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
const availability = require(path.join(root, 'availability'));
const deepseek = require(path.join(root, 'providers', 'deepseek'));

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

check('sortMetrics pone la ventana mas corta primero, en TODOS los proveedores', () => {
  // El orden que devuelve cada API es distinto: aqui esta al reves.
  const metrics = [
    { label: 'semanal', window: 'weekly' },
    { label: 'ventana 5 h', window: '5h' },
    { label: 'mensual', window: 'monthly' },
  ];
  assert.deepStrictEqual(
    http.sortMetrics(metrics).map((m) => m.label),
    ['ventana 5 h', 'semanal', 'mensual']
  );

  // El limite con ambito va tras la semanal (es otra cuota semanal).
  const conAmbito = [
    { label: 'semanal Fable', window: 'weekly_scoped' },
    { label: 'ventana 5 h', window: '5h' },
    { label: 'semanal', window: 'weekly' },
  ];
  assert.deepStrictEqual(
    http.sortMetrics(conAmbito).map((m) => m.label),
    ['ventana 5 h', 'semanal', 'semanal Fable']
  );
});

check('sortMetrics respeta los GRUPOS (Antigravity) sin separarlos', () => {
  const metrics = [
    { label: 'Gemini Models · semanal', window: 'weekly', group: 'Gemini Models' },
    { label: 'Claude and GPT models · semanal', window: 'weekly', group: 'Claude and GPT models' },
    { label: 'Gemini Models · 5 h', window: '5h', group: 'Gemini Models' },
    { label: 'Claude and GPT models · 5 h', window: '5h', group: 'Claude and GPT models' },
  ];
  assert.deepStrictEqual(
    http.sortMetrics(metrics).map((m) => m.label),
    [
      'Gemini Models · 5 h',
      'Gemini Models · semanal',
      'Claude and GPT models · 5 h',
      'Claude and GPT models · semanal',
    ]
  );
});

check('sortMetrics deja al final lo que no es una ventana de cuota', () => {
  const metrics = [
    { label: 'saldo', window: undefined },
    { label: 'ventana 5 h', window: '5h' },
    { label: 'tokens', window: undefined },
  ];
  assert.deepStrictEqual(
    http.sortMetrics(metrics).map((m) => m.label),
    ['ventana 5 h', 'saldo', 'tokens']
  );
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
  extra_usage: { is_enabled: true, monthly_limit: 50, used_credits: 12, currency: 'USD' },
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
  const { metrics, notes } = claude.parseUsage(claudeResponse);
  // El reinicio va en la propia metrica (junto a su barra), no en la nota.
  const fiveHour = metrics.find((m) => m.label === 'ventana 5 h');
  assert.ok(fiveHour.reset, 'la metrica debe decir cuando se reinicia');
  assert.ok(notes.some((n) => n.includes('Claude Code consume el 94% de la cuota semanal')), notes.join(' | '));
  // El uso extra solo se avisa cuando hay algo que avisar.
  assert.ok(
    notes.some((n) => n.includes('uso extra: 12 de 50 USD')),
    notes.join(' | ')
  );
});

