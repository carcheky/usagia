'use strict';

// Lector del Administrador de credenciales de Windows (Credential Manager).
// Se usa para apps que guardan su token OAuth ahí (Antigravity, Gemini CLI...).

const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'cred-read.ps1');

/**
 * @param {string} target destino de la credencial, p.ej. "gemini:antigravity"
 * @returns {Promise<{secret:string, user:string}|null>}
 */
function read(target, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Target', target],
      { timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const parsed = JSON.parse(String(stdout).trim());
          if (!parsed.ok || !parsed.secret) return resolve(null);
          resolve({ secret: parsed.secret, user: parsed.user || '' });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

module.exports = { read };
