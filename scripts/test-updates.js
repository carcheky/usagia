'use strict';

// Pruebas del módulo de actualizaciones (src/main/updates.js).
// Node PURO: lo lanza scripts/test.js (npm test).

const path = require('path');
const fs = require('fs');
const t = require('./test-lib');

const home = t.fakeHome('usagia-updates');

const updates = require(path.join(__dirname, '..', 'src', 'main', 'updates'));
const { assert } = t;

/* --------------------------------------------------------- parseVersion */

t.section('parseVersion:');

t.check('parsea versiones estables con y sin v', () => {
  const v1 = updates.parseVersion('1.2.3');
  assert.deepStrictEqual({ major: v1.major, minor: v1.minor, patch: v1.patch, beta: v1.beta }, { major: 1, minor: 2, patch: 3, beta: null });

  const v2 = updates.parseVersion('v10.20.30');
  assert.deepStrictEqual({ major: v2.major, minor: v2.minor, patch: v2.patch, beta: v2.beta }, { major: 10, minor: 20, patch: 30, beta: null });
});

t.check('parsea versiones beta con y sin v', () => {
  const v1 = updates.parseVersion('1.0.0-beta.5');
  assert.deepStrictEqual({ major: v1.major, minor: v1.minor, patch: v1.patch, beta: v1.beta }, { major: 1, minor: 0, patch: 0, beta: 5 });

  const v2 = updates.parseVersion('v2.1.3-beta.0012');
  assert.deepStrictEqual({ major: v2.major, minor: v2.minor, patch: v2.patch, beta: v2.beta }, { major: 2, minor: 1, patch: 3, beta: 12 });
});

t.check('devuelve null para versiones inválidas', () => {
  assert.strictEqual(updates.parseVersion(null), null);
  assert.strictEqual(updates.parseVersion(''), null);
  assert.strictEqual(updates.parseVersion('abc'), null);
  assert.strictEqual(updates.parseVersion('1.2'), null);
  assert.strictEqual(updates.parseVersion('1.2.3.4'), null);
  assert.strictEqual(updates.parseVersion('1.0.0-alpha.1'), null);
});

/* ------------------------------------------------------- compareVersions */

t.section('compareVersions:');

t.check('compara major.minor.patch correctamente', () => {
  const v100 = updates.parseVersion('1.0.0');
  const v101 = updates.parseVersion('1.0.1');
  const v110 = updates.parseVersion('1.1.0');
  const v200 = updates.parseVersion('2.0.0');

  assert.ok(updates.compareVersions(v100, v101) < 0, '1.0.0 < 1.0.1');
  assert.ok(updates.compareVersions(v101, v110) < 0, '1.0.1 < 1.1.0');
  assert.ok(updates.compareVersions(v110, v200) < 0, '1.1.0 < 2.0.0');
  assert.ok(updates.compareVersions(v200, v100) > 0, '2.0.0 > 1.0.0');
  assert.strictEqual(updates.compareVersions(v100, v100), 0, '1.0.0 == 1.0.0');
});

t.check('una estable es mayor que cualquier beta de la misma base', () => {
  const stable = updates.parseVersion('1.0.0');
  const beta1 = updates.parseVersion('1.0.0-beta.1');
  const beta99 = updates.parseVersion('1.0.0-beta.99');

  assert.ok(updates.compareVersions(stable, beta1) > 0, '1.0.0 > 1.0.0-beta.1');
  assert.ok(updates.compareVersions(stable, beta99) > 0, '1.0.0 > 1.0.0-beta.99');
  assert.ok(updates.compareVersions(beta1, stable) < 0, '1.0.0-beta.1 < 1.0.0');
});

t.check('entre betas de la misma base, gana el número mayor', () => {
  const beta1 = updates.parseVersion('1.0.0-beta.1');
  const beta5 = updates.parseVersion('1.0.0-beta.5');
  const beta10 = updates.parseVersion('1.0.0-beta.10');

  assert.ok(updates.compareVersions(beta1, beta5) < 0, 'beta.1 < beta.5');
  assert.ok(updates.compareVersions(beta5, beta10) < 0, 'beta.5 < beta.10');
  assert.ok(updates.compareVersions(beta10, beta1) > 0, 'beta.10 > beta.1');
});

