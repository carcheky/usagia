'use strict';

// Pruebas de la logica PURA de scripts/release.js: como se clasifica un
// commit, que decide la version, como se numera la siguiente beta (cuatro
// digitos) y que entra en el changelog. Lo demas (git y la API de GitHub)
// no se toca aqui.
//
// Equivocarse aqui cuesta una release mal numerada o un changelog con ruido,
// y hasta ahora solo se comprobaba publicando. Node PURO (npm test).

const path = require('path');
const t = require('./test-lib');

const rel = require(path.join(__dirname, 'release.js'));
const { assert } = t;

const c = (asunto, cuerpo = '', sha = 'abcdef1234567890') => rel.clasificar(sha, asunto, cuerpo);

t.section('clasificar commits:');

t.check('tipo, ambito, texto y cambios incompatibles', () => {
  assert.deepStrictEqual(c('feat: nueva cosa'), { sha: 'abcdef1234567890', asunto: 'feat: nueva cosa', texto: 'nueva cosa', tipo: 'feat', rompe: false });
  assert.strictEqual(c('fix(android): arregla').texto, 'arregla');
  assert.strictEqual(c('fix(android): arregla').tipo, 'fix');
  assert.strictEqual(c('feat!: rompe').rompe, true);
  assert.strictEqual(c('refactor: x', 'BREAKING CHANGE: la config cambia').rompe, true);
  assert.strictEqual(c('  docs: con espacios  ').tipo, 'docs');
  // Un mensaje que no es convencional no tiene tipo (commitlint lo habria parado antes).
  const libre = c('Merge branch x');
  assert.strictEqual(libre.tipo, '');
  assert.strictEqual(libre.texto, 'Merge branch x');
});

t.check('solo feat, fix, perf y los incompatibles son publicables', () => {
  for (const asunto of ['feat: a', 'fix: b', 'perf: c', 'chore!: d']) {
    assert.strictEqual(rel.publicable(c(asunto)), true, asunto);
  }
  for (const asunto of ['ci: a', 'chore: b', 'docs: c', 'test: d', 'refactor: e', 'build: f', 'style: g', 'nada']) {
    assert.strictEqual(rel.publicable(c(asunto)), false, asunto);
  }
});

t.section('version base:');

t.check('sin estable previa la base es 1.0.0, pase lo que pase', () => {
  assert.strictEqual(rel.siguienteBase(null, [c('feat!: x')]), '1.0.0');
  assert.strictEqual(rel.siguienteBase(null, []), '1.0.0');
});

t.check('fix -> parche, feat -> menor, incompatible -> mayor (gana el mas alto)', () => {
  assert.strictEqual(rel.siguienteBase('1.2.3', [c('fix: a')]), '1.2.4');
  assert.strictEqual(rel.siguienteBase('1.2.3', [c('fix: a'), c('feat: b')]), '1.3.0');
  assert.strictEqual(rel.siguienteBase('1.2.3', [c('feat: b'), c('fix!: c')]), '2.0.0');
  assert.strictEqual(rel.siguienteBase('1.2.3', [c('perf: d')]), '1.2.4');
  // Sin commits publicables sigue saliendo un parche (quien decide no
  // publicar es main(), al ver la lista vacia).
  assert.strictEqual(rel.siguienteBase('1.2.3', []), '1.2.4');
});

t.check('la ultima estable es la MAYOR, no la ultima de la lista', () => {
  const releases = [
    { tag_name: 'v1.0.0-beta.0003' },
    { tag_name: 'v1.2.0' },
    { tag_name: 'v1.10.0' },
    { tag_name: 'v1.9.1' },
    { tag_name: 'v2.0.0-beta.0001' },
  ];
  assert.strictEqual(rel.ultimaEstableDe(releases), '1.10.0', 'orden numerico, no alfabetico');
  assert.strictEqual(rel.ultimaEstableDe([{ tag_name: 'v1.0.0-beta.0001' }]), null);
  assert.strictEqual(rel.ultimaEstableDe([]), null);
});

t.check('los borradores no cuentan como publicados', () => {
  const list = rel.sinBorradores([{ tag_name: 'a', draft: true }, { tag_name: 'b', draft: false }, { tag_name: 'c' }]);
  assert.deepStrictEqual(
    list.map((r) => r.tag_name),
    ['b', 'c']
  );
});

t.section('siguiente tag:');

