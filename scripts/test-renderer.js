'use strict';

// Pruebas del RENDERER de la tarjeta (src/renderer/card.js) con un DOM
// minimo de mentira: lo justo para que el script se cargue y pinte. Asi se
// fija lo que se ve sin arrancar Electron:
//
//   - una metrica SIN porcentaje no lleva barra (una barra apagada al 100 %
//     parecia "agotado"),
//   - la barra de una cuota se llena con lo CONSUMIDO y la del saldo con lo
//     que QUEDA,
//   - el reinicio va junto a su barra, el punto de la fila lleva el tono de
//     la cuota, y con mas de 4 metricas sale "+N mas",
//   - el tope de altura que manda el proceso principal se aplica.
//
// Node PURO: lo lanza scripts/test.js (npm test).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const t = require('./test-lib');

const { assert } = t;

/* --------------------------------------------------------- DOM minimo */

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.title = '';
    this.style = {};
    this._text = '';
    this.id = '';
    this.listeners = {};
    this.classList = {
      add: (c) => {
        this.className = `${this.className} ${c}`.trim();
      },
      contains: (c) => this.className.split(/\s+/).includes(c),
    };
  }
  get textContent() {
    return this._text;
  }
  set textContent(value) {
    this._text = String(value);
    if (this._text === '') this.children = [];
  }
  appendChild(node) {
    this.children.push(node);
    return node;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  getBoundingClientRect() {
    // Alto "medido": 100 + 10 por elemento descendiente, para que cambie con
    // el contenido.
    return { x: 0, y: 0, width: 380, height: 100 + 10 * countAll(this) };
  }
  querySelector(selector) {
    return findAll(this, selector)[0] || null;
  }
  querySelectorAll(selector) {
    return findAll(this, selector);
  }
}

function countAll(node) {
  return node.children.reduce((n, c) => n + 1 + countAll(c), 0);
}

function matches(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  return node.tagName === selector;
}

function findAll(node, selector, out = []) {
  for (const child of node.children) {
    if (matches(child, selector)) out.push(child);
    findAll(child, selector, out);
  }
  return out;
}

/** Carga card.js en un contexto con el DOM falso; devuelve el "mundo". */
function loadCard() {
  const body = new FakeElement('body');
  const card = new FakeElement('div');
  card.className = 'card';
  body.appendChild(card);
  const byId = {};
  for (const id of ['rows', 'updated', 'hint', 'gear']) {
    const el = new FakeElement('div');
    el.id = id;
    byId[id] = el;
    card.appendChild(el);
  }
  const document = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => body.querySelector(selector),
  };
  const bridge = { stateHandler: null, sizes: [], ready: 0, settingsOpened: 0 };
  const window = {
    usagia: {
      onState: (fn) => {
        bridge.stateHandler = fn;
      },
      reportSize: (payload) => bridge.sizes.push(payload),
      ready: () => {
        bridge.ready += 1;
      },
      settings: () => {
        bridge.settingsOpened += 1;
      },
    },
    addEventListener: () => {},
  };
  const context = {
    document,
    window,
    console: { log: () => {} },
    setInterval: () => 0,
    Date,
    Math,
    Number,
    String,
    Boolean,
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'card.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'card.js' });
  return { card, byId, bridge, render: (payload) => bridge.stateHandler(payload) };
}

function metricsOf(row) {
  return findAll(row, '.metric');
}

const basePayload = (providers, extra = {}) => ({
  updatedAt: Date.now() - 30 * 1000,
  refreshing: false,
  pinned: false,
  maxHeight: 852,
  providers,
  ...extra,
});

/* ------------------------------------------------------------ pruebas */

t.section('tarjeta (renderer):');

t.check('al cargar avisa de que esta lista y se suscribe al estado', () => {
  const world = loadCard();
  assert.strictEqual(world.bridge.ready, 1, 'tiene que pedir el estado al proceso principal');
  assert.strictEqual(typeof world.bridge.stateHandler, 'function');
  // El boton de configuracion abre la ventana y no deja pasar el clic.
  let stopped = false;
  world.byId.gear.listeners.click({ stopPropagation: () => (stopped = true) });
  assert.strictEqual(world.bridge.settingsOpened, 1);
  assert.ok(stopped);
});

