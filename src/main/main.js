'use strict';

const fs = require('fs');
const path = require('path');
const { app, Tray, Menu, screen, nativeImage, ipcMain, shell, protocol } = require('electron');

const config = require('./config');
const card = require('./card');
const hover = require('./hover');
const instances = require('./instances');
const settings = require('./settings');
const availability = require('./availability');
const tooltip = require('./tooltip');
const updates = require('./updates');
// Instalacion de la actualizacion (descarga, instalador y relanzado): la
// parte con efectos, aparte de la decision de `updates.js`.
const install = require('./update-install');
// La cabecera de la fila y la linea del menu: funciones puras, probadas en
// scripts/test-local.js.
const { shortSummary, primarySummary } = require('./summary');
const { byId } = require('./providers');

const MARKER = 'Usagia';
const ASSETS = path.join(__dirname, '..', '..', 'assets');
// Presupuesto del tooltip del sistema (ver src/main/tooltip.js).
const TOOLTIP_MAX = tooltip.TOOLTIP_MAX;

// La vista previa de la configuracion trabaja sobre una carpeta de datos
// temporal: al pulsar "Guardar" no debe tocar la configuracion de verdad.
const PREVIEW_CONFIG_DIR =
  process.argv.includes('--settings')
    ? path.join(require('os').tmpdir(), 'usagia-preview-settings')
    : null;
if (PREVIEW_CONFIG_DIR) {
  app.setPath('userData', PREVIEW_CONFIG_DIR);
}

// En un entorno sin GPU utilizable (el sandbox de DSH, un contenedor, un RDP
// sin aceleracion) Chromium mata la app al arrancar: "GPU process isn't
// usable. Goodbye.". Las vistas previas se lanzan con la GPU dentro del
// proceso (--in-process-gpu, lo pone el script de npm) para que funcionen en
// cualquier sitio; la app de bandeja no se toca, porque ahi si se quiere el
// proceso de GPU aparte.
if (process.argv.includes('--preview') || process.argv.includes('--settings')) {
  app.commandLine.appendSwitch('disable-gpu');
}

let tray = null;
let anchorRect = null;
let state = { results: {}, updatedAt: 0, refreshing: false, updateInfo: null };
let refreshTimer = null;
let anchorTimer = null;
let pollTimer = null;
let hideTimer = null;
let updateCheckTimer = null;
let pinned = false;
let suppressHover = false;
let lastPointerLog = 0;

/* ------------------------------------------------------------------ datos */

// Cuentas activas (una o varias por proveedor) con su ultimo resultado.
function orderedResults() {
  return instances
    .list()
    .filter((instance) => instance.enabled)
    .map((instance) => {
      const provider = byId(instance.provider);
      return { instance, provider, result: state.results[instance.id] || null };
    })
    .filter((entry) => entry.provider);
}

async function collect() {
  const cfg = config.load();
  const results = {};
  await Promise.all(
    instances
      .list()
      .filter((instance) => instance.enabled)
      .map(async (instance) => {
        const provider = byId(instance.provider);
        if (!provider) return;
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
      })
  );
  return results;
}

let refreshInFlight = null;

async function refresh() {
  // Un refresco en curso se reutiliza: dos collect() a la vez solo duplican
  // peticiones, y el que terminaba primero ponia refreshing=false con el
  // otro aun en marcha.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    state.refreshing = true;
    broadcast();
    try {
      state.results = await collect();
      state.updatedAt = Date.now();
    } catch (err) {
      console.error('[usagia] fallo el refresco:', err?.message || err);
    } finally {
      // Pase lo que pase, el estado no se queda "refrescando" para siempre
      // (eso bloqueaba todos los refrescos periodicos posteriores).
      state.refreshing = false;
      refreshInFlight = null;
    }
    updateTrayIcon();
    updateTooltip();
    broadcast();
  })();
  return refreshInFlight;
}

/**
 * Tono del icono de la bandeja: la salud GLOBAL de la cuota.
 *
 * No es "la peor de todas": una sola ventana de un solo proveedor al 100 %
 * (p. ej. la de 5 h de Claude, que se repone en un rato) no debe poner el
 * icono en rojo, que se lee como "no queda uso de nada". El criterio esta
 * en `availability.js`.
 */
