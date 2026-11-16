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

// La busqueda se hace POR TROZOS: el fichero entero no se carga nunca en
// memoria (app.asar puede pesar mas de 100 MB y aqui solo se buscan dos
// regex). Se lee de 1 MiB en 1 MiB, con un solape entre trozos para que un
// par id+secret partido justo en el limite se siga viendo.
const SCAN_CHUNK = 1024 * 1024;
const SCAN_OVERLAP = 64 * 1024;
// Tope de bytes leidos de un app.asar: SOLO se lee el principio, por tamano
// (el asar puede pesar cientos de MB y el caso real es que los pares estan
// en resources/app/out/main.js, el primer candidato). Los .js sueltos se
// leen enteros, pero siempre por trozos: la memoria sigue siendo acotada.
const MAX_ASAR_BYTES = 16 * 1024 * 1024;

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

/**
 * Extrae los pares (clientId, clientSecret) de un fichero sin cargarlo
 * entero en memoria: se lee por trozos de 1 MiB (con solape) y se aplica
 * `extractPairs` a cada trozo.
 *
 * @param {string} file
 * @returns {{clientId: string, clientSecret: string}[]}
 */
function extractPairsFromFile(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    // Un app.asar solo se lee por el principio (ver MAX_ASAR_BYTES); los
    // .js sueltos se leen enteros, siempre por trozos.
    const limit = file.toLowerCase().endsWith('.asar')
      ? Math.min(size, MAX_ASAR_BYTES)
      : size;

    const pairs = [];
    const seen = new Set();
    const buffer = Buffer.allocUnsafe(SCAN_CHUNK);
    let carry = '';
    let read = 0;

    while (read < limit) {
      const want = Math.min(SCAN_CHUNK, limit - read);
      const n = fs.readSync(fd, buffer, 0, want, read);
      if (n <= 0) break;
      read += n;

      const text = carry + buffer.toString('latin1', 0, n);
      for (const pair of extractPairs(text)) {
        // El solape hace que un par visto en dos trozos aparezca dos veces.
        const key = `${pair.clientId}\u0000${pair.clientSecret}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(pair);
      }
      // Cola para el siguiente trozo.
      carry = text.length > SCAN_OVERLAP ? text.slice(-SCAN_OVERLAP) : text;
    }

    return pairs;
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* da igual */
      }
    }
  }
}

let cachedPairs = null;

/** Pares descubiertos en la instalacion local (cacheados en memoria). */
function discoverPairs() {
  if (cachedPairs) return cachedPairs;

  const pairs = [];
  for (const file of candidateFiles()) {
    pairs.push(...extractPairsFromFile(file));
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

module.exports = {
  refreshAccessToken,
  discoverPairs,
  extractPairs,
  describe,
  TOKEN_URL,
  // Auxiliar (interno): la busqueda por trozos, expuesta para poder
  // probarla sin depender de una instalacion de Antigravity real.
  extractPairsFromFile,
};
