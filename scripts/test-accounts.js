'use strict';

// Pruebas de las CUENTAS (instancias): la app admite varias cuentas del
// mismo proveedor y cada una puede tener su propia credencial.
//
// Node PURO (sin Electron): el job `verify` del pipeline lo ejecuta, asi que
// no puede depender de la GUI ni de credenciales reales.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// La carpeta de datos se decide ANTES de cargar el modulo de configuracion.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'usagia-cuentas-'));
process.env.APPDATA = path.join(fakeHome, 'AppData', 'Roaming');
process.env.XDG_CONFIG_HOME = path.join(fakeHome, '.config');
process.env.USERPROFILE = fakeHome;
process.env.HOME = fakeHome;

const root = path.join(__dirname, '..', 'src', 'main');
const config = require(path.join(root, 'config'));
const instances = require(path.join(root, 'instances'));
const creds = require(path.join(root, 'credentials'));

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

function writeConfig(data) {
  config.invalidate();
  const file = config.configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  config.invalidate();
}

console.log('cuentas:');

check('sin configuracion hay una instancia por proveedor', () => {
  writeConfig({});
  const list = instances.list();
  assert.strictEqual(list.length, 4, `esperaba 4 instancias, hay ${list.length}`);
  const ids = list.map((i) => i.provider);
  for (const p of ['minimax', 'claude', 'antigravity', 'deepseek']) {
    assert.ok(ids.includes(p), `falta el proveedor ${p}`);
  }
  // En autodeteccion las credenciales estan vacias: las busca el sistema.
  assert.deepStrictEqual(list[0].credentials, {});
});

check('se admiten varias cuentas del mismo proveedor', () => {
  writeConfig({
    accounts: [
      { id: 'a1', provider: 'minimax', label: 'Trabajo', credentials: { apiKey: 'sk-cp-1' } },
      { id: 'a2', provider: 'minimax', label: 'Personal', credentials: { apiKey: 'sk-cp-2' } },
      { id: 'a3', provider: 'claude', label: 'Claude', credentials: { apiKey: 'sk-ant-oat-1' } },
    ],
  });
  const list = instances.list();
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(
    list.map((i) => i.label),
    ['Trabajo', 'Personal', 'Claude']
  );
  assert.deepStrictEqual(
    list.map((i) => i.credentials.apiKey),
    ['sk-cp-1', 'sk-cp-2', 'sk-ant-oat-1']
  );
  // Cada cuenta conserva su id: es la clave de los resultados y de las caches.
  assert.deepStrictEqual(
    list.map((i) => i.id),
    ['a1', 'a2', 'a3']
  );
});

check('los nombres repetidos se distinguen con un sufijo', () => {
  writeConfig({
    accounts: [
      { provider: 'minimax', label: 'Minimax' },
      { provider: 'minimax', label: 'Minimax' },
      { provider: 'minimax', label: 'Minimax' },
    ],
  });
  const list = instances.list();
  assert.deepStrictEqual(
    list.map((i) => i.label),
    ['Minimax', 'Minimax 2', 'Minimax 3']
  );
});

check('las cuentas sin nombre toman el del proveedor', () => {
  writeConfig({ accounts: [{ provider: 'deepseek' }, { provider: 'deepseek' }] });
  const list = instances.list();
  assert.deepStrictEqual(
    list.map((i) => i.label),
    ['DeepSeek', 'DeepSeek 2']
  );
});

check('las cuentas de un proveedor desconocido se descartan', () => {
  writeConfig({
    accounts: [
      { provider: 'minimax', label: 'Vale' },
      { provider: 'inventado', label: 'No existe' },
    ],
  });
  const list = instances.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].label, 'Vale');
});

check('una cuenta puede estar desactivada', () => {
  writeConfig({
    accounts: [
      { provider: 'minimax', label: 'Minimax', enabled: true },
      { provider: 'claude', label: 'Claude', enabled: false },
    ],
  });
  const list = instances.list();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list.find((i) => i.provider === 'claude').enabled, false);
});

check('cada cuenta usa SU credencial, no la de otra', () => {
  writeConfig({
    accounts: [
      { id: 'a1', provider: 'minimax', label: 'Trabajo', credentials: { apiKey: 'sk-cp-trabajo' } },
      { id: 'a2', provider: 'minimax', label: 'Personal', credentials: { apiKey: 'sk-cp-personal' } },
    ],
  });
  const cfg = config.load();
  const [trabajo, personal] = instances.list();
  const one = creds.fromUserConfig(cfg, 'minimax', 'apiKey', trabajo);
  const two = creds.fromUserConfig(cfg, 'minimax', 'apiKey', personal);
  assert.strictEqual(one.value, 'sk-cp-trabajo');
  assert.strictEqual(two.value, 'sk-cp-personal');
});

check('sin credencial propia se cae a la credencial global del proveedor', () => {
  writeConfig({
    credentials: { minimax: { apiKey: 'sk-cp-global' } },
    accounts: [{ id: 'a1', provider: 'minimax', label: 'Sin clave propia' }],
  });
  const cfg = config.load();
  const instance = instances.list()[0];
  assert.strictEqual(creds.fromUserConfig(cfg, 'minimax', 'apiKey', instance).value, 'sk-cp-global');
});

check('la credencial de la cuenta tiene prioridad sobre la global', () => {
  writeConfig({
    credentials: { minimax: { apiKey: 'sk-cp-global' } },
    accounts: [
      { id: 'a1', provider: 'minimax', label: 'Propia', credentials: { apiKey: 'sk-cp-propia' } },
    ],
  });
  const cfg = config.load();
  const instance = instances.list()[0];
  assert.strictEqual(creds.fromUserConfig(cfg, 'minimax', 'apiKey', instance).value, 'sk-cp-propia');
});

check('guardar y volver a leer conserva las cuentas', () => {
  writeConfig({});
  config.save({
    accounts: [
      { id: 'x1', provider: 'minimax', label: 'Guardada', credentials: { apiKey: 'sk-cp-x' } },
      { id: 'x2', provider: 'claude', label: 'Tambien', enabled: false },
    ],
  });
  const list = instances.list();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].label, 'Guardada');
  assert.strictEqual(list[0].credentials.apiKey, 'sk-cp-x');
  assert.strictEqual(list[1].enabled, false);
});

check('borrar todas las cuentas vuelve a la autodeteccion', () => {
  writeConfig({
    accounts: [{ id: 'x1', provider: 'minimax', label: 'Temporal' }],
  });
  assert.strictEqual(instances.list().length, 1);
  config.save({ accounts: [] });
  assert.strictEqual(instances.list().length, 4);
});

check('el catalogo expone los proveedores con su campo de credencial', () => {
  const catalog = instances.catalog();
  assert.strictEqual(catalog.length, 4);
  for (const item of catalog) {
    assert.ok(item.label, `el proveedor ${item.id} no tiene etiqueta`);
    assert.ok(item.credential.field, `el proveedor ${item.id} no tiene campo de credencial`);
    assert.ok(item.credential.hint, `el proveedor ${item.id} no tiene pista`);
  }
});

fs.rmSync(fakeHome, { recursive: true, force: true });

console.log(failures ? `\nFALLO: ${failures} prueba(s) fallida(s)` : '\nOK: todas las pruebas pasan');
process.exit(failures ? 1 : 0);