t.check('una beta de una base mayor supera a una estable de base menor', () => {
  const stable100 = updates.parseVersion('1.0.0');
  const beta101 = updates.parseVersion('1.0.1-beta.1');

  assert.ok(updates.compareVersions(beta101, stable100) > 0, '1.0.1-beta.1 > 1.0.0');
});

/* ------------------------------------------------------------ isNewer */

t.section('isNewer:');

t.check('detecta correctamente si una versión es más nueva', () => {
  const v100 = updates.parseVersion('1.0.0');
  const v101 = updates.parseVersion('1.0.1');

  assert.strictEqual(updates.isNewer(v101, v100), true, '1.0.1 es más nueva que 1.0.0');
  assert.strictEqual(updates.isNewer(v100, v101), false, '1.0.0 NO es más nueva que 1.0.1');
  assert.strictEqual(updates.isNewer(v100, v100), false, '1.0.0 NO es más nueva que 1.0.0');
});

/* ------------------------------------------------------ effectiveChannel */

t.section('effectiveChannel (canal automático):');

t.check('en automático, una beta sigue el canal beta y una estable el estable', () => {
  assert.strictEqual(updates.effectiveChannel('1.0.0-beta.0010', 'auto'), 'beta');
  assert.strictEqual(updates.effectiveChannel('1.0.0', 'auto'), 'stable');
  assert.strictEqual(updates.effectiveChannel('0.0.0', 'auto'), 'stable', 'en desarrollo no hay beta');
  assert.strictEqual(updates.effectiveChannel('cualquiera', 'auto'), 'stable');
});

t.check('un canal explícito manda sobre la versión instalada', () => {
  assert.strictEqual(updates.effectiveChannel('1.0.0-beta.0010', 'stable'), 'stable');
  assert.strictEqual(updates.effectiveChannel('1.0.0', 'beta'), 'beta');
});

/* ------------------------------------------------------- filterByChannel */

t.section('filterByChannel:');

const mockReleases = [
  { tag_name: 'v1.0.0', draft: false, prerelease: false },
  { tag_name: 'v1.0.1-beta.1', draft: false, prerelease: true },
  { tag_name: 'v1.0.1-beta.2', draft: false, prerelease: true },
  { tag_name: 'v1.0.1', draft: false, prerelease: false },
  { tag_name: 'v1.1.0-beta.1', draft: false, prerelease: true },
  { tag_name: 'v2.0.0', draft: true, prerelease: false }, // borrador, no cuenta
  { tag_name: 'invalid', draft: false, prerelease: false }, // versión inválida
];

t.check('canal stable solo incluye versiones estables (sin betas ni borradores)', () => {
  const filtered = updates.filterByChannel(mockReleases, 'stable');
  const tags = filtered.map((r) => r.tag_name);
  assert.deepStrictEqual(tags, ['v1.0.0', 'v1.0.1']);
});

t.check('canal beta incluye estables y betas (no borradores)', () => {
  const filtered = updates.filterByChannel(mockReleases, 'beta');
  const tags = filtered.map((r) => r.tag_name);
  assert.deepStrictEqual(tags, ['v1.0.0', 'v1.0.1-beta.1', 'v1.0.1-beta.2', 'v1.0.1', 'v1.1.0-beta.1']);
});

/* ---------------------------------------------------------- findLatest */

t.section('findLatest:');

t.check('encuentra la versión más alta de una lista', () => {
  const stableOnly = updates.filterByChannel(mockReleases, 'stable');
  const latestStable = updates.findLatest(stableOnly);
  assert.strictEqual(latestStable.tag_name, 'v1.0.1');

  const withBetas = updates.filterByChannel(mockReleases, 'beta');
  const latestBeta = updates.findLatest(withBetas);
  // 1.1.0-beta.1 es mayor que 1.0.1 (aunque una sea beta)
  assert.strictEqual(latestBeta.tag_name, 'v1.1.0-beta.1');
});

t.check('devuelve null para lista vacía', () => {
  assert.strictEqual(updates.findLatest([]), null);
});

/* ------------------------------------------------------- formatVersion */

t.section('formatVersion:');

t.check('formatea versiones correctamente', () => {
  assert.strictEqual(updates.formatVersion('1.0.0'), '1.0.0');
  assert.strictEqual(updates.formatVersion('v1.0.0'), '1.0.0');
  assert.strictEqual(updates.formatVersion('1.0.0-beta.5'), '1.0.0-beta.5');
  assert.strictEqual(updates.formatVersion('v2.1.3-beta.0012'), '2.1.3-beta.12');
  assert.strictEqual(updates.formatVersion('invalid'), 'invalid');
  assert.strictEqual(updates.formatVersion(null), '—');
});

