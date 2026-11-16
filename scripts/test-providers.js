'use strict';

// Pruebas de `fetchUsage` de los CUATRO proveedores, de extremo a extremo
// pero sin red: `fetch` se simula y el HOME es falso. Aqui se fija lo que
// hace cada proveedor con la respuesta REAL de su API (la forma de las
// respuestas esta en FINDINGS.md) y, sobre todo, como se comporta cuando
// algo falla: token caducado, 401, 429, respuesta vacia...
//
// Node PURO: lo lanza scripts/test.js (npm test) y el job `verify`.

const path = require('path');
const t = require('./test-lib');

// ANTES de cargar nada de src/: HOME falso, sin credenciales de la maquina.
const home = t.fakeHome('usagia-prov');

const root = path.join(__dirname, '..', 'src', 'main');
const config = require(path.join(root, 'config'));
const ps = require(path.join(root, 'local', 'ps'));
const agClient = require(path.join(root, 'local', 'antigravity-client'));
const minimax = require(path.join(root, 'providers', 'minimax'));
const claude = require(path.join(root, 'providers', 'claude'));
const antigravity = require(path.join(root, 'providers', 'antigravity'));
const deepseek = require(path.join(root, 'providers', 'deepseek'));

const { assert } = t;

const FUTURE = Date.now() + 6 * 3600 * 1000;
const PAST = Date.now() - 3600 * 1000;

// El fichero del harness se escribe UNA vez: credentials.js lo cachea en la
// primera lectura. Lleva la sesion de Claude y la de DeepSeek, pero NO la
// clave de Minimax (para poder probar el caso "sin credencial").
t.writeFile(
  path.join(home, '.dsh', '.credentials.yaml'),
  [
    'refs:',
    '  GOOGLE_API_KEY: "AIza-no-se-usa"',
    'records:',
    '  llm-pi-ai/anthropic:',
    '    payload:',
    '      access: sk-ant-oat01-dsh',
    '      refresh: rt-dsh',
    `      expires: ${FUTURE}`,
    '  deepseek-account-platform/default:',
    '    payload:',
    '      token: ds-session-token',
  ].join('\n')
);

function claudeCli(token, expiresAt) {
  t.writeFile(path.join(home, '.claude', '.credentials.json'), {
    claudeAiOauth: { accessToken: token, refreshToken: 'rt-cli', expiresAt, subscriptionType: 'pro' },
  });
}

// El script de PowerShell de Claude Desktop NO se ejecuta en las pruebas:
// se sustituye por un fallo de autenticacion (como si la cache no sirviera).
let desktopScriptCalls = 0;
ps.runScript = async () => {
  desktopScriptCalls += 1;
  return { ok: false, stdout: '', stderr: 'HTTP 401 Unauthorized' };
};

let ctxCounter = 0;
/** Contexto de llamada con un id de cuenta nuevo (la cache de Claude va por cuenta). */
function ctx(provider, credentials = {}, id) {
  ctxCounter += 1;
  config.invalidate();
  return {
    config: config.load(),
    instance: { id: id || `${provider}:t${ctxCounter}`, provider, label: provider, enabled: true, credentials },
  };
}

/* --------------------------------------------------------------- minimax */

t.section('minimax:');

const minimaxBody = {
  model_remains: [
    {
      model_name: 'image',
      current_interval_status: 1,
      current_interval_remaining_percent: 100,
      current_weekly_remaining_percent: 100,
    },
    {
      model_name: 'general',
      current_interval_remaining_percent: 61,
      current_weekly_remaining_percent: 1,
      remains_time: 3 * 3600 * 1000 + 12 * 60 * 1000,
      weekly_remains_time: 26 * 3600 * 1000,
    },
  ],
};

