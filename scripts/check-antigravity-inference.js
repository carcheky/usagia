'use strict';

// Verificacion independiente de la conclusion del otro agente:
// Antigravity tiene cuota intacta pero NO sirve como ruta de inferencia.
//
// Un intento a generateContent. Si responde 429/403/401 no se genera nada y
// no se consume cuota; solo se gastaria si la generacion saliese bien.

const { execFile } = require('child_process');
const path = require('path');

const client = require(path.join(__dirname, '..', 'src', 'main', 'local', 'antigravity-client.js'));

const CRED_TARGET = 'gemini:antigravity';
const CRED_SCRIPT = path.join(__dirname, 'cred-read.ps1');

function readCredential() {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CRED_SCRIPT, '-Target', CRED_TARGET],
      { timeout: 15000, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(new Error('no se pudo leer la credencial'));
        try {
          const parsed = JSON.parse(String(stdout).trim());
          resolve(parsed.secret);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

async function getAccessToken() {
  const raw = await readCredential();
  const token = JSON.parse(raw).token;
  if (token.access_token && Date.parse(token.expiry) > Date.now() + 120000) return token.access_token;

  // El canje lo hace el modulo de cliente: descubre los pares id+secret en la
  // instalacion local de Antigravity y prueba hasta que uno vale.
  const refreshed = await client.refreshAccessToken(token.refresh_token);
  if (!refreshed) throw new Error('no se encontró el cliente OAuth de Antigravity');
  return refreshed.accessToken;
}

async function main() {
  const token = await getAccessToken();
  console.log('token renovado: OK');

  console.log('--- generateContent (debe fallar) ---');
  for (const model of ['gemini-3.1-pro-preview', 'gemini-2.5-pro']) {
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:generateContent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'antigravity/2.32.1',
      },
      body: JSON.stringify({
        model,
        project: 'aicode-consumers',
        request: { contents: [{ role: 'user', parts: [{ text: 'ping' }] }] },
      }),
    });
    console.log(`${model}: HTTP ${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 220)}`);
  }

  console.log('--- path estandar de Gemini ---');
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
    }
  );
  console.log(`generativelanguage: HTTP ${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 220)}`);
}

main().catch((err) => {
  console.error('fallo:', err.message);
  process.exit(1);
});
