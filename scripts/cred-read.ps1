<#
  Lee una credencial genérica del Administrador de credenciales de Windows.
  Uso: powershell -NoProfile -ExecutionPolicy Bypass -File cred-read.ps1 -Target "gemini:antigravity"
  Salida: JSON por stdout.
#>
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [string]$User = ''
)

$ErrorActionPreference = 'Stop'

if (-not ('CredMan' -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;

public class CredMan
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public int Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr cred);
}
"@
}

$ptr = [IntPtr]::Zero
if ([CredMan]::CredRead($Target, 1, 0, [ref]$ptr)) {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredMan+CREDENTIAL])
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)

    # Según la app, el blob se guarda como UTF-8 plano o como UTF-16LE.
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        $text = $strictUtf8.GetString($bytes)
    }
    catch {
        $text = [System.Text.Encoding]::Unicode.GetString($bytes)
    }

    $name = [Runtime.InteropServices.Marshal]::PtrToStringUni($cred.UserName)
    [CredMan]::CredFree($ptr)

    [pscustomobject]@{
        ok    = $true
        target = $Target
        user  = $name
        secret = $text.TrimEnd([char]0)
    } | ConvertTo-Json -Compress
}
else {
    [pscustomobject]@{
        ok    = $false
        target = $Target
        error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    } | ConvertTo-Json -Compress
}
