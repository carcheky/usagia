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
  if (status === 'error') return 'critical';
  return 'neutral';
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
    head.appendChild(el('span', `dot ${statusTone(provider.status)}`));
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
    head.appendChild(value);
    row.appendChild(head);

    const allMetrics = provider.metrics || [];
    const shown = allMetrics.slice(0, MAX_METRICS);
    const hidden = allMetrics.length - shown.length;

    if (shown.length) {
      const metrics = el('div', 'metrics');
      for (const metric of shown) {
        const item = el('div', 'metric');
        const labelText = metric.remaining ? `${metric.label} · ${metric.remaining}` : metric.label;
        const label = el('span', 'metric-label', labelText);
        label.title = labelText;
        item.appendChild(label);

        const bar = el('span', 'bar');
        const fill = el('i', metric.tone || 'neutral');
        const hasPct = typeof metric.pct === 'number';
        fill.style.width = hasPct ? `${Math.max(2, Math.min(1, metric.pct) * 100)}%` : '100%';
        if (!hasPct) fill.style.opacity = '0.3';
        bar.appendChild(fill);
        item.appendChild(bar);

        item.appendChild(el('span', 'metric-value', metric.value));
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
