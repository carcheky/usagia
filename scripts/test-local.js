'use strict';

// Pruebas de los modulos auxiliares del proceso principal que se pueden
// cargar en Node puro (sin ventanas): la cabecera de la fila, las
// transcripciones locales de Claude, la traduccion de rutas del asar, la
// zona de hover, la configuracion y el saneado de la ventana de ajustes.
//
// Node PURO: lo lanza scripts/test.js (npm test).

const fs = require('fs');
const path = require('path');
const t = require('./test-lib');

const home = t.fakeHome('usagia-local');

const root = path.join(__dirname, '..', 'src', 'main');
const summary = require(path.join(root, 'summary'));
const jsonl = require(path.join(root, 'local', 'jsonl-tokens'));
const scriptPath = require(path.join(root, 'local', 'script-path'));
const hover = require(path.join(root, 'hover'));
const config = require(path.join(root, 'config'));
const settings = require(path.join(root, 'settings'));
const { assert } = t;

/* ------------------------------------------------------------- summary */

t.section('cabecera de la fila (primarySummary):');

t.check('los estados que no son "ok" tienen su texto fijo', () => {
  assert.strictEqual(summary.primarySummary(null), '—');
  assert.strictEqual(summary.primarySummary({ status: 'unconfigured' }), 'sin credencial');
  assert.strictEqual(summary.primarySummary({ status: 'error', metrics: [{ pct: 1 }] }), 'error');
  assert.strictEqual(summary.primarySummary({ status: 'warning', metrics: [] }), 'cuota no disponible');
});

t.check('con cuotas: la ventana MAS AGOTADA, con el porcentaje DELANTE', () => {
  const r = {
    status: 'ok',
    metrics: [
      { label: 'ventana 5 h', value: '12% usado', pct: 0.12 },
      { label: 'semanal', value: '74% usado', pct: 0.74 },
      { label: 'tokens', value: '3 k', pct: null },
    ],
  };
  assert.strictEqual(summary.primarySummary(r), '74% usado · semanal');
});

t.check('la cabecera propia del proveedor (headline) manda', () => {
  const r = { status: 'ok', headline: '$33.64 · aguanta 12 meses', metrics: [{ label: 'x', value: '1', pct: 0.9 }] };
  assert.strictEqual(summary.primarySummary(r), '$33.64 · aguanta 12 meses');
});

t.check('sin porcentajes: los dos primeros valores; sin metricas: el resumen', () => {
  assert.strictEqual(
    summary.primarySummary({
      status: 'ok',
      metrics: [
        { label: 'saldo', value: '$5', pct: null },
        { label: 'bonus', value: '¥4', pct: null },
        { label: 'gasto', value: '$1', pct: null },
      ],
    }),
    '$5 / ¥4'
  );
  assert.strictEqual(summary.primarySummary({ status: 'ok', metrics: [], summary: 'nada' }), 'nada');
  assert.strictEqual(summary.primarySummary({ status: 'ok', metrics: [] }), '—');
});

t.check('shortSummary (menu): dos valores cortos y "usado" solo si todo es porcentaje', () => {
  assert.strictEqual(
    summary.shortSummary({
      status: 'ok',
      metrics: [
        { short: '12%', value: '12% usado', pct: 0.12 },
        { short: '74%', value: '74% usado', pct: 0.74 },
        { short: '1%', value: '1% usado', pct: 0.01 },
      ],
    }),
    '12% / 74% usado'
  );
  assert.strictEqual(
    summary.shortSummary({ status: 'ok', metrics: [{ value: '$5', pct: null }, { value: '3 k', pct: null }] }),
    '$5 / 3 k'
  );
  assert.strictEqual(summary.shortSummary({ status: 'warning' }), 'cuota no disponible');
  assert.strictEqual(summary.shortSummary({ status: 'unconfigured' }), 'sin credencial');
  assert.strictEqual(summary.shortSummary({ status: 'error' }), 'error');
  assert.strictEqual(summary.shortSummary(null), '—');
});

/* ------------------------------------------------------ jsonl-tokens */

t.section('transcripciones locales (jsonl-tokens):');

const projects = path.join(home, '.claude', 'projects');
const now = Date.now();
const since = now - 24 * 3600 * 1000;

