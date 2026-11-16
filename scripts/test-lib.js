'use strict';

// Utilidades comunes de las pruebas. Node PURO, sin dependencias.
//
// Cada fichero `scripts/test-*.js` es un proceso aparte (lo lanza
// `scripts/test.js`), asi que puede fijar su propio HOME falso y sus propias
// variables de entorno ANTES de cargar los modulos de la app.
//
//   const t = require('./test-lib');
//   const home = t.fakeHome('mi-suite');       // antes de cualquier require de src/
//   t.section('cosa:');
//   t.check('hace tal', async () => { ... });  // sync o async
//   t.finish('OK: todo pasa');                 // ejecuta la cola y sale con 0/1

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const queue = [];
let failures = 0;
let passed = 0;

/** Imprime una cabecera cuando le toque en la cola. */
function section(title) {
  queue.push({ title });
}

/** Encola una prueba. `fn` puede devolver una promesa. */
function check(name, fn) {
  queue.push({ name, fn });
}

async function runQueue() {
  for (const item of queue) {
    if (item.title) {
      console.log(item.title);
      continue;
    }
    try {
      await item.fn();
      passed += 1;
      console.log(`  OK   ${item.name}`);
    } catch (err) {
      failures += 1;
      console.log(`  FALLO ${item.name}: ${err.message}`);
    }
  }
}

/**
 * Ejecuta la cola y termina el proceso. `cleanup` (opcional) se llama al
 * final, pase lo que pase (por ejemplo, para borrar el HOME falso).
 */
function finish(okMessage = 'OK: todas las pruebas pasan', cleanup) {
  runQueue()
    .catch((err) => {
      failures += 1;
      console.log(`  FALLO (inesperado): ${err.stack || err.message}`);
    })
    .finally(() => {
      try {
        if (cleanup) cleanup();
      } catch {
        /* el temporal se borra solo tarde o temprano */
      }
      console.log(failures ? `\nFALLO: ${failures} prueba(s) fallida(s) (${passed} OK)` : `\n${okMessage} (${passed})`);
      process.exit(failures ? 1 : 0);
    });
}

/* ------------------------------------------------------------- HOME falso */

/**
 * Crea un HOME temporal y apunta a el todas las variables que la app mira
 * (USERPROFILE/HOME/APPDATA/LOCALAPPDATA/XDG_CONFIG_HOME). Vacia tambien las
 * variables de entorno de credenciales, para que la maquina del autor no
 * contamine la prueba. Hay que llamarlo ANTES de cargar `src/main/*`.
 *
 * @returns {string} ruta del HOME falso
 */
function fakeHome(prefix = 'usagia-test') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
  process.env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  process.env.XDG_CONFIG_HOME = path.join(home, '.config');
  for (const name of [
    'MINIMAX_API_KEY',
    'MINIMAX_KEY',
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'DEEPSEEK_API_KEY',
    'ANTIGRAVITY_TOKEN',
    'ANTIGRAVITY_API_KEY',
    'GOOGLE_ANTIGRAVITY_TOKEN',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
  ]) {
    delete process.env[name];
  }
  // El Administrador de credenciales de Windows es del sistema: un HOME falso
  // no lo esconde. Esta variable apaga su lectura (ver local/credstore.js).
  process.env.USAGIA_SIMULATE_CLEAN_ENV = '1';
  return home;
}

/** Escribe un fichero creando las carpetas que falten. */
function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
  return file;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

/* ----------------------------------------------------------- fetch falso */

const realFetch = global.fetch;

/**
 * Sustituye `fetch` por un simulador. `handler(url, options, n)` devuelve
 * `{ status?, body? }` (body objeto o texto) o lanza para simular un fallo de
 * red. Devuelve la lista de llamadas hechas, para poder inspeccionar cabeceras
 * y cuerpos.
 *
 * Solo cubre lo que usa `http.fetchJson`: `ok`, `status` y `text()`.
 */
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const call = { url: String(url), options, headers: options.headers || {} };
    calls.push(call);
    const reply = (await handler(call.url, options, calls.length)) || {};
    const status = reply.status || 200;
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? null);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  };
  return calls;
}

/** Un `fetch` que no debe llamarse: si se llama, la prueba falla. */
function forbidFetch(reason = 'no deberia haber peticiones') {
  return mockFetch(() => {
    throw new Error(reason);
  });
}

function restoreFetch() {
  global.fetch = realFetch;
}

module.exports = {
  assert,
  section,
  check,
  finish,
  fakeHome,
  writeFile,
  removeDir,
  mockFetch,
  forbidFetch,
  restoreFetch,
};
