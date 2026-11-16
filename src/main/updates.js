'use strict';

/**
 * Comprobación de actualizaciones. Consulta las releases de GitHub y compara
 * con la versión local para ver si hay una nueva disponible.
 *
 * Canales:
 *   - `stable`: solo versiones estables (sin `-beta.NNNN`).
 *   - `beta`: versiones estables y betas.
 *
 * La comparación sigue semver: 1.0.0 < 1.0.1 < 1.1.0 < 2.0.0.
 * Las betas de la misma base son menores que la estable: 1.0.0-beta.1 < 1.0.0.
 * Entre betas de la misma base, gana el número mayor: beta.9 < beta.10.
 */

// Se usa el mismo `fetch` que los proveedores (http.js): asi las pruebas lo
// pueden simular sin red, como hacen las de los cuatro proveedores.
const { fetchJson } = require('./http');

const REPO = 'carcheky/usagia';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const TIMEOUT_MS = 15000;

// Patrones de versión
const STABLE_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;
const BETA_RE = /^v?(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/;

/**
 * Parsea una versión y devuelve sus componentes.
 * @param {string} version - p.ej. "1.0.0", "v1.0.0-beta.5"
 * @returns {{major: number, minor: number, patch: number, beta: number|null, raw: string}|null}
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') return null;
  const v = version.trim();

  const stable = STABLE_RE.exec(v);
  if (stable) {
    return {
      major: parseInt(stable[1], 10),
      minor: parseInt(stable[2], 10),
      patch: parseInt(stable[3], 10),
      beta: null,
      raw: v,
    };
  }

  const beta = BETA_RE.exec(v);
  if (beta) {
    return {
      major: parseInt(beta[1], 10),
      minor: parseInt(beta[2], 10),
      patch: parseInt(beta[3], 10),
      beta: parseInt(beta[4], 10),
      raw: v,
    };
  }

  return null;
}

/**
 * Compara dos versiones parseadas.
 * @returns {number} negativo si a < b, 0 si iguales, positivo si a > b
 */
function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // Comparar major.minor.patch
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Misma base: una estable es mayor que cualquier beta de esa base
  if (a.beta === null && b.beta !== null) return 1;
  if (a.beta !== null && b.beta === null) return -1;

  // Ambas son betas de la misma base: gana el número mayor
  if (a.beta !== null && b.beta !== null) return a.beta - b.beta;

  return 0;
}

/**
 * ¿Es `candidate` más nueva que `current`?
 */
function isNewer(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/**
 * Canal que toca de verdad.
 *
 * `auto` sigue a la versión instalada: quien lleva una beta quiere enterarse
 * de las betas nuevas (y de la estable, que es mayor que cualquier beta);
 * quien lleva una estable solo quiere estables. Es el canal por defecto
 * porque la app todavía no ha publicado ninguna estable: con `stable` fijo,
 * la comprobación no encontraría nunca nada.
 *
 * @param {string} currentVersion - versión instalada
 * @param {'auto'|'stable'|'beta'} channel - canal configurado
 * @returns {'stable'|'beta'}
 */
function effectiveChannel(currentVersion, channel = 'auto') {
  if (channel === 'stable' || channel === 'beta') return channel;
  const v = parseVersion(currentVersion);
  return v && v.beta !== null ? 'beta' : 'stable';
}

/**
 * Filtra las releases según el canal.
 * @param {Array} releases - lista de releases de GitHub
 * @param {'stable'|'beta'} channel
 * @returns {Array} releases filtradas
 */
function filterByChannel(releases, channel) {
  if (!Array.isArray(releases)) return [];
  return releases.filter((r) => {
    if (!r || r.draft) return false;
    const v = parseVersion(r.tag_name);
    if (!v) return false;
    if (channel === 'stable') return v.beta === null;
    // channel === 'beta': acepta estables y betas
    return true;
  });
}

/**
 * Encuentra la release más reciente de la lista (ya filtrada por canal).
 * @param {Array} releases
 * @returns {object|null} la release con la versión más alta
 */
function findLatest(releases) {
  if (!releases.length) return null;
  let best = null;
  let bestV = null;
  for (const r of releases) {
    const v = parseVersion(r.tag_name);
    if (!v) continue;
    if (!best || isNewer(v, bestV)) {
      best = r;
      bestV = v;
    }
  }
  return best;
}

/**
 * Consulta las releases publicadas de GitHub.
 * @throws si la petición falla o la respuesta no es una lista
 * @returns {Promise<Array>}
 */
async function fetchReleases() {
  const res = await fetchJson(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'usagia-update-check',
    },
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`GitHub: ${res.error || `HTTP ${res.status}`}`);
  }
  if (!Array.isArray(res.data)) {
    throw new Error('respuesta de GitHub con formato inesperado');
  }
  return res.data;
}

