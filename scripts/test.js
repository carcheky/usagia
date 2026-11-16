'use strict';

// Lanza TODAS las suites de pruebas (scripts/test-*.js), cada una en su
// propio proceso de Node, y resume. Es lo que ejecuta `npm test` y el job
// `verify` del pipeline.
//
// Cada suite es un proceso aparte a proposito: asi puede fijar su HOME falso
// y sus variables de entorno antes de cargar los modulos de la app, sin
// pisarse con las demas (los modulos cachean cosas como ~/.dsh).
//
// Una suite nueva se descubre sola: basta con crear `scripts/test-<lo que
// sea>.js`. No hay que tocar ni package.json ni el pipeline.
//
// Uso:
//   node scripts/test.js             # todas
//   node scripts/test.js providers   # solo las que contengan "providers"

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;

// Suites que NO van en `npm test`:
//  - test-probe-clean-env.js hace red de verdad (sondea los proveedores) y
//    es la simulacion del runner de CI; se lanza con `npm run test:ci-env`.
const SKIP = new Set(['test-lib.js', 'test-probe-clean-env.js']);

const filter = process.argv.slice(2);
const suites = fs
  .readdirSync(dir)
  .filter((name) => /^test-.*\.js$/.test(name) && !SKIP.has(name))
  .filter((name) => !filter.length || filter.some((f) => name.includes(f)))
  .sort();

if (!suites.length) {
  console.error('No hay ninguna suite que lanzar.');
  process.exit(1);
}

const results = [];
const startedAll = Date.now();
for (const name of suites) {
  console.log(`\n━━━ ${name} ━━━`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(dir, name)], {
    cwd: path.join(dir, '..'),
    stdio: 'inherit',
    env: process.env,
    timeout: 180000,
  });
  const ok = run.status === 0;
  results.push({ name, ok, ms: Date.now() - started, status: run.status, signal: run.signal });
}

console.log('\n━━━ resumen ━━━');
for (const r of results) {
  const estado = r.ok ? 'OK   ' : `FALLO (codigo ${r.status ?? r.signal})`;
  console.log(`  ${estado} ${r.name} (${(r.ms / 1000).toFixed(1)} s)`);
}
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length
    ? `\nFALLO: ${failed.length} de ${results.length} suites fallan`
    : `\nOK: ${results.length} suites en verde (${((Date.now() - startedAll) / 1000).toFixed(1)} s)`
);
process.exit(failed.length ? 1 : 0);