t.check('usa el bucket "general" (el del chat), no el primero que llega', async () => {
  const calls = t.mockFetch(() => ({ body: minimaxBody }));
  const r = await minimax.fetchUsage(ctx('minimax', { apiKey: 'sk-cp-prueba' }));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-cp-prueba');
  assert.deepStrictEqual(
    r.metrics.map((m) => [m.label, m.value]),
    [
      ['ventana 5 h', '39% usado'],
      ['semanal', '99% usado'],
    ]
  );
  // remaining=1 es "1 % que queda", o sea 99 % usado (NO 0 %): la regresion
  // "1 % vs 100 %" tambien a nivel de proveedor.
  const weekly = r.metrics.find((m) => m.window === 'weekly');
  assert.strictEqual(weekly.tone, 'critical');
  assert.strictEqual(weekly.remaining, 'queda 1%');
  // El reinicio es una DURACION y va junto a su barra.
  assert.strictEqual(r.metrics[0].reset, 'en 3 h 12 min');
  assert.strictEqual(weekly.reset, 'en 1 d 2 h');
  assert.strictEqual(r.source, 'configuración de la app');
  assert.strictEqual(r.summary, 'ventana 5 h: 39% usado · semanal: 99% usado');
});

t.check('la clave de la variable de entorno vale si no hay cuenta a mano', async () => {
  process.env.MINIMAX_API_KEY = 'sk-cp-entorno';
  const calls = t.mockFetch(() => ({ body: minimaxBody }));
  try {
    const r = await minimax.fetchUsage(ctx('minimax'));
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-cp-entorno');
    assert.strictEqual(r.source, 'variable de entorno');
  } finally {
    delete process.env.MINIMAX_API_KEY;
  }
});

t.check('sin credencial en ningun sitio -> unconfigured y SIN peticion', async () => {
  t.forbidFetch();
  const r = await minimax.fetchUsage(ctx('minimax'));
  assert.strictEqual(r.status, 'unconfigured');
  assert.deepStrictEqual(r.metrics, []);
  // La fila tiene que decir QUE HACER, no solo que falta la clave.
  assert.match(r.note, /Configuración|MINIMAX_API_KEY/);
});

t.check('un 401 sale como error con el mensaje de la API', async () => {
  t.mockFetch(() => ({ status: 401, body: { base_resp: { status_code: 1004, status_msg: 'invalid api key' } } }));
  const r = await minimax.fetchUsage(ctx('minimax', { apiKey: 'sk-cp-mala' }));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'invalid api key');
  assert.deepStrictEqual(r.metrics, []);
});

t.check('un fallo de red no revienta: error con su motivo', async () => {
  t.mockFetch(() => {
    throw new TypeError('fetch failed');
  });
  const r = await minimax.fetchUsage(ctx('minimax', { apiKey: 'sk-cp-x' }));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'fetch failed');
});

t.check('una respuesta sin buckets es "respuesta vacia", y un porcentaje ausente no pinta barra', async () => {
  t.mockFetch(() => ({ body: { model_remains: [] } }));
  let r = await minimax.fetchUsage(ctx('minimax', { apiKey: 'sk-cp-x' }));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'respuesta vacía');

  t.mockFetch(() => ({
    body: { model_remains: [{ model_name: 'general', current_interval_remaining_percent: 50 }] },
  }));
  r = await minimax.fetchUsage(ctx('minimax', { apiKey: 'sk-cp-x' }));
  assert.strictEqual(r.status, 'ok');
  // Sin `current_weekly_remaining_percent` NO hay metrica semanal (antes
  // null se convertia en 0 % = "agotado").
  assert.deepStrictEqual(
    r.metrics.map((m) => m.label),
    ['ventana 5 h']
  );
});

/* ---------------------------------------------------------------- claude */

t.section('claude:');

const claudeBody = {
  five_hour: { utilization: 12, resets_at: '2026-11-16T18:30:00Z' },
  seven_day: { utilization: 28, resets_at: '2026-11-22T01:00:00Z' },
};

t.check('resolve(): manual OAuth manda y es el UNICO candidato', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const list = await claude.resolve(ctx('claude', { apiKey: 'sk-ant-oat01-manual' }));
  assert.deepStrictEqual(
    list.map((c) => [c.kind, c.value]),
    [['manual', 'sk-ant-oat01-manual']]
  );
});

