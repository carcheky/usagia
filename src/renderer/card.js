'use strict';

const rowsEl = document.getElementById('rows');
const updatedEl = document.getElementById('updated');
const hintEl = document.getElementById('hint');
const gearEl = document.getElementById('gear');
let lastState = null;
let lastHeight = 0;
let lastGear = null;
const MAX_METRICS = 4;

// Boton de configuracion. La tarjeta es "click-through" (para no tapar la
// barra de tareas), asi que el boton solo recibe clics cuando el raton esta
// encima de la tarjeta: el proceso principal la vuelve interactiva entonces.
gearEl?.addEventListener('click', (event) => {
  event.stopPropagation();
  console.log('clic en el boton de configuracion');
  window.usagia?.settings();
});

function relativeTime(ts) {
  if (!ts) return 'sin datos';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

function statusTone(status) {
  if (status === 'ok') return 'ok';
  if (status === 'warning') return 'warning';
  if (status === 'error') return 'critical';
  return 'neutral';
}

/**
 * Tono del punto de un proveedor.
 *
 * Si la consulta va bien, manda la CUOTA: una ventana al 100 % se pinta en
 * rojo. El "ok" de la consulta solo se usa cuando no hay ningun porcentaje
 * con el que opinar (por ejemplo, el saldo de DeepSeek).
 */
function providerTone(provider) {
  if (provider.status !== 'ok') return statusTone(provider.status);
  if (provider.tone && provider.tone !== 'neutral') return provider.tone;
  return 'ok';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(payload) {
  rowsEl.textContent = '';

  for (const provider of payload.providers || []) {
    const row = el('div', `row ${provider.status}`);

    const head = el('div', 'row-head');
    head.appendChild(el('span', `dot ${providerTone(provider)}`));
    head.appendChild(el('span', 'name', provider.label));

    const source = el('span', 'source', provider.source || '');
    head.appendChild(source);

    const value = el(
      'span',
      'value',
      provider.status === 'unconfigured'
        ? 'sin credencial'
        : provider.status === 'error'
          ? 'error'
          : provider.status === 'pending'
            ? '…'
            : provider.primary
    );
    // El resumen completo, para cuando la columna se recorta.
    value.title = provider.summary || provider.primary || '';
    head.appendChild(value);
    row.appendChild(head);

    const allMetrics = provider.metrics || [];
    const shown = allMetrics.slice(0, MAX_METRICS);
    const hidden = allMetrics.length - shown.length;

    if (shown.length) {
      const metrics = el('div', 'metrics');
      for (const metric of shown) {
        const item = el('div', 'metric');
        const hasPct = typeof metric.pct === 'number';
        // La etiqueta va solo con el nombre de la ventana: antes llevaba
        // tambien "queda 43 %", que no cabia en 122 px y se cortaba a medias.
        // El % que queda se deja en el tooltip, que si tiene sitio.
        const label = el('span', 'metric-label', metric.label);
        label.title = metric.fullLabel
          ? `${metric.fullLabel}${metric.remaining ? ` · ${metric.remaining}` : ''}`
          : metric.remaining
            ? `${metric.label}: ${metric.remaining}`
            : metric.label;
        item.appendChild(label);

        // Una metrica SIN PORCENTAJE (saldo, tokens, peticiones) no lleva
        // barra: una barra apagada de ancho completo parece "100 % usado" y
        // no significa nada. Se deja solo el valor, que si es concreto.
        if (hasPct) {
          const bar = el('span', 'bar');
          const fill = el('i', metric.tone || 'neutral');
          // La barra mide lo CONSUMIDO: llena = cuota agotada.
          fill.style.width = `${Math.max(2, Math.min(1, metric.pct) * 100)}%`;
          const parts = [`${Math.round(metric.pct * 100)}% usado`];
          if (metric.remaining) parts.push(metric.remaining);
          if (metric.reset) parts.push(`reinicia ${metric.reset}`);
          bar.title = `${metric.fullLabel || metric.label}: ${parts.join(' · ')}`;
          bar.appendChild(fill);
          item.appendChild(bar);
        } else {
          item.classList.add('plain');
        }

        // La columna de la derecha: el valor y, a continuacion, el reinicio
        // de esa ventana. Va en la MISMA linea (con una fuente menor) para
        // que la tarjeta no crezca una linea por ventana.
        const right = el('div', 'metric-right');
        const valueEl = el('span', 'metric-value', metric.value);
        if (hasPct && metric.remaining) {
          valueEl.title = `${metric.label}: ${metric.value} · ${metric.remaining}`;
        }
        right.appendChild(valueEl);
        if (metric.reset) {
          right.appendChild(el('span', 'metric-reset', `↻ ${metric.reset}`));
        }
        item.appendChild(right);
        metrics.appendChild(item);
      }
      row.appendChild(metrics);
    }

    const notes = [];
    if (provider.error) notes.push(provider.error);
    else if (provider.note) notes.push(provider.note);
    if (hidden > 0) notes.push(`+${hidden} más`);
    if (notes.length) {
      row.appendChild(el('div', `note${provider.error ? ' error' : ''}`, notes.join(' · ')));
    }

    rowsEl.appendChild(row);
  }

  updatedEl.textContent = payload.refreshing ? 'actualizando…' : relativeTime(payload.updatedAt);
  if (hintEl) {
    hintEl.textContent = payload.pinned
      ? 'Fijado · pasa el ratón o haz clic en el icono para soltarlo · ⚙ para configurar'
      : 'Actualización automática · pasa el ratón por el icono · clic para fijar · ⚙ para configurar';
  }
  reportSize();
}

function reportSize() {
  const card = document.querySelector('.card');
  if (!card) return;
  const height = Math.ceil(card.getBoundingClientRect().height);
  const gear = document.getElementById('gear');
  const rect = gear ? gear.getBoundingClientRect() : null;
  const payload = { width: 380, height };
  if (rect) {
    payload.gear = {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  }
  if (Math.abs(height - lastHeight) < 1 && lastGear) return;
  lastHeight = height;
  lastGear = payload.gear || null;
  window.usagia?.reportSize(payload);
}

window.usagia?.onState((payload) => {
  lastState = payload;
  render(payload);
});
// La tarjeta puede cargarse DESPUES de que el proceso principal haya
// enviado el estado: al avisar, el proceso se lo vuelve a mandar.
window.usagia?.ready();
window.addEventListener('resize', reportSize);
setInterval(() => {
  if (lastState && !lastState.refreshing) {
    updatedEl.textContent = relativeTime(lastState.updatedAt);
  }
}, 5000);