function globalTone() {
  const results = orderedResults()
    .map(({ result }) => result)
    .filter(Boolean);
  return availability.computeAvailability(results).tone;
}

/* ---------------------------------------------------------- actualizaciones */

/**
 * Obtiene la versión actual de la app.
 * En desarrollo es "0.0.0"; en producción es la que inyecta electron-builder.
 */
function currentVersion() {
  try {
    return app.getVersion() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Estado de la instalación de la actualización:
 *
 *   idle        -> no hay nada que instalar
 *   available   -> hay versión nueva (aún sin bajar)
 *   downloading -> bajando; `percent` avanza
 *   ready       -> bajada y lista: se instala al pulsar o al salir
 *   installing  -> lanzado el instalador; la app se va
 *   error       -> algo falló; queda el enlace a la release
 */
let updateState = { phase: 'idle', version: '', percent: 0, error: '' };
let downloadInFlight = null;
let installStarted = false;
let lastProgressBroadcast = 0;

/** ¿Se puede instalar sola? (NSIS en Windows, AppImage en Linux) */
function autoUpdateSupport() {
  return updates.canAutoUpdate({ platform: process.platform, packaged: app.isPackaged, env: process.env });
}

/** Última versión de la que ya se avisó, para no repetir el aviso cada 6 h. */
let notifiedVersion = null;

/**
 * Comprueba si hay una versión nueva y actualiza el estado.
 * Si hay una y se puede instalar sola, empieza la descarga.
 */
async function checkForUpdates() {
  const cfg = config.load();
  if (!cfg.updateCheck) {
    state.updateInfo = null;
    updateState = { phase: 'idle', version: '', percent: 0, error: '' };
    broadcast();
    return;
  }

  // Un re-chequeo (cambio de canal, guardar ajustes) no puede pisar lo que ya
  // está en marcha: si se está bajando o ya está lista, se respeta la fase.
  const busy = ['downloading', 'ready', 'installing'].includes(updateState.phase);
  if (updateState.phase === 'idle') {
    updateState = { phase: 'available', version: '', percent: 0, error: '' };
  }

  try {
    const result = await updates.checkForUpdates(currentVersion(), cfg.updateChannel);
    if (result.available && result.latest) {
      state.updateInfo = result.latest;
      if (!busy) updateState = { phase: 'available', version: result.latest.version, percent: 0, error: '' };
      console.log(`[usagia] nueva versión disponible: ${result.latest.version}`);
      notifyUpdate(result.latest);
      broadcast();
      // Desatendido: si se puede instalar sola, se baja ya y queda lista
      // para instalarse al salir (o al pulsar el aviso).
      if (cfg.updateAutoDownload && autoUpdateSupport().ok) startDownload();
      return;
    }
    // Al cambiar de canal o tras actualizar, el aviso viejo ya no vale.
    state.updateInfo = null;
    updateState = { phase: 'idle', version: '', percent: 0, error: '' };
    if (result.error) console.log(`[usagia] error al buscar actualizaciones: ${result.error}`);
  } catch (err) {
    state.updateInfo = null;
    updateState = { phase: 'idle', version: '', percent: 0, error: '' };
    console.log(`[usagia] error al buscar actualizaciones: ${err.message}`);
  }
  broadcast();
}

/**
 * Baja el binario de la versión nueva a la carpeta del actualizador.
 *
 * Si el fichero ya está descargado y coincide el tamaño, no se vuelve a
 * bajar: se marca listo. Así un reinicio a mitad de la instalación no
 * gasta 100 MB de más.
 */
function startDownload() {
  if (downloadInFlight) return downloadInFlight;
  const support = autoUpdateSupport();
  if (!support.ok || !state.updateInfo) return Promise.resolve(null);

  const asset = updates.assetFor(state.updateInfo, { platform: process.platform });
  if (!asset || !asset.url) {
    updateState = {
      phase: 'error',
      version: state.updateInfo.version,
      percent: 0,
      error: 'la release no trae el instalador para este sistema',
    };
    broadcast();
    return Promise.resolve(null);
  }

  const dest = install.downloadPath(app.getPath('userData'), asset.name);

  // Ya bajado en un intento anterior: nada que hacer.
  try {
    const info = fs.statSync(dest);
    if (asset.size > 0 && info.size === asset.size) {
      updateState = { phase: 'ready', version: state.updateInfo.version, percent: 100, error: '' };
      broadcast();
      return Promise.resolve({ file: dest, bytes: info.size });
    }
  } catch {
    /* no estaba: se baja */
  }

  updateState = { phase: 'downloading', version: state.updateInfo.version, percent: 0, error: '' };
  broadcast();
  console.log(`[usagia] bajando ${asset.name} (${Math.round(asset.size / 1048576)} MB)`);

  downloadInFlight = install
    .download(asset.url, dest, {
      expectedSize: asset.size,
      onProgress: ({ percent }) => {
        updateState.percent = percent;
        // Sin esto son cientos de mensajes IPC por segundo.
        const now = Date.now();
        if (now - lastProgressBroadcast > 400 || percent >= 100) {
          lastProgressBroadcast = now;
          broadcast();
        }
      },
    })
    .then((result) => {
      updateState = { phase: 'ready', version: state.updateInfo.version, percent: 100, error: '' };
      console.log(`[usagia] actualización descargada: ${result.file}`);
      broadcast();
      return result;
    })
    .catch((err) => {
      console.log(`[usagia] no se pudo descargar la actualización: ${err.message}`);
      updateState = {
        phase: 'error',
        version: state.updateInfo?.version || '',
        percent: 0,
        error: err.message,
      };
      broadcast();
      return null;
    })
    .finally(() => {
      downloadInFlight = null;
    });

  return downloadInFlight;
}

/**
 * Instala la actualización descargada y sale de la app.
 *
 * `relaunch` = true cuando la pide el usuario (el instalador vuelve a abrir
 * la app); en la instalación al salir no se relanza, que para eso se cierra.
 */
function installUpdate({ relaunch: relaunchAfter = true } = {}) {
  if (installStarted) return false;
  if (updateState.phase !== 'ready' || !state.updateInfo) return false;

  const asset = updates.assetFor(state.updateInfo, { platform: process.platform });
  if (!asset) return false;
  const file = install.downloadPath(app.getPath('userData'), asset.name);
  const log = path.join(app.getPath('userData'), 'updater', 'update.log');

  installStarted = true;
  updateState = { ...updateState, phase: 'installing' };
  broadcast();
  console.log(`[usagia] instalando ${asset.name} (relanzar=${relaunchAfter})`);

  try {
    if (process.platform === 'win32') {
      install.installWindows({ installer: file, exe: process.execPath, relaunch: relaunchAfter, log });
    } else if (process.platform === 'linux') {
      const image = process.env.APPIMAGE || process.execPath;
      install.installAppImage({ downloaded: file, current: image });
      if (relaunchAfter) install.relaunch(image);
    } else {
      installStarted = false;
      return false;
    }
  } catch (err) {
    installStarted = false;
    updateState = { ...updateState, phase: 'error', error: err.message };
    broadcast();
    console.log(`[usagia] no se pudo instalar la actualización: ${err.message}`);
    return false;
  }

  // El instalador ya está lanzado y espera a que muramos: se cierra ya.
  setTimeout(() => app.quit(), 250);
  return true;
}

/**
 * Notificación nativa de nueva versión disponible.
 *
 * Solo en la app empaquetada (en desarrollo la version es "0.0.0" y saldria
 * un aviso en cada arranque) y una sola vez por version (si no, el aviso se
 * repite en cada comprobacion de cada 6 h).
 */
function notifyUpdate(info) {
  if (!info || notifiedVersion === info.version) return;
  if (!app.isPackaged) return;
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    const { Notification } = require('electron');
    if (!Notification.isSupported()) return;
    notifiedVersion = info.version;
    const auto = autoUpdateSupport().ok;
    const notification = new Notification({
      title: 'Nueva versión de Usagia',
      body: auto
        ? `La versión ${info.version} se está descargando; se instalará al salir (o desde el aviso de la tarjeta).`
        : `La versión ${info.version} está disponible. Haz clic para descargarla.`,
      silent: true,
    });
    notification.on('click', () => {
      if (auto) return;
      if (info.url) shell.openExternal(info.url);
    });
    notification.show();
  } catch (err) {
    console.log('[usagia] no se pudo mostrar el aviso de actualización:', err.message);
  }
}

/**
 * Programa la comprobación periódica de actualizaciones.
 * Se comprueba una vez al arrancar (con un pequeño retraso, para no bloquear)
 * y luego cada 6 horas.
 */
let updateCheckStart = null;

function scheduleUpdateCheck() {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (updateCheckStart) clearTimeout(updateCheckStart);
  updateCheckTimer = null;
  updateCheckStart = null;

  const cfg = config.load();
  if (!cfg.updateCheck) return;

  updateCheckStart = setTimeout(() => {
    updateCheckStart = null;
    checkForUpdates();
  }, 5000);

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  updateCheckTimer = setInterval(() => checkForUpdates(), SIX_HOURS);
}

/* ------------------------------------------------------------------ bandeja */

function iconFor(tone) {
  if (process.platform === 'darwin') {
    const template = nativeImage.createFromPath(path.join(ASSETS, 'trayTemplate.png'));
    template.setTemplateImage(true);
    return template;
  }
  const names = {
    ok: 'tray-ok.png',
    warning: 'tray-warn.png',
    critical: 'tray-crit.png',
    neutral: 'tray-idle.png',
  };
  const image = nativeImage.createFromPath(path.join(ASSETS, names[tone] || names.neutral));
  return image;
}

function updateTrayIcon() {
  if (!tray) return;
  tray.setImage(iconFor(globalTone()));
}

function updateTooltip() {
  if (!tray) return;
  // El tooltip lleva una linea por proveedor, lo mas urgente primero, y
  // se recorta al presupuesto de Windows sin partir lineas a medias (ver
  // src/main/tooltip.js).
  const text = tooltip.buildTooltip(
    orderedResults().map(({ instance, result }) => ({
      label: instance.label,
      result,
      tone: result?.status === 'ok' ? availability.providerTone(result) : 'neutral',
    })),
    MARKER,
    TOOLTIP_MAX
  );

  tray.setToolTip(text);
  if (process.argv.includes('--verbose')) {
    console.log(`[usagia] tooltip (${text.length} car.): ${JSON.stringify(text)}`);
  }
}

function buildMenu() {
  const items = [];
  for (const { instance, provider, result } of orderedResults()) {
    items.push({
      label: `${instance.label}: ${shortSummary(result)}`,
      click: provider.url ? () => shell.openExternal(provider.url) : undefined,
    });
  }
  items.push({ type: 'separator' });
  items.push({
    label: 'Refrescar ahora',
    click: () => refresh(),
  });
  items.push({
    label: 'Buscar actualizaciones',
    click: () => checkForUpdates(),
  });
  items.push({
    label: 'Configuración…',
    click: () => settings.open(),
  });
  items.push({
    label: 'Abrir archivo de configuración',
    click: () => shell.openPath(config.configPath()),
  });

  // Mostrar la versión actual y, si hay actualización, lo que toca hacer:
  // instalarla (ya descargada), descargarla, o abrir la release si este
  // binario no se puede actualizar solo (portable, .deb…).
  items.push({ type: 'separator' });
  const version = currentVersion();
  if (updateState.phase === 'ready') {
    items.push({
      label: `Reiniciar e instalar ${updateState.version}`,
      click: () => installUpdate({ relaunch: true }),
    });
  } else if (updateState.phase === 'downloading') {
    items.push({ label: `Descargando ${updateState.version}… ${updateState.percent} %`, enabled: false });
  } else if (updateState.phase === 'installing') {
    items.push({ label: `Instalando ${updateState.version}…`, enabled: false });
  } else if (state.updateInfo) {
    const auto = autoUpdateSupport().ok;
    items.push({
      label: auto
        ? `Actualizar a ${state.updateInfo.version}`
        : `Descargar ${state.updateInfo.version} (este binario no se actualiza solo)`,
      click: () => (auto ? installUpdate({ relaunch: true }) : shell.openExternal(state.updateInfo.url)),
    });
  }
  items.push({ label: `Versión ${version}`, enabled: false });

  items.push({ type: 'separator' });
  items.push({ label: 'Salir', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

/* ------------------------------------------------------------------- hover */

let warnedHidden = false;
let anchorFallback = false;

function currentAnchor() {
  return anchorRect || (anchorFallback ? hover.taskbarFallbackRect() : null);
}

async function refreshAnchor() {
  const { rect, hidden } = await hover.getTrayAnchor(tray, MARKER);
  if (hidden) {
    // El icono esta en "iconos ocultos": no hay zona fiable de hover, asi que
    // solo queda el tooltip nativo del sistema.
    anchorRect = null;
    anchorFallback = false;
  } else if (rect) {
    anchorRect = rect;
    anchorFallback = false;
  } else {
    // No se pudo localizar el icono: se usa una aproximacion.
    anchorRect = null;
    anchorFallback = true;
  }
  card.setAnchor(anchorRect);
  if (process.argv.includes('--verbose')) {
    console.log(`[usagia] ancla=${JSON.stringify(anchorRect)} oculto=${hidden}`);
  }
  if (hidden && !warnedHidden) {
    warnedHidden = true;
    console.log(
      '[usagia] aviso: el icono está en "iconos ocultos" de Windows. Arrástralo a la zona visible de la bandeja para que la tarjeta salga al pasar el ratón.'
    );
    notifyHiddenIcon();
  }
}

/** Aviso nativo: en Windows 11 los iconos nuevos caen en "iconos ocultos". */
function notifyHiddenIcon() {
  if (process.platform !== 'win32') return;
  try {
    const { Notification } = require('electron');
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: 'Usagia ya está en la bandeja',
      body: 'Windows lo ha dejado en "iconos ocultos". Arrástralo a la zona visible de la bandeja para ver el uso al pasar el ratón.',
      silent: true,
    });
    notification.on('click', () => shell.openExternal('https://learn.microsoft.com/windows/taskbar/tray-icon'));
    notification.show();
  } catch (err) {
    console.log('[usagia] no se pudo mostrar el aviso:', err.message);
  }
}

function handlePointer() {
  const cfg = config.load();
  if (!cfg.showOnHover && !pinned) {
    card.setInteractive(false);
    return;
  }

  const point = screen.getCursorScreenPoint();
  const rect = currentAnchor();
  const overIcon = hover.inside(point, rect, 6);
  const overCard = card.isVisible() && hover.inside(point, card.bounds(), 2);

  // La tarjeta es click-through (no tapa la barra de tareas), pero en cuanto el
  // puntero esta encima se vuelve interactiva: asi se puede pulsar su boton
  // de configuracion.
  card.setInteractive(overCard);

  if (process.argv.includes('--verbose') && Date.now() - lastPointerLog > 1000) {
    lastPointerLog = Date.now();
    console.log(
      `[usagia] puntero ${JSON.stringify(point)} icono=${overIcon} tarjeta=${overCard} visible=${card.isVisible()}`
    );
  }

  // Con la tarjeta fijada permanece abierta aunque el raton se vaya.
  if (pinned) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    return;
  }

  // Tras soltar la tarjeta con un clic, no vuelve a salir hasta que el raton
  // abandone el icono.
  if (suppressHover) {
    if (!overIcon) suppressHover = false;
    return;
  }

  if (overIcon) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!card.isVisible()) {
      card.show();
      console.log(`[usagia] tarjeta visible (ancla ${JSON.stringify(rect)})`);
      broadcast();
      // Si los datos son viejos, se refresca al vuelo.
      if (Date.now() - state.updatedAt > 60000) refresh();
    }
  } else if (card.isVisible() && !overCard) {
    if (!hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        const pt = screen.getCursorScreenPoint();
        if (!hover.inside(pt, currentAnchor(), 6) && !hover.inside(pt, card.bounds(), 2)) {
          card.hide();
        }
      }, cfg.hoverCloseDelayMs || 400);
    }
  }
}