t.check('resolve(): CLI vigente -> harness vigente -> Claude Desktop (en Windows)', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const list = await claude.resolve(ctx('claude'));
  const kinds = list.map((c) => `${c.kind}:${c.value || c.source}`);
  assert.deepStrictEqual(
    kinds.slice(0, 2),
    ['oauth:sk-ant-oat01-cli', 'oauth:sk-ant-oat01-dsh']
  );
  if (process.platform === 'win32') {
    assert.strictEqual(kinds[2], 'desktop:Claude Desktop');
  }
});

t.check('resolve(): un token CADUCADO se descarta antes de gastar un 401', async () => {
  // Es el bug que dejaba a Claude "en gris": el token de ~/.claude estaba
  // caducado, la app lo usaba, recibia 401 y caia a las transcripciones.
  claudeCli('sk-ant-oat01-caducado', PAST);
  const list = await claude.resolve(ctx('claude'));
  assert.ok(!list.some((c) => c.value === 'sk-ant-oat01-caducado'), 'el token caducado no puede ser candidato');
  assert.strictEqual(list[0].value, 'sk-ant-oat01-dsh');
});

t.check('resolve(): una clave API (sk-ant-api) no es candidata, pero se recuerda para avisar', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const list = await claude.resolve(ctx('claude', { apiKey: 'sk-ant-api03-clave' }));
  assert.ok(!list.some((c) => c.value === 'sk-ant-api03-clave'));
  assert.ok(list.length > 0);
  assert.ok(list[0].ignored.includes('configuración de la app'), list[0].ignored);
});

t.check('con el token de la CLI vigente la cuota sale por HTTP directo', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const calls = t.mockFetch(() => ({ body: claudeBody }));
  const r = await claude.fetchUsage(ctx('claude'));
  assert.strictEqual(r.status, 'ok', r.note);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-ant-oat01-cli');
  assert.strictEqual(calls[0].headers['anthropic-beta'], 'oauth-2025-04-20');
  assert.strictEqual(r.source, 'Claude Code');
  assert.deepStrictEqual(
    r.metrics.map((m) => m.value),
    ['12% usado', '28% usado']
  );
  assert.strictEqual(r.note, '');
});

t.check('la respuesta se CACHEA por cuenta: otra cuenta no hereda la respuesta', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const calls = t.mockFetch(() => ({ body: claudeBody }));
  const first = await claude.fetchUsage(ctx('claude', {}, 'claude:cache'));
  const again = await claude.fetchUsage(ctx('claude', {}, 'claude:cache'));
  assert.strictEqual(calls.length, 1, 'la segunda consulta de la misma cuenta no hace peticion');
  assert.strictEqual(first, again);
  await claude.fetchUsage(ctx('claude', {}, 'claude:otra'));
  assert.strictEqual(calls.length, 2, 'otra cuenta hace su propia peticion');
});

/**
 * Ejecuta `fn` con el reloj adelantado `ms`. La cache de Claude caduca por
 * tiempo, y sin mover el reloj no habria forma de comprobarlo en un test que
 * tiene que durar milisegundos.
 */