check('el uso extra desactivado no llena la nota de ruido', () => {
  const { notes } = claude.parseUsage({
    seven_day: { utilization: 42 },
    extra_usage: { is_enabled: false, monthly_limit: 3600, used_credits: 0, currency: 'EUR' },
  });
  assert.deepStrictEqual(notes, [], notes.join(' | '));
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

check('un token caducado se detecta (si se usa, el endpoint responde 401)', () => {
  const ahora = Date.now();
  assert.strictEqual(claude.isExpired(ahora - 1000), true);
  assert.strictEqual(claude.isExpired(ahora + 3600000), false);
  // Sin fecha de expiracion no se puede affirmar que este caducado.
  assert.strictEqual(claude.isExpired(null), false);
  assert.strictEqual(claude.isExpired(undefined), false);
  assert.strictEqual(claude.isExpired(0), false);
  assert.strictEqual(claude.isExpired('nada'), false);
});

check('una cuota al 100 % sale critica y con la barra llena', () => {
  const { metrics } = claude.parseUsage({
    five_hour: { utilization: 100, resets_at: '2026-11-16T03:30:00Z' },
    seven_day: { utilization: 42 },
  });
  const fiveHour = metrics.find((m) => m.label === 'ventana 5 h');
  // pct = lo CONSUMIDO: 1 = barra al 100 %.
  assert.strictEqual(fiveHour.pct, 1);
  assert.strictEqual(fiveHour.value, '100% usado');
  // El tono se decide por lo que QUEDA: 0 % que queda = critico (rojo).
  assert.strictEqual(fiveHour.tone, 'critical');
  assert.strictEqual(fiveHour.remaining, 'queda 0%');
});

check('el limite con ambito se marca por su nombre de modelo', () => {
  const { metrics } = claude.parseUsage({
    seven_day: { utilization: 42 },
    limits: [
      {
        kind: 'weekly_scoped',
        is_active: true,
        percent: 74,
        scope: { model: { display_name: 'Fable' } },
      },
    ],
  });
  const scoped = metrics.find((m) => m.label === 'semanal Fable');
  assert.ok(scoped, 'falta la metrica con ambito');
  assert.strictEqual(scoped.pct, 0.74);
  assert.strictEqual(scoped.tone, 'warning');
});

check('Claude sale en el orden canonico: 5 h, semanal, con ambito, mensual', () => {
  const { metrics } = claude.parseUsage({
    five_hour: { utilization: 100 },
    seven_day: { utilization: 42 },
    seven_day_opus: { utilization: 10 },
    limits: [
      {
        kind: 'weekly_scoped',
        is_active: true,
        percent: 74,
        scope: { model: { display_name: 'Fable' } },
      },
    ],
  });
  assert.deepStrictEqual(
    metrics.map((m) => m.label),
    ['ventana 5 h', 'semanal', 'semanal Fable', 'mensual']
  );
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
  const weekly = metrics.find((m) => m.label === 'Gemini · semanal');
  assert.ok(weekly, 'falta la metrica semanal');
  assert.strictEqual(weekly.value, '15.4% usado');
  assert.strictEqual(weekly.short, '15%');
  assert.strictEqual(weekly.remaining, 'queda 84.6%');
  assert.strictEqual(weekly.tone, 'ok');
  // remaining=1 es "100 % que queda", o sea 0 % usado, no 1 %.
  const fiveHour = metrics.find((m) => m.label === 'Gemini · 5 h');
  assert.strictEqual(fiveHour.value, '0% usado');
});

check('un bucket casi agotado sale critico y los no numericos se omiten', () => {
  const { metrics, notes } = antigravity.parseSummary(agResponse);
  const tight = metrics.find((m) => m.label === 'Claude/GPT · semanal');
  assert.strictEqual(tight.tone, 'critical');
  assert.strictEqual(tight.value, '99% usado');
  assert.ok(!metrics.some((m) => m.label.endsWith('diario')), 'el bucket no numerico no debe pintarse');
  // El reinicio va en la metrica que lo tiene; la nota global ya no repite
  // el grupo cuatro veces (era la linea mas larga de la tarjeta).
  const weekly = metrics.find((m) => m.label === 'Gemini · semanal');
  assert.ok(weekly.reset, 'la metrica debe decir cuando se reinicia');
  assert.strictEqual(notes.length, 0);
});

check('el nombre largo del grupo se abrevia, pero el completo sigue en el tooltip', () => {
  const { metrics } = antigravity.parseSummary(agResponse);
  const weekly = metrics.find((m) => m.label === 'Gemini · semanal');
  assert.strictEqual(weekly.fullLabel, 'Gemini Models · semanal');
  const gpt = metrics.find((m) => m.label === 'Claude/GPT · semanal');
  assert.strictEqual(gpt.fullLabel, 'Claude and GPT models · semanal');
});

check('Antigravity sale en el orden canonico: 5 h antes que semanal', () => {
  const { metrics } = antigravity.parseSummary({
    groups: [
      {
        displayName: 'Gemini Models',
        buckets: [
          { window: 'weekly', remainingFraction: 0.846 },
          { window: '5h', remainingFraction: 0.5 },
        ],
      },
    ],
  });
  assert.deepStrictEqual(
    metrics.map((m) => m.label),
    ['Gemini · 5 h', 'Gemini · semanal']
  );
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

/* ------------------------------------------------------- disponibilidad */

console.log('disponibilidad:');

/** Atajo: un proveedor con las ventanas que se le pasan. */
function prov(metrics, extra = {}) {
  return {
    status: 'ok',
    metrics: metrics.map(([window, used]) => ({
      label: window,
      window,
      pct: used,
      tone: 'ok',
    })),
    ...extra,
  };
}

check('todo en verde cuando hay de sobra en todas partes', () => {
  const { tone, left } = availability.computeAvailability([
    prov([['5h', 0.1], ['weekly', 0.2]]),
    prov([['5h', 0], ['weekly', 0.1]]),
  ]);
  assert.strictEqual(tone, 'ok');
  assert.ok(left > 0.5, `media ${left}`);
});

check('una ventana de 5 h agotada NO pone el icono en rojo', () => {
  // Es el caso que se quejaba: Claude al 100 % en la 5 h y de sobra en lo
  // demas. Rojo se lee como "no queda uso de nada".
  const { tone } = availability.computeAvailability([
    prov([['5h', 1], ['weekly', 0.42]]),
    prov([['5h', 0.07], ['weekly', 0.11]]),
    prov([['5h', 0], ['weekly', 0.15]]),
  ]);
  assert.strictEqual(tone, 'warning', 'una 5 h agotada es amarillo, no rojo');
});

check('una ventana LARGA agotada si pone el icono en rojo', () => {
  const { tone } = availability.computeAvailability([
    prov([['5h', 0.1], ['weekly', 1]]),
    prov([['5h', 0.07], ['weekly', 0.11]]),
  ]);
  assert.strictEqual(tone, 'critical', 'la semanal agotada es un problema de verdad');
});

check('una ventana mensual agotada es roja', () => {
  const { tone } = availability.computeAvailability([
    prov([['5h', 0.1], ['monthly', 1]]),
    prov([['5h', 0.07], ['weekly', 0.11]]),
  ]);
  assert.strictEqual(tone, 'critical');
});

check('con la media por debajo del 20 % el icono se pone rojo', () => {
  // Nadie al 100 %, pero entre todos queda muy poco.
  const { tone, left } = availability.computeAvailability([
    prov([['weekly', 0.95], ['monthly', 0.95]]),
    prov([['weekly', 0.95], ['monthly', 0.95]]),
  ]);
  assert.ok(left < 0.2, `media ${left}`);
  assert.strictEqual(tone, 'critical');
});

check('con la media entre el 20 % y el 50 % el icono es amarillo', () => {
  const { tone, left } = availability.computeAvailability([
    prov([['weekly', 0.7], ['monthly', 0.7]]),
    prov([['weekly', 0.7], ['monthly', 0.7]]),
  ]);
  assert.ok(left > 0.2 && left < 0.5, `media ${left}`);
  assert.strictEqual(tone, 'warning');
});

check('un proveedor con TODAS sus ventanas agotadas bloquea al resto', () => {
  const providers = [
    prov([['5h', 1], ['weekly', 1]]),
    prov([['5h', 0.07], ['weekly', 0.11]]),
  ];
  const { tone, blocked } = availability.computeAvailability(providers);
  assert.strictEqual(blocked, 1);
  // El otro proveedor tiene de sobra, pero el primero tiene la SEMANAL
  // agotada (no se repone en dias): eso es rojo, aunque el total global
  // no sea de collapse.
  assert.strictEqual(tone, 'critical');
});

check('si TODOS los proveedores estan bloqueados, es rojo', () => {
  const { tone } = availability.computeAvailability([
    prov([['5h', 1], ['weekly', 1]]),
    prov([['5h', 1], ['weekly', 1]]),
  ]);
  assert.strictEqual(tone, 'critical');
});

check('una cuota que no se pudo consultar avisa (no se da por buena)', () => {
  const { tone, unknown } = availability.computeAvailability([
    prov([['5h', 0.05], ['weekly', 0.1]]),
    { status: 'warning', metrics: [] },
  ]);
  assert.strictEqual(unknown, 1);
  assert.strictEqual(tone, 'warning');
});

check('el punto de la fila usa el mismo criterio que el icono', () => {
  // Una ventana larga agotada: el punto va en rojo.
  assert.strictEqual(availability.providerTone(prov([['5h', 0.1], ['weekly', 1]])), 'critical');
  // Una 5 h agotada: el punto va en amarillo, no en rojo.
  assert.strictEqual(availability.providerTone(prov([['5h', 1], ['weekly', 0.4]])), 'warning');
  // Con de sobra: en verde.
  assert.strictEqual(availability.providerTone(prov([['5h', 0.1], ['weekly', 0.2]])), 'ok');
  // Sin cuota consultable: avisa.
  assert.strictEqual(availability.providerTone({ status: 'warning', metrics: [] }), 'warning');
  // Sin porcentajes (el saldo de DeepSeek): ni verde ni rojo, neutro.
  assert.strictEqual(
    availability.providerTone({ status: 'ok', metrics: [{ label: 'saldo', pct: null }] }),
    'neutral'
  );
});

check('las ventanas de 5 h pesan menos que las semanales en la media', () => {
  // Con la 5 h al 100 % pero la semanal casi entera, la media ponderada
  // tiene que seguir siendo buena: la semanal es la que pesa, porque es la
  // que no se repone enseguida.
  const { left } = availability.computeAvailability([prov([['5h', 1], ['weekly', 0]])]);
  assert.ok(left > 0.5, `media ${left} (la semanal pesa mas que la 5 h)`);
  const solo = availability.providerState(prov([['5h', 1], ['weekly', 0]]));
  assert.ok(solo.left > 0.5, `media del proveedor ${solo.left}`);
  // Y aun asi avisa: la 5 h agotada es un contratiempo pasajero.
  assert.strictEqual(availability.providerTone(prov([['5h', 1], ['weekly', 0]])), 'warning');
});

/* ------------------------------------------------------------ deepseek */

console.log('deepseek:');

check('el saldo NO es una ventana: no entra en la media de cuota', () => {
  // El saldo es dinero prepaid: no hay tope contra el que medirlo, asi que
  // no puede compararse con la 5 h ni con la semanal de los demas.
  const state = deepseek.balanceState(33.64, 178.32);
  // La barra del saldo se llena con lo que QUEDA (no con lo usado, como las
  // cuotas): de 212 USD puestos, quedan 33,64.
  assert.ok(Math.abs(state.pct - 33.64 / 212) < 0.001, `pct ${state.pct}`);
  // El color va por el saldo absoluto: no se repone solo (hay que recargar).
  assert.strictEqual(deepseek.balanceTone(33.64), 'ok');
  assert.strictEqual(deepseek.balanceTone(10), 'warning');
  assert.strictEqual(deepseek.balanceTone(2), 'critical');
  assert.strictEqual(deepseek.balanceTone(0), 'critical');
});

check('la autonomia se mide en dias y es la "ventana" de DeepSeek', () => {
  // 30 USD gastados en 10 dias que ya han pasado = 3 USD/dia; con 30 USD de
  // saldo, 10 dias de autonomia.
  const days = Array.from({ length: 10 }, (_, i) => ({
    date: `2020-01-${String(i + 1).padStart(2, '0')}`,
    data: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: '3' }] }],
  }));
  const runway = deepseek.runwayFrom(days, 30);
  assert.ok(runway, 'debe sacar la autonomia');
  assert.ok(Math.abs(runway.perDay - 3) < 0.01, `ritmo ${runway.perDay}`);
  assert.strictEqual(runway.days, 10, `autonomia ${runway.days} dias`);
  // Con 10 dias de autonomia, la ventana que le toca es la mensual (mas de
  // una semana de sobra).
  assert.strictEqual(deepseek.runwayWindow(10), 'monthly');
  assert.strictEqual(deepseek.runwayWindow(2), 'daily');
  assert.strictEqual(deepseek.runwayWindow(1), '5h');
  assert.strictEqual(deepseek.runwayWindow(5), 'weekly');
  assert.strictEqual(deepseek.runwayWindow(400), 'monthly');
});

