<#
.SYNOPSIS
  Lee la cuota real de Claude (Plan Max / Pro) desde el endpoint no documentado
  GET https://api.anthropic.com/api/oauth/usage

.DESCRIPTION
  El token OAuth de Claude Code no está en %USERPROFILE%\.claude\.credentials.json
  (puede estar vacío), sino en la caché de Claude Desktop:
    %APPDATA%\Claude\config.json  ->  clave "oauth:tokenCacheV2"
  Ese valor es un blob de Chromium OSCrypt:
    "v10" (3 bytes) + nonce (12 bytes) + AES-256-GCM(ciphertext||tag16)
  La clave AES de 32 bytes está en %APPDATA%\Claude\Local State,
    os_crypt.encrypted_key = "DPAPI" + CryptProtectData(AES key)  (DPAPI del usuario)

  Este script descifra la caché con DPAPI + AES-GCM, elige el grant con scope
  user:sessions:claude_code, y llama al endpoint de uso. No consume tokens de IA.

.NOTES
  - Ejecutar como el MISMO usuario de Windows (DPAPI es por usuario).
  - Endpoint no oficial: puede cambiar sin aviso. Límite observado por la
    comunidad: ~5 peticiones por ventana -> HTTP 429. Cachea >= 10 min.
  - Respuesta normalizada: five_hour.utilization / seven_day.utilization (0-100),
    .resets_at (ISO-8601 UTC), limits[], extra_usage.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $env:APPDATA 'Claude\config.json'),
  [string]$LocalStatePath = (Join-Path $env:APPDATA 'Claude\Local State'),
  [string]$CliCredentialsPath = (Join-Path $env:USERPROFILE '.claude\.credentials.json'),
  [switch]$SkipSpend,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'

# La app lee stdout/stderr como UTF-8; sin esto PowerShell escribe con la
# pagina de codigos de la consola y las tildes llegan rotas.
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# Cualquier fallo sale por stderr como UNA linea con el motivo y codigo 1. Sin
# esto, PowerShell 7 pinta el error "conciso" (ruta:linea, la linea de codigo,
# tildes...) y la app, que solo muestra la primera linea, ensenaba
# "Exception: ...ps1:156" en vez de "HTTP 429: limite de peticiones".
trap {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}

# ---------------------------------------------------------------- helpers ----
function Get-OsCryptKey {
  param([string]$Path)
  $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  $enc  = $state.os_crypt.encrypted_key
  if (-not $enc) { throw "No hay os_crypt.encrypted_key en '$Path'." }
  $blob = [Convert]::FromBase64String($enc)
  $magic = [Text.Encoding]::ASCII.GetString($blob, 0, 5)
  if ($magic -ne 'DPAPI') { throw "Formato de encrypted_key no soportado ('$magic')." }
  $payload = New-Object byte[] ($blob.Length - 5)
  [Array]::Copy($blob, 5, $payload, 0, $payload.Length)
  return [Dpapi]::Unprotect($payload)
}

function Unprotect-ChromiumV10 {
  param([byte[]]$Blob, [byte[]]$Key)
  if ($Blob.Length -lt 3 + 12 + 16) { throw 'Blob v10 demasiado corto.' }
  if (-not ($Blob[0] -eq 0x76 -and $Blob[1] -eq 0x31 -and $Blob[2] -eq 0x30)) { throw 'El blob no empieza por "v10".' }
  $nonce  = New-Object byte[] 12; [Array]::Copy($Blob, 3, $nonce, 0, 12)
  $ct     = New-Object byte[] ($Blob.Length - 15); [Array]::Copy($Blob, 15, $ct, 0, $ct.Length)
  $cipherLen = $ct.Length - 16
  $cipher = New-Object byte[] $cipherLen; [Array]::Copy($ct, 0, $cipher, 0, $cipherLen)
  $tag    = New-Object byte[] 16;         [Array]::Copy($ct, $cipherLen, $tag, 0, 16)
  $plain  = New-Object byte[] $cipherLen
  $aes = [System.Security.Cryptography.AesGcm]::new($Key)
  try { $aes.Decrypt($nonce, $cipher, $tag, $plain) } finally { $aes.Dispose() }
  return [Text.Encoding]::UTF8.GetString($plain)
}

