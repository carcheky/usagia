'use strict';

const { app } = require('electron');
const fs = require('fs');
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
  // Activación por proveedor: {} = usar el valor por defecto del proveedor.
  providers: {},
  // Credenciales escritas a mano (tienen prioridad sobre la autodetección).
  credentials: {},
};

let cache = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  if (cache) return cache;
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    file = {};
  }
  cache = { ...DEFAULTS, ...file };
  cache.providers = { ...(file.providers || {}) };
  cache.credentials = { ...(file.credentials || {}) };
  return cache;
}

function save(patch) {
  const next = { ...load(), ...(patch || {}) };
  cache = next;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[usagia] no se pudo guardar la configuración:', err.message);
  }
  return next;
}

function isProviderEnabled(id, fallback = true) {
  const entry = load().providers[id];
  if (!entry || typeof entry.enabled !== 'boolean') return fallback;
  return entry.enabled;
}

module.exports = { load, save, isProviderEnabled, configPath, DEFAULTS };