/* ------------------------------------------------------------------ tarjeta */

/**
 * Tope de altura de la tarjeta: **toda la pantalla menos la barra de
 * tareas**.
 *
 * El `workArea` de Electron es exactamente eso (la pantalla menos la barra
 * de tareas), asi que el tope es su alto. Antes era un tope fijo (640 px)
 * que no significaba nada: hacia aparecer una barra de scroll por 3 o 4
 * pixeles, que es una chapuza.
 *
 * @returns {number} pixeles
 */
function cardMaxHeight() {
  const display = anchorRect
    ? screen.getDisplayMatching({
        x: anchorRect.x,
        y: anchorRect.y,
        width: anchorRect.width,
        height: anchorRect.height,
      })
    : screen.getPrimaryDisplay();
  return display.workArea.height;
}

function broadcast() {
  const payload = {
    updatedAt: state.updatedAt,
    refreshing: state.refreshing,
    pinned,
    // El tope de la tarjeta: lo aplica el renderer como max-height, para
    // que la tarjeta CREZCA sola hasta ese limite (y solo entonces
    // aparezca el scroll).
    maxHeight: cardMaxHeight(),
    // Información de actualización disponible y en qué punto está.
    updateInfo: state.updateInfo,
    updateState,
    autoUpdate: autoUpdateSupport(),
    currentVersion: currentVersion(),
    providers: orderedResults().map(({ instance, provider, result }) => ({
      id: instance.id,
      label: instance.label,
      provider: provider.id,
      color: provider.color,
      status: result?.status || 'pending',
      summary: result?.summary || '',
      headline: result?.headline || '',
      primary: primarySummary(result),
      // El punto refleja la CUOTA de ese proveedor, no el estado de la
      // consulta: una ventana larga agotada tiene que salir en rojo, y una
      // de 5 h (que se repone en un rato) en amarillo.
      tone: result?.status === 'ok' ? availability.providerTone(result) : 'neutral',
      metrics: result?.metrics || [],
      note: result?.note || '',
      error: result?.error || '',
      source: result?.source || '',
    })),
  };
  card.send('state', payload);
}

