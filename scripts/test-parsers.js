'use strict';

// Pruebas de los PARSERS puros: lo que convierte la respuesta de cada API en
// las metricas de la tarjeta. Son funciones sin red ni disco, asi que se
// prueban con respuestas fijas.
//
// Aqui vive la regresion del bug "1 % vs 100 %": Claude devuelve
// utilization=1 para "1 % usado" y Minimax remaining=1 para "1 % que queda".
// Una heuristica del tipo "si > 1, divide entre 100" los confundia. La escala
// es FIJA por proveedor (pct100) y estas pruebas lo fijan.
//
// Node PURO (sin Electron): lo ejecuta el job `verify` del pipeline.

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..', 'src', 'main');
const http = require(path.join(root, 'http'));
const creds = require(path.join(root, 'credentials'));
const claude = require(path.join(root, 'providers', 'claude'));
const antigravity = require(path.join(root, 'providers', 'antigravity'));
const client = require(path.join(root, 'local', 'antigravity-client'));

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FALLO ${name}: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ http */

console.log('http:');

check('pct100 es una escala fija 0-100 -> 0-1 (no adivina)', () => {
  assert.strictEqual(http.pct100(1), 0.01); // 1 %: el caso que rompia
  assert.strictEqual(http.pct100(100), 1);
  assert.strictEqual(http.pct100(0), 0);
  assert.strictEqual(http.pct100('37'), 0.37);
  // Ausente NO es 0: para un restante, 0 significa "agotado".
  assert.strictEqual(http.pct100(null), null);
  assert.strictEqual(http.pct100(undefined), null);
  assert.strictEqual(http.pct100(''), null);
  assert.strictEqual(http.pct100('nada'), null);
  // Una cadena de solo espacios tambien es "ausente": Number(' ') es 0, y 0
  // para un restante significa "agotado" (rojo).
  assert.strictEqual(http.pct100(' '), null);
  assert.strictEqual(http.pct100('  \t '), null);
});

check('fmtPercent1 solo lleva decimal cuando hace falta', () => {
  assert.strictEqual(http.fmtPercent1(0.154), '15.4%');
  assert.strictEqual(http.fmtPercent1(0.99), '99%');
  assert.strictEqual(http.fmtPercent1(0), '0%');
  assert.strictEqual(http.fmtPercent1(1), '100%');
  assert.strictEqual(http.fmtPercent1(null), '—');
});

check('used invierte un restante 0-1 y lo acota', () => {
  assert.strictEqual(http.used(0.25), 0.75);
  assert.strictEqual(http.used(1), 0);
  assert.strictEqual(http.used(0), 1);
  assert.strictEqual(http.used(1.5), 0);
  assert.strictEqual(http.used(null), null);
});

check('tone se decide por lo que QUEDA', () => {
  assert.strictEqual(http.tone(0.05), 'critical');
  assert.strictEqual(http.tone(0.1), 'critical');
  assert.strictEqual(http.tone(0.3), 'warning');
  assert.strictEqual(http.tone(0.31), 'ok');
  assert.strictEqual(http.tone(null), 'neutral');
});

check('fmtDuration', () => {
  assert.strictEqual(http.fmtDuration(5 * 60 * 1000), '5 min');
  assert.strictEqual(http.fmtDuration((2 * 3600 + 14 * 60) * 1000), '2 h 14 min');
  assert.strictEqual(http.fmtDuration((26 * 3600) * 1000), '1 d 2 h');
  assert.strictEqual(http.fmtDuration(0), null);
  assert.strictEqual(http.fmtDuration(NaN), null);
});

/* ---------------------------------------------------------------- claude */

console.log('claude:');

const claudeResponse = {
  five_hour: { utilization: 1, resets_at: '2026-11-15T17:30:00Z' },
  seven_day: { utilization: 28, resets_at: '2026-11-16T01:00:00Z' },
  seven_day_opus: { utilization: 54 },
  limits: [
    { kind: 'weekly_scoped', is_active: true, percent: 46, scope: { model: { display_name: 'Fable' } } },
    { kind: 'weekly_scoped', is_active: false, percent: 99 },
  ],
  seven_day_breakdown: { rows: [{ key: 'claude_code', percent: 94.2 }] },
  extra_usage: { is_enabled: false, monthly_limit: 50, currency: 'USD' },
};

check('utilization=1 es 1 % usado, no 100 %', () => {
  const { metrics } = claude.parseUsage(claudeResponse);
  const fiveHour = metrics.find((m) => m.label === 'ventana 5 h');
  assert.strictEqual(fiveHour.pct, 0.01);
  assert.strictEqual(fiveHour.short, '1%');
  assert.strictEqual(fiveHour.remaining, 'queda 99%');
  assert.strictEqual(fiveHour.tone, 'ok');
});

check('la semanal y el limite con ambito salen como consumido', () => {
  const { metrics } = claude.parseUsage(claudeResponse);
  const weekly = metrics.find((m) => m.label === 'semanal');
  assert.strictEqual(weekly.pct, 0.28);
  const scoped = metrics.find((m) => m.label === 'semanal Fable');
  assert.ok(scoped, 'falta la metrica del limite con ambito');
  assert.strictEqual(scoped.pct, 0.46);
  // El limite inactivo no se pinta.
  assert.ok(!metrics.some((m) => m.pct === 0.99));
});

check('las notas recogen reinicios, reparto y uso extra', () => {
  const { notes } = claude.parseUsage(claudeResponse);
  assert.ok(notes.some((n) => n.startsWith('ventana 5 h se reinicia')), notes.join(' | '));
  assert.ok(notes.includes('Claude Code consume el 94% de la cuota semanal'), notes.join(' | '));
  assert.ok(notes.includes('uso extra desactivado (límite 50 USD)'), notes.join(' | '));
});

