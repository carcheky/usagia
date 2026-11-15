'use strict';

// Consulta el estado de las cuotas y lo vuelca por consola.
//
// Node PURO: no arranca Electron. Es lo que usa el job `verify` del pipeline,
// donde no hay display y Electron sin un servidor X (o con un HOME raro)
// revienta con STATUS_BREAKPOINT. Aqui solo hacen falta fetch y fs.

const path = require('path');

const root = path.join(__dirname, '..', 'src', 'main');
const { byId } = require(path.join(root, 'providers'));
const config = require(path.join(root, 'config'));
const instances = require(path.join(root, 'instances'));

async function collect() {
  const cfg = config.load();
  const results = {};
  for (const instance of instances.list()) {
    if (!instance.enabled) continue;
    const provider = byId(instance.provider);
    if (!provider) continue;
    try {
      results[instance.id] = await provider.fetchUsage({ config: cfg, instance });
    } catch (err) {
      results[instance.id] = {
        status: 'error',
        summary: 'error',
        metrics: [],
        error: err?.message || String(err),
      };
    }
  }
  return results;
}

async function main() {
  const results = await collect();
  for (const [id, result] of Object.entries(results)) {
    console.log(`\n=== ${id} ===`);
    console.log(JSON.stringify(result, null, 2));
  }

  // Si algun proveedor falla al CONSULTRAR (no al no estar configurado), el
  // script falla: en CI eso es informacion, no ruido.
  const broken = Object.entries(results).filter(([, r]) => r.status === 'error');
  if (broken.length) {
    console.error(`\nProveedores con error: ${broken.map(([id]) => id).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fallo el sondeo:', err?.stack || err?.message || err);
  process.exitCode = 1;
});
