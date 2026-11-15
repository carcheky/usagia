'use strict';

// Lector del Administrador de credenciales de Windows (Credential Manager).
// Se usa para apps que guardan su token OAuth ahí (Antigravity, Gemini CLI...).

const { execFile } = require('child_process');
const scriptPath = require('./script-path');

const SCRIPT = scriptPath.script('cred-read.ps1');

/**
 * El Administrador de credenciales de Windows es del SISTEMA, no del usuario:
 * un HOME falso no lo esconde. Por eso la simulacion de entorno limpio
 * (scripts/test-probe-clean-env.js) apaga esta lectura con esta variable, que
 * en un runner de CI no hace falta porque ahi no hay ninguna credencial.
 */
function disabled() {
  return process.env.USAGIA_SIMULATE_CLEAN_ENV === '1';
}

/**
 * @param {string} target destino de la credencial, p.ej. "gemini:antigravity"
 * @returns {Promise<{secret:string, user:string}|null>}
 */
function read(target, timeout = 8000) {
  if (disabled()) return Promise.resolve(null);
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