/* -------------------------------------------------------------------- init */

function createTray() {
  tray = new Tray(iconFor('neutral'));
  let lastClickAt = 0;
  tray.on('click', () => {
    // Un doble clic genera dos eventos: se ignora el segundo para que la
    // tarjeta no se fije y se suelte a la vez.
    const now = Date.now();
    if (now - lastClickAt < 400) return;
    lastClickAt = now;

    // Clic: fija la tarjeta (toggle). Un segundo clic la suelta.
    pinned = !pinned;
    console.log(`[usagia] tarjeta ${pinned ? 'FIJADA' : 'suelta'}`);
    if (pinned) {
      refreshAnchor().finally(() => {
        card.show();
        broadcast();
      });
    } else {
      card.hide();
      suppressHover = true;
    }
  });
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  updateTooltip();
}

function createCard() {
  card.create(path.join(__dirname, '..', 'preload', 'preload.js'));
}

/**
 * (Re)programa el refresco periodico con el intervalo de la configuracion.
 * Se llama al arrancar y cada vez que se guarda la configuracion: antes el
 * intervalo se leia una sola vez y cambiar "Actualizar cada" no hacia nada
 * hasta reiniciar la app.
 */
function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const seconds = Math.max(30, Number(config.load().refreshSeconds) || config.DEFAULTS.refreshSeconds);
  refreshTimer = setInterval(() => refresh(), seconds * 1000);
  if (process.argv.includes('--verbose')) {
    console.log(`[usagia] refresco cada ${seconds} s`);
  }
}