/* ---------------------------------------------------- checkForUpdates */

t.section('checkForUpdates (con fetch simulado):');

t.check('detecta actualización disponible en canal stable', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.0', draft: false, prerelease: false, html_url: 'https://example.com/1.0.0', published_at: '2026-01-01' },
      { tag_name: 'v1.0.1', draft: false, prerelease: false, html_url: 'https://example.com/1.0.1', published_at: '2026-01-02' },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.0', 'stable');
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.latest.version, '1.0.1');
  assert.strictEqual(result.latest.url, 'https://example.com/1.0.1');
  assert.strictEqual(result.error, null);
});

t.check('no hay actualización si ya tenemos la última', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.1', draft: false, prerelease: false, html_url: 'https://example.com/1.0.1' },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.1', 'stable');
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.latest, null);
});

t.check('detecta beta disponible en canal beta', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.0', draft: false, prerelease: false },
      { tag_name: 'v1.0.1-beta.2', draft: false, prerelease: true, html_url: 'https://example.com/beta2' },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.0', 'beta');
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.latest.version, '1.0.1-beta.2');
});

t.check('ignora betas en canal stable', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.0', draft: false, prerelease: false },
      { tag_name: 'v1.0.1-beta.1', draft: false, prerelease: true },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.0', 'stable');
  assert.strictEqual(result.available, false, 'no debe detectar la beta en canal stable');
});

t.check('maneja errores de red', async () => {
  t.mockFetch(() => {
    throw new Error('network error');
  });

  const result = await updates.checkForUpdates('1.0.0', 'stable');
  assert.strictEqual(result.available, false);
  assert.ok(result.error.includes('network error'), result.error);
});

t.check('maneja versión local inválida', async () => {
  t.forbidFetch();
  const result = await updates.checkForUpdates('invalid', 'stable');
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.error, 'versión local no válida');
});

t.check('en automático, una beta instalada ve las betas nuevas', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.0-beta.0010', draft: false, prerelease: true },
      { tag_name: 'v1.0.0-beta.0011', draft: false, prerelease: true, html_url: 'https://example.com/beta11' },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.0-beta.0010', 'auto');
  assert.strictEqual(result.channel, 'beta');
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.latest.version, '1.0.0-beta.0011');
});

t.check('en automático, una estable instalada NO ve las betas', async () => {
  t.mockFetch(() => ({
    body: [
      { tag_name: 'v1.0.0', draft: false, prerelease: false },
      { tag_name: 'v1.0.1-beta.1', draft: false, prerelease: true },
    ],
  }));

  const result = await updates.checkForUpdates('1.0.0', 'auto');
  assert.strictEqual(result.channel, 'stable');
  assert.strictEqual(result.available, false);
});

/* ------------------------------------------------------- canAutoUpdate */

t.section('canAutoUpdate (¿puede instalarse sola?):');

t.check('en desarrollo no, y la portable tampoco', () => {
  assert.strictEqual(updates.canAutoUpdate({ platform: 'win32', packaged: false }).ok, false);
  // PORTABLE_EXECUTABLE_DIR la pone el target portable: el .exe se descomprime
  // en una carpeta distinta en cada arranque y no hay nada que reemplazar.
  const portable = updates.canAutoUpdate({
    platform: 'win32',
    packaged: true,
    env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Temp\\abc' },
  });
  assert.strictEqual(portable.ok, false);
  assert.ok(portable.reason.includes('portable'));
});

t.check('Windows con el instalador NSIS: sí', () => {
  const r = updates.canAutoUpdate({ platform: 'win32', packaged: true, env: {} });
  assert.deepStrictEqual(r, { ok: true, reason: 'nsis' });
});

t.check('Linux solo si corre como AppImage; macOS nunca', () => {
  assert.strictEqual(updates.canAutoUpdate({ platform: 'linux', packaged: true, env: {} }).ok, false);
  // Un .deb no se puede reemplazar en caliente: sin APPIMAGE, no.
  assert.strictEqual(
    updates.canAutoUpdate({ platform: 'linux', packaged: true, env: { APPIMAGE: '/home/x/Usagia.AppImage' } }).ok,
    true
  );
  assert.strictEqual(updates.canAutoUpdate({ platform: 'darwin', packaged: true, env: {} }).ok, false);
});

