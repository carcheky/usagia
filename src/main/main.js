'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, Tray, Menu, screen, nativeImage, ipcMain, shell, protocol, net } = require('electron');

const config = require('./config');
const card = require('./card');
const hover = require('./hover');
const { providers } = require('./providers');

const MARKER = 'Usagia';
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const TOOLTIP_MAX = 120;

let tray = null;
let anchorRect = null;
let state = { results: {}, updatedAt: 0, refreshing: false };
let refreshTimer = null;
let anchorTimer = null;
let pollTimer = null;
let hideTimer = null;
let pinned = false;
let suppressHover = false;

/* ------------------------------------------------------------------ datos */

function orderedResults() {
  return providers.map((p) => ({ provider: p, result: state.results[p.id] || null }));
}

async function collect() {
  const ctx = { config: config.load() };
  const results = {};
  await Promise.all(
    providers.map(async (provider) => {
      if (!config.isProviderEnabled(provider.id)) return;
      try {
        results[provider.id] = await provider.fetchUsage(ctx);
      } catch (err) {
        results[provider.id] = {
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

async function refresh({ force = false } = {}) {
  if (state.refreshing && !force) return;
  state.refreshing = true;
  broadcast();

  state.results = await collect();
  state.updatedAt = Date.now();
  state.refreshing = false;

  updateTrayIcon();
  updateTooltip();
  broadcast();
}

function shortSummary(result) {
  if (!result) return '—';
  if (result.status === 'unconfigured') return 'sin credencial';
  if (result.status === 'error') return 'error';
  const metrics = result.metrics || [];
  if (!metrics.length) return result.summary || '—';
  const parts = metrics.slice(0, 2).map((m) => m.short || m.value);
  // Todas las metricas en porcentaje son "consumido", como en los paneles.
  const allPercent = metrics.every((m) => typeof m.pct === 'number');
  return `${parts.join(' / ')}${allPercent ? ' usado' : ''}`;
}

function worstTone() {
  const order = { critical: 3, warning: 2, ok: 1, neutral: 0 };
  let worst = 'neutral';
  for (const { result } of orderedResults()) {
    if (!result || result.status !== 'ok') continue;
    for (const metric of result.metrics || []) {
      if (!metric.tone || metric.tone === 'neutral') continue;
      if (order[metric.tone] > order[worst]) worst = metric.tone;
    }
  }
  return worst;
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
  tray.setImage(iconFor(worstTone()));
}

function updateTooltip() {
  if (!tray) return;
  const lines = [MARKER];
  for (const { provider, result } of orderedResults()) {
    if (!result) continue;
    lines.push(`${provider.label}: ${shortSummary(result)}`);
  }
  let text = lines.join('\n');
  if (text.length > TOOLTIP_MAX) text = `${text.slice(0, TOOLTIP_MAX - 1)}…`;
  tray.setToolTip(text);
  if (process.argv.includes('--verbose')) {
    console.log(`[usagia] tooltip (${text.length} car.): ${JSON.stringify(text)}`);
  }
}

function buildMenu() {
  const items = [];
  for (const { provider, result } of orderedResults()) {
    items.push({
      label: `${provider.label}: ${shortSummary(result)}`,
      click: provider.url ? () => shell.openExternal(provider.url) : undefined,
    });
  }
  items.push({ type: 'separator' });
  items.push({
    label: 'Refrescar ahora',
    click: () => refresh({ force: true }),
  });
  items.push({
    label: 'Configuración',
    click: () => shell.openPath(config.configPath()),
  });
  items.push({ type: 'separator' });
  items.push({ label: 'Salir', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

/* ------------------------------------------------------------------- hover */

function currentAnchor() {
  return anchorRect || (anchorFallback ? hover.taskbarFallbackRect() : null);
}

let warnedHidden = false;
let anchorFallback = false;

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
  if (!cfg.showOnHover && !pinned) return;

  const point = screen.getCursorScreenPoint();
  const rect = currentAnchor();
  const overIcon = hover.inside(point, rect, 6);
  const overCard = card.isVisible() && hover.inside(point, card.bounds(), 2);

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
      if (Date.now() - state.updatedAt > 60000) refresh({ force: true });
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

function broadcast() {
  const payload = {
    updatedAt: state.updatedAt,
    refreshing: state.refreshing,
    pinned,
    providers: orderedResults().map(({ provider, result }) => ({
      id: provider.id,
      label: provider.label,
      color: provider.color,
      status: result?.status || 'pending',
      summary: result?.summary || '',
      primary: shortSummary(result),
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

function startTimers() {
  const cfg = config.load();
  refreshTimer = setInterval(() => refresh(), Math.max(30, cfg.refreshSeconds) * 1000);
  anchorTimer = setInterval(() => refreshAnchor(), 10000);
  pollTimer = setInterval(handlePointer, 150);
}

function singleInstance() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  return true;
}

app.on('window-all-closed', () => {
  // App de bandeja: la ventana de la tarjeta no debe cerrar la app.
});

// Protocolo propio para servir el renderer: permite una CSP estricta
// (file:// no permite 'self' en la CSP).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function registerAppProtocol() {
  const root = path.join(__dirname, '..', 'renderer');
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const relative = pathname === '/' ? 'card.html' : pathname.replace(/^\/+/, '');
    const target = path.join(root, relative);
    if (!target.startsWith(root)) {
      return new Response('no permitido', { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
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

  if (!singleInstance()) return;

  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  registerAppProtocol();

  ipcMain.on('card:size', (_event, size) => card.resize(size));
  ipcMain.on('card:refresh', () => refresh({ force: true }));
  ipcMain.on('card:open', (_event, url) => {
    if (url && /^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // Modo vista previa: abre la tarjeta con datos reales, fija en pantalla.
  if (process.argv.includes('--preview')) {
    createCard();
    await refresh({ force: true });
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
        const image = await card.get().webContents.capturePage();
        const file = path.join(__dirname, '..', '..', 'preview-card.png');
        fs.writeFileSync(file, image.toPNG());
        console.log(`[usagia] captura: ${file}`);
      } catch (err) {
        console.log(`[usagia] captura falló: ${err.message}`);
      }
      app.exit(0);
    }, 2500);
    return;
  }

  createCard();
  createTray();
  startTimers();

  await refresh({ force: true });
  await refreshAnchor();
});

app.on('activate', () => {
  if (card.get() && !card.isVisible()) {
    card.show();
    broadcast();
  }
});

app.on('will-quit', () => {
  clearInterval(refreshTimer);
  clearInterval(anchorTimer);
  clearInterval(pollTimer);
  if (hideTimer) clearTimeout(hideTimer);
});
