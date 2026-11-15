# Lista los botones de la barra de tareas y del area de notificacion (diagnostico).
param([string]$Marker = 'Usagia')

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ('TrayLister' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TrayLister
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindow(string cls, string title);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder cls, int max);
}
"@
}

function Get-UiButtons($root) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button
    )
    return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
}

$taskbar = [TrayLister]::FindWindow('Shell_TrayWnd', $null)
Write-Output "taskbar hwnd=$taskbar"

if ($taskbar -ne [IntPtr]::Zero) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($taskbar)
    foreach ($b in Get-UiButtons $root) {
        $r = $b.Current.BoundingRectangle
        Write-Output ("  btn '{0}' cls={1} rect={2},{3} {4}x{5}" -f $b.Current.Name, $b.Current.ClassName, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
    }
}

# Ventana de iconos ocultos (chevron)
$overflow = New-Object System.Collections.Generic.List[System.IntPtr]
$cb = [TrayLister+EnumWindowsProc] {
    param($h, $l)
    $sb = New-Object System.Text.StringBuilder 256
    [TrayLister]::GetClassName($h, $sb, 256) | Out-Null
    if ($sb.ToString() -match 'NotifyIconOverflowWindow|Shell_TrayWnd|TrayNotifyWnd') {
        $overflow.Add($h)
    }
    return $true
}
[TrayLister]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

foreach ($h in $overflow) {
    Write-Output "ventana overflow/tray: $h"
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
    foreach ($b in Get-UiButtons $root) {
        $r = $b.Current.BoundingRectangle
        Write-Output ("  btn '{0}' rect={1},{2} {3}x{4}" -f $b.Current.Name, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
    }
}