/**
 * Cambia la disposicion de pantallas -> el icono de bandeja puede haberse
 * movido y el factor de escala con el que se convierten los pixeles fisicos
 * a DIP tambien. Se invalida la cache del ancla y se busca el icono otra vez
 * (la cache dura 60 s, asi que sin esto el ancla quedaria obsoleta).
 */
function watchDisplayChanges() {
  const onChange = () => {
    hover.invalidate();
    refreshAnchor();
  };
  screen.on('display-metrics-changed', onChange);
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
}

function startTimers() {
  scheduleRefresh();
  scheduleUpdateCheck();
  anchorTimer = setInterval(() => refreshAnchor(), 10000);
  pollTimer = setInterval(handlePointer, 150);
  watchDisplayChanges();
}

function singleInstance() {
  if (!app.requestSingleInstanceLock()) {
    // Sin este mensaje, un segundo arranque se cierra con codigo 0 y sin
    // explicar nada: parece que la app no hace nada.
    console.log('[usagia] ya hay otra instancia en marcha; se cierra esta.');
    app.quit();
    return false;
  }
  return true;
}

/**
 * Las vistas previas no exigen instancia unica: pintan su propia ventana y
 * se cierran solas, asi que pueden convivir con la app en marcha (si no, al
 * abrir la app instalada el preview moria en silencio y sin captura).
 */