function Get-ClaudeCodeToken {
  <# Devuelve @{ Token; Source; ExpiresAt } del primer grant VALIDO con scope claude_code. #>
  # 1) CLI standalone: .claude\.credentials.json (si tiene token real Y vigente).
  #    OJO: su token CADUCA solo. Si se usa uno caducado, el endpoint responde
  #    401 "OAuth access token has been revoked" y la cuota real se pierde.
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if (Test-Path -LiteralPath $CliCredentialsPath) {
    try {
      $cli = Get-Content -LiteralPath $CliCredentialsPath -Raw | ConvertFrom-Json
      $a = $cli.claudeAiOauth
      $exp = 0
      if ($a.expiresAt) { try { $exp = [int64]$a.expiresAt } catch { $exp = 0 } }
      $vigente = ($exp -eq 0) -or ($exp -gt $now)
      if ($a.accessToken -and $a.accessToken.Length -gt 20 -and $vigente) {
        return @{ Token = $a.accessToken; Source = $CliCredentialsPath; ExpiresAt = $a.expiresAt }
      }
    } catch { }
  }

  # 2) Claude Desktop: config.json -> oauth:tokenCacheV2 (cifrado).
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "No existe '$ConfigPath'." }
  $key = Get-OsCryptKey -Path $LocalStatePath
  $cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $candidates = @()
  foreach ($field in @('oauth:tokenCacheV2', 'oauth:tokenCache')) {
    $b64 = $cfg.$field
    if (-not $b64) { continue }
    $blob = [Convert]::FromBase64String($b64)
    $json = Unprotect-ChromiumV10 -Blob $blob -Key $key
    $cache = $json | ConvertFrom-Json
    foreach ($p in $cache.PSObject.Properties) {
      $name = $p.Name
      if ($name -notmatch 'claude_code') { continue }          # scope claude_code
      $val = $p.Value
      if (-not $val -or -not $val.token) { continue }
      $exp = 0
      if ($val.expiresAt) { try { $exp = [int64]$val.expiresAt } catch { $exp = 0 } }
      # Un grant caducado NO vale: se descarta antes de gastarlo un 401.
      if ($exp -gt 0 -and $exp -le $now) { continue }
      $candidates += [pscustomobject]@{
        Token     = $val.token
        ExpiresAt = $val.expiresAt
        Field     = $field
        Name      = $name
      }
    }
  }
  if (-not $candidates.Count) { throw 'La caché no contiene ningún grant con scope claude_code.' }
  $valid = $candidates | Sort-Object ExpiresAt -Descending | Select-Object -First 1
  if (-not $valid) { $valid = $candidates | Select-Object -First 1 }
  return @{ Token = $valid.Token; Source = "$ConfigPath ($($valid.Field))"; ExpiresAt = $valid.ExpiresAt }
}

# ------------------------------------------------------------------- DPAPI ---
if (-not ('Dpapi' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Dpapi {
  [StructLayout(LayoutKind.Sequential)]
  public struct DATA_BLOB { public int cbData; public IntPtr pbData; }
  [DllImport("crypt32.dll", SetLastError=true)]
  static extern bool CryptUnprotectData(ref DATA_BLOB pDataIn, IntPtr szDescr, IntPtr pEntropy,
                                        IntPtr pvReserved, IntPtr pPrompt, int dwFlags, ref DATA_BLOB pDataOut);
  [DllImport("kernel32.dll")]
  static extern IntPtr LocalFree(IntPtr hMem);
  public static byte[] Unprotect(byte[] data) {
    DATA_BLOB inB = new DATA_BLOB(), outB = new DATA_BLOB();
    IntPtr p = Marshal.AllocHGlobal(data.Length);
    Marshal.Copy(data, 0, p, data.Length);
    inB.cbData = data.Length; inB.pbData = p;
    bool ok = CryptUnprotectData(ref inB, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref outB);
    int err = Marshal.GetLastWin32Error();
    Marshal.FreeHGlobal(p);
    if (!ok) throw new System.ComponentModel.Win32Exception(err);
    byte[] result = new byte[outB.cbData];
    Marshal.Copy(outB.pbData, result, 0, outB.cbData);
    LocalFree(outB.pbData);
    return result;
  }
}
'@ -Language CSharp
}

# --------------------------------------------------------------- request ----
$cred = Get-ClaudeCodeToken
$uri = 'https://api.anthropic.com/api/oauth/usage'
if ($SkipSpend) { $uri += '?skip_spend=1' }

$headers = @{
  Authorization   = "Bearer $($cred.Token)"
  'anthropic-beta' = 'oauth-2025-04-20'
  Accept          = 'application/json'
}

try {
  $resp = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 30
} catch {
  $code = $null
  try { $code = [int]$_.Exception.Response.StatusCode } catch { }
  if ($code -eq 429) { throw 'HTTP 429: límite de peticiones del endpoint de uso. Cachea >= 10 min.' }
  throw
}

if ($Json) { $resp | ConvertTo-Json -Depth 12; return }

$out = [ordered]@{
  source        = $cred.Source
  token_expires = if ($cred.ExpiresAt) { [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$cred.ExpiresAt).ToString('u') } else { $null }
  five_hour_pct = $resp.five_hour.utilization
  five_hour_reset = $resp.five_hour.resets_at
  seven_day_pct = $resp.seven_day.utilization
  seven_day_reset = $resp.seven_day.resets_at
  limits        = @($resp.limits | ForEach-Object { [pscustomobject]@{ kind=$_.kind; group=$_.group; percent=$_.percent; severity=$_.severity; resets_at=$_.resets_at } })
  extra_usage   = if ($resp.extra_usage) { [pscustomobject]@{
      enabled       = $resp.extra_usage.is_enabled
      used_credits  = $resp.extra_usage.used_credits
      monthly_limit = $resp.extra_usage.monthly_limit
      currency      = $resp.extra_usage.currency
      utilization   = $resp.extra_usage.utilization
    } } else { $null }
}
[pscustomobject]$out | Format-List
