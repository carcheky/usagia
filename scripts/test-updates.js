'use strict';

// Pruebas del módulo de actualizaciones (src/main/updates.js).
// Node PURO: lo lanza scripts/test.js (npm test).

const path = require('path');
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

t.finish('OK: las actualizaciones pasan', () => {
  t.restoreFetch();
  t.removeDir(home);
});
