<#
  Localiza el icono de la bandeja de Multitarea de la app por el texto de su
  tooltip (Windows). Usa UI Automation para obtener el rectangulo real.

  Devuelve JSON:
    { ok, x, y, w, h }              rectangulo del icono (si esta visible)
    { ok:false, trayX, trayY, trayW, trayH, hidden:true }
                                  area de notificacion como respaldo; hidden
                                  indica que el icono esta en "iconos ocultos".

  Uso: powershell -NoProfile -ExecutionPolicy Bypass -File find-tray-icon.ps1 -Marker "Usagia"
#>
param([string]$Marker = 'Usagia')

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ('TrayFinder' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TrayFinder
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindow(string cls, string title);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
}

function Get-TrayButtons($root) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button
    )
    return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
}

try {
    $taskbar = [TrayFinder]::FindWindow('Shell_TrayWnd', $null)
    if ($taskbar -eq [IntPtr]::Zero) {
        [pscustomobject]@{ ok = $false; reason = 'taskbar no encontrada' } | ConvertTo-Json -Compress
        exit 0
    }

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($taskbar)
    $buttons = Get-TrayButtons $root

    # 1) El icono de la app, identificado por el texto de su tooltip.
    foreach ($b in $buttons) {
        $name = ($b.Current.Name -replace '^\s+', '')
        if ($name -and $name.StartsWith($Marker, [System.StringComparison]::OrdinalIgnoreCase)) {
            $r = $b.Current.BoundingRectangle
            [pscustomobject]@{
                ok   = $true
                x    = [int]$r.X
                y    = [int]$r.Y
                w    = [int]$r.Width
                h    = [int]$r.Height
                name = $name
            } | ConvertTo-Json -Compress
            exit 0
        }
    }

    # 2) Area de notificacion visible (respaldo): union de los botones reales.
    $minX = [int]::MaxValue; $minY = [int]::MaxValue
    $maxX = 0; $maxY = 0; $found = $false
    foreach ($b in $buttons) {
        if ($b.Current.ClassName -notlike 'SystemTray*') { continue }
        $r = $b.Current.BoundingRectangle
        if ($r.Width -le 0) { continue }
        $found = $true
        $minX = [Math]::Min($minX, [int]$r.X)
        $minY = [Math]::Min($minY, [int]$r.Y)
        $maxX = [Math]::Max($maxX, [int]($r.X + $r.Width))
        $maxY = [Math]::Max($maxY, [int]($r.Y + $r.Height))
    }

    if ($found) {
        [pscustomobject]@{
            ok     = $false
            hidden = $true
            reason = 'icono en iconos ocultos'
            trayX  = $minX
            trayY  = $minY
            trayW  = ($maxX - $minX)
            trayH  = ($maxY - $minY)
        } | ConvertTo-Json -Compress
    }
    else {
        [pscustomobject]@{ ok = $false; reason = 'area de notificacion no encontrada' } | ConvertTo-Json -Compress
    }
}
catch {
    [pscustomobject]@{ ok = $false; reason = $_.Exception.Message } | ConvertTo-Json -Compress
}
