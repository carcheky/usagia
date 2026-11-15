'use strict';

// Claude (Claude Code / suscripción Max o Pro).
//
// Fuente de verdad: GET https://api.anthropic.com/api/oauth/usage
//   -> five_hour.utilization / seven_day.utilization = % CONSUMIDO (0-100)
//   -> resets_at en ISO-8601
//
// En Windows el token de sesion no esta en ~/.claude/.credentials.json (viene
// vacio): vive cifrado (DPAPI + AES-256-GCM) en la cache de Claude Desktop
// (%APPDATA%\Claude\config.json -> oauth:tokenCacheV2). Se delega en
// scripts/get-claude-usage.ps1, que necesita PowerShell 7.
//
// El endpoint no es publico y la comunidad reporta ~5 peticiones por ventana
// (HTTP 429), asi que la respuesta se cachea 10 minutos.

const { fetchJson, pct100, tone } = require('../http');
const creds = require('../credentials');
const ps = require('../local/ps');
const scriptPath = require('../local/script-path');
const { aggregate, claudeProjectsDir } = require('../local/jsonl-tokens');

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';
const SCRIPT = scriptPath.script('get-claude-usage.ps1');
const CACHE_MS = 10 * 60 * 1000;

// La cache va por CUENTA: con varias cuentas de Claude, una respuesta de la
// cuenta A no puede servirse para la cuenta B.
const cache = new Map();

/** Clave de cache por cuenta, sin guardar el token en claro. */
function cacheKey(ctx, credential) {
  const instanceId = ctx.instance?.id || 'claude';
  const kind = credential?.kind || 'none';
  const value = String(credential?.value || '');
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return `${instanceId}:${kind}:${hash}`;
}

/**
 * El endpoint de uso solo acepta tokens OAuth de la sesion (sk-ant-oat…).
 * Una clave API (sk-ant-api…, la habitual en ANTHROPIC_API_KEY) NO sirve:
 * si se enviara, la consulta fallaria y, al contar como credencial "manual",
 * ademas impediria probar la sesion local. Por eso se descarta aqui.
 */
function isOauthToken(value) {
  return /^sk-ant-oat/i.test(String(value || '').trim());
}

/**
 * Credencial de la cuenta. `kind`:
 *  - manual:  token OAuth pegado por el usuario -> HTTP directo.
 *  - oauth:   token de ~/.claude/.credentials.json -> HTTP directo
 *             (en Windows, el script, que ademas sabe leer la cache cifrada).
 *  - desktop: sin token en claro; en Windows el script descifra la cache de
 *             Claude Desktop (DPAPI + AES-GCM). Antes este caso devolvia null
 *             y el script NUNCA llegaba a ejecutarse, que era justo el
 *             escenario para el que se escribio.
 * `ignored` lleva la fuente de una clave API descartada, para avisar.
 */
async function resolve(ctx) {
  const manual = creds.firstValid([
    creds.fromUserConfig(ctx.config, 'claude', 'apiKey', ctx.instance),
    creds.fromEnv('claude'),
  ]);
  if (manual && isOauthToken(manual.value)) return { ...manual, kind: 'manual' };
  const ignored = manual ? `${manual.source} (${manual.hint})` : null;

  const oauth = creds.claudeCodeToken();
  if (oauth) return { ...oauth, kind: 'oauth', ignored };

  if (process.platform === 'win32') {
    return { value: '', source: 'Claude Desktop', hint: 'cache cifrada', kind: 'desktop', ignored };
  }
  return null;
}

/**
 * Normaliza la respuesta del endpoint de uso.
 *
 * `utilization` viene en escala 0-100 (100 = limite alcanzado). El panel de
 * Claude usa esa misma escala, asi que no hay que invertir nada: se divide
 * entre 100 y ya.
 */
function parseUsage(data) {
  const metrics = [];
  const notes = [];

  const buckets = [
    ['ventana 5 h', data?.five_hour],
    ['semanal', data?.seven_day],
    ['mensual', data?.seven_day_opus ?? data?.seven_day_sonnet],
  ];

  for (const [label, raw] of buckets) {
    if (!raw || typeof raw !== 'object') continue;
    const consumed = pct100(raw.utilization);
    if (consumed === null) continue;
    const remaining = Math.max(0, 1 - consumed);
    metrics.push({
      label,
      value: `${Math.round(consumed * 100)}% usado`,
      short: `${Math.round(consumed * 100)}%`,
      remaining: `queda ${Math.round(remaining * 100)}%`,
      pct: consumed,
      tone: tone(remaining),
    });

    if (raw.resets_at) {
      const when = new Date(raw.resets_at);
      if (!Number.isNaN(when.getTime())) {
        notes.push(
          `${label} se reinicia ${when.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`
        );
      }
    }
  }

  // El panel de Claude muestra ademas un limite con ambito (por modelo, p. ej.
  // "Fable") en `limits[]`. Si esta activo, es el que aplica de verdad.
  const scoped = (data?.limits || []).find((l) => l.kind === 'weekly_scoped' && l.is_active);
  if (scoped && typeof scoped.percent === 'number') {
    const consumed = pct100(scoped.percent);
    if (consumed !== null) {
      const remaining = Math.max(0, 1 - consumed);
      const scope = scoped.scope?.model?.display_name;
      metrics.push({
        label: scope ? `semanal ${scope}` : 'semanal con ámbito',
        value: `${Math.round(consumed * 100)}% usado`,
        short: `${Math.round(consumed * 100)}%`,
        remaining: `queda ${Math.round(remaining * 100)}%`,
        pct: consumed,
        tone: tone(remaining),
      });
    }
  }

  // Reparto de la cuota semanal: cuanto de ella es de Claude Code.
  const cc = (data?.seven_day_breakdown?.rows || []).find((r) => r.key === 'claude_code');
  if (cc && typeof cc.percent === 'number') {
    notes.push(`Claude Code consume el ${Math.round(cc.percent)}% de la cuota semanal`);
  }

  const extra = data?.extra_usage;
  if (extra?.monthly_limit) {
    const usedCredits = extra.used_credits ?? 0;
    const currency = extra.currency || '';
    notes.push(
      extra.is_enabled
        ? `uso extra: ${usedCredits} de ${extra.monthly_limit} ${currency}`.trim()
        : `uso extra desactivado (límite ${extra.monthly_limit} ${currency})`
    );
  }

  return { metrics, notes };
}

