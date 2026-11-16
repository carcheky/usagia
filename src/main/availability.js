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
 * @param {object} result resultado de un proveedor
 * @returns {Array<object>} ventanas con { left, window, transient }
 */
function windowsOf(result) {
  const out = [];
  for (const metric of result?.metrics || []) {
    if (typeof metric?.pct !== 'number') continue;
    out.push({
      left: Math.max(0, Math.min(1, 1 - metric.pct)),
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
 * @param {object} result
 * @returns {{left: number|null, blocked: boolean, exhaustedTransient: boolean, exhaustedLong: boolean}}
 */
function providerState(result) {
  const windows = windowsOf(result);
  const empty = {
    left: null,
    blocked: false,
    exhaustedTransient: false,
    exhaustedLong: false,
  };
  if (!windows.length) return empty;

  let sum = 0;
  let weights = 0;
  for (const w of windows) {
    const weight = weightOf({ window: w.window });
    sum += w.left * weight;
    weights += weight;
  }

  const exhausted = windows.filter((w) => w.left <= 0);
  return {
    left: weights > 0 ? sum / weights : 0,
    blocked: exhausted.length === windows.length,
    exhaustedTransient: exhausted.some((w) => w.transient),
    exhaustedLong: exhausted.some((w) => !w.transient),
  };
}

/**
 * Tono de UN proveedor (el punto de su fila en la tarjeta).
 *
 * El mismo criterio que el global, pero aplicado a ese proveedor solo: una
 * ventana larga agotada es roja; una de 5 h, amarilla; lo demas, verde.
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
  if (state.left === null) return 'neutral';

  if (state.exhaustedLong || state.left < THRESHOLDS.critical) return 'critical';
  if (state.exhaustedTransient || state.left < THRESHOLDS.warning) return 'warning';
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
    .filter((entry) => entry.state.left !== null);

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
  // pesan por tipo dentro de su propia media).
  const left = withQuota.reduce((sum, entry) => sum + entry.state.left, 0) / withQuota.length;

  const blocked = withQuota.filter((entry) => entry.state.blocked).length;
  const allBlocked = blocked === withQuota.length;
  const anyLongExhausted = withQuota.some((entry) => entry.state.exhaustedLong);
  const anyTransientExhausted = withQuota.some((entry) => entry.state.exhaustedTransient);

  let tone = 'ok';
  if (left < THRESHOLDS.critical || anyLongExhausted || allBlocked) {
    tone = 'critical';
  } else if (left < THRESHOLDS.warning || anyTransientExhausted || unknown > 0) {
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