async function conRelojAdelantado(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

t.check('un acierto se cachea lo que dura el refresco: a los 2 min se vuelve a preguntar', async () => {
  // La cache de 10 min congelaba las cifras de Claude cinco refrescos
  // seguidos: el consumo parecia no actualizarse.
  claudeCli('sk-ant-oat01-fresco', FUTURE);
  const calls = t.mockFetch(() => ({ body: claudeBody }));
  const id = 'claude:ttl-acierto';
  await claude.fetchUsage(ctx('claude', {}, id));
  await conRelojAdelantado(90 * 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 1, 'dentro de los 2 min no se repite la peticion');
  await conRelojAdelantado(2 * 60 * 1000 + 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 2, 'pasados los 2 min se vuelve a preguntar');
});

t.check('un 429 se respeta 10 minutos: no se insiste en gastar el margen', async () => {
  claudeCli('sk-ant-oat01-topado', FUTURE);
  const calls = t.mockFetch(() => ({ status: 429, body: { error: { message: 'rate limited' } } }));
  const id = 'claude:ttl-429';
  const primero = await claude.fetchUsage(ctx('claude', {}, id));
  assert.notStrictEqual(primero.status, 'ok', 'un 429 no se da por bueno');
  // A los 3 minutos no se molesta al endpoint otra vez.
  await conRelojAdelantado(3 * 60 * 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 1, 'el 429 se cachea: no se insiste a los 3 min');
  // Pasados los 10, si.
  await conRelojAdelantado(11 * 60 * 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 2, 'pasados los 10 min se reintenta');
});

t.check('un fallo normal se cachea un minuto, no diez: el tropiezo no dura', async () => {
  claudeCli('sk-ant-oat01-caido', FUTURE);
  const calls = t.mockFetch(() => {
    throw new Error('red caida');
  });
  const id = 'claude:ttl-fallo';
  await claude.fetchUsage(ctx('claude', {}, id));
  await conRelojAdelantado(30 * 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 1, 'dentro del minuto se sirve la cache del fallo');
  await conRelojAdelantado(61 * 1000, () => claude.fetchUsage(ctx('claude', {}, id)));
  assert.strictEqual(calls.length, 2, 'pasado un minuto se reintenta');
});

t.check('un 401 pasa al SIGUIENTE candidato y lo cuenta en la nota', async () => {
  claudeCli('sk-ant-oat01-revocado', FUTURE);
  const calls = t.mockFetch((url, options) =>
    options.headers.Authorization === 'Bearer sk-ant-oat01-revocado'
      ? { status: 401, body: { error: { message: 'OAuth access token has been revoked' } } }
      : { body: claudeBody }
  );
  const r = await claude.fetchUsage(ctx('claude'));
  assert.strictEqual(r.status, 'ok', r.note);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].headers.Authorization, 'Bearer sk-ant-oat01-dsh');
  assert.strictEqual(r.source, 'harness DSH');
  assert.ok(r.note.includes('Claude Code: OAuth access token has been revoked'), r.note);
});

t.check('un 429 NO se reintenta con otro token: cae al respaldo local con aviso', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  // Transcripciones locales de hoy: el respaldo tiene algo que enseñar.
  t.writeFile(
    path.join(home, '.claude', 'projects', 'p', 's.jsonl'),
    [
      JSON.stringify({ timestamp: new Date().toISOString(), message: { usage: { input_tokens: 1200, output_tokens: 300 } } }),
      JSON.stringify({ timestamp: new Date().toISOString(), message: { usage: { input_tokens: 800, cache_read_input_tokens: 5000 } } }),
    ].join('\n')
  );
  const calls = t.mockFetch(() => ({ status: 429, body: { error: { message: 'rate limited' } } }));
  desktopScriptCalls = 0;
  const r = await claude.fetchUsage(ctx('claude'));
  assert.strictEqual(calls.length, 1, 'un 429 no se reintenta');
  assert.strictEqual(desktopScriptCalls, 0, 'ni se prueba la cache de Claude Desktop');
  // Las transcripciones NO son la cuota: la fila avisa, no sale en verde.
  assert.strictEqual(r.status, 'warning');
  assert.strictEqual(r.summary, 'cuota no disponible');
  assert.strictEqual(r.source, 'Claude Code (local)');
  assert.ok(r.note.startsWith('leído de 1 transcripciones locales'), r.note);
  assert.ok(r.note.includes('cuota remota no disponible: rate limited'), r.note);
  assert.deepStrictEqual(
    r.metrics.map((m) => [m.label, m.value]),
    [
      ['tokens 24 h', '7.3 k'],
      ['peticiones', '2'],
    ]
  );
  // Sin porcentaje: estas metricas no pintan barra ni entran en la media.
  assert.ok(r.metrics.every((m) => m.pct === null));
});

t.check('si TODOS los candidatos fallan de autenticacion, se intenta Claude Desktop y se avisa', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const calls = t.mockFetch(() => ({ status: 401, body: { error: { message: 'revoked' } } }));
  desktopScriptCalls = 0;
  const r = await claude.fetchUsage(ctx('claude'));
  assert.strictEqual(calls.length, 2, 'se prueban los dos tokens en claro');
  if (process.platform === 'win32') assert.strictEqual(desktopScriptCalls, 1);
  assert.strictEqual(r.status, 'warning');
  assert.ok(r.note.includes('Claude Code: revoked'), r.note);
  assert.ok(r.note.includes('harness DSH: revoked'), r.note);
});

