'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('./crypto');

const DEFAULTS = {
  // Cada cuánto se refrescan los datos en segundo plano (segundos).
  refreshSeconds: 120,
  // Mostrar la tarjeta rica al pasar el ratón por el icono de la bandeja.
  showOnHover: true,
  // Segundos sin mover el ratón dentro de la zona del icono para cerrar la tarjeta.
  hoverCloseDelayMs: 400,
  // Buscar actualizaciones automáticamente.
  updateCheck: true,
  // Canal de actualización: 'auto' (sigue a la versión instalada), 'stable'
  // (solo estables) o 'beta' (incluye las betas). Por defecto 'auto': la app
  // todavía no ha publicado ninguna estable, y con 'stable' fijo la
  // comprobación no encontraría nunca nada.
  updateChannel: 'auto',
  // Bajar la actualización en cuanto se sepa que hay una (sin preguntar).
  updateAutoDownload: true,
  // Instalarla sola al cerrar la app, sin que el usuario haga nada.
  updateInstallOnQuit: true,
  // Cuentas configuradas por el usuario. Cada cuenta es una instancia de un
  // proveedor y puede haber VARIAS del mismo proveedor (una por cuenta).
  // Lista vacía = autodetección: una cuenta por proveedor.
  accounts: [],
  // Obsoleto, se mantiene por compatibilidad con configuraciones anteriores:
  // activación por proveedor: {} = usar el valor por defecto del proveedor.
  providers: {},
  // Obsoleto, se mantiene por compatibilidad: credenciales globales escritas
  // a mano (siguen siendo la última fuente antes de las variables de entorno).
  credentials: {},
};

let cache = null;

/**
 * Carpeta de datos de la app.
 *
 * Fuera de Electron (por ejemplo en el script de consulta `scripts/probe.js`,
 * que corre en CI sin display) no hay `app.getPath`, asi que se calcula con la
 * convencion de cada sistema. Esto permite consultar las cuotas en Node puro,
 * sin arrancar la GUI.
 */
function userDataDir() {
  try {
    // En Node plano, `require('electron')` devuelve la RUTA del binario (un
    // string), no el modulo: por eso se comprueba antes de usar `app`.
    const electron = require('electron');
    const app = electron && electron.app;
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    /* no estamos en Electron */
  }

  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'Usagia');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Usagia');
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'Usagia');
}

function configPath() {
  return path.join(userDataDir(), 'config.json');
}

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Descifra las credenciales de las cuentas.
 * Las cifradas que no se puedan descifrar (Node puro, otro usuario) se marcan
 * con `_encrypted: true` para que la cascada las salte pero la UI sepa que hay
 * algo guardado.
 */
function decryptAccounts(accounts) {
  if (!Array.isArray(accounts)) return accounts;
  return accounts.map((acc) => {
    if (!acc || !acc.credentials || typeof acc.credentials !== 'object') return acc;
    const creds = {};
    let anyEncrypted = false;
    for (const [key, value] of Object.entries(acc.credentials)) {
      if (crypto.isEncrypted(value)) {
        const plain = crypto.decrypt(value);
        if (plain === null) {
          // No se pudo descifrar: marcar pero no incluir el valor.
          anyEncrypted = true;
        } else {
          creds[key] = plain;
        }
      } else {
        creds[key] = value;
      }
    }
    return { ...acc, credentials: creds, _encrypted: anyEncrypted || undefined };
  });
}

/**
 * Cifra las credenciales de las cuentas antes de guardar.
 * Las que ya están cifradas se dejan tal cual.
 */
function encryptAccounts(accounts) {
  if (!Array.isArray(accounts)) return accounts;
  return accounts.map((acc) => {
    if (!acc || !acc.credentials || typeof acc.credentials !== 'object') return acc;
    const creds = {};
    for (const [key, value] of Object.entries(acc.credentials)) {
      if (typeof value === 'string' && value.trim() && !crypto.isEncrypted(value)) {
        creds[key] = crypto.encrypt(value);
      } else {
        creds[key] = value;
      }
    }
    // Limpiar el marcador _encrypted al guardar.
    const { _encrypted, ...rest } = acc;
    return { ...rest, credentials: creds };
  });
}

/** Rellena los huecos y normaliza los tipos del archivo de configuración. */
function normalize(file, decrypt = true) {
  const base = { ...DEFAULTS, ...file };
  // Solo se copian objetos planos: `{ ...'x' }` da `{ 0: 'x' }` y
  // `{ ...[1] }` da `{ 0: 1 }`, que no son mapas por proveedor.
  const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {});
  base.providers = plain(file.providers);
  base.credentials = plain(file.credentials);
  let accounts = Array.isArray(file.accounts)
    ? file.accounts.filter((a) => a && typeof a === 'object').map((a) => ({ ...a }))
    : [];
  // Descifrar las credenciales al leer (a menos que estemos preparando para
  // guardar, donde decrypt=false para no descifrar y volver a cifrar).
  if (decrypt) accounts = decryptAccounts(accounts);
  base.accounts = accounts;
  // Normalizar los ajustes de actualizaciones.
  if (typeof base.updateCheck !== 'boolean') base.updateCheck = DEFAULTS.updateCheck;
  if (typeof base.updateAutoDownload !== 'boolean') {
    base.updateAutoDownload = DEFAULTS.updateAutoDownload;
  }
  if (typeof base.updateInstallOnQuit !== 'boolean') {
    base.updateInstallOnQuit = DEFAULTS.updateInstallOnQuit;
  }
  const UPDATE_CHANNELS = ['auto', 'stable', 'beta'];
  if (!UPDATE_CHANNELS.includes(base.updateChannel)) base.updateChannel = DEFAULTS.updateChannel;
  return base;
}

function load() {
  if (!cache) cache = normalize(readFile());
  return cache;
}

/**
 * Escribe la configuración en disco y actualiza la caché.
 * @throws si no se puede escribir: la caché NO se toca, para que la app no
 *   siga con una configuración que no existe en disco.
 */
function write(next) {
  const file = configPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[usagia] no se pudo guardar la configuración:', err.message);
    throw new Error(`no se pudo guardar ${file}: ${err.message}`);
  }
  cache = next;
}

/**
 * Aplica un parche y lo persiste.
 * @throws si el disco falla (antes se devolvía la config "guardada" igual y
 *   la ventana decía "Guardado" aunque no se hubiera escrito nada).
 */
function save(patch) {
  // Cifrar las credenciales del parche ANTES de mezclar con la config actual.
  const patchWithEncrypted = patch && patch.accounts
    ? { ...patch, accounts: encryptAccounts(patch.accounts) }
    : patch;
  // normalize(decrypt=false) para no descifrar lo que ya viene cifrado.
  const toWrite = normalize({ ...readFile(), ...(patchWithEncrypted || {}) }, /* decrypt */ false);
  write(toWrite);
  // Invalidar la caché para que la siguiente lectura descifre de nuevo.
  cache = null;
  return load();
}

/** Vacía la caché: la siguiente lectura vuelve al archivo. */
function invalidate() {
  cache = null;
}

function isProviderEnabled(id, fallback = true) {
  const entry = load().providers[id];
  if (!entry || typeof entry.enabled !== 'boolean') return fallback;
  return entry.enabled;
}

module.exports = {
  load,
  save,
  write,
  invalidate,
  isProviderEnabled,
  configPath,
  userDataDir,
  isEncryptionAvailable: crypto.isAvailable,
  DEFAULTS,
};
