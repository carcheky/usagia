$ErrorActionPreference = 'Stop'

$src = @"
using System;
using System.Runtime.InteropServices;

public static class CredMan
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);

    public const uint CRED_TYPE_GENERIC = 1;
    public const uint CRED_TYPE_DOMAIN_PASSWORD = 2;

    // Returns the UTF-8 blob (CredentialBlob) as a string, or null.
    public static string ReadSecret(string target)
    {
        IntPtr p;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p)) return null;
        try
        {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            if (c.CredentialBlobSize == 0) return string.Empty;
            byte[] blob = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
            return System.Text.Encoding.UTF8.GetString(blob);
        }
        finally { CredFree(p); }
    }

    public static CREDENTIAL ReadFull(string target, out byte[] blob)
    {
        blob = null;
        IntPtr p;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            blob = new byte[c.CredentialBlobSize];
            if (c.CredentialBlobSize > 0) Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
            return c;
        }
        finally { CredFree(p); }
    }
}
"@

Add-Type -TypeDefinition $src -Language CSharp

$targets = @('LegacyGeneric:target=gemini:antigravity', 'gemini:antigravity')

foreach ($t in $targets) {
    Write-Output "=== target: $t ==="
    try {
        $blob = $null
        $cred = [CredMan]::ReadFull($t, [ref]$blob)
        Write-Output ("  UserName    : {0}" -f $cred.UserName)
        Write-Output ("  TargetName  : {0}" -f $cred.TargetName)
        Write-Output ("  Type        : {0}  Persist: {1}" -f $cred.Type, $cred.Persist)
        Write-Output ("  BlobSize    : {0} bytes" -f $blob.Length)
        $s = [System.Text.Encoding]::UTF8.GetString($blob)
        $prefix = if ($s.Length -ge 8) { $s.Substring(0,8) } else { $s }
        Write-Output ("  BlobPrefix  : {0}...  (chars={1})" -f $prefix, $s.Length)
        $simple = $s -replace '[^\x20-\x7E]', ''
        Write-Output ("  PrintableRun: {0}" -f ($simple.Substring(0, [Math]::Min(80, $simple.Length))))
        # structured probe
        try {
            $j = $s | ConvertFrom-Json
            Write-Output "  JSON: YES"
            $j.PSObject.Properties | ForEach-Object {
                $v = $_.Value
                $desc = if ($null -eq $v) { 'null' } elseif ($v -is [string]) { "string len=$($v.Length)" } else { $v.GetType().Name }
                Write-Output ("    .{0} = {1}" -f $_.Name, $desc)
            }
        } catch { Write-Output "  JSON: NO ($($_.Exception.Message))" }
    } catch {
        Write-Output ("  ERROR: {0}" -f $_.Exception.Message)
    }
}

Write-Output "=== cmdkey listing (gemini/antigravity) ==="
cmdkey /list | Select-String -Pattern 'gemini|antigravity|Target:' -Context 0,0 | Select-Object -First 30 | ForEach-Object { $_.Line }