check('una respuesta vacia no produce metricas', () => {
  assert.deepStrictEqual(claude.parseUsage({}), { metrics: [], notes: [] });
  assert.deepStrictEqual(claude.parseUsage(null), { metrics: [], notes: [] });
});

check('solo un token OAuth sirve como credencial manual', () => {
  assert.strictEqual(claude.isOauthToken('sk-ant-oat01-abc'), true);
  assert.strictEqual(claude.isOauthToken('  SK-ANT-OAT01-abc '), true);
  assert.strictEqual(claude.isOauthToken('sk-ant-api03-abc'), false);
  assert.strictEqual(claude.isOauthToken(''), false);
  assert.strictEqual(claude.isOauthToken(null), false);
});

/* ----------------------------------------------------------- antigravity */

console.log('antigravity:');

const agResponse = {
  groups: [
    {
      displayName: 'Gemini Models',
      buckets: [
        { window: 'weekly', remainingFraction: 0.846, resetTime: '2026-11-20T10:00:00Z' },
        { window: '5h', remainingFraction: 1 },
      ],
    },
    {
      displayName: 'Claude and GPT models',
      buckets: [{ window: 'weekly', remainingFraction: 0.01 }, { window: 'daily', remainingFraction: 'x' }],
    },
  ],
};

check('remainingFraction (0-1) se invierte a consumido', () => {
  const { metrics } = antigravity.parseSummary(agResponse);
  const weekly = metrics.find((m) => m.label === 'Gemini Models · semanal');
  assert.ok(weekly, 'falta la metrica semanal');
  assert.strictEqual(weekly.value, '15.4% usado');
  assert.strictEqual(weekly.short, '15%');
  assert.strictEqual(weekly.remaining, 'queda 84.6%');
  assert.strictEqual(weekly.tone, 'ok');
  // remaining=1 es "100 % que queda", o sea 0 % usado, no 1 %.
  const fiveHour = metrics.find((m) => m.label === 'Gemini Models · 5 h');
  assert.strictEqual(fiveHour.value, '0% usado');
});

check('un bucket casi agotado sale critico y los no numericos se omiten', () => {
  const { metrics, notes } = antigravity.parseSummary(agResponse);
  const tight = metrics.find((m) => m.label === 'Claude and GPT models · semanal');
  assert.strictEqual(tight.tone, 'critical');
  assert.strictEqual(tight.value, '99% usado');
  assert.ok(!metrics.some((m) => m.label.endsWith('diario')), 'el bucket no numerico no debe pintarse');
  assert.strictEqual(notes.length, 1);
  assert.ok(notes[0].startsWith('Gemini Models (semanal) reinicia'));
});

check('manualKind distingue JSON de token a secas', () => {
  assert.strictEqual(antigravity.manualKind('{"token":{}}'), 'json');
  assert.strictEqual(antigravity.manualKind('  {"a":1}'), 'json');
  assert.strictEqual(antigravity.manualKind('ya29.abc'), 'raw');
  assert.strictEqual(antigravity.manualKind(''), 'raw');
});

check('extractPairs empareja cada client_id con el secret siguiente', () => {
  const text = [
    'x = "123456-abc.apps.googleusercontent.com"; y = "GOCSPX-aaaaaaaaaaaaaaaaaaaaaaaa";',
    'z = "654321-def.apps.googleusercontent.com"; w = "GOCSPX-bbbbbbbbbbbbbbbbbbbbbbbb";',
    'huerfano = "999999-ghi.apps.googleusercontent.com";',
  ].join('\n');
  const pairs = client.extractPairs(text);
  assert.deepStrictEqual(pairs, [
    { clientId: '123456-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-aaaaaaaaaaaaaaaaaaaaaaaa' },
    { clientId: '654321-def.apps.googleusercontent.com', clientSecret: 'GOCSPX-bbbbbbbbbbbbbbbbbbbbbbbb' },
  ]);
  assert.deepStrictEqual(client.extractPairs('nada'), []);
});

/* -------------------------------------------------------------- yaml dsh */

console.log('credenciales:');

check('parseYamlMappings lee mapeos anidados y claves con "/"', () => {
  const yaml = [
    '# comentario',
    'refs:',
    '  MINIMAX_API_KEY: "sk-cp-123"',
    "  GOOGLE_API_KEY: 'AIza'",
    'records:',
    '  deepseek-account-platform/default:',
    '    payload:',
    '      token: tok-abc',
    '    otro: valor',
    'suelto: 1',
  ].join('\n');
  const parsed = creds.parseYamlMappings(yaml);
  assert.strictEqual(parsed.refs.MINIMAX_API_KEY, 'sk-cp-123');
  assert.strictEqual(parsed.refs.GOOGLE_API_KEY, 'AIza');
  assert.strictEqual(parsed.records['deepseek-account-platform/default'].payload.token, 'tok-abc');
  assert.strictEqual(parsed.records['deepseek-account-platform/default'].otro, 'valor');
  assert.strictEqual(parsed.suelto, '1');
});

check('firstValid salta nulos y vacios', () => {
  const picked = creds.firstValid([null, { value: '  ', source: 'a' }, { value: 'x', source: 'b' }]);
  assert.strictEqual(picked.source, 'b');
  assert.strictEqual(creds.firstValid([null, { value: '', source: 'a' }]), null);
});

console.log(failures ? `\nFALLO: ${failures} prueba(s) fallida(s)` : '\nOK: todos los parsers pasan');
process.exit(failures ? 1 : 0);