/* ------------------------------------------------------------ assetFor */

t.section('assetFor (qué fichero se baja):');

const assets = [
  { name: 'Usagia-portable-1.1.0-beta.0003-win-x64.exe', size: 90, browser_download_url: 'https://x/portable' },
  { name: 'Usagia-Setup-1.1.0-beta.0003-win-x64.exe', size: 100, browser_download_url: 'https://x/setup' },
  { name: 'Usagia-Setup-1.1.0-beta.0003-win-x64.exe.blockmap', size: 1, browser_download_url: 'https://x/blockmap' },
  { name: 'Usagia-1.1.0-beta.0003-linux-x86_64.AppImage', size: 110, browser_download_url: 'https://x/AppImage' },
  { name: 'usagia_1.1.0-beta.0003_amd64.deb', size: 120, browser_download_url: 'https://x/deb' },
];

t.check('en Windows baja el instalador NSIS, nunca el portable ni el blockmap', () => {
  const asset = updates.assetFor({ assets }, { platform: 'win32' });
  assert.strictEqual(asset.name, 'Usagia-Setup-1.1.0-beta.0003-win-x64.exe');
  assert.strictEqual(asset.url, 'https://x/setup');
  assert.strictEqual(asset.size, 100);
});

t.check('en Windows acepta también el formato con prefijo win-', () => {
  const winAssets = [
    { name: 'win-Usagia-portable-1.1.0-beta.0013-x64.exe', size: 90, browser_download_url: 'https://x/portable' },
    { name: 'win-Usagia-Setup-1.1.0-beta.0013-x64.exe', size: 100, browser_download_url: 'https://x/setup' },
    { name: 'win-Usagia-Setup-1.1.0-beta.0013-x64.exe.blockmap', size: 1, browser_download_url: 'https://x/blockmap' },
  ];
  const asset = updates.assetFor({ assets: winAssets }, { platform: 'win32' });
  assert.strictEqual(asset.name, 'win-Usagia-Setup-1.1.0-beta.0013-x64.exe');
  assert.strictEqual(asset.url, 'https://x/setup');
});

t.check('en Linux baja el AppImage (no el .deb)', () => {
  const asset = updates.assetFor({ assets }, { platform: 'linux' });
  assert.strictEqual(asset.name, 'Usagia-1.1.0-beta.0003-linux-x86_64.AppImage');
});

t.check('sin binario para esa plataforma devuelve null (queda descarga manual)', () => {
  assert.strictEqual(updates.assetFor({ assets }, { platform: 'darwin' }), null);
  assert.strictEqual(updates.assetFor({ assets: [] }, { platform: 'win32' }), null);
  assert.strictEqual(updates.assetFor({}, { platform: 'win32' }), null);
});

/* ------------------------------------------------------ downloadPercent */

t.section('downloadPercent:');

t.check('porcentaje entero y acotado', () => {
  assert.strictEqual(updates.downloadPercent(0, 100), 0);
  assert.strictEqual(updates.downloadPercent(50, 100), 50);
  assert.strictEqual(updates.downloadPercent(100, 100), 100);
  assert.strictEqual(updates.downloadPercent(120, 100), 100, 'no pasa de 100');
  assert.strictEqual(updates.downloadPercent(10, 0), 0, 'sin total no hay porcentaje');
  assert.strictEqual(updates.downloadPercent(NaN, 100), 0);
});

/* ------------------------------------------------------ installScript */

t.section('installScript (instalador silencioso de Windows):');

const updateInstall = require(path.join(__dirname, '..', 'src', 'main', 'update-install'));

t.check('el .cmd espera a que muera la app, instala en silencio y la vuelve a abrir', () => {
  const script = updateInstall.installScript({
    installer: 'C:\\Temp\\Usagia-Setup-1.1.0-beta.0003-win-x64.exe',
    exe: 'C:\\Users\\x\\AppData\\Local\\Programs\\Usagia\\Usagia.exe',
    relaunch: true,
    log: 'C:\\Temp\\update.log',
  });
  const lines = script.split('\r\n').filter(Boolean);
  assert.strictEqual(lines[0], '@echo off');
  assert.ok(
    lines.some((l) => l.startsWith('ping -n') && l.includes('127.0.0.1')),
    'primero una espera: la app aun se esta cerrando'
  );
  const install = lines.find((l) => l.includes('start /wait'));
  assert.ok(install.includes('Usagia-Setup-1.1.0-beta.0003-win-x64.exe'), install);
  assert.ok(install.includes('/S'), 'instalacion silenciosa');
  assert.ok(!install.includes('timeout'), 'timeout falla sin consola de entrada');
  const relaunch = lines.find((l) => l.includes('Programs\\Usagia\\Usagia.exe'));
  assert.ok(relaunch.startsWith('start ""'), 'vuelve a abrir la app');
  assert.ok(script.includes('update.log'), 'deja rastro para poder depurar');
});

