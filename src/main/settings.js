'use strict';

// Ventana de configuración: cuentas (una o varias por proveedor) y ajustes
// generales. Es una ventana normal, con su propio preload y su propio canal
// IPC: el renderer solo puede pedir lo que se expone en `settings-preload.js`.

const path = require('path');
const { BrowserWindow, ipcMain, shell } = require('electron');

const config = require('./config');
const instances = require('./instances');
const { byId } = require('./providers');

let win = null;
let onSaved = () => {};

function preloadPath() {
  return path.join(__dirname, '..', 'preload', 'settings-preload.js');
}

/** Abre la ventana (o la trae al frente si ya estaba). */
function open() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }

  win = new BrowserWindow({
    width: 780,
    height: 660,
    minWidth: 640,
    minHeight: 480,
    title: 'Usagia · Configuración',
    backgroundColor: '#14161b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // El preload solo usa contextBridge e ipcRenderer: con sandbox:true el
      // renderer no tiene acceso al sistema de ficheros.
      sandbox: true,
    },
  });

  if (typeof win.removeMenu === 'function') win.removeMenu();
  win.loadURL('app://bundle/settings.html');
  win.once('ready-to-show', () => {
    win.show();
    console.log('[usagia] ventana de configuracion abierta');
  });
  win.on('closed', () => {
    win = null;
  });
  return win;
}

function get() {
  return win;
}

/** Datos que necesita el renderer para pintar el formulario. */
function snapshot() {
  const cfg = config.load();
  return {
    catalog: instances.catalog(),
    accounts: instances.list(),
    general: {
      refreshSeconds: cfg.refreshSeconds,
      showOnHover: cfg.showOnHover,
      hoverCloseDelayMs: cfg.hoverCloseDelayMs,
    },
    configPath: config.configPath(),
  };
}

/** Normaliza lo que llega del renderer antes de tocar el archivo. */
function sanitizeAccounts(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const used = new Set();
  const accounts = list
    .map((entry) => instances.normalizeAccount(entry, used))
    .filter(Boolean);
  // Los ids tienen que ser unicos: son la clave de los resultados y de las
  // caches por cuenta (ver instances.uniqueIds).
  return instances.uniqueIds(accounts);
}

/** Prueba una credencial sin guardarla. */
async function test(payload) {
  const provider = byId(payload?.provider);
  if (!provider) {
    return { status: 'error', error: 'proveedor desconocido', summary: '' };
  }

  const instance = {
    id: 'test',
    provider: provider.id,
    label: payload?.label || provider.label,
    enabled: true,
    credentials: instances.normalizeAccount(
      { provider: provider.id, label: payload?.label || provider.label, credentials: payload?.credentials },
      new Set()
    )?.credentials || {},
  };

  try {
    const result = await provider.fetchUsage({ config: config.load(), instance });
    return {
      status: result.status || 'error',
      summary: result.summary || '',
      error: result.error || '',
      note: result.note || '',
      source: result.source || '',
    };
  } catch (err) {
    return { status: 'error', summary: '', error: err?.message || String(err), note: '', source: '' };
  }
}

/** Registra los handlers IPC. Se llama una vez al arrancar la app. */
function register(hooks = {}) {
  onSaved = typeof hooks.onSaved === 'function' ? hooks.onSaved : () => {};

  ipcMain.handle('settings:get', () => snapshot());

  ipcMain.handle('settings:save', (_event, payload) => {
    const accounts = sanitizeAccounts(payload?.accounts);
    const general = payload?.general || {};
    const patch = { accounts };
    if (Number.isFinite(Number(general.refreshSeconds))) {
      patch.refreshSeconds = Math.max(30, Math.round(Number(general.refreshSeconds)));
    }
    if (Number.isFinite(Number(general.hoverCloseDelayMs))) {
      patch.hoverCloseDelayMs = Math.max(0, Math.round(Number(general.hoverCloseDelayMs)));
    }
    if (typeof general.showOnHover === 'boolean') {
      patch.showOnHover = general.showOnHover;
    }
    try {
      config.save(patch);
    } catch (err) {
      // El disco ha fallado: se le dice al usuario, no "Guardado".
      return { ok: false, error: err.message, accounts };
    }
    onSaved();
    return { ok: true, accounts };
  });

  ipcMain.handle('settings:test', (_event, payload) => test(payload));

  ipcMain.handle('settings:reveal', () => {
    const file = config.configPath();
    shell.showItemInFolder(file);
    return { ok: true, path: file };
  });

  ipcMain.on('settings:close', () => {
    if (win && !win.isDestroyed()) win.close();
  });
}

module.exports = { open, get, register, snapshot, test, sanitizeAccounts };
