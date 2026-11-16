'use strict';

// Resumenes de texto de un resultado de proveedor: la cabecera de la fila de
// la tarjeta y la linea del menu contextual. Son funciones puras (sin
// Electron) para poder probarlas en Node: aqui se decide que ve el usuario
// de un vistazo, y ha cambiado varias veces (cual es la ventana "peor", que
// va delante, que pasa sin porcentajes...).

const { countingMetrics } = require('./availability');

/** Linea corta para el menu contextual de la bandeja. */
function shortSummary(result) {
  if (!result) return '—';
  if (result.status === 'unconfigured') return 'sin credencial';
  if (result.status === 'error') return 'error';
  if (result.status === 'warning') return 'cuota no disponible';
  // Los EXTRAS (tope con ambito) no cuentan: la linea del menu habla de la
  // cuota que se consume al hacer tareas.
  const metrics = countingMetrics(result.metrics || []);
  if (!metrics.length) return result.summary || '—';
  const parts = metrics.slice(0, 2).map((m) => m.short || m.value);
  // Todas las metricas en porcentaje son "consumido", como en los paneles.
  const allPercent = metrics.every((m) => typeof m.pct === 'number');
  return `${parts.join(' / ')}${allPercent ? ' usado' : ''}`;
}

/**
 * Lo que se ve en la cabecera de la fila: la ventana MAS AGOTADA.
 *
 * El porcentaje va DELANTE a proposito: la columna se recorta por el final
 * (con puntos suspensivos), asi que lo que no puede perderse es cuanto se
 * ha gastado. El nombre de la ventana va detras, y las filas de abajo lo
 * repiten con su barra.
 *
 * Los EXTRAS (tope con ambito, p. ej. el "Fable" de Claude) NO cuentan: la
 * cabecera describe la cuota general (5 h, semanal, mensual). El extra se ve
 * en su propia fila, con su barra y su reinicio.
 *
 * @param {object} result
 * @returns {string}
 */
function primarySummary(result) {
  if (!result) return '—';
  if (result.status === 'unconfigured') return 'sin credencial';
  if (result.status === 'error') return 'error';
  if (result.status === 'warning') return 'cuota no disponible';
  // Un proveedor puede decir lo que quiere en su cabecera (DeepSeek:
  // "saldo · aguanta 12 meses"), porque su cuenta no es una cuota por
  // ventanas de tiempo.
  if (result.headline) return result.headline;
  const all = countingMetrics(result.metrics || []);
  const metrics = all.filter((m) => typeof m.pct === 'number');
  if (!metrics.length) {
    // Sin porcentajes (saldo, tokens): solo los valores, como antes.
    if (!all.length) return result.summary || '—';
    return all
      .slice(0, 2)
      .map((m) => m.value)
      .join(' / ');
  }
  const worst = metrics.reduce((a, b) => (b.pct > a.pct ? b : a));
  return `${worst.value} · ${worst.label}`;
}

module.exports = { shortSummary, primarySummary };
