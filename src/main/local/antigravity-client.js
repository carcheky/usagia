'use strict';

// Cliente OAuth de Google para Antigravity.
//
// NO se lleva el client_id ni el client_secret en el codigo: se DESCUBREN en
// la instalacion local de Antigravity, que es donde viven. Son constantes
// publicas de una "installed app" (Google publica las suyas en el codigo
// abierto de gemini-cli con el aviso de que "el client secret obviamente no se
// trata como un secreto"), pero GitHub las marca como secretos en el push
// protection, asi que lo correcto es no tenerlas en el repo.
//
// En el bundle de Antigravity (`resources/app/out/main.js`) los pares client
// id + secret estan contiguos, en este orden:
//
//   id1 = "...", secret1 = "...", id2 = "...", secret2 = "..."
//
// Se emparejan por proximidad. Pode haber mas de un par y no todos valen
// para el refresh_token de este usuario: por eso se prueban en orden hasta que
// uno funciona, y el que funciona se cachea.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchJson } = require('../http');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const ID_PATTERN = /["'](\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com)["']/g;
const SECRET_PATTERN = /["'](GOCSPX-[A-Za-z0-9_-]{20,})["']/g;

/** Ficheros donde puede estar el cliente OAuth, en orden de probabilidad. */
function candidateFiles() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programs = path.join(local, 'Programs');
  const files = [];

  for (const dirName of ['Antigravity IDE', 'Antigravity']) {
    const base = path.join(programs, dirName, 'resources');
    files.push(path.join(base, 'app', 'out', 'main.js'));
    files.push(path.join(base, 'app', 'out', 'jetskiAgent', 'main.js'));
    files.push(path.join(base, 'app.asar'));
  }
  return files;
}

/**
 * Extrae los pares (clientId, clientSecret) de un texto.
 * Empareja cada id con el secret que aparece mas cerca despues.
 */
function extractPairs(text) {
  const ids = [];
  const secrets = [];
  let match;

  ID_PATTERN.lastIndex = 0;
  while ((match = ID_PATTERN.exec(text)) !== null) {
    ids.push({ value: match[1], index: match.index });
  }
  SECRET_PATTERN.lastIndex = 0;
  while ((match = SECRET_PATTERN.exec(text)) !== null) {
    secrets.push({ value: match[1], index: match.index });
  }

  const pairs = [];
  for (const id of ids) {
    // El secret de este id es el primero que aparece despues.
    const secret = secrets.find((s) => s.index > id.index);
    if (!secret) continue;
    pairs.push({ clientId: id.value, clientSecret: secret.value });
    // Ese secret ya tiene id: no se reutiliza.
    secrets.splice(secrets.indexOf(secret), 1);
  }
  return pairs;
}

let cachedPairs = null;

/** Pares descubiertos en la instalacion local (cacheados en memoria). */
function discoverPairs() {
  if (cachedPairs) return cachedPairs;

  const pairs = [];
  for (const file of candidateFiles()) {
    let text;
    try {
      text = fs.readFileSync(file, 'latin1');
    } catch {
      continue;
    }
    pairs.push(...extractPairs(text));
    if (pairs.length) break;
  }

  cachedPairs = pairs;
  return pairs;
}

/** Pares configurados a mano, que mandan sobre los descubiertos. */
function configuredPairs() {
  const pairs = [];
  const id = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID;
  const secret = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET;
  if (id && secret) pairs.push({ clientId: id, clientSecret: secret });
  return pairs;
}

/**
 * Canjea el refresh_token por un access_token.
 * Prueba cada par disponible hasta que uno no falla.
 *
 * @param {string} refreshToken
 * @returns {Promise<{accessToken:string, clientId:string}|null>}
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) return null;

  const pairs = [...configuredPairs(), ...discoverPairs()];
  if (!pairs.length) return null;

  let lastError = null;
  for (const pair of pairs) {
    // Con timeout: el refresco corre dentro del Promise.all de todos los
    // proveedores, y un fetch colgado bloqueaba la actualizacion de TODOS.
    const res = await fetchJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: pair.clientId,
        client_secret: pair.clientSecret,
      }).toString(),
      timeoutMs: 15000,
    });

    if (!res.ok) {
      lastError = res.data?.error_description || res.data?.error || res.error;
      continue;
    }
    if (res.data?.access_token) {
      return {
        accessToken: res.data.access_token,
        clientId: pair.clientId,
        expiresIn: Number(res.data.expires_in || 3600),
      };
    }
    lastError = res.data?.error || 'sin access_token';
  }

  throw new Error(
    `no se pudo renovar la sesion de Antigravity con ninguno de los ${pairs.length} clientes encontrados` +
      (lastError ? ` (ultimo error: ${lastError})` : '')
  );
}

/** Diagnostico: de donde salen los clientes. */
function describe() {
  const pairs = [...configuredPairs(), ...discoverPairs()];
  return {
    total: pairs.length,
    fromEnv: configuredPairs().length,
    fromInstall: discoverPairs().length,
    files: candidateFiles().filter((f) => fs.existsSync(f)),
  };
}

module.exports = { refreshAccessToken, discoverPairs, extractPairs, describe, TOKEN_URL };
