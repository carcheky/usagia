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
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / 100;
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

module.exports = { fetchJson, pct100, used, tone, fmtPercent, fmtDuration };