t.check('suma los tokens de las lineas dentro de la ventana y cuenta peticiones', () => {
  const recent = new Date(now - 3600 * 1000).toISOString();
  const old = new Date(now - 48 * 3600 * 1000).toISOString();
  t.writeFile(
    path.join(projects, 'a', 'uno.jsonl'),
    [
      JSON.stringify({ timestamp: recent, message: { usage: { input_tokens: 100, output_tokens: 10 } } }),
      JSON.stringify({ timestamp: recent, usage: { cache_read_input_tokens: 1000, cache_creation_input_tokens: 5 } }),
      JSON.stringify({ timestamp: old, message: { usage: { input_tokens: 9999 } } }), // fuera de ventana
      JSON.stringify({ timestamp: recent, message: { usage: { input_tokens: 0 } } }), // sin tokens: no es peticion
      JSON.stringify({ timestamp: recent, type: 'user' }), // sin usage
      '{ linea rota',
      '',
    ].join('\n')
  );
  const r = jsonl.aggregate(projects, since);
  assert.deepStrictEqual(r, { input: 100, output: 10, cacheRead: 1000, cacheWrite: 5, requests: 2, files: 1 });
});

t.check('un fichero que no se ha tocado desde antes de la ventana se salta entero', () => {
  const file = path.join(projects, 'b', 'viejo.jsonl');
  t.writeFile(file, JSON.stringify({ message: { usage: { input_tokens: 5000 } } }));
  const ancient = new Date(now - 5 * 24 * 3600 * 1000);
  fs.utimesSync(file, ancient, ancient);
  const r = jsonl.aggregate(projects, since);
  assert.strictEqual(r.input, 100, 'los 5000 del fichero viejo no cuentan');
  assert.strictEqual(r.files, 2, 'pero el fichero se lista');
});

t.check('sin carpeta de proyectos no revienta: todo a cero', () => {
  const r = jsonl.aggregate(path.join(home, 'no-existe'), since);
  assert.deepStrictEqual(r, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, files: 0 });
});

t.check('claudeProjectsDir apunta a ~/.claude/projects', () => {
  assert.strictEqual(jsonl.claudeProjectsDir(), projects);
});

/* ------------------------------------------------------- script-path */

t.section('rutas de los scripts (script-path):');

t.check('fuera del asar, la ruta es la del repo y el fichero existe', () => {
  const file = scriptPath.script('find-tray-icon.ps1');
  assert.strictEqual(file, path.join(scriptPath.ROOT, 'scripts', 'find-tray-icon.ps1'));
  assert.ok(fs.existsSync(file), `falta ${file}`);
});

t.check('dentro de app.asar se traduce a app.asar.unpacked (conservando el separador)', () => {
  // El bug de beta.3: la tarjeta nunca salia en la app instalada porque
  // PowerShell no puede ejecutar un .ps1 que vive dentro del asar.
  const base = path.join(home, 'resources');
  const unpacked = path.join(base, 'app.asar.unpacked', 'scripts', 'x.ps1');
  t.writeFile(unpacked, '# ps');
  const inside = path.join(base, 'app.asar', 'scripts', 'x.ps1');
  assert.strictEqual(scriptPath.realPath(inside), unpacked);
  // Si no esta desempaquetado, se deja la ruta original (no se inventa).
  const other = path.join(base, 'app.asar', 'scripts', 'no-desempaquetado.ps1');
  assert.strictEqual(scriptPath.realPath(other), other);
  // Sin "app.asar" en la ruta, no se toca nada.
  assert.strictEqual(scriptPath.realPath(unpacked), unpacked);
});

/* ----------------------------------------------------------- hover */

t.section('zona de hover (hover.inside):');

t.check('dentro, fuera y en el margen', () => {
  const rect = { x: 100, y: 200, width: 24, height: 24 };
  assert.strictEqual(hover.inside({ x: 112, y: 212 }, rect), true);
  assert.strictEqual(hover.inside({ x: 97, y: 212 }, rect, 4), true, 'margen por la izquierda');
  assert.strictEqual(hover.inside({ x: 95, y: 212 }, rect, 4), false);
  assert.strictEqual(hover.inside({ x: 112, y: 229 }, rect, 6), true, 'margen por abajo');
  assert.strictEqual(hover.inside({ x: 112, y: 231 }, rect, 6), false);
  assert.strictEqual(hover.inside({ x: 112, y: 212 }, null), false, 'sin ancla no hay zona');
});

/* ---------------------------------------------------------- config */

t.section('configuracion (config):');

t.check('los valores por defecto y la ruta del fichero', () => {
  config.invalidate();
  const cfg = config.load();
  assert.strictEqual(cfg.refreshSeconds, 120);
  assert.strictEqual(cfg.showOnHover, true);
  assert.strictEqual(cfg.hoverCloseDelayMs, 400);
  assert.deepStrictEqual(cfg.accounts, []);
  assert.ok(config.configPath().startsWith(home), config.configPath());
  assert.ok(config.configPath().endsWith(path.join('Usagia', 'config.json')));
});

