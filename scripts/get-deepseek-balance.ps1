<#
.SYNOPSIS
  Saldo / gasto de la cuenta DeepSeek a partir del grant OAuth de DSH
  (C:\Users\<user>\.dsh\.credentials.yaml -> deepseek-account-platform/default).

.DESCRIPTION
  OJO: el token del grant NO vale como "Authorization: Bearer" en
  https://api.deepseek.com/user/balance (devuelve 401 / code 40003).
  Ese endpoint solo acepta API keys "sk-...".

  El token OAuth de la cuenta se usa contra la API privada de Platform con el
  header  x-dsh-auth-token:  <token>  (no Bearer) sobre:
    GET https://platform.deepseek.com/api/v0/users/get_user_summary   -> saldo
    GET https://platform.deepseek.com/api/v0/usage/amount?month=M&year=Y -> tokens
    GET https://platform.deepseek.com/api/v0/usage/cost?month=M&year=Y   -> gasto
  (endpoints privados, no documentados; pueden cambiar sin aviso)

  No consume tokens de IA.
#>
[CmdletBinding()]
param(
  [string]$CredentialsPath = (Join-Path $env:USERPROFILE '.dsh\.credentials.yaml'),
  [string]$PlatformOrigin = 'https://platform.deepseek.com',
  [switch]$IncludeUsage,
  [int]$Month = (Get-Date).Month,
  [int]$Year = (Get-Date).Year,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'

# ------------------------------------------------------- token del grant ----
if (-not (Test-Path -LiteralPath $CredentialsPath)) { throw "No existe '$CredentialsPath'." }
$yaml = Get-Content -LiteralPath $CredentialsPath -Raw

# Bloque "deepseek-account-platform/default:" -> payload.token (sin depender de un parser YAML)
$block = [regex]::Match($yaml, '(?ms)^\s{2}deepseek-account-platform/default:\s*$(?<body>.*?)(?=^\s{2}\S|^refs:|\z)')
if (-not $block.Success) { throw 'No se encontró el record deepseek-account-platform/default.' }
$tokMatch = [regex]::Match($block.Groups['body'].Value, '(?m)^\s+token:\s*(\S+)\s*$')
if (-not $tokMatch.Success) { throw 'No se encontró payload.token en el record.' }
$token = $tokMatch.Groups[1].Value

$headers = @{
  'x-dsh-auth-token' = $token
  Accept             = 'application/json'
}

function Invoke-PlatformGet {
  param([string]$Path)
  $uri = "$PlatformOrigin$Path"
  $r = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 30
  if ($r.code -ne 0) {
    $biz = if ($r.data) { " biz_code=$($r.data.biz_code) biz_msg=$($r.data.biz_msg)" } else { '' }
    throw "Platform respondió code=$($r.code) msg='$($r.msg)'$biz"
  }
  if ($r.data -and $r.data.biz_code -ne 0) {
    throw "Platform biz_code=$($r.data.biz_code) biz_msg='$($r.data.biz_msg)'"
  }
  return $r.data.biz_data
}

# ------------------------------------------------------------------ saldo ----
$summary = Invoke-PlatformGet '/api/v0/users/get_user_summary'

$result = [ordered]@{
  normal_wallets = @($summary.normal_wallets | ForEach-Object { [pscustomobject]@{ currency = $_.currency; balance = $_.balance } })
  bonus_wallets  = @($summary.bonus_wallets  | ForEach-Object { [pscustomobject]@{ currency = $_.currency; balance = $_.balance } })
  total_costs    = @($summary.total_costs    | ForEach-Object { [pscustomobject]@{ currency = $_.currency; amount = $_.amount } })
}

if ($IncludeUsage) {
  $q = "?month=$Month&year=$Year"
  $result.usage_amount = Invoke-PlatformGet "/api/v0/usage/amount$q"
  $result.usage_cost   = Invoke-PlatformGet "/api/v0/usage/cost$q"
}

if ($Json) { [pscustomobject]$result | ConvertTo-Json -Depth 12; return }

"Saldo (recargado) : " + (($result.normal_wallets | ForEach-Object { "$($_.balance) $($_.currency)" }) -join ' | ')
"Saldo (bonus)     : " + (($result.bonus_wallets  | ForEach-Object { "$($_.balance) $($_.currency)" }) -join ' | ')
"Gasto acumulado   : " + (($result.total_costs    | ForEach-Object { "$($_.amount) $($_.currency)" }) -join ' | ')
if ($IncludeUsage) {
  ''
  "Uso $Month/${Year} (tokens):"
  $result.usage_amount | ConvertTo-Json -Depth 8
  "Coste $Month/${Year}:"
  $result.usage_cost | ConvertTo-Json -Depth 8
}