/** Primera linea util de un stderr de PowerShell, para el aviso. */
function firstLine(text) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, 160) : 'sin detalle';
}

/**
 * Consulta remota de la cuota.
 * @returns {Promise<{metrics, notes, source}|{error:string}>}
 */
async function remoteUsage(ctx, credential) {
  // Una credencial puesta a mano (token OAuth de otra cuenta, por ejemplo) va
  // siempre por HTTP: el script de PowerShell solo sirve para la sesion local
  // de Claude Desktop.
  const useScript = process.platform === 'win32' && credential.kind !== 'manual';
  if (useScript) {
    const result = await ps.runScript(SCRIPT, ['-Json']);
    if (!result.ok) return { error: `sesión de Claude Desktop: ${firstLine(result.stderr)}` };
    if (!result.stdout.trim()) return { error: 'sesión de Claude Desktop: el script no devolvió nada' };
    let parsed;
    try {
      parsed = parseUsage(JSON.parse(result.stdout));
    } catch (err) {
      return { error: `respuesta ilegible de la sesión: ${err.message}` };
    }
    if (!parsed.metrics.length) return { error: 'la sesión respondió sin cuotas' };
    return { ...parsed, source: 'Claude (sesión)' };
  }

  if (!credential.value) return { error: 'sin token OAuth' };

  const res = await fetchJson(USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${credential.value}`,
      'anthropic-beta': OAUTH_BETA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { error: res.error };

  const parsed = parseUsage(res.data);
  if (!parsed.metrics.length) return { error: 'respuesta sin cuotas' };
  return { ...parsed, source: credential.source };
}

/** Consumo local de las transcripciones de Claude Code (respaldo). */
function localUsage() {
  const day = aggregate(claudeProjectsDir(), Date.now() - 24 * 60 * 60 * 1000);
  if (!day.requests) return null;
  const total = day.input + day.output + day.cacheRead + day.cacheWrite;
  return {
    metrics: [
      { label: 'tokens 24 h', value: formatTokens(total), pct: null, tone: 'neutral' },
      { label: 'peticiones', value: String(day.requests), pct: null, tone: 'neutral' },
    ],
    notes: [`leído de ${day.files} transcripciones locales`],
  };
}

function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(n);
}

async function fetchUsage(ctx) {
  const credential = await resolve(ctx);
  const key = cacheKey(ctx, credential);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.result;
  }

  const remote = credential ? await remoteUsage(ctx, credential) : { error: 'sin sesión de Claude' };
  const warnings = [];
  if (credential?.ignored) {
    warnings.push(`se ignora la clave API de ${credential.ignored}: la cuota solo se consulta con un token OAuth`);
  }

  let result;
  if (!remote.error) {
    result = {
      status: 'ok',
      summary: remote.metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
      metrics: remote.metrics,
      note: [...remote.notes, ...warnings].join(' · '),
      source: remote.source,
    };
  } else {
    // Respaldo: transcripciones locales. El motivo por el que no se pudo
    // consultar la cuota real se deja en la nota, para que no pase en silencio.
    warnings.unshift(`cuota remota no disponible: ${remote.error}`);
    const local = localUsage();
    if (!local) {
      result = { status: 'unconfigured', summary: 'sin sesión', metrics: [], note: warnings.join(' · ') };
    } else {
      result = {
        status: 'ok',
        summary: local.metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
        metrics: local.metrics,
        note: [...local.notes, ...warnings].join(' · '),
        source: 'Claude Code (local)',
      };
    }
  }

  cache.set(key, { at: Date.now(), result });
  return result;
}

module.exports = {
  id: 'claude',
  label: 'Claude',
  color: '#d97757',
  url: 'https://claude.ai/settings/usage',
  credential: {
    label: 'Token OAuth',
    placeholder: 'sk-ant-oat01-…',
    hint: 'Token OAuth (sk-ant-oat…) de otra cuenta de Claude; una clave API sk-ant-api no sirve para la cuota. Vacío = se usa la sesión de Claude Desktop.',
  },
  resolve,
  fetchUsage,
  // Expuestos para las pruebas (funciones puras).
  parseUsage,
  isOauthToken,
};
