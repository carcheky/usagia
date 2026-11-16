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
 * Id ESTABLE para una cuenta que no trae uno (config.json editado a mano).
 *
 * No puede ser aleatorio: `list()` se llama en cada refresco y en cada
 * repintado, y el id es la clave de `state.results` y de las caches por
 * cuenta. Con un id distinto en cada llamada, el resultado guardado con un id
 * nunca se encontraba con el siguiente, y la fila se quedaba en "…" para
 * siempre. Se deriva del proveedor y de la etiqueta ya unica.
 */
function derivedId(provider, label) {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${provider}:${slug || 'cuenta'}`;
}

/**
 * Garantiza que cada cuenta tenga un id UNICO.
 *
 * El id es la clave de `state.results` y de las caches por cuenta: si dos
 * cuentas comparten id, la fila de una ensena la cuota de la otra (el ultimo
 * `write` gana) y el tono del icono de la bandeja se calcula sobre el dato
 * equivocado.
 *
 * Hace falta porque el id derivado de `derivedId()` sale de un slug de la
 * etiqueta: "Trabajo!" y "Trabajo?" dan el mismo slug, y un id escrito a
 * mano puede coincidir con uno derivado. El sufijo depende solo del orden,
 * asi que el id sigue siendo ESTABLE entre refrescos.
 */
function uniqueIds(accounts) {
  const seen = new Set();
  const out = [];
  for (const account of accounts) {
    let id = account.id;
    let n = 2;
    while (seen.has(id)) {
      id = `${account.id}-${n}`;
      n += 1;
    }
    seen.add(id);
    out.push({ ...account, id });
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
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : derivedId(provider.id, label),
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
    const accounts = cfg.accounts.map((raw) => normalizeAccount(raw, used)).filter(Boolean);
    return uniqueIds(accounts);
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

module.exports = { list, byId, catalog, normalizeAccount, uniqueIds, providerById };
