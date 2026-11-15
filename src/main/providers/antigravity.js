'use strict';

// Google Antigravity (el IDE).
//
// Su credencial de Google vive en el Administrador de credenciales de Windows
// con el destino "gemini:antigravity" (JSON con access_token + refresh_token).
// El access_token caduca en ~1 h, así que se refresca contra el endpoint OAuth
// de Google con el refresh_token (que no rota) y se consulta el resumen de
// cuota de Cloud Code.
//
// Endpoint: POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
// Son llamadas de metadatos: no consumen cuota de modelos.

const { fetchJson, used, tone } = require('../http');
const creds = require('../credentials');
const credstore = require('../local/credstore');
const client = require('../local/antigravity-client');

const CRED_TARGET = 'gemini:antigravity';
const HOST = 'https://cloudcode-pa.googleapis.com';

const WINDOW_LABELS = { '5h': '5 h', weekly: 'semanal', daily: 'diario', monthly: 'mensual' };

// El access_token se cachea por CUENTA: con varias cuentas de Antigravity,
// el token de una no puede servirse para la otra.
const tokenCache = new Map();

/**
 * Una credencial pegada a mano puede ser el access_token a secas o el JSON
 * completo con access_token + refresh_token (lo que promete la pista del
 * formulario). Antes todo lo manual se marcaba `raw` y el JSON entero iba
 * como Bearer.
 */
function manualKind(value) {
  return String(value || '').trim().startsWith('{') ? 'json' : 'raw';
}

async function resolve(ctx) {
  const manual = creds.firstValid([
    creds.fromUserConfig(ctx.config, 'antigravity', 'apiKey', ctx.instance),
    creds.fromEnv('antigravity'),
  ]);
  if (manual) return { ...manual, kind: manualKind(manual.value) };

  const local = creds.antigravityToken();
  if (local) return { ...local, kind: 'raw' };

  if (process.platform === 'win32') {
    const stored = await credstore.read(CRED_TARGET);
    if (stored) {
      return { value: stored.secret, source: 'Windows (credenciales)', hint: stored.user, kind: 'json' };
    }
  }
  return null;
}

/** Devuelve un access_token válido, refrescándolo si hace falta. */
async function getAccessToken(credential) {
  if (credential.kind === 'raw') return credential.value;

  let parsed;
  try {
    parsed = JSON.parse(credential.value);
  } catch {
    throw new Error('credencial de Antigravity ilegible');
  }
  const token = parsed?.token || parsed;

  const expiry = token?.expiry ? Date.parse(token.expiry) : 0;
  if (token?.access_token && expiry > Date.now() + 120000) {
    return token.access_token;
  }

  const key = token?.refresh_token || credential.value;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 120000) {
    return cached.accessToken;
  }
  if (!token?.refresh_token) {
    throw new Error('la credencial de Antigravity está caducada y no tiene refresh_token');
  }

  // El canje lo hace el modulo de cliente: descubre los pares id+secret en
  // la instalacion local de Antigravity y prueba hasta que uno vale.
  const refreshed = await client.refreshAccessToken(token.refresh_token);
  if (!refreshed) {
    throw new Error(
      'no se encontró el cliente OAuth de Antigravity: instala Antigravity o define ANTIGRAVITY_OAUTH_CLIENT_ID y ANTIGRAVITY_OAUTH_CLIENT_SECRET'
    );
  }

  tokenCache.set(key, {
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
  });
  return refreshed.accessToken;
}

async function fetchQuotaSummary(accessToken) {
  const res = await fetchJson(`${HOST}/v1internal:retrieveUserQuotaSummary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/2.32.1',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data;
}

function parseSummary(data) {
  const metrics = [];
  const notes = [];

  for (const group of data?.groups || []) {
    const groupName = String(group.displayName || 'cuota');
    for (const bucket of group.buckets || []) {
      const remaining = bucket.remainingFraction;
      if (typeof remaining !== 'number') continue;
      const window = WINDOW_LABELS[bucket.window] || bucket.window || '';
      const consumed = used(remaining);
      metrics.push({
        label: window ? `${groupName} · ${window}` : groupName,
        value: `${(consumed * 100).toFixed(consumed >= 0.995 || consumed === 0 ? 0 : 1)}% usado`,
        short: `${Math.round(consumed * 100)}%`,
        remaining: `queda ${(remaining * 100).toFixed(remaining >= 0.995 || remaining === 0 ? 0 : 1)}%`,
        pct: consumed,
        tone: tone(remaining),
      });
      if (bucket.resetTime) {
        const when = new Date(bucket.resetTime);
        if (!Number.isNaN(when.getTime())) {
          notes.push(
            `${groupName} (${window || bucket.bucketId}) reinicia ${when.toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}`
          );
        }
      }
    }
  }

  return { metrics, notes };
}

async function fetchUsage(ctx) {
  const credential = await resolve(ctx);
  if (!credential) {
    return { status: 'unconfigured', summary: 'sin credencial', metrics: [] };
  }

  try {
    const accessToken = await getAccessToken(credential);
    const data = await fetchQuotaSummary(accessToken);
    const { metrics, notes } = parseSummary(data);

    if (!metrics.length) {
      return { status: 'error', summary: 'sin datos', metrics: [], error: 'respuesta sin cuotas' };
    }

    return {
      status: 'ok',
      summary: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
      metrics,
      note: notes.join(' · '),
      source: credential.source,
    };
  } catch (err) {
    return { status: 'error', summary: 'error', metrics: [], error: err.message };
  }
}

module.exports = {
  id: 'antigravity',
  label: 'Antigravity',
  color: '#8b7cf6',
  url: 'https://antigravity.google/',
  credential: {
    label: 'Credencial de Google',
    placeholder: '{"token": {...}}',
    hint: 'JSON con access_token/refresh_token, o el token a secas. Vacío = se busca en Windows.',
  },
  resolve,
  fetchUsage,
  // Expuestos para las pruebas (funciones puras o sin red con token vigente).
  manualKind,
  getAccessToken,
  parseSummary,
};