t.check('una fila con cuotas: punto con el tono de la cuota, barra llena con lo CONSUMIDO y reinicio al lado', () => {
  const world = loadCard();
  world.render(
    basePayload([
      {
        id: 'claude',
        label: 'Claude',
        status: 'ok',
        tone: 'critical',
        primary: '100% usado · ventana 5 h',
        summary: 'x',
        source: 'Claude Code',
        metrics: [
          { label: 'ventana 5 h', value: '100% usado', remaining: 'queda 0%', pct: 1, tone: 'critical', reset: '16/11, 18:30' },
          { label: 'semanal', value: '28% usado', remaining: 'queda 72%', pct: 0.28, tone: 'ok' },
        ],
        note: '',
        error: '',
      },
    ])
  );
  const rows = findAll(world.byId.rows, '.row');
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].classList.contains('ok'), rows[0].className);
  const dot = rows[0].querySelector('.dot');
  assert.ok(dot.classList.contains('critical'), `el punto refleja la cuota: ${dot.className}`);
  assert.strictEqual(rows[0].querySelector('.name').textContent, 'Claude');
  assert.strictEqual(rows[0].querySelector('.value').textContent, '100% usado · ventana 5 h');
  assert.strictEqual(rows[0].querySelector('.source').textContent, 'Claude Code');

  const metrics = metricsOf(rows[0]);
  assert.strictEqual(metrics.length, 2);
  const fill5h = metrics[0].querySelector('.bar').children[0];
  assert.strictEqual(fill5h.style.width, '100%', 'cuota agotada = barra llena');
  assert.ok(fill5h.classList.contains('critical'));
  assert.strictEqual(metrics[0].querySelector('.bar').title, 'ventana 5 h: 100% usado · queda 0% · reinicia 16/11, 18:30');
  assert.strictEqual(metrics[0].querySelector('.metric-reset').textContent, '↻ 16/11, 18:30');
  // (parseFloat: 0.28 * 100 da 28.000000000000004, que CSS acepta igual)
  assert.strictEqual(Math.round(parseFloat(metrics[1].querySelector('.bar').children[0].style.width)), 28);
  assert.strictEqual(metrics[1].querySelector('.metric-reset'), null, 'sin reinicio no hay texto');
  // La etiqueta solo lleva el nombre; lo que queda, en el tooltip.
  assert.strictEqual(metrics[1].querySelector('.metric-label').textContent, 'semanal');
  assert.strictEqual(metrics[1].querySelector('.metric-label').title, 'semanal: queda 72%');
});

t.check('una metrica SIN porcentaje no lleva barra; el SALDO se llena con lo que queda', () => {
  const world = loadCard();
  world.render(
    basePayload([
      {
        id: 'deepseek',
        label: 'DeepSeek',
        status: 'ok',
        tone: 'ok',
        primary: '$33.64 · aguanta 12 meses',
        metrics: [
          { label: 'saldo', value: '$33.64', pct: 0.16, tone: 'ok', kind: 'balance' },
          { label: 'tokens', value: '2.4 M', pct: null, tone: 'neutral' },
        ],
      },
    ])
  );
  const metrics = metricsOf(findAll(world.byId.rows, '.row')[0]);
  const saldo = metrics[0];
  assert.strictEqual(saldo.querySelector('.bar').children[0].style.width, '16%');
  assert.strictEqual(saldo.querySelector('.bar').title, 'saldo: 16% del total puesto');
  const tokens = metrics[1];
  assert.strictEqual(tokens.querySelector('.bar'), null, 'sin porcentaje no hay barra');
  assert.ok(tokens.classList.contains('plain'));
  assert.strictEqual(tokens.querySelector('.metric-value').textContent, '2.4 M');
});

t.check('un porcentaje minusculo sigue pintando algo (ancho minimo 2 %)', () => {
  const world = loadCard();
  world.render(
    basePayload([{ id: 'm', label: 'M', status: 'ok', primary: '', metrics: [{ label: 'x', value: '0% usado', pct: 0, tone: 'ok' }] }])
  );
  const fill = metricsOf(findAll(world.byId.rows, '.row')[0])[0].querySelector('.bar').children[0];
  assert.strictEqual(fill.style.width, '2%');
});

