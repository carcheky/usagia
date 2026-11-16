'use strict';

// Salud de la cuota: lo que QUEDA, y que se.ToString de eso sale un color.
//
// Por que hace falta este modulo: el icono de la bandeja tiene UNA sola
// senal para muchos proveedores, y antes tomaba la PEOR de todos (la
// primera ventana que encontraba justa). Con una sola ventana de un solo
// proveedor al 100 %, el icono salia en ROJO, que se lee como "no queda
// uso de nada", cuando en realidad habia de sobra en las demas.
//
// La cuenta, en tres reglas:
//
//  1. Cada ventana aporta lo que le QUEDA (1 - pct). La media se pondera
//     por el tipo de ventana: la de 5 h se repone en horas, la mensual en
//     semanas. Agotarse una es un contratiempo; agotarse la otra es un
//     problema de verdad.
//
//  2. Se distingue una ventana AGOTADA de la que se repone PRONTO. La de
//     5 h (o la diaria) vuelve en un rato: enrojecerse por ella seria
//     alarmista. La semanal o la mensual no.
//
//  3. De ahi sale el color:
//
//     | Situacion                                    | Icono       |
//     |----------------------------------------------|-------------|
//     | Todo con >= 50 % de sobra, nada agotado     | verde       |
//     | Algo agotado (que se repone pronto), o media  | **amarillo** |
//     |   por debajo del 50 %, o algo sin consultar   |             |
//     | Media por debajo del 20 %, o una ventana      | **rojo**    |
//     |   larga agotada, o TODOS los proveedores      |             |
//     |   bloqueados                                 |             |
//
// Los umbrales son constantes de aqui: cambiar uno es cambiar una linea.

// Peso de cada ventana en la media. Una ventana larga pesa mas: si se
// agota, no se repone enseguida.
const WINDOW_WEIGHT = {
  '5h': 1,
  daily: 1.5,
  weekly: 2,
  weekly_scoped: 2,
  monthly: 2.5,
};

// Peso por defecto de una ventana de la que no se sabe el tipo.
const DEFAULT_WEIGHT = 1.5;

// Ventanas que se reponen pronto: agotarse en ellas es un contratiempo
// pasajero, no un problema de cuota.
const TRANSIENT_WINDOWS = new Set(['5h', 'daily']);

// Umbrales de la media (fraccion de cuota que queda).
const THRESHOLDS = { critical: 0.2, warning: 0.5 };

/**
 * Peso de una ventana en la media.
 * @param {object} metric
 * @returns {number}
 */
function weightOf(metric) {
  const w = WINDOW_WEIGHT[metric?.window];
  return Number.isFinite(w) ? w : DEFAULT_WEIGHT;
}

/**
 * Las ventanas con porcentaje de un proveedor, con su "lo que queda".
 *
 * Hay dos clases de metricas:
 *  - Con `pct`: lo CONSUMIDO de una ventana de cuota (Minimax, Claude,
 *    Antigravity). Lo que queda es 1 - pct.
 *  - La AUTONOMIA (DeepSeek): los dias que aguanta el saldo al ritmo
 *    actual. No tiene pct, pero se compara con las ventanas por su
 *    `window`, que el proveedor le asigna segun cuanta (5 h, diaria,
 *    semanal, mensual).
 *
 * El SALDO en si no es una ventana y no entra en la media: no hay tope
 * contra el que medirlo.
 *
 * @param {object} result resultado de un proveedor
 * @returns {Array<object>} ventanas con { left, window, transient }
 */
function windowsOf(result) {
  const out = [];
  for (const metric of result?.metrics || []) {
    // El saldo no es una ventana: se cuenta con la autonomia.
    if (metric.kind === 'balance') continue;

    let left;
    if (typeof metric?.pct === 'number') {
      left = Math.max(0, Math.min(1, 1 - metric.pct));
    } else if (metric?.kind === 'runway' && Number.isFinite(metric.runwayDays)) {
      // La autonomia se mide en DIAS: lo que queda es la fraccion de la
      // ventana mas larga (30 dias) que aguanta el saldo. Con 12 meses de
      // autonomia sale 1 (de sobra); con 3 dias, 0,1 (poco).
      left = Math.max(0, Math.min(1, metric.runwayDays / 30));
    } else {
      continue;
    }

    out.push({
      left,
      window: metric.window,
      transient: TRANSIENT_WINDOWS.has(metric.window),
    });
  }
  return out;
}

/**
 * Estado de UN proveedor: lo que le queda y si esta bloqueado.
 *
 * "Bloqueado" = todas sus ventanas de cuota estan agotadas: ese proveedor
 * no se puede usar en absoluto.
 *
 * El SALDO (DeepSeek) se mira aparte: no es una ventana, pero si avisa si
 * esta bajo, porque no se repone solo (hay que recargar).
 *
 * @param {object} result
 * @returns {{left: number|null, blocked: boolean, exhaustedTransient: boolean, anyLongExhausted: boolean, allLongExhausted: boolean, lowBalance: boolean}}
 */
