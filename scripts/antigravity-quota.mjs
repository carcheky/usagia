#!/usr/bin/env node
// Antigravity quota reader (Windows) — Node >= 18 (usa fetch global).
// Lee el refresh_token del Credential Manager, lo canjea por un access_token
// y consulta POST cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary.
// No consume cuota de modelos: son llamadas de metadatos.
//
// El cliente OAuth (id + secret) NO va en el codigo: se descubre en la
// instalacion local de Antigravity. Ver src/main/local/antigravity-client.js.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const client = require(path.join(here, '..', 'src', 'main', 'local', 'antigravity-client.js'));

const BASE = 'https://cloudcode-pa.googleapis.com';

// --- 1) Credential Manager vía P/Invoke CredReadW (pwsh / Windows PowerShell) ---
const PS_READ = String.raw`
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public static class CredManNode {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public uint Flags; public uint Type;
    public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll",EntryPoint="CredReadW",SetLastError=true,CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string t,uint ty,uint f,out IntPtr p);
  [DllImport("advapi32.dll",SetLastError=true)] public static extern void CredFree(IntPtr p);
  public static string Read(string t){
    IntPtr p; if(!CredRead(t,1,0,out p)) return null;
    try{ var c=(CREDENTIAL)Marshal.PtrToStructure(p,typeof(CREDENTIAL));
      var b=new byte[c.CredentialBlobSize];
      if(b.Length>0) Marshal.Copy(c.CredentialBlob,b,0,b.Length);
      return System.Text.Encoding.UTF8.GetString(b);
    } finally{ CredFree(p); } } }
"@
[Console]::Out.Write([CredManNode]::Read('LegacyGeneric:target=gemini:antigravity'))
`;

function readCredential() {
  const psPath = process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell.exe';
  const out = execFileSync(psPath, ['-NoProfile', '-Command', PS_READ], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!out || !out.trim()) throw new Error('Credencial gemini:antigravity no encontrada');
  return JSON.parse(out);
}

// --- 2) Quota ---
async function fetchQuotaSummary(accessToken) {
  const res = await fetch(`${BASE}/v1internal:retrieveUserQuotaSummary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/2.32.1',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`quota falló: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const cred = readCredential();
const token = cred.token || cred;
const refreshed = await client.refreshAccessToken(token.refresh_token);
if (!refreshed) throw new Error('No se encontró el cliente OAuth de Antigravity en la instalación local');

const summary = await fetchQuotaSummary(refreshed.accessToken);

console.log(JSON.stringify(summary, null, 2));

// Resumen legible
for (const g of summary.groups ?? []) {
  console.log(`\n== ${g.displayName} ==`);
  for (const b of g.buckets ?? []) {
    const pct = b.remainingFraction == null ? '?' : (b.remainingFraction * 100).toFixed(1);
    console.log(`  ${b.bucketId.padEnd(14)} ${String(b.window).padEnd(7)} ${pct.padStart(6)}%  reset ${b.resetTime}`);
  }
}
