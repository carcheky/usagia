'use strict';

// Cuentas ("instancias"): cada una es un proveedor concreto con una etiqueta
// y, opcionalmente, una credencial propia.
//
// Se admiten VARIAS cuentas del mismo proveedor (una por cuenta de IA): por
// ejemplo, dos Minimax distintos, cada uno con su clave. La tarjeta muestra
// una fila por cuenta.
//
// Si el usuario no ha configurado ninguna cuenta, se usa la autodetección:
// una instancia por proveedor, que busca la credencial por la cascada habitual
// (configuración propia -> variable de entorno -> harness DSH -> almacenes
// nativos del sistema).

const config = require('./config');
const { providers } = require('./providers');

/** Proveedor por id. */
function providerById(id) {
  return providers.find((p) => p.id === id) || null;
}

/** Metadatos de los proveedores, para la ventana de configuración. */
function catalog() {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    url: p.url || null,
    credential: {
      field: 'apiKey',
      label: (p.credential && p.credential.label) || 'Credencial',
      placeholder: (p.credential && p.credential.placeholder) || '',
      hint: (p.credential && p.credential.hint) || '',
    },
  }));
}

function newId() {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Etiqueta única: si el nombre ya existe, se le añade un sufijo. */
function uniqueLabel(base, used) {
  let label = base;
  let n = 2;
  while (used.has(label.toLowerCase())) {
    label = `${base} ${n}`;
    n += 1;
  }
  return label;
}

function cleanCredentials(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) out[key] = text;
  }
  return out;
}

/**
 * Normaliza una cuenta configurada por el usuario.
 * @returns {object|null} null si el proveedor no existe.
 */
function normalizeAccount(raw, used) {
  if (!raw || typeof raw !== 'object') return null;
  const provider = providerById(raw.provider);
  if (!provider) return null;

  const base = String(raw.label || '').trim() || provider.label;
  const label = uniqueLabel(base, used);
  used.add(label.toLowerCase());

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newId(),
    provider: provider.id,
    label,
    enabled: raw.enabled !== false,
    credentials: cleanCredentials(raw.credentials),
  };
}

/**
 * Lista efectiva de cuentas.
 * @returns {Array<{id,provider,label,enabled,credentials}>}
 */
function list() {
  const cfg = config.load();
  const used = new Set();

  if (cfg.accounts.length) {
    return cfg.accounts.map((raw) => normalizeAccount(raw, used)).filter(Boolean);
  }

  // Autodetección: una cuenta por proveedor, con la activación heredada.
  return providers.map((p) => ({
    id: p.id,
    provider: p.id,
    label: p.label,
    enabled: config.isProviderEnabled(p.id),
    credentials: {},
  }));
}

/** Instancia por id (la usan los cachés por cuenta). */
function byId(id) {
  return list().find((i) => i.id === id) || null;
}

module.exports = { list, byId, catalog, normalizeAccount, providerById, newId };
