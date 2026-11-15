'use strict';

// Ejecución de scripts de PowerShell.
// Se prefiere PowerShell 7 (pwsh): es el unico que trae AesGcm, necesario para
// descifrar la cache de credenciales de Claude Desktop.

const { execFile } = require('child_process');

const CANDIDATES = process.platform === 'win32' ? ['pwsh.exe', 'pwsh', 'powershell.exe'] : ['pwsh'];

function exec(script, args, exe, timeout) {
  return new Promise((resolve) => {
    execFile(
      exe,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, stdout: '', stderr: String(stderr || err.message) });
          return;
        }
        resolve({ ok: true, stdout: String(stdout), stderr: String(stderr || '') });
      }
    );
  });
}

/**
 * Ejecuta un script .ps1 con el primer shell disponible.
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string}>}
 */
async function runScript(script, args = [], timeout = 45000) {
  let last = { ok: false, stdout: '', stderr: 'sin shell disponible' };
  for (const exe of CANDIDATES) {
    const result = await exec(script, args, exe, timeout);
    if (result.ok) return result;
    last = result;
    // Si el script existe pero falla, no tiene sentido probar otro shell.
    if (!/no se encuentra|not recognized|not found/i.test(result.stderr)) break;
  }
  return last;
}

module.exports = { runScript };