t.check('los estados sin cuota: sin credencial, error (con nota en rojo), pendiente y aviso', () => {
  const world = loadCard();
  world.render(
    basePayload([
      { id: 'a', label: 'A', status: 'unconfigured', primary: 'sin credencial', metrics: [] },
      { id: 'b', label: 'B', status: 'error', primary: 'error', metrics: [], error: 'HTTP 500', note: 'se ignora' },
      { id: 'c', label: 'C', status: 'pending', primary: '—', metrics: [] },
      { id: 'd', label: 'D', status: 'warning', tone: 'neutral', primary: 'cuota no disponible', metrics: [], note: 'leído de 3 transcripciones' },
    ])
  );
  const rows = findAll(world.byId.rows, '.row');
  assert.deepStrictEqual(
    rows.map((r) => r.querySelector('.value').textContent),
    ['sin credencial', 'error', '…', 'cuota no disponible']
  );
  assert.deepStrictEqual(
    rows.map((r) => r.querySelector('.dot').className),
    ['dot neutral', 'dot critical', 'dot neutral', 'dot warning']
  );
  const errorNote = rows[1].querySelector('.note');
  assert.strictEqual(errorNote.textContent, 'HTTP 500', 'con error, la nota es el error (no la nota normal)');
  assert.ok(errorNote.classList.contains('error'));
  assert.strictEqual(rows[3].querySelector('.note').textContent, 'leído de 3 transcripciones');
  assert.strictEqual(rows[0].querySelector('.note'), null);
});

t.check('con mas de 4 metricas se enseñan 4 y la nota dice "+N más"', () => {
  const world = loadCard();
  const metrics = Array.from({ length: 6 }, (_, i) => ({ label: `m${i}`, value: `${i}`, pct: null }));
  world.render(basePayload([{ id: 'x', label: 'X', status: 'ok', primary: '', metrics, note: 'nota' }]));
  const row = findAll(world.byId.rows, '.row')[0];
  assert.strictEqual(metricsOf(row).length, 4);
  assert.strictEqual(row.querySelector('.note').textContent, 'nota · +2 más');
});

t.check('el tope de altura del proceso principal se aplica como max-height, y la medida se reporta', () => {
  const world = loadCard();
  world.render(basePayload([{ id: 'x', label: 'X', status: 'ok', primary: '', metrics: [] }], { maxHeight: 852 }));
  assert.strictEqual(world.card.style.maxHeight, '852px');
  assert.ok(world.bridge.sizes.length >= 1, 'tiene que reportar su tamaño');
  const last = world.bridge.sizes[world.bridge.sizes.length - 1];
  assert.strictEqual(last.width, 380);
  assert.ok(last.height > 0);
  assert.ok(last.gear && typeof last.gear.x === 'number', 'la posicion del boton de configuracion viaja con la medida');
  // Repintar con el mismo contenido NO vuelve a reportar (evita bucles).
  const before = world.bridge.sizes.length;
  world.render(basePayload([{ id: 'x', label: 'X', status: 'ok', primary: '', metrics: [] }]));
  assert.strictEqual(world.bridge.sizes.length, before);
});

t.check('el pie: "actualizando…" mientras refresca, "hace N s" despues, y la pista cambia al fijar', () => {
  const world = loadCard();
  world.render(basePayload([], { refreshing: true }));
  assert.strictEqual(world.byId.updated.textContent, 'actualizando…');
  world.render(basePayload([], { updatedAt: Date.now() - 30 * 1000 }));
  assert.strictEqual(world.byId.updated.textContent, 'hace 30 s');
  world.render(basePayload([], { updatedAt: Date.now() - 5 * 60 * 1000 }));
  assert.strictEqual(world.byId.updated.textContent, 'hace 5 min');
  world.render(basePayload([], { updatedAt: Date.now() - 3 * 3600 * 1000 }));
  assert.strictEqual(world.byId.updated.textContent, 'hace 3 h');
  world.render(basePayload([], { updatedAt: 0 }));
  assert.strictEqual(world.byId.updated.textContent, 'sin datos');
  assert.ok(world.byId.hint.textContent.startsWith('Actualización automática'));
  world.render(basePayload([], { pinned: true }));
  assert.ok(world.byId.hint.textContent.startsWith('Fijado'));
});

t.finish('OK: el renderer pasa');