function isPreviewMode() {
  return process.argv.includes('--preview') || process.argv.includes('--settings');
}

app.on('window-all-closed', () => {
  // App de bandeja: la ventana de la tarjeta no debe cerrar la app.
});

/**
 * Dónde se guardan las capturas de las vistas previas. En la app empaquetada
 * no se puede escribir dentro del asar, así que van a la carpeta temporal.
 */
function previewPath(name) {
  const dir = app.isPackaged ? app.getPath('temp') : path.join(__dirname, '..', '..');
  return path.join(dir, name);
}

// Protocolo propio para servir el renderer: permite una CSP estricta
// (file:// no permite 'self' en la CSP).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// Tipos MIME de los ficheros del renderer.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function registerAppProtocol() {
  const root = path.join(__dirname, '..', 'renderer');
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const relative =
      pathname === '/' ? 'card.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const target = path.join(root, relative);
    // La comprobacion exige el separador: `target.startsWith(root)` aceptaria
    // una ruta hermana tipo ".../renderer-otro/x", porque el prefijo de texto
    // coincide sin ser un directorio hijo. Solo vale root en si o algo
    // colgando de root + path.sep (y asi un ".." que se escape tampoco pasa).
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response('no permitido', { status: 403 });
    }

    // OJO: se lee con fs y NO con net.fetch. net.fetch va por el servicio de
    // red de Chromium, que NO entiende el empaquetado asar: en la app
    // instalada el renderer esta dentro de app.asar y la pagina se quedaria
    // EN BLANCO (ni la tarjeta ni la ventana de configuracion se verian).
    // fs si lo entiende, porque Electron parchea el modulo para el asar.
    try {
      const data = await fs.promises.readFile(target);
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch (err) {
      console.error(`[usagia] no se pudo servir ${relative}: ${err.message}`);
      return new Response(`no se pudo leer ${relative}`, { status: 404 });
    }
  });
}

