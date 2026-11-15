'use strict';

// Resolución de credenciales en cascada. La app funciona "out of the box" si
// las herramientas ya están instaladas y autenticadas en el sistema: no hace
// falta copiar claves a mano.

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Parser mínimo de YAML (solo mapeos y escalares) suficiente para .credentials.yaml del harness. */
function parseYamlMappings(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const rawLine of String(text).split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    const m = line.match(/^([A-Za-z0-9_.@/-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rawValue = m[2].trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (rawValue === '') {
      const node = {};
      parent[key] = node;
      stack.push({ indent, node });
    } else {
      parent[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
  return root;
}

let dshCache;
function dshCredentials() {
  if (dshCache !== undefined) return dshCache;
  const file = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  try {
    dshCache = parseYamlMappings(fs.readFileSync(file, 'utf8'));
  } catch {
    dshCache = {};
  }
  return dshCache;
}

function env(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Crea undescriptor de credencial a partir de un valor, o null si no existe. */
function cand(value, source, hint) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return { value: text, source, hint };
}

/**
 * Devuelve la primera credencial disponible de una lista de candidatos.
 * @param {Array<{value:string|null, source:string, hint?:string}>} candidates
 */
function firstValid(candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (c.value && String(c.value).trim()) return c;
  }
  return null;
}

/** Claves de entorno habituales por proveedor. */
const ENV_KEYS = {
  minimax: ['MINIMAX_API_KEY', 'MINIMAX_KEY'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  antigravity: ['ANTIGRAVITY_TOKEN', 'ANTIGRAVITY_API_KEY', 'GOOGLE_ANTIGRAVITY_TOKEN'],
  gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
};

function fromEnv(providerId) {
  for (const name of ENV_KEYS[providerId] || []) {
    const c = cand(env(name), 'variable de entorno', name);
    if (c) return c;
  }
  return null;
}

/** Credenciales guardadas por el usuario en el config de la app. */
function fromUserConfig(config, providerId, field) {
  const entry = config.credentials?.[providerId];
  if (!entry) return null;
  return cand(entry[field], 'configuración de la app', 'introducida a mano');
}

/** Referencias del harness DSH (~/.dsh/.credentials.yaml). */
function fromDsh(providerId) {
  const creds = dshCredentials();
  const refs = creds.refs || {};
  if (providerId === 'minimax') return cand(refs.MINIMAX_API_KEY, 'harness DSH', 'MINIMAX_API_KEY');
  if (providerId === 'deepseek') {
    const grant = creds.records?.['deepseek-account-platform/default'];
    const token = grant?.payload?.token;
    return cand(token, 'harness DSH', 'deepseek-account OAuth');
  }
  if (providerId === 'gemini') return cand(refs.GOOGLE_API_KEY, 'harness DSH', 'GOOGLE_API_KEY');
  return null;
}

/** Claude Code guarda su token OAuth en ~/.claude/.credentials.json. */
function claudeCodeToken() {
  const file = path.join(os.homedir(), '.claude', '.credentials.json');
  const data = readJson(file);
  const token = data?.claudeAiOauth?.accessToken;
  const subscription = data?.claudeAiOauth?.subscriptionType;
  const c = cand(token, 'Claude Code', '.claude/.credentials.json');
  if (c && subscription) c.hint = `Claude Code · ${subscription}`;
  return c;
}

/** Antigravity guarda su credencial de Google en el almacen nativo. */
function antigravityToken() {
  const file = path.join(os.homedir(), '.antigravity', 'auth.json');
  const data = readJson(file);
  const token = data?.token || data?.access_token || data?.accessToken;
  return cand(token, 'Antigravity', '.antigravity/auth.json');
}

module.exports = {
  parseYamlMappings,
  firstValid,
  fromEnv,
  fromUserConfig,
  fromDsh,
  claudeCodeToken,
  antigravityToken,
  dshCredentials,
};