t.check('la clave API pegada se IGNORA y la nota lo dice', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const calls = t.mockFetch(() => ({ body: claudeBody }));
  const r = await claude.fetchUsage(ctx('claude', { apiKey: 'sk-ant-api03-clave' }));
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-ant-oat01-cli', 'la clave API no se envia');
  assert.ok(r.note.includes('se ignora la clave API'), r.note);
});

t.check('un token OAuth pegado a mano se usa tal cual (sin pasar por la CLI)', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  const calls = t.mockFetch(() => ({ body: claudeBody }));
  const r = await claude.fetchUsage(ctx('claude', { apiKey: ' sk-ant-oat01-manual ' }));
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-ant-oat01-manual');
});

t.check('una respuesta 200 sin cuotas no se da por buena', async () => {
  claudeCli('sk-ant-oat01-cli', FUTURE);
  t.mockFetch(() => ({ body: { ok: true } }));
  const r = await claude.fetchUsage(ctx('claude'));
  assert.notStrictEqual(r.status, 'ok');
  assert.ok(r.note.includes('respuesta sin cuotas'), r.note);
});

/* ----------------------------------------------------------- antigravity */

t.section('antigravity:');

const agBody = {
  groups: [
    {
      displayName: 'Gemini Models',
      buckets: [
        { window: 'weekly', remainingFraction: 0.846, resetTime: '2026-11-20T10:00:00Z' },
        { window: '5h', remainingFraction: 1 },
      ],
    },
  ],
};

t.check('JSON pegado a mano: el Bearer es el access_token, NO el JSON entero', async () => {
  // Regresion de ef99d53: todo lo manual se marcaba `raw` y el JSON entero
  // iba como Bearer.
  const cred = JSON.stringify({
    token: { access_token: 'ya29.vigente', refresh_token: 'rt', expiry: new Date(FUTURE).toISOString() },
  });
  const calls = t.mockFetch(() => ({ body: agBody }));
  const r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: cred }));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].options.method, 'POST');
  assert.ok(calls[0].url.endsWith('/v1internal:retrieveUserQuotaSummary'), calls[0].url);
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer ya29.vigente');
  assert.deepStrictEqual(
    r.metrics.map((m) => m.label),
    ['Gemini · 5 h', 'Gemini · semanal']
  );
});

t.check('un token a secas va tal cual como Bearer', async () => {
  const calls = t.mockFetch(() => ({ body: agBody }));
  const r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: 'ya29.a-secas' }));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer ya29.a-secas');
});

t.check('JSON caducado SIN refresh_token: error claro, sin peticion', async () => {
  const cred = JSON.stringify({ token: { access_token: 'ya29.viejo', expiry: new Date(PAST).toISOString() } });
  t.forbidFetch();
  const r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: cred }));
  assert.strictEqual(r.status, 'error');
  assert.ok(/caducada/.test(r.error), r.error);
});

t.check('JSON caducado CON refresh_token: se renueva y el token nuevo se cachea', async () => {
  const original = agClient.refreshAccessToken;
  let refreshes = 0;
  agClient.refreshAccessToken = async (refreshToken) => {
    refreshes += 1;
    assert.strictEqual(refreshToken, 'rt-renovable');
    return { accessToken: 'ya29.fresco', expiresIn: 3600 };
  };
  try {
    const cred = JSON.stringify({
      token: { access_token: 'ya29.viejo', refresh_token: 'rt-renovable', expiry: new Date(PAST).toISOString() },
    });
    const calls = t.mockFetch(() => ({ body: agBody }));
    const r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: cred }));
    assert.strictEqual(r.status, 'ok', r.error);
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer ya29.fresco');
    await antigravity.fetchUsage(ctx('antigravity', { apiKey: cred }));
    assert.strictEqual(refreshes, 1, 'el segundo uso sale de la cache del token');
    assert.strictEqual(calls.length, 2);
  } finally {
    agClient.refreshAccessToken = original;
  }
});