t.check('al instalar al salir no se relanza (el usuario esta cerrando la app)', () => {
  const script = updateInstall.installScript({
    installer: 'C:\\Temp\\Usagia-Setup.exe',
    exe: 'C:\\Programs\\Usagia\\Usagia.exe',
    relaunch: false,
  });
  assert.ok(!script.includes('C:\\Programs\\Usagia\\Usagia.exe'));
  assert.ok(script.includes('start /wait'));
});

t.check('si el instalador falla: deja marcador, rastro y vuelve a abrir la app', () => {
  const script = updateInstall.installScript({
    installer: 'C:\\Temp\\Usagia-Setup.exe',
    exe: 'C:\\Programs\\Usagia\\Usagia.exe',
    relaunch: true,
    log: 'C:\\Temp\\update.log',
    version: '1.1.1-beta.0001',
    failMarker: 'C:\\Temp\\failed-1.1.1-beta.0001',
  });
  assert.ok(script.includes('if errorlevel 1 goto fallo'), 'hay que mirar el resultado del instalador');
  assert.ok(script.includes(':fallo'));
  assert.ok(script.includes('failed-1.1.1-beta.0001'), 'el marcador evita reintentos en bucle');
  assert.ok(script.includes('1.1.1-beta.0001'), 'el marcador guarda la version');
  // La ultima linea del caso de fallo vuelve a abrir la app: nadie se queda sin bandeja.
  const fallo = script.split(':fallo')[1];
  assert.ok(fallo.includes('C:\\Programs\\Usagia\\Usagia.exe'), fallo);
  assert.ok(fallo.trim().endsWith('exit /b 1'));
});

t.check('el marcador de fallo se puede consultar por version', () => {
  const dir = path.join(home, 'datos-app2');
  assert.strictEqual(updateInstall.hasFailed(dir, '1.1.1-beta.0001'), false);
  t.writeFile(updateInstall.failMarkerPath(dir, '1.1.1-beta.0001'), '1.1.1-beta.0001');
  assert.strictEqual(updateInstall.hasFailed(dir, '1.1.1-beta.0001'), true);
  assert.strictEqual(updateInstall.hasFailed(dir, '1.1.1-beta.0002'), false, 'otra version se intenta');
  // Un nombre raro no se escapa de la carpeta.
  assert.strictEqual(path.dirname(updateInstall.failMarkerPath(dir, '../..\\evil')), updateInstall.updaterDir(dir));
});

t.check('las rutas de descarga no se pueden escapar de la carpeta del actualizador', () => {
  const dir = updateInstall.updaterDir('C:\\datos');
  assert.strictEqual(dir, path.join('C:\\datos', 'updater'));
  assert.strictEqual(
    updateInstall.downloadPath('C:\\datos', '..\\..\\evil.exe'),
    path.join(dir, 'evil.exe'),
    'solo el nombre del fichero'
  );
});