check('el dia de hoy cuenta a medias en el ritmo', () => {
  const hoy = new Date();
  const key = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(
    hoy.getDate()
  ).padStart(2, '0')}`;
  assert.strictEqual(deepseek.dayIsPast({ date: key }), 0.5, 'hoy va a medias');
  assert.strictEqual(deepseek.dayIsPast({ date: '2020-01-01' }), 1, 'ayer cuenta entero');
  assert.strictEqual(deepseek.dayIsPast({ date: '2999-01-01' }), 0, 'un dia futuro no cuenta');
});

check('la autonomia se cuenta como ventana en la cuenta global', () => {
  // Con el saldo a la mitad de su historico, pero la autonomia larga, no es
  // un provider bloqueado.
  const resultado = {
    status: 'ok',
    metrics: [
      { label: 'saldo', kind: 'balance', pct: 0.5, tone: 'ok' },
      { label: 'aguanta', kind: 'runway', runwayDays: 400, window: 'monthly' },
    ],
  };
  const { tone, left } = availability.computeAvailability([resultado]);
  assert.ok(left > 0.5, `media ${left}`);
  assert.strictEqual(tone, 'ok');
});

check('un saldo bajo avisa aunque la autonomia sea larga', () => {
  // El saldo no se repone solo: recargar es cosa del usuario.
  const resultado = {
    status: 'ok',
    metrics: [
      { label: 'saldo', kind: 'balance', pct: 0.02, tone: 'critical' },
      { label: 'aguanta', kind: 'runway', runwayDays: 2, window: '5h' },
    ],
  };
  assert.strictEqual(availability.providerTone(resultado), 'critical');
});

console.log(failures ? `\nFALLO: ${failures} prueba(s) fallida(s)` : '\nOK: todos los parsers pasan');
process.exit(failures ? 1 : 0);
