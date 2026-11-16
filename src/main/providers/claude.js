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

const { fetchJson, pct100, tone, sortMetrics } = require('../http');
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

/**
 * Clave de cache por cuenta. Se usa el id de la cuenta y NO el token: con
 * una lista de candidatos, el token que acaba funcionando puede cambiar de
 * una consulta a otra, y la respuesta de la cuenta A no puede servirse para
 * la cuenta B.
 */
function cacheKey(ctx) {
  return `claude:${ctx.instance?.id || 'default'}`;
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
 * Candidatos de credencial, en orden de preferencia.
 *
 * Cada uno lleva `kind`:
 *  - manual:  token OAuth pegado por el usuario -> HTTP directo.
 *  - oauth:   token OAuth vigente en claro (Claude Code o el harness DSH)
 *             -> HTTP directo.
 *  - desktop: sin token en claro; en Windows el script descifra la cache de
 *             Claude Desktop (DPAPI + AES-GCM). Los tokens de ahi duran
 *             meses, asi que es el mas duradero de los tres.
 *
 * OJO con los tokens CADUCADOS: si se usan, el endpoint responde 401 y la
 * app cae al respaldo local (transcripciones), que NO es la cuota. Por eso
 * un token con `expiresAt` en el pasado no se usa: se pasa al siguiente.
 *
 * @returns {Promise<Array<object>>} lista de candidatos (puede estar vacia)
 */
async function resolve(ctx) {
  const manual = creds.firstValid([
    creds.fromUserConfig(ctx.config, 'claude', 'apiKey', ctx.instance),
    creds.fromEnv('claude'),
  ]);
  const ignored = manual ? `${manual.source} (${manual.hint})` : null;
  const candidates = [];

  // 1) Token pegado a mano: manda sobre cualquier otra cosa.
  if (manual && isOauthToken(manual.value)) {
    candidates.push({ ...manual, kind: 'manual', ignored });
    return candidates;
  }

  // 2) Tokens OAuth en claro que NO esten caducados. El del harness DSH
  //    ("llm-pi-ai/anthropic") es la misma sesion de Claude Code, pero la
  //    copia que el harness renueva: suele estar mas al dia que el fichero
  //    de ~/.claude.
  const oauth = creds.claudeCodeToken();
  if (oauth && !isExpired(oauth.expiresAt)) {
    candidates.push({ ...oauth, kind: 'oauth', ignored });
  }
  const dsh = creds.fromDsh('claude');
  if (dsh && !isExpired(dsh.expiresAt)) {
    candidates.push({ ...dsh, kind: 'oauth', ignored });
  }

  // 3) Cache cifrada de Claude Desktop (solo Windows). Es la mas duradera:
  //    sus grants siguen vivos semanas, cuando los tokens de la CLI caducan
  //    en horas.
  if (process.platform === 'win32') {
    candidates.push({ value: '', source: 'Claude Desktop', hint: 'cache cifrada', kind: 'desktop', ignored });
  }
  return candidates;
}

/**
 * Un token con `expiresAt` en el pasado ya no vale: el endpoint responde 401
 * ("OAuth access token has been revoked") y la cuota real desaparece.
 *
 * @param {number|null|undefined} expiresAt milisegundos epoch
 * @returns {boolean} true si el token esta caducado
 */
function isExpired(expiresAt) {
  const ms = Number(expiresAt);
  if (!Number.isFinite(ms) || ms <= 0) return false;
  return ms <= Date.now();
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
    ['ventana 5 h', data?.five_hour, '5h'],
    ['semanal', data?.seven_day, 'weekly'],
    ['mensual', data?.seven_day_opus ?? data?.seven_day_sonnet, 'monthly'],
  ];

  for (const [label, raw, window] of buckets) {
    if (!raw || typeof raw !== 'object') continue;
    const consumed = pct100(raw.utilization);
    if (consumed === null) continue;
    const remaining = Math.max(0, 1 - consumed);
    metrics.push({
      label,
      window,
      value: `${Math.round(consumed * 100)}% usado`,
      short: `${Math.round(consumed * 100)}%`,
      remaining: `queda ${Math.round(remaining * 100)}%`,
      pct: consumed,
      tone: tone(remaining),
    });

    if (raw.resets_at) {
      const when = new Date(raw.resets_at);
      if (!Number.isNaN(when.getTime())) {
        // El reinicio va en la propia metrica, en la misma linea que el
        // valor: asi se ve junto a la barra que le corresponde, sin que la
        // tarjeta crezca una linea por ventana (y sin que el texto final
        // se corte con "...").
        metrics[metrics.length - 1].reset = when.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
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
        window: 'weekly_scoped',
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
    // Solo se avisa del uso extra cuando HAY algo que avisar: "desactivado"
    // con un limite de 3600 EUR no es informacion, es ruido (y la nota se
    // cortaba con "...").
    if (extra.is_enabled) {
      notes.push(`uso extra: ${usedCredits} de ${extra.monthly_limit} ${currency}`.trim());
    } else if (usedCredits > 0) {
      notes.push(`uso extra: ${usedCredits} de ${extra.monthly_limit} ${currency}`.trim());
    }
  }

  return { metrics: sortMetrics(metrics), notes };
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
 *
 * Un fallo de AUTENTICACION (401/403) se marca con `authError: true`: es el
 * unico motivo por el que tiene sentido probar el siguiente candidato (un
 * token caducado o revocado). Un 429 o un fallo de red NO se reintentan: el
 * endpoint da pocas peticiones por ventana y probarlo otra vez solo gasta el
 * margen.
 *
 * @returns {Promise<{metrics, notes, source}|{error:string, authError?:boolean}>}
 */
async function remoteUsage(ctx, credential) {
  // El script de PowerShell solo hace falta cuando NO hay un token en claro
  // (caso "desktop": la cache cifrada de Claude Desktop). Con un token OAuth
  // a mano se va por HTTP, que es mas rápido y no depende de PowerShell.
  const useScript = process.platform === 'win32' && credential.kind === 'desktop';
  if (useScript) {
    const result = await ps.runScript(SCRIPT, ['-Json']);
    if (!result.ok) {
      const detail = firstLine(result.stderr);
      // El script avisa con "HTTP 401" cuando el token que ha elegido esta
      // caducado: eso si es un problema de autenticacion.
      const authError = /401|unauthorized|revoked/i.test(detail);
      return { error: `sesión de Claude Desktop: ${detail}`, authError };
    }
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
  if (!res.ok) {
    return { error: res.error, authError: res.status === 401 || res.status === 403 };
  }

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
  const key = cacheKey(ctx);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.result;
  }

  const candidates = await resolve(ctx);
  const warnings = [];

  // Se prueban los candidatos EN ORDEN hasta que uno responda. El endpoint
  // es generoso (un 429 por ventana), asi que solo se pasa al siguiente si
  // el anterior fallo de AUTENTICACION: un 429 no se reintenta, porque
  // repetirlo solo gastaria el poco margen que tiene.
  let remote = null;
  let used = null;
  for (const candidate of candidates) {
    const attempt = await remoteUsage(ctx, candidate);
    if (!attempt.error) {
      remote = attempt;
      used = candidate;
      break;
    }
    if (attempt.authError) {
      warnings.push(`${candidate.source}: ${attempt.error}`);
      continue;
    }
    // Otro tipo de fallo (429, red): no se prueba mas, se informa tal cual.
    remote = attempt;
    break;
  }
  if (!remote) remote = { error: 'sin sesión de Claude' };

  if (used?.ignored) {
    warnings.push(`se ignora la clave API de ${used.ignored}: la cuota solo se consulta con un token OAuth`);
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
    // Respaldo: transcripciones locales. NO son la cuota, asi que el estado
    // es "warning" y no "ok": si la fila saliera en verde, alguien leeria
    // "todo correcto" sin saber que la cuota real no se pudo consultar.
    warnings.unshift(`cuota remota no disponible: ${remote.error}`);
    const local = localUsage();
    if (!local) {
      result = { status: 'unconfigured', summary: 'sin cuota', metrics: [], note: warnings.join(' · ') };
    } else {
      result = {
        status: 'warning',
        summary: 'cuota no disponible',
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
  isExpired,
};