/**
 * ¿Se puede actualizar la app sola desde dentro?
 *
 * Solo cuando hay un binario instalado que se pueda reemplazar:
 *   - **Windows/NSIS**: sí (el instalador silencioso reemplaza en su sitio).
 *   - **Linux/AppImage**: sí, si estamos corriendo desde un AppImage
 *     (`APPIMAGE`); se baja el nuevo al lado y se relanza.
 *   - **Portable, `.deb`, macOS o el repo en desarrollo**: no. En esos casos
 *     queda el enlace a la release (descarga manual).
 *
 * `PORTABLE_EXECUTABLE_DIR` la pone el target portable de electron-builder:
 * si está, la app se está ejecutando como portable.
 *
 * @param {{platform?: string, packaged?: boolean, env?: object}} ctx
 * @returns {{ok: boolean, reason: string}}
 */
function canAutoUpdate(ctx = {}) {
  const platform = ctx.platform || process.platform;
  const env = ctx.env || process.env;
  if (!ctx.packaged) return { ok: false, reason: 'en desarrollo' };
  if (env.PORTABLE_EXECUTABLE_DIR) return { ok: false, reason: 'es la versión portable' };
  if (platform === 'win32') return { ok: true, reason: 'nsis' };
  if (platform === 'linux') {
    return env.APPIMAGE ? { ok: true, reason: 'appimage' } : { ok: false, reason: 'no es un AppImage' };
  }
  if (platform === 'darwin') return { ok: false, reason: 'macOS no tiene binario publicado' };
  return { ok: false, reason: `plataforma ${platform} sin binario` };
}

/**
 * El fichero que hay que bajarse para actualizar de verdad (no para mirar).
 *
 * Los nombres los pone electron-builder en `package.json` (`artifactName`):
 *   - Windows: `Usagia-Setup-<v>-win-x64.exe` (el portable NO se puede
 *     actualizar en su sitio).
 *   - Linux: `Usagia-<v>-linux-x86_64.AppImage`.
 *
 * @param {object} release - release de GitHub (con `assets`)
 * @param {{platform?: string}} ctx
 * @returns {{name: string, url: string, size: number}|null}
 */
function assetFor(release, ctx = {}) {
  const platform = ctx.platform || process.platform;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const pick = (test) => {
    const found = assets.find((asset) => test(String(asset.name || '')));
    return found
      ? { name: found.name, url: found.browser_download_url || found.url || '', size: Number(found.size) || 0 }
      : null;
  };
  if (platform === 'win32') {
    return pick((name) => /^(?:win-)?Usagia-Setup-.*\.exe$/i.test(name) && !/\.blockmap$/i.test(name));
  }
  if (platform === 'linux') {
    return pick((name) => /\.AppImage$/i.test(name));
  }
  return null;
}

/**
 * Porcentaje de descarga, acotado a 0-100 y entero.
 * @param {number} received - bytes descargados
 * @param {number} total - bytes totales (0 si no se sabe)
 * @returns {number}
 */
function downloadPercent(received, total) {
  if (!Number.isFinite(received) || received <= 0) return 0;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)));
}

/**
 * Comprueba si hay una versión nueva disponible.
 * @param {string} currentVersion - versión instalada (sin "v")
 * @param {'auto'|'stable'|'beta'} channel - canal de actualización
 * @returns {Promise<{available: boolean, latest: object|null, current: object|null, channel: string, error: string|null}>}
 */
async function checkForUpdates(currentVersion, channel = 'auto') {
  const current = parseVersion(currentVersion);
  if (!current) {
    return { available: false, latest: null, current: null, channel, error: 'versión local no válida' };
  }

  const effective = effectiveChannel(currentVersion, channel);

  try {
    const releases = await fetchReleases();
    const filtered = filterByChannel(releases, effective);
    const latestRelease = findLatest(filtered);

    if (!latestRelease) {
      return { available: false, latest: null, current, channel: effective, error: null };
    }

    const latestV = parseVersion(latestRelease.tag_name);
    const available = isNewer(latestV, current);

    return {
      available,
      latest: available
        ? {
            version: latestV.raw.replace(/^v/, ''),
            tag: latestRelease.tag_name,
            url: latestRelease.html_url,
            publishedAt: latestRelease.published_at,
            prerelease: latestRelease.prerelease,
            body: latestRelease.body || '',
            // Los ficheros de la release: con ellos se puede bajar e instalar
            // sin pasar por el navegador.
            assets: (latestRelease.assets || []).map((asset) => ({
              name: asset.name,
              size: asset.size,
              url: asset.browser_download_url,
            })),
          }
        : null,
      current,
      channel: effective,
      error: null,
    };
  } catch (err) {
    return { available: false, latest: null, current, channel: effective, error: err.message };
  }
}

/**
 * Formatea una versión para mostrar.
 * @param {string} version
 * @returns {string}
 */
function formatVersion(version) {
  const v = parseVersion(version);
  if (!v) return version || '—';
  if (v.beta !== null) {
    return `${v.major}.${v.minor}.${v.patch}-beta.${v.beta}`;
  }
  return `${v.major}.${v.minor}.${v.patch}`;
}

module.exports = {
  parseVersion,
  compareVersions,
  isNewer,
  effectiveChannel,
  canAutoUpdate,
  assetFor,
  downloadPercent,
  filterByChannel,
  findLatest,
  fetchReleases,
  checkForUpdates,
  formatVersion,
  REPO,
};