t.check('un fichero roto o con tipos malos se normaliza en vez de reventar', () => {
  t.writeFile(config.configPath(), '{ roto');
  config.invalidate();
  assert.deepStrictEqual(config.load().accounts, []);

  t.writeFile(config.configPath(), { accounts: 'no es lista', providers: null, credentials: 'x', refreshSeconds: 30 });
  config.invalidate();
  const cfg = config.load();
  assert.deepStrictEqual(cfg.accounts, []);
  assert.deepStrictEqual(cfg.providers, {});
  assert.deepStrictEqual(cfg.credentials, {});
  assert.strictEqual(cfg.refreshSeconds, 30);

  t.writeFile(config.configPath(), { accounts: [null, 'texto', 7, { provider: 'minimax' }] });
  config.invalidate();
  assert.deepStrictEqual(config.load().accounts, [{ provider: 'minimax' }]);
});

t.check('save() aplica un parche, persiste y conserva lo demas', () => {
  t.writeFile(config.configPath(), { refreshSeconds: 45, showOnHover: false });
  config.invalidate();
  config.save({ hoverCloseDelayMs: 900 });
  config.invalidate();
  const cfg = config.load();
  assert.strictEqual(cfg.refreshSeconds, 45);
  assert.strictEqual(cfg.showOnHover, false);
  assert.strictEqual(cfg.hoverCloseDelayMs, 900);
});

t.check('isProviderEnabled: el formato antiguo por proveedor', () => {
  t.writeFile(config.configPath(), { providers: { claude: { enabled: false }, minimax: { enabled: 'si' } } });
  config.invalidate();
  assert.strictEqual(config.isProviderEnabled('claude'), false);
  assert.strictEqual(config.isProviderEnabled('minimax'), true, 'un valor no booleano usa el defecto');
  assert.strictEqual(config.isProviderEnabled('deepseek'), true);
  assert.strictEqual(config.isProviderEnabled('deepseek', false), false);
});

/* -------------------------------------------------------- settings */

t.section('ventana de configuracion (settings.sanitizeAccounts):');

t.check('lo que llega del renderer se normaliza: ids unicos, proveedores reales, credenciales limpias', () => {
  const out = settings.sanitizeAccounts([
    { provider: 'minimax', label: ' Trabajo ', credentials: { apiKey: ' sk-1 ', basura: 3 } },
    { provider: 'minimax', label: 'Trabajo', credentials: { apiKey: '' } },
    { provider: 'inventado', label: 'no' },
    null,
    { id: 'minimax:trabajo', provider: 'claude', label: 'Trabajo', enabled: false },
  ]);
  assert.deepStrictEqual(
    out.map((a) => [a.id, a.provider, a.label, a.enabled, a.credentials]),
    [
      ['minimax:trabajo', 'minimax', 'Trabajo', true, { apiKey: 'sk-1' }],
      ['minimax:trabajo-2', 'minimax', 'Trabajo 2', true, {}],
      ['minimax:trabajo-3', 'claude', 'Trabajo 3', false, {}],
    ]
  );
  assert.deepStrictEqual(settings.sanitizeAccounts('nada'), []);
});

t.check('snapshot() lleva catalogo, cuentas, ajustes generales y la ruta del fichero', () => {
  t.writeFile(config.configPath(), { refreshSeconds: 77, accounts: [{ provider: 'deepseek', label: 'DS' }] });
  config.invalidate();
  const snap = settings.snapshot();
  assert.strictEqual(snap.catalog.length, 4);
  assert.deepStrictEqual(
    snap.accounts.map((a) => a.label),
    ['DS']
  );
  assert.strictEqual(snap.general.refreshSeconds, 77);
  assert.strictEqual(snap.configPath, config.configPath());
});

t.check('test() prueba una credencial sin guardarla y no revienta con un proveedor desconocido', async () => {
  const bad = await settings.test({ provider: 'inventado' });
  assert.strictEqual(bad.status, 'error');
  assert.strictEqual(bad.error, 'proveedor desconocido');

  const calls = t.mockFetch(() => ({
    body: { model_remains: [{ model_name: 'general', current_interval_remaining_percent: 80, current_weekly_remaining_percent: 50 }] },
  }));
  const ok = await settings.test({ provider: 'minimax', label: 'Prueba', credentials: { apiKey: ' sk-cp-prueba ' } });
  assert.strictEqual(ok.status, 'ok', ok.error);
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-cp-prueba');
  assert.strictEqual(ok.summary, 'ventana 5 h: 20% usado · semanal: 50% usado');
  // No se ha guardado nada.
  config.invalidate();
  assert.ok(!JSON.stringify(config.load()).includes('sk-cp-prueba'));
});

t.finish('OK: los modulos locales pasan', () => {
  t.restoreFetch();
  t.removeDir(home);
});
