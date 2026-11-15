<#
.SYNOPSIS
    Obtiene el consumo / cuota actual de Google Antigravity (Windows, sin dependencias).

.DESCRIPTION
    1) Lee el refresh_token del Windows Credential Manager ("gemini:antigravity", usuario "antigravity").
    2) Lo canjea por un access_token OAuth en https://oauth2.googleapis.com/token
    3) Llama a POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
    4) Imprime porcentaje restante por grupo (Gemini / Claude+GPT) y ventana (5h / semanal).

    NO consume cuota de modelos: son llamadas de metadatos.

.PARAMETER Json
    Devuelve el JSON crudo de la API en lugar de la tabla.

.PARAMETER PerModel
    Usa /v1internal:retrieveUserQuota (buckets por modelo) en vez del resumen por grupos.

.EXAMPLE
    .\Get-AntigravityQuota.ps1
#>
[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$PerModel
)

$ErrorActionPreference = 'Stop'

# --- Cliente OAuth: se DESCUBRE en la instalacion local de Antigravity ---
#     No se lleva en el codigo: son constantes publicas de una "installed app",
#     pero GitHub las marca como secretos en el push protection. Se emparejan
#     por proximidad (el secret va justo detras de su id) y se prueban en orden
#     hasta que uno canjea el refresh_token.
$TokenUrl     = 'https://oauth2.googleapis.com/token'
$BaseUrl      = 'https://cloudcode-pa.googleapis.com'

function Get-AntigravityOAuthClients {
    $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
    $candidates = @(
        (Join-Path $local 'Programs\Antigravity IDE\resources\app\out\main.js'),
        (Join-Path $local 'Programs\Antigravity\resources\app.asar')
    )

    foreach ($file in $candidates) {
        if (-not (Test-Path -LiteralPath $file)) { continue }
        try {
            $text = [System.IO.File]::ReadAllText($file)
        } catch { continue }

        $ids = [regex]::Matches($text, '["''](\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com)["'']')
        $secrets = [regex]::Matches($text, '["''](GOCSPX-[A-Za-z0-9_-]{20,})["'']')
        if ($ids.Count -eq 0) { continue }

        $pairs = @()
        foreach ($id in $ids) {
            # El secret de este id es el primero que aparece despues.
            $secret = $secrets | Where-Object { $_.Index -gt $id.Index } | Select-Object -First 1
            if (-not $secret) { continue }
            $pairs += [pscustomobject]@{ ClientId = $id.Groups[1].Value; ClientSecret = $secret.Groups[1].Value }
            $secrets = @($secrets | Where-Object { $_ -ne $secret })
        }
        if ($pairs.Count) { return $pairs }
    }
    return @()
}

# ---------------------------------------------------------------- Credential Manager
if (-not ('CredMan' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CredMan {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags; public uint Type;
        public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize; public IntPtr CredentialBlob;
        public uint Persist; public uint AttributeCount; public IntPtr Attributes;
        public string TargetAlias; public string UserName;
    }
    [DllImport("advapi32.dll", EntryPoint="CredReadW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, uint reserved, out IntPtr credPtr);
    [DllImport("advapi32.dll", SetLastError=true)]
    public static extern void CredFree(IntPtr buffer);
    public const uint CRED_TYPE_GENERIC = 1;

    public static string ReadSecret(string target) {
        IntPtr p;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p)) return null;
        try {
            var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            if (c.CredentialBlobSize == 0) return string.Empty;
            var blob = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
            return System.Text.Encoding.UTF8.GetString(blob);
        } finally { CredFree(p); }
    }
}
"@
}

# El nombre real del destino lleva el prefijo "LegacyGeneric:target=".
$targets = @('LegacyGeneric:target=gemini:antigravity', 'gemini:antigravity')
$blob = $null
foreach ($t in $targets) {
    $blob = [CredMan]::ReadSecret($t)
    if ($blob) { break }
}
if (-not $blob) { throw "No se encontro la credencial 'gemini:antigravity' en el Credential Manager." }

$cred = $blob | ConvertFrom-Json
$refreshToken = $cred.token.refresh_token
$accessToken  = $cred.token.access_token
$expiryStr    = $cred.token.expiry

$expired = $true
if ($expiryStr) {
    try { $expired = ([datetimeoffset]::Parse($expiryStr)) -le [datetimeoffset]::UtcNow.AddMinutes(2) } catch { $expired = $true }
}

# ---------------------------------------------------------------- OAuth refresh
if ($expired -or -not $accessToken) {
    Write-Verbose 'Access token caducado: refrescando con el refresh_token...'

    # Se prueban los clientes descubiertos en orden hasta que uno canjea el
    # refresh_token: no todos valen para esta credencial.
    $clients = Get-AntigravityOAuthClients
    if (-not $clients -or $clients.Count -eq 0) {
        throw 'No se encontro el cliente OAuth de Antigravity en la instalacion local.'
    }

    $accessToken = $null
    $lastError = $null
    foreach ($pair in $clients) {
        try {
            $body = @{
                grant_type    = 'refresh_token'
                refresh_token = $refreshToken
                client_id     = $pair.ClientId
                client_secret = $pair.ClientSecret
            }
            $tok = Invoke-RestMethod -Method Post -Uri $TokenUrl -Body $body `
                -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 30
            if ($tok.access_token) {
                $accessToken = $tok.access_token
                break
            }
            $lastError = 'respuesta sin access_token'
        } catch {
            $lastError = $_.Exception.Message
        }
    }

    if (-not $accessToken) {
        throw "Ninguno de los $($clients.Count) clientes encontrados pudo renovar la sesion: $lastError"
    }
} else {
    Write-Verbose 'Access token todavia valido.'
}

# ---------------------------------------------------------------- Quota call
$path = if ($PerModel) { '/v1internal:retrieveUserQuota' } else { '/v1internal:retrieveUserQuotaSummary' }
$headers = @{
    Authorization = "Bearer $accessToken"
    'User-Agent'  = 'antigravity/2.32.1'
}
$raw = Invoke-RestMethod -Method Post -Uri ($BaseUrl + $path) -Headers $headers `
    -Body '{}' -ContentType 'application/json' -TimeoutSec 30

if ($Json) { $raw | ConvertTo-Json -Depth 10; return }

if ($PerModel) {
    $raw.buckets | Sort-Object modelId |
        Select-Object modelId, tokenType,
            @{n='Remaining%'; e={ if ($null -ne $_.remainingFraction) { [math]::Round($_.remainingFraction * 100, 1) } else { $null } }},
            @{n='Remaining'; e={ $_.remainingAmount }},
            @{n='ResetUTC';  e={ $_.resetTime }} |
        Format-Table -AutoSize
    return
}

foreach ($g in $raw.groups) {
    Write-Host ''
    Write-Host ("== {0} ==" -f $g.displayName) -ForegroundColor Cyan
    if ($g.description) { Write-Host ("   {0}" -f $g.description) -ForegroundColor DarkGray }
    $g.buckets | Select-Object bucketId,
        @{n='Window';     e={ $_.window }},
        @{n='Remaining%'; e={ if ($null -ne $_.remainingFraction) { [math]::Round($_.remainingFraction * 100, 1) } else { $null } }},
        @{n='ResetUTC';   e={ $_.resetTime }},
        @{n='Note';       e={ $_.description }} |
        Format-Table -AutoSize
}
