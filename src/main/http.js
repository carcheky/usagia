'use strict';

const DEFAULT_TIMEOUT = 20000;

/**
 * Petición JSON con timeout y errores normalizados.
 * @returns {Promise<{ok:boolean, status:number, data:any, error:string|null}>}
 */
async function fetchJson(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message =
        (data && (data.error?.message || data.message || data.base_resp?.status_msg)) ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: message };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 0, data: null, error: 'tiempo de espera agotado' };
    }
    return { ok: false, status: 0, data: null, error: err.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normaliza un porcentaje 0-100 a la escala 0-1.
 *
 * IMPORTANTE: la escala es FIJA por proveedor y no se deduce del valor.
 * La version anterior ("si > 1, divide entre 100") fallaba justo en el
 * valor 1, que es donde cae la confusion entre "1 %" y "100 %":
 *   - Claude devuelve utilization=1 para "1 % usado"  -> se pintaba 100 %
 *   - Minimax devuelve remaining=1 para "1 % que queda" -> se pintaba 0 %
 * Los tres proveedores que consume la app devuelven 0-100 en el campo que
 * usa cada uno (Antigravity usa remainingFraction, que ya es 0-1, y por eso
 * no pasa por aqui).
 *
 * @param {number} value porcentaje 0-100
 * @returns {number|null} 0-1, o null si el valor no es numerico
 */
function pct100(value) {
  // Number(null) y Number('') son 0: un campo ausente se convertia en "0 %",
  // que para un restante significa "agotado" (critico). Ausente = null.
  // Tambien una cadena de solo espacios: Number(' ') es 0 igual que Number('').
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/**
 * Porcentaje 0-1 con un decimal solo cuando hace falta: 15.4 %, 99 %, 0 %.
 * (Antes salia "99.0 %".)
 */
function fmtPercent1(p) {
  if (p === null || p === undefined) return '—';
  return `${Number((p * 100).toFixed(1))}%`;
}

/**
 * Convierte un % restante en % consumido.
 *
 * Minimax y Antigravity devuelven en sus APIs el porcentaje que QUEDA, mientras
 * que Claude devuelve el porcentaje CONSUMIDO (utilization). Todos los paneles
 * de cada proveedor muestran lo CONSUMIDO, asi que para que las barras de la
 * app se llenen como las del panel (0 % = nada usado) trabajamos siempre con
 * "usado". Quien tenga un % restante debe invertirlo antes de llamar aqui.
 *
 * @param {number} remaining 0-1 restante
 * @returns {number} 0-1 consumido
 */
function used(remaining) {
  if (remaining === null || remaining === undefined) return null;
  return Math.max(0, Math.min(1, 1 - remaining));
}

/** Semáforo de color a partir de un porcentaje de cuota restante. */
function tone(p) {
  if (p === null || p === undefined) return 'neutral';
  if (p <= 0.1) return 'critical';
  if (p <= 0.3) return 'warning';
  return 'ok';
}

/**
 * Orden canónico de las ventanas de cuota.
 *
 * Cada proveedor devuelve sus ventanas en el orden que le da su API, y ese
 * orden no coincide entre unos y otros: la 5 h iba primera en Minimax y en
 * Claude, pero segunda en Antigravity. Con la tarjeta era imposible
 * comparar de un vistazo.
 *
 * La regla es una sola para todos: **la ventana más corta primero** (la que
 * se acaba antes), y luego de más larga a más larga.
 *
 * | `window` | Ventana | Posición |
 * |---|---|---|
 * | `5h` | 5 horas | 1.ª |
 * | `daily` | diaria | 2.ª |
 * | `weekly` | semanal | 3.ª |
 * | `weekly_scoped` | semanal con ámbito (otro modelo) | 4.ª |
 * | `monthly` | mensual | 5.ª |
 *
 * Lo que no lleve `window` (el saldo de DeepSeek, los tokens) se queda donde
 * esté: no es una ventana de cuota y no compite por el sitio.
 */
const WINDOW_ORDER = { '5h': 0, daily: 1, weekly: 2, weekly_scoped: 3, monthly: 4 };

/**
 * Ordena las metricas por su ventana, sin tocar las que no tienen `window`.
 * El orden es **estable**: a igual de ventana se respeta el de origen.
 *
 * Si las metricas traen `group` (Antigravity separa sus cuotas por familia
 * de modelos), el grupo se respeta como bloque: las ventanas de un grupo no
 * se separan de las del otro.
 *
 * @param {Array<object>} metrics
 * @returns {Array<object>} una lista nueva, ordenada
 */
function sortMetrics(metrics) {
  // El orden de los grupos es el de aparición: el del API, no el alfabético.
  const groups = [];
  for (const metric of metrics) {
    if (metric.group === undefined || metric.group === null) continue;
    if (!groups.includes(metric.group)) groups.push(metric.group);
  }
  const groupRank = (metric) => {
    if (metric.group === undefined || metric.group === null) return -1;
    return groups.indexOf(metric.group);
  };

  return metrics
    .map((metric, index) => ({ metric, index }))
    .sort((a, b) => {
      const ga = groupRank(a.metric);
      const gb = groupRank(b.metric);
      if (ga !== gb) return ga - gb;
      const ra = WINDOW_ORDER[a.metric.window] ?? Number.MAX_SAFE_INTEGER;
      const rb = WINDOW_ORDER[b.metric.window] ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    })
    .map((entry) => entry.metric);
}

function fmtPercent(p) {
  if (p === null || p === undefined) return '—';
  return `${Math.round(p * 100)}%`;
}

/** "2 h 14 min" a partir de milisegundos. */
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/**
 * Formatea un número de tokens con sufijo k/M/B.
 */
function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(n);
}

module.exports = { fetchJson, pct100, used, tone, fmtPercent, fmtPercent1, fmtDuration, sortMetrics, formatTokens, WINDOW_ORDER };