t.check('un JSON ilegible no revienta', async () => {
  t.forbidFetch();
  const r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: '{esto no es json' }));
  assert.strictEqual(r.status, 'error');
  assert.ok(/ilegible/.test(r.error), r.error);
});

t.check('un fallo de la API sale como error, y una respuesta sin cuotas tambien', async () => {
  t.mockFetch(() => ({ status: 403, body: { error: { message: 'PERMISSION_DENIED' } } }));
  let r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: 'ya29.x' }));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'PERMISSION_DENIED');

  t.mockFetch(() => ({ body: { groups: [] } }));
  r = await antigravity.fetchUsage(ctx('antigravity', { apiKey: 'ya29.x' }));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'respuesta sin cuotas');
});

t.check('sin credencial (y sin almacen de Windows) -> unconfigured', async () => {
  t.forbidFetch();
  const r = await antigravity.fetchUsage(ctx('antigravity'));
  assert.strictEqual(r.status, 'unconfigured');
  // Un usuario pregunto "¿tiene que detectar Antigravity abierto?": la nota
  // aclara que la cuenta se conecta iniciando sesion en el IDE, no aqui.
  assert.match(r.note, /IDE de Antigravity/);
  assert.match(r.note, /no hace falta tenerlo abierto/);
});

t.check('la credencial de ~/.antigravity/auth.json se usa como token a secas', async () => {
  t.writeFile(path.join(home, '.antigravity', 'auth.json'), { access_token: 'ya29.local' });
  try {
    const calls = t.mockFetch(() => ({ body: agBody }));
    const r = await antigravity.fetchUsage(ctx('antigravity'));
    assert.strictEqual(r.status, 'ok', r.error);
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer ya29.local');
    assert.strictEqual(r.source, 'Antigravity');
  } finally {
    t.removeDir(path.join(home, '.antigravity'));
  }
});

/* -------------------------------------------------------------- deepseek */

t.section('deepseek:');

t.check('con clave API: el saldo de api.deepseek.com, sin barra', async () => {
  const calls = t.mockFetch(() => ({
    body: {
      is_available: true,
      balance_infos: [{ currency: 'USD', total_balance: '33.64', granted_balance: '0.00', topped_up_balance: '33.64' }],
    },
  }));
  const r = await deepseek.fetchUsage(ctx('deepseek', { apiKey: 'sk-clave' }));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.ok(calls[0].url.startsWith('https://api.deepseek.com/user/balance'));
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer sk-clave');
  assert.deepStrictEqual(
    r.metrics.map((m) => [m.label, m.value, m.pct]),
    [
      ['saldo', '$33.64', null],
      ['recargado', '$33.64', null],
      ['cortesía', '$0.00', null],
    ]
  );
  assert.strictEqual(r.note, '');
});

t.check('con clave API y saldo agotado, la nota lo dice', async () => {
  t.mockFetch(() => ({
    body: { is_available: false, balance_infos: [{ currency: 'CNY', total_balance: '0.00' }] },
  }));
  const r = await deepseek.fetchUsage(ctx('deepseek', { apiKey: 'sk-clave' }));
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.metrics[0].value, '¥0.00');
  assert.strictEqual(r.note, 'saldo agotado');
});

/** Respuesta de la plataforma (sesion del harness), con el sobre code/biz_code. */
function platform(bizData) {
  return { body: { code: 0, data: { biz_code: 0, biz_msg: '', biz_data: bizData } } };
}

const hoy = new Date();
const diaKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

