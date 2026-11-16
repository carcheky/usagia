'use strict';

// Pruebas de la CASCADA de credenciales con ficheros de verdad en un HOME
// falso: variables de entorno, ~/.dsh/.credentials.yaml (harness),
// ~/.claude/.credentials.json (Claude Code) y ~/.antigravity/auth.json.
//
// La app funciona "out of the box" leyendo lo que las herramientas ya
// tienen guardado: si una de estas lecturas se rompe, un proveedor pasa a
// "sin credencial" sin que nadie haya tocado nada.
//
// Node PURO: lo lanza scripts/test.js (npm test).

const path = require('path');
const t = require('./test-lib');

const home = t.fakeHome('usagia-creds');

// El fichero del harness se escribe ANTES de la primera lectura (se cachea).
t.writeFile(
  path.join(home, '.dsh', '.credentials.yaml'),
  [
    '# credenciales del harness (formato real, con CRLF a proposito)',
    'refs:',
    '  MINIMAX_API_KEY: "sk-cp-harness"',
    "  GOOGLE_API_KEY: 'AIza-harness'",
    'records:',
    '  llm-pi-ai/anthropic:',
    '    payload:',
    '      access: sk-ant-oat01-harness',
    '      refresh: rt-harness',
    '      expires: 1900000000000',
    '    meta: x',
    '  deepseek-account-platform/default:',
    '    payload:',
    '      token: ds-harness',
  ].join('\r\n')
);

const root = path.join(__dirname, '..', 'src', 'main');
const creds = require(path.join(root, 'credentials'));
const { assert } = t;

t.section('variables de entorno:');

t.check('fromEnv toma la primera variable con valor y dice cual', () => {
  process.env.MINIMAX_API_KEY = '   ';
  process.env.MINIMAX_KEY = ' sk-cp-env ';
  try {
    const c = creds.fromEnv('minimax');
    assert.strictEqual(c.value, 'sk-cp-env', 'se recorta y se salta la vacia');
    assert.strictEqual(c.source, 'variable de entorno');
    assert.strictEqual(c.hint, 'MINIMAX_KEY');
  } finally {
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_KEY;
  }
  assert.strictEqual(creds.fromEnv('minimax'), null);
  assert.strictEqual(creds.fromEnv('inventado'), null);
});

t.check('Antigravity acepta cualquiera de sus tres variables', () => {
  process.env.GOOGLE_ANTIGRAVITY_TOKEN = 'ya29.env';
  try {
    assert.strictEqual(creds.fromEnv('antigravity').value, 'ya29.env');
  } finally {
    delete process.env.GOOGLE_ANTIGRAVITY_TOKEN;
  }
});

t.section('configuracion de la app:');

t.check('la credencial de la cuenta manda sobre la global, y la global sobre nada', () => {
  const cfg = { credentials: { minimax: { apiKey: 'global' } } };
  const own = creds.fromUserConfig(cfg, 'minimax', 'apiKey', { credentials: { apiKey: ' propia ' } });
  assert.strictEqual(own.value, 'propia');
  assert.strictEqual(own.hint, 'cuenta configurada a mano');
  const global = creds.fromUserConfig(cfg, 'minimax', 'apiKey', { credentials: { apiKey: '  ' } });
  assert.strictEqual(global.value, 'global');
  assert.strictEqual(global.hint, 'introducida a mano');
  assert.strictEqual(creds.fromUserConfig({}, 'minimax', 'apiKey', null), null);
  assert.strictEqual(creds.fromUserConfig({ credentials: { minimax: {} } }, 'minimax', 'apiKey', {}), null);
});

t.section('harness DSH (~/.dsh/.credentials.yaml):');

t.check('parseYamlMappings aguanta CRLF, comentarios y comillas', () => {
  const parsed = creds.parseYamlMappings('a: "1"\r\n# c\r\nb:\r\n  c/d: \'x\'\r\n  e:\r\n    f: y\r\ng: z');
  assert.deepStrictEqual(parsed, { a: '1', b: { 'c/d': 'x', e: { f: 'y' } }, g: 'z' });
});

t.check('Minimax: la referencia MINIMAX_API_KEY', () => {
  const c = creds.fromDsh('minimax');
  assert.strictEqual(c.value, 'sk-cp-harness');
  assert.strictEqual(c.source, 'harness DSH');
});

t.check('DeepSeek: el token de la sesion de la plataforma', () => {
  const c = creds.fromDsh('deepseek');
  assert.strictEqual(c.value, 'ds-harness');
  assert.strictEqual(c.hint, 'deepseek-account OAuth');
});

t.check('Claude: el grant de pi-ai con su expiracion (numerica) y su refresh', () => {
  const c = creds.fromDsh('claude');
  assert.strictEqual(c.value, 'sk-ant-oat01-harness');
  assert.strictEqual(c.expiresAt, 1900000000000, 'expires tiene que ser un numero, no texto');
  assert.strictEqual(c.refresh, 'rt-harness');
});

t.check('Antigravity no esta en el harness', () => {
  assert.strictEqual(creds.fromDsh('antigravity'), null);
});

t.section('Claude Code (~/.claude/.credentials.json):');

const claudeFile = path.join(home, '.claude', '.credentials.json');

t.check('token, expiracion, refresh y tipo de suscripcion', () => {
  t.writeFile(claudeFile, {
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-cli',
      refreshToken: 'rt-cli',
      expiresAt: 1800000000000,
      subscriptionType: 'pro',
    },
  });
  const c = creds.claudeCodeToken();
  assert.strictEqual(c.value, 'sk-ant-oat01-cli');
  assert.strictEqual(c.source, 'Claude Code');
  assert.strictEqual(c.hint, 'Claude Code · pro');
  assert.strictEqual(c.expiresAt, 1800000000000);
  assert.strictEqual(c.refresh, 'rt-cli');
});

t.check('en Windows el fichero suele venir SIN token: null, no un token vacio', () => {
  t.writeFile(claudeFile, { claudeAiOauth: { accessToken: '', subscriptionType: 'pro' } });
  assert.strictEqual(creds.claudeCodeToken(), null);
  t.writeFile(claudeFile, '{ roto');
  assert.strictEqual(creds.claudeCodeToken(), null);
  t.removeDir(path.join(home, '.claude'));
  assert.strictEqual(creds.claudeCodeToken(), null);
});

t.section('Antigravity (~/.antigravity/auth.json):');

t.check('acepta token, access_token o accessToken', () => {
  const file = path.join(home, '.antigravity', 'auth.json');
  for (const key of ['token', 'access_token', 'accessToken']) {
    t.writeFile(file, { [key]: `ya29.${key}` });
    const c = creds.antigravityToken();
    assert.strictEqual(c.value, `ya29.${key}`, `clave ${key}`);
    assert.strictEqual(c.source, 'Antigravity');
  }
  t.writeFile(file, { otra: 'cosa' });
  assert.strictEqual(creds.antigravityToken(), null);
});

t.section('firstValid:');

t.check('devuelve el primero con valor de verdad, en orden', () => {
  const picked = creds.firstValid([undefined, { value: null, source: 'a' }, { value: 'x', source: 'b' }, { value: 'y', source: 'c' }]);
  assert.strictEqual(picked.source, 'b');
});

t.finish('OK: la cascada de credenciales pasa', () => t.removeDir(home));
