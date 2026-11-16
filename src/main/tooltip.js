'use strict';

// Tooltip del icono de la bandeja.
//
// El tooltip es el RESUMEN de la cuota: la tarjeta es la vista completa.
// Windows da un presupuesto limited (~127 caracteres) para el tooltip del
// sistema, asi que hay que decidir que se enseña y que no.
//
// Aqui va la logica pura (sin Electron), para que se pueda probar en Node:
//   - `tooltipLine`   : una linea corta por proveedor
//   - `shortWindow`   : el nombre corto de una ventana
//   - `fitTooltip`    : como encajar las lineas en el presupuesto

// Presupuesto del tooltip del sistema en Windows.
const TOOLTIP_MAX = 127;

// Marcador del icono de la bandeja. El hover en Windows localiza el icono
// por este texto (ver `buildTooltip` y scripts/find-tray-icon.ps1): la
// PRIMERA linea del tooltip tiene que empezar por aqui.
const MARKER = 'Usagia';

// Orden de urgencia: lo que peor esta, primero.
const TONE_RANK = { critical: 0, warning: 1, ok: 2, neutral: 3 };

/**
 * Nombre corto de una ventana ("ventana 5 h" -> "5 h", "semanal" -> "sem").
 *
 * @param {string} label etiqueta de la metrica
 * @returns {string}
 */
function shortWindow(label) {
  const text = String(label || '');
  // Quita el grupo ("Gemini · 5 h" -> "5 h").
  const win = text.includes('·') ? text.split('·').pop().trim() : text.trim();
  const lower = win.toLowerCase();
  if (lower.startsWith('ventana 5')) return '5 h';
  if (lower.startsWith('5 h')) return '5 h';
  if (lower.startsWith('semanal')) return `sem${win.slice(7)}`.trim();
  if (lower.startsWith('mensual')) return 'mens';
  if (lower.startsWith('diaria')) return 'día';
  return '';
}

/**
 * Resumen de UN proveedor para el tooltip: una linea corta.
 *
 * @param {object} result
 * @returns {string|null}
 */
function tooltipLine(result) {
  if (!result) return null;
  if (result.status === 'unconfigured') return 'sin credencial';
  if (result.status === 'error') return 'error';
  if (result.status === 'warning') return 'cuota no disponible';
  // DeepSeek dice lo suyo: "$33,64 · aguanta 12 meses".
  if (result.headline) return result.headline;

  const metrics = (result.metrics || []).filter((m) => typeof m.pct === 'number');
  if (!metrics.length) {
    const first = (result.metrics || [])[0];
    return first ? `${first.label} ${first.value}` : null;
  }
  // La ventana MAS AGOTADA, que es la que importa: "100% 5 h".
  const worst = metrics.reduce((a, b) => (b.pct > a.pct ? b : a));
  const win = shortWindow(worst.label);
  return `${Math.round(worst.pct * 100)}%${win ? ` ${win}` : ''}`;
}

/**
 * Encaja las lineas en el presupuesto del sistema SIN partir ninguna a
 * medias: si no cabe una linea entera, se deja fuera (se van las menos
 * importantes, que van al final).
 *
 * @param {Array<string>} lines
 * @param {number} max presupuesto
 * @returns {string}
 */
function fitTooltip(lines, max = TOOLTIP_MAX) {
  const list = (lines || []).filter(Boolean);
  if (!list.length) return '';
  const joined = list.join('\n');
  if (joined.length <= max) return joined;

  const kept = [];
  for (const line of list) {
    const cost = kept.length ? kept.join('\n').length + 1 + line.length : line.length;
    if (cost <= max) kept.push(line);
  }
  if (kept.length) return kept.join('\n');
  // Ni una linea cabe entera: se corta la primera (es la mas urgente).
  return `${list[0].slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Construye el tooltip completo a partir de los proveedores.
 *
 * **OJO: la primera linea SIEMPRE tiene que empezar por el marcador**
 * ("Usagia"). El hover en Windows localiza el icono de la bandeja por UI
 * Automation, buscando un boton cuyo tooltip EMPIECE por ese texto
 * (scripts/find-tray-icon.ps1). Si el tooltip no empieza por el marcador,
 * el script no encuentra el icono y la tarjeta NO sale nunca al pasar el
 * raton. Esa linea no se quita jamas, aunque no quepa el resto.
 *
 * @param {Array<{label: string, result: object, tone: string}>} providers
 * @param {string} marker texto por el que se localiza el icono
 * @param {number} max presupuesto
 * @returns {string}
 */
function buildTooltip(providers, marker = MARKER, max = TOOLTIP_MAX) {
  const entries = (providers || [])
    // El `tone` se conserva: es lo que ordena las lineas por urgencia.
    .map((provider) => ({
      label: provider.label,
      text: tooltipLine(provider.result),
      tone: provider.tone,
    }))
    .filter((entry) => entry.text);

  // Lo mas urgente primero: el proveedor que peor esta, para que se vea
  // sin tener que leer las cuatro lineas.
  entries.sort((a, b) => (TONE_RANK[a.tone] ?? 3) - (TONE_RANK[b.tone] ?? 3));

  const lines = entries.map((entry) => `${entry.label}: ${entry.text}`);

  // La cabecera lleva el marcador y lo mas urgente, en una sola linea:
  // asi, si Windows solo enseña la primera, se ve lo que importa; y si las
  // enseña todas, esta informs de todo.
  const head = lines.length ? `${marker} · ${lines[0]}` : marker;
  const rest = lines.slice(1);

  // El presupuesto se reparte: la cabecera entra siempre, y el resto se
  // recorta quitando lineas enteras por el final.
  const budget = Math.max(0, max - head.length - 1);
  const kept = [];
  for (const line of rest) {
    const cost = kept.length ? kept.join('\n').length + 1 + line.length : line.length;
    if (cost <= budget) kept.push(line);
  }

  return [head, ...kept].join('\n');
}

module.exports = { TOOLTIP_MAX, MARKER, shortWindow, tooltipLine, fitTooltip, buildTooltip };