t.check('con la sesion del harness: saldo + autonomia, en ese orden, y la cabecera propia', async () => {
  // Tres dias pasados con 1 USD/dia + hoy (que cuenta a medias).
  const days = [];
  for (let i = 3; i >= 1; i -= 1) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    days.push({ date: diaKey(d), data: [{ model: 'deepseek-flash', usage: [{ type: 'RESPONSE_TOKEN', amount: '1' }] }] });
  }
  days.push({ date: diaKey(hoy), data: [{ model: 'deepseek-flash', usage: [{ type: 'RESPONSE_TOKEN', amount: '0.5' }] }] });

  const calls = t.mockFetch((url) => {
    if (url.includes('get_user_summary')) {
      return platform({
        normal_wallets: [{ currency: 'USD', balance: '35.00' }],
        bonus_wallets: [{ currency: 'CNY', balance: '4.69' }, { currency: 'USD', balance: '0' }],
        total_costs: [{ currency: 'USD', amount: '178.32' }],
      });
    }
    if (url.includes('/usage/amount')) {
      return platform({
        total: [
          {
            model: 'deepseek-flash',
            usage: [
              { type: 'PROMPT_TOKEN', amount: '2000000' },
              { type: 'RESPONSE_TOKEN', amount: '400000' },
              { type: 'REQUEST', amount: '475' },
            ],
          },
        ],
      });
    }
    if (url.includes('/usage/cost')) {
      return platform({
        total: [{ model: 'deepseek-flash', usage: [{ type: 'PROMPT_TOKEN', amount: '3.5' }] }],
        days,
      });
    }
    throw new Error(`url inesperada ${url}`);
  });

  const r = await deepseek.fetchUsage(ctx('deepseek'));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0].headers['x-dsh-auth-token'], 'ds-session-token');
  assert.strictEqual(r.source, 'harness DSH');

  // Ritmo: 3,5 USD en 3,5 dias = 1 USD/dia -> 35 dias de autonomia.
  assert.deepStrictEqual(
    r.metrics.map((m) => m.label),
    ['saldo', 'aguanta', 'bonus CNY', `tokens ${hoy.getMonth() + 1}/${hoy.getFullYear()}`, 'peticiones mes', 'gasto USD']
  );
  const saldo = r.metrics[0];
  assert.strictEqual(saldo.kind, 'balance');
  assert.strictEqual(saldo.value, '$35.00');
  assert.strictEqual(saldo.tone, 'ok');
  // La barra del saldo se llena con lo que QUEDA: 35 de (35 + 178,32).
  assert.ok(Math.abs(saldo.pct - 35 / 213.32) < 0.001, `pct ${saldo.pct}`);
  const aguanta = r.metrics[1];
  assert.strictEqual(aguanta.kind, 'runway');
  assert.strictEqual(aguanta.runwayDays, 35);
  assert.strictEqual(aguanta.value, '35 días');
  assert.strictEqual(aguanta.window, 'monthly');
  assert.strictEqual(r.metrics[3].value, '2.4 M');
  assert.strictEqual(r.metrics[4].value, '475');
  assert.strictEqual(r.headline, '$35.00 · aguanta 35 días');
  assert.ok(r.note.includes('deepseek-flash 3.50 USD este mes'), r.note);
  assert.ok(r.note.includes('ritmo 1.000 USD/día'), r.note);
});

t.check('un error de negocio de la plataforma (token caducado) sale como error, no como ok vacio', async () => {
  t.mockFetch(() => ({ body: { code: 40001, msg: 'token expired', data: null } }));
  const r = await deepseek.fetchUsage(ctx('deepseek'));
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error, 'token expired');

  t.mockFetch(() => ({ body: { code: 0, data: { biz_code: 10001, biz_msg: 'login required' } } }));
  const r2 = await deepseek.fetchUsage(ctx('deepseek'));
  assert.strictEqual(r2.status, 'error');
  assert.strictEqual(r2.error, 'login required');
});

t.check('sin desglose de gasto no hay autonomia, pero el saldo sigue saliendo', async () => {
  t.mockFetch((url) => {
    if (url.includes('get_user_summary')) {
      return platform({ normal_wallets: [{ currency: 'USD', balance: '3.00' }], total_costs: [] });
    }
    return { status: 500, body: 'boom' };
  });
  const r = await deepseek.fetchUsage(ctx('deepseek'));
  assert.strictEqual(r.status, 'ok', r.error);
  assert.deepStrictEqual(
    r.metrics.map((m) => m.label),
    ['saldo']
  );
  // Saldo bajo: critico aunque no haya ritmo.
  assert.strictEqual(r.metrics[0].tone, 'critical');
  assert.strictEqual(r.headline, '$3.00');
});

t.finish('OK: los proveedores pasan', () => {
  t.restoreFetch();
  t.removeDir(home);
});