function providerState(result) {
  const windows = windowsOf(result);
  const empty = {
    left: null,
    blocked: false,
    exhaustedTransient: false,
    anyLongExhausted: false,
    allLongExhausted: false,
    lowBalance: false,
  };
  if (!windows.length && !hasBalance(result)) return empty;

  let sum = 0;
  let weights = 0;
  for (const w of windows) {
    const weight = weightOf({ window: w.window });
    sum += w.left * weight;
    weights += weight;
  }

  const exhausted = windows.filter((w) => w.left <= 0);
  const longWindows = windows.filter((w) => !w.transient);
  const exhaustedLong = exhausted.filter((w) => !w.transient);
  const balance = (result?.metrics || []).find((m) => m.kind === 'balance');
  return {
    left: weights > 0 ? sum / weights : null,
    blocked: windows.length > 0 && exhausted.length === windows.length,
    exhaustedTransient: exhausted.some((w) => w.transient),
    // Alguna ventana larga agotada: aviso (amarillo).
    anyLongExhausted: exhaustedLong.length > 0,
    // TODAS las ventanas largas agotadas: problema serio (rojo).
    allLongExhausted: longWindows.length > 0 && exhaustedLong.length === longWindows.length,
    // Un saldo por debajo del 15 % es poco: hay que recargar.
    lowBalance: Boolean(balance) && balance.tone === 'critical',
  };
}

/** ¿Este proveedor lleva saldo (DeepSeek)? */
function hasBalance(result) {
  return (result?.metrics || []).some((m) => m.kind === 'balance');
}

/**
 * Tono de UN proveedor (el punto de su fila en la tarjeta).
 *
 * El mismo criterio que el global, pero aplicado a ese proveedor solo:
 * - TODAS las ventanas largas agotadas → rojo
 * - Alguna ventana larga agotada (pero no todas) → amarillo
 * - Una de 5 h agotada → amarillo
 * - Lo demas → verde
 *
 * @param {object} result
 * @returns {string} 'ok' | 'warning' | 'critical' | 'neutral'
 */
function providerTone(result) {
  if (!result) return 'neutral';
  if (result.status === 'error') return 'critical';
  // Sin cuota consultable no se puede decir que todo este bien.
  if (result.status === 'warning') return 'warning';

  const state = providerState(result);
  // Un saldo bajo avisa aunque la autonomia sea larga: el saldo no se
  // repone solo.
  if (state.lowBalance) return 'critical';
  if (state.left === null) return 'neutral';

  // Rojo solo si TODAS las ventanas largas agotadas, o si queda muy poco.
  if (state.allLongExhausted || state.left < THRESHOLDS.critical) return 'critical';
  // Amarillo si alguna ventana larga agotada (pero no todas), o si queda poco.
  if (state.anyLongExhausted || state.exhaustedTransient || state.left < THRESHOLDS.warning) return 'warning';
  return 'ok';
}

/**
 * Estado GLOBAL de la cuota y tono del icono de la bandeja.
 *
 * @param {Array<object>} results resultados de los proveedores (con estado)
 * @returns {{tone: string, left: number|null, blocked: number, total: number, unknown: number}}
 */
function computeAvailability(results) {
  const list = results || [];
  const usable = list.filter((result) => result && result.status === 'ok');
  const withQuota = usable
    .map((result) => ({ result, state: providerState(result) }))
    .filter((entry) => entry.state.left !== null || entry.state.lowBalance);

  // Un proveedor sin cuota consultable (warning) no entra en la media, pero
  // avisa: no se puede dar por hecho que todo va bien. Un error, tambien.
  const unknown = list.filter((result) => result?.status === 'warning' || result?.status === 'error')
    .length;

  if (!withQuota.length) {
    return {
      tone: unknown ? 'warning' : 'neutral',
      left: null,
      blocked: 0,
      total: unknown,
      unknown,
    };
  }

  // Media de lo que queda: cada proveedor pesa lo mismo (sus ventanas ya
  // pesan por tipo dentro de su propia media). Los que solo tienen saldo
  // (DeepSeek sin autonomia) no entran en la media, pero avisan.
  const withWindows = withQuota.filter((entry) => entry.state.left !== null);
  const left = withWindows.length
    ? withWindows.reduce((sum, entry) => sum + entry.state.left, 0) / withWindows.length
    : null;

  const blocked = withQuota.filter((entry) => entry.state.blocked).length;
  const allBlocked = withWindows.length > 0 && blocked === withWindows.length;
  // Algun proveedor con TODAS sus ventanas largas agotadas: problema serio.
  const anyAllLongExhausted = withQuota.some((entry) => entry.state.allLongExhausted);
  // Algun proveedor con ALGUNA ventana larga agotada (pero no todas): aviso.
  const anyAnyLongExhausted = withQuota.some((entry) => entry.state.anyLongExhausted);
  const anyTransientExhausted = withQuota.some((entry) => entry.state.exhaustedTransient);
  const anyLowBalance = withQuota.some((entry) => entry.state.lowBalance);

  let tone = 'ok';
  if (
    (left !== null && left < THRESHOLDS.critical) ||
    anyAllLongExhausted ||
    allBlocked ||
    anyLowBalance
  ) {
    tone = 'critical';
  } else if (
    (left !== null && left < THRESHOLDS.warning) ||
    anyAnyLongExhausted ||
    anyTransientExhausted ||
    unknown > 0
  ) {
    tone = 'warning';
  }

  return { tone, left, blocked, total: withQuota.length + unknown, unknown };
}

module.exports = {
  computeAvailability,
  providerState,
  providerTone,
  windowsOf,
  THRESHOLDS,
  WINDOW_WEIGHT,
};