t.check('en beta: la mayor beta de ESA base + 1, con cuatro digitos', () => {
  const releases = [
    { tag_name: 'v1.0.0-beta.0009' },
    { tag_name: 'v1.0.0-beta.0010' },
    { tag_name: 'v1.0.0-beta.0002' },
    { tag_name: 'v1.1.0-beta.0004' }, // otra base: no cuenta
  ];
  const { tag, anterior } = rel.siguienteTag('beta', '1.0.0', releases, null);
  assert.strictEqual(tag, 'v1.0.0-beta.0011');
  assert.strictEqual(anterior, 'v1.0.0-beta.0010');
});

t.check('en beta: la primera beta de una base nueva es la 0001 y compara con la estable', () => {
  const releases = [{ tag_name: 'v1.0.0' }, { tag_name: 'v1.0.0-beta.0012' }];
  const { tag, anterior } = rel.siguienteTag('beta', '1.1.0', releases, '1.0.0');
  assert.strictEqual(tag, 'v1.1.0-beta.0001');
  assert.strictEqual(anterior, 'v1.0.0');
  // Sin ninguna release, no hay anterior.
  assert.deepStrictEqual(rel.siguienteTag('beta', '1.0.0', [], null), { tag: 'v1.0.0-beta.0001', anterior: null });
});

t.check('en beta: una beta vieja sin relleno ("beta.6") se cuenta y se referencia por su tag REAL', () => {
  // Reconstruir "beta.0006" daria un tag que no existe y `git rev-parse`
  // tumbaria la publicacion.
  const releases = [{ tag_name: 'v1.0.0-beta.6' }, { tag_name: 'v1.0.0-beta.0004' }];
  const { tag, anterior } = rel.siguienteTag('beta', '1.0.0', releases, null);
  assert.strictEqual(tag, 'v1.0.0-beta.0007');
  assert.strictEqual(anterior, 'v1.0.0-beta.6');
});

t.check('en main: la estable, comparada con la estable anterior (nunca con una beta)', () => {
  const releases = [{ tag_name: 'v1.0.0' }, { tag_name: 'v1.0.1-beta.0003' }];
  assert.deepStrictEqual(rel.siguienteTag('main', '1.0.1', releases, '1.0.0'), { tag: 'v1.0.1', anterior: 'v1.0.0' });
  assert.deepStrictEqual(rel.siguienteTag('main', '1.0.0', [], null), { tag: 'v1.0.0', anterior: null });
});

t.check('mas de 9999 betas no rompe el formato (crece a cinco digitos)', () => {
  const { tag } = rel.siguienteTag('beta', '1.0.0', [{ tag_name: 'v1.0.0-beta.9999' }], null);
  assert.strictEqual(tag, 'v1.0.0-beta.10000');
});

t.section('changelog:');

t.check('agrupa por tipo, en orden, con enlace al commit, y enlaza la comparacion', () => {
  const commits = [
    c('fix: arregla la cosa', '', '1111111aaaaaaa'),
    c('feat: añade algo', '', '2222222bbbbbbb'),
    c('perf: va mas rapido', '', '3333333ccccccc'),
    c('feat!: cambia el formato', '', '4444444ddddddd'),
  ];
  const body = rel.notas(commits, 'v1.0.0-beta.0010', 'v1.0.0-beta.0011');
  const lines = body.split('\n');
  const headers = lines.filter((l) => l.startsWith('### '));
  assert.deepStrictEqual(headers, ['### Cambios incompatibles', '### Novedades', '### Correcciones', '### Rendimiento']);
  assert.ok(body.includes('* arregla la cosa ([1111111](https://github.com/'), body);
  assert.ok(body.includes('/commit/1111111aaaaaaa))'), body);
  // El incompatible NO se repite en Novedades.
  assert.strictEqual(body.split('cambia el formato').length, 2, body);
  assert.ok(body.includes('**Cambios completos**: https://github.com/'), body);
  assert.ok(body.includes('/compare/v1.0.0-beta.0010...v1.0.0-beta.0011'), body);
  assert.ok(body.endsWith('\n'));
});

t.check('sin release anterior no hay enlace de comparacion, y los grupos vacios no salen', () => {
  const body = rel.notas([c('fix: solo esto')], null, 'v1.0.0-beta.0001');
  assert.ok(!body.includes('Cambios completos'), body);
  assert.ok(!body.includes('### Novedades'), body);
  assert.ok(body.startsWith('### Correcciones'), body);
});

t.check('cmpVersion ordena numericamente', () => {
  assert.ok(rel.cmpVersion('1.10.0', '1.9.0') > 0);
  assert.ok(rel.cmpVersion('1.0.0', '1.0.1') < 0);
  assert.strictEqual(rel.cmpVersion('2.0.0', '2.0.0'), 0);
});

t.finish('OK: la logica de releases pasa');