t.check('el registro del actualizador se escribe, se recorta y nunca lanza', () => {
  const dir = path.join(home, 'datos-app');
  assert.strictEqual(updateInstall.appendLog(dir, 'primera linea'), true);
  assert.strictEqual(updateInstall.appendLog(dir, 'segunda linea'), true);
  const file = updateInstall.logPath(dir);
  const texto = fs.readFileSync(file, 'utf8');
  assert.ok(texto.includes('primera linea') && texto.includes('segunda linea'));
  assert.ok(/^\[\d{4}-\d{2}-\d{2}T/.test(texto.split('\n')[0]), 'cada linea lleva la fecha');

  // Un log que ya es enorme se vacía en vez de crecer sin límite.
  t.writeFile(file, 'x'.repeat(1000));
  updateInstall.appendLog(dir, 'despues del recorte', { maxBytes: 100 });
  const recortado = fs.readFileSync(file, 'utf8');
  assert.ok(recortado.includes('despues del recorte'));
  assert.ok(recortado.length < 500, `no deberia quedar el relleno: ${recortado.length}`);

  // Si el disco falla, se devuelve false y no se propaga el error.
  const roto = { mkdirSync() { throw new Error('sin disco'); } };
  assert.strictEqual(updateInstall.appendLog(dir, 'x', { fsImpl: roto }), false);
});

/* ------------------------------------------------------- download (fake) */

t.section('download (con net y disco simulados):');

const { EventEmitter } = require('events');

/** Un `net` de mentira que devuelve una respuesta con los trozos dados. */
function fakeNet(chunks, { status = 200, total } = {}) {
  return {
    request() {
      const req = new EventEmitter();
      req.end = () => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.headers = { 'content-length': String(total === undefined ? chunks.join('').length : total) };
        response.pause = () => {};
        response.resume = () => {};
        setImmediate(() => {
          req.emit('response', response);
          setImmediate(() => {
            for (const chunk of chunks) response.emit('data', Buffer.from(chunk));
            response.emit('end');
          });
        });
      };
      return req;
    },
  };
}

const fakeFs = (_dir) => {
  const writes = [];
  const state = { destroyed: false, errored: false };
  return {
    writes,
    state,
    mkdirSync() {},
    createWriteStream() {
      const stream = new EventEmitter();
      stream.write = (chunk) => {
        writes.push(chunk.toString());
        return true;
      };
      stream.end = (cb) => {
        if (cb) setImmediate(cb);
      };
      stream.destroy = () => {
        state.destroyed = true;
      };
      return stream;
    },
    existsSync: () => true,
    renameSync: (from, to) => writes.push(`RENAME ${path.basename(from)}->${path.basename(to)}`),
    unlinkSync: () => writes.push('UNLINK'),
  };
};

t.check('descarga felizmente: escribe los trozos, avisa del progreso y renombra el .part', async () => {
  const fsImpl = fakeFs();
  const progreso = [];
  const result = await updateInstall.download(
    'https://ejemplo/x.exe',
    path.join(home, 'updater', 'x.exe'),
    {
      net: fakeNet(['hola', ' mundo']),
      fsImpl,
      expectedSize: 10,
      onProgress: (info) => progreso.push(info.percent),
    }
  );
  assert.strictEqual(result.bytes, 10);
  assert.deepStrictEqual(fsImpl.writes.slice(0, 2), ['hola', ' mundo']);
  assert.ok(fsImpl.writes.includes('RENAME x.exe.part->x.exe'));
  assert.deepStrictEqual(progreso, [40, 100], '5 y 10 de 10 bytes');
});

t.check('un fallo AL CREAR el fichero rechaza en vez de quedarse colgado (bug de la prueba real)', async () => {
  const stream = new EventEmitter();
  stream.write = () => true;
  stream.end = () => {};
  stream.destroy = () => {};
  const fsImpl = {
    mkdirSync() {},
    createWriteStream() {
      // Como un disco lleno o un permiso denegado: el error llega por evento.
      setImmediate(() => stream.emit('error', new Error('EPERM: sin permiso')));
      return stream;
    },
    unlinkSync() {},
    existsSync: () => false,
    renameSync() {
      throw new Error('no deberia llegar al rename');
    },
  };
  await assert.rejects(
    () => updateInstall.download('https://ejemplo/x.exe', path.join(home, 'u', 'x.exe'), { net: fakeNet(['a']), fsImpl }),
    /sin permiso/
  );
});

t.check('una descarga incompleta se rechaza (el tamaño de GitHub manda)', async () => {
  const fsImpl = fakeFs();
  await assert.rejects(
    () =>
      updateInstall.download('https://ejemplo/x.exe', path.join(home, 'u', 'y.exe'), {
        net: fakeNet(['tres'], { total: 10 }),
        fsImpl,
        expectedSize: 10,
      }),
    /incompleta/
  );
});

t.check('un HTTP que no es 200 se rechaza sin escribir nada', async () => {
  const fsImpl = fakeFs();
  await assert.rejects(
    () =>
      updateInstall.download('https://ejemplo/x.exe', path.join(home, 'u', 'z.exe'), {
        net: fakeNet([], { status: 404 }),
        fsImpl,
      }),
    /HTTP 404/
  );
});

t.finish('OK: las actualizaciones pasan', () => {
  t.restoreFetch();
  t.removeDir(home);
});