app.whenReady().then(async () => {
  // Modo prueba: consulta los proveedores y vuelca el resultado por stdout.
  // No exige instancia unica: se puede probar con la app en marcha.
  if (process.argv.includes('--probe')) {
    const results = await collect();
    for (const [id, result] of Object.entries(results)) {
      console.log(`\n=== ${id} ===`);
      console.log(JSON.stringify(result, null, 2));
    }
    app.exit(0);
    return;
  }

  if (!isPreviewMode() && !singleInstance()) return;

  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  registerAppProtocol();

  ipcMain.on('card:size', (_event, size) => {
    card.resize(size, cardMaxHeight());
    if (process.argv.includes('--verbose') && size?.gear) {
      const bounds = card.bounds();
      if (!bounds) return;
      const display = screen.getDisplayMatching(bounds);
      const scale = display.scaleFactor || 1;
      const dip = {
        x: Math.round(bounds.x + size.gear.x),
        y: Math.round(bounds.y + size.gear.y),
      };
      console.log(
        `[usagia] boton de configuracion en DIP ${JSON.stringify(dip)} fisico ${JSON.stringify({
          x: Math.round(display.bounds.x + dip.x * scale),
          y: Math.round(display.bounds.y + dip.y * scale),
        })}`
      );
    }
  });
  ipcMain.on('card:refresh', () => refresh());
  ipcMain.on('card:open', (_event, url) => {
    if (url && /^https?:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.on('card:settings', () => settings.open());
  ipcMain.on('card:ready', () => broadcast());
  // Boton del aviso de la tarjeta: si ya esta bajada, instala; si no, baja.
  ipcMain.on('card:update', () => {
    if (updateState.phase === 'ready') {
      installUpdate({ relaunch: true });
      return;
    }
    if (updateState.phase === 'downloading' || updateState.phase === 'installing') return;
    startDownload();
  });

  // La ventana de configuracion avisa cuando guarda: los datos se vuelven a
  // pedir y la tarjeta se repinta.
  settings.register({
    onSaved: () => {
      // Solo si la app esta en modo normal: en las vistas previas no hay timer.
      if (refreshTimer) {
        scheduleRefresh();
        // Cambiar de canal o volver a activar la busqueda debe notarse ya.
        scheduleUpdateCheck();
      }
      refresh();
    },
    // "Instalar ahora" de la ventana de configuración.
    applyUpdate: () => {
      if (updateState.phase === 'ready') return installUpdate({ relaunch: true });
      startDownload();
      return true;
    },
  });

  // Modo vista previa: abre la tarjeta con datos reales, fija en pantalla.
  if (process.argv.includes('--preview')) {
    createCard();
    await refresh();
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    card.get().setBounds({ x: area.x + area.width - 420, y: area.y + 40, width: 380, height: 240 });
    card.get().showInactive();
    card.get().setFocusable(true);
    card.get().focus();
    card.get().moveTop();

    // Captura del contenido para poder revisarlo desde fuera.
    setTimeout(async () => {
      try {
        // Diagnostico: si la tarjeta necesita scroll, o cual es el tope
        // aplicado (la pantalla menos la barra de tareas).
        const info = await card.get().webContents.executeJavaScript(`
          (() => {
            const c = document.querySelector('.card');
            if (!c) return { error: 'sin .card' };
            return {
              alto: c.scrollHeight,
              visible: c.clientHeight,
              maxHeight: c.style.maxHeight || '(sin tope)',
              scroll: c.scrollHeight > c.clientHeight,
            };
          })()
        `);
        console.log(`[usagia] tarjeta: ${JSON.stringify(info)}`);
        const image = await card.get().webContents.capturePage();
        const file = previewPath('preview-card.png');
        fs.writeFileSync(file, image.toPNG());
        console.log(`[usagia] captura: ${file}`);
      } catch (err) {
        console.log(`[usagia] captura falló: ${err.message}`);
      }
      app.exit(0);
    }, 2500);
    return;
  }

  // Modo vista previa de la configuracion: abre la ventana y hace una captura
  // para poder revisarlo desde fuera.
  if (process.argv.includes('--settings')) {
    const win = settings.open();
    win.once('ready-to-show', () => win.show());
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Comprobacion de que el boton "Probar" llega al proceso principal.
    try {
      const answer = await win.webContents.executeJavaScript(
        `(async () => {
           const botones = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Probar');
           if (!botones.length) return 'sin botones Probar';
           botones[0].click();
           await new Promise((r) => setTimeout(r, 6000));
           const nota = document.querySelector('.acc-note');
           return nota ? nota.textContent : 'sin nota';
         })()`
      );
      console.log(`[usagia] boton Probar -> ${answer}`);
    } catch (err) {
      console.log(`[usagia] el boton Probar fallo: ${err.message}`);
    }

    // Comprobacion de que "Guardar" escribe la configuracion.
    try {
      const answer = await win.webContents.executeJavaScript(
        `(async () => {
           const guardar = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Guardar');
           if (!guardar) return 'sin boton Guardar';
           guardar.click();
           await new Promise((r) => setTimeout(r, 1500));
           const estado = document.getElementById('status');
           return estado ? estado.textContent : 'sin estado';
         })()`
      );
      console.log(`[usagia] boton Guardar -> ${answer} (${config.configPath()})`);
    } catch (err) {
      console.log(`[usagia] el boton Guardar fallo: ${err.message}`);
    }

    try {
      const image = await win.webContents.capturePage();
      const file = previewPath('preview-settings.png');
      fs.writeFileSync(file, image.toPNG());
      console.log(`[usagia] captura: ${file}`);
    } catch (err) {
      console.log(`[usagia] captura falló: ${err.message}`);
    }
    // La carpeta de datos temporal no se deja tirada.
    try {
      fs.rmSync(PREVIEW_CONFIG_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      /* da igual */
    }
    app.exit(0);
    return;
  }

  createCard();
  createTray();
  startTimers();

  await refresh();
  await refreshAnchor();
});

app.on('activate', () => {
  if (card.get() && !card.isVisible()) {
    card.show();
    broadcast();
  }
});

/**
 * Instalación al salir: si la actualización está descargada y el usuario no
 * ha pulsado nada, se instala sola al cerrar la app (sin volver a abrirla,
 * que para eso la está cerrando). Es la parte que hace que no haya que
 * acordarse de nada.
 */
app.on('before-quit', () => {
  if (installStarted) return;
  if (!config.load().updateInstallOnQuit) return;
  if (updateState.phase !== 'ready') return;
  installUpdate({ relaunch: false });
});

app.on('will-quit', () => {
  clearInterval(refreshTimer);
  clearInterval(anchorTimer);
  clearInterval(pollTimer);
  clearInterval(updateCheckTimer);
  if (updateCheckStart) clearTimeout(updateCheckStart);
  if (hideTimer) clearTimeout(hideTimer);
});
