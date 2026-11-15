'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  // Cada cuánto se refrescan los datos en segundo plano (segundos).
  refreshSeconds: 120,
  // Mostrar la tarjeta rica al pasar el ratón por el icono de la bandeja.
  showOnHover: true,
  // Segundos sin mover el ratón dentro de la zona del icono para cerrar la tarjeta.
  hoverCloseDelayMs: 400,
  // Idioma de las etiquetas de la tarjeta.
  locale: 'es',
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

/** Rellena los huecos y normaliza los tipos del archivo de configuración. */
function normalize(file) {
  const base = { ...DEFAULTS, ...file };
  base.providers = { ...(file.providers || {}) };
  base.credentials = { ...(file.credentials || {}) };
  base.accounts = Array.isArray(file.accounts)
    ? file.accounts.filter((a) => a && typeof a === 'object').map((a) => ({ ...a }))
    : [];
  return base;
}

function load() {
  if (!cache) cache = normalize(readFile());
  return cache;
}

/** Escribe la configuración en disco y actualiza la caché. */
function write(next) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[usagia] no se pudo guardar la configuración:', err.message);
    return false;
  }
  cache = next;
  return true;
}

function save(patch) {
  const next = normalize({ ...load(), ...(patch || {}) });
  write(next);
  return next;
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
  DEFAULTS,
};
