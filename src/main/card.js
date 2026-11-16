'use strict';

// Tarjeta flotante que se muestra al pasar el ratón por el icono de la bandeja.

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const CARD_WIDTH = 380;

let win = null;
let anchor = null;
let interactive = false;

function create(preloadPath) {
  win = new BrowserWindow({
    width: CARD_WIDTH,
    height: 240,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    roundedCorners: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // El preload solo usa contextBridge e ipcRenderer: no necesita el
      // sandbox desactivado, y con sandbox:true el renderer queda aislado
      // del sistema de ficheros.
      sandbox: true,
    },
  });

  // La tarjeta nunca debe robar el foco ni impedir clics en lo que hay debajo.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL('app://bundle/card.html');
  win.webContents.on('did-finish-load', () => {
    if (process.argv.includes('--preview')) console.log('[usagia] card cargada');
  });
  if (process.argv.includes('--verbose')) {
    win.webContents.on('console-message', (_event, level, message) => {
      console.log(`[tarjeta] ${message}`);
    });
  }
  win.on('closed', () => {
    win = null;
  });
  return win;
}

function get() {
  return win;
}

/** Recoloca la tarjeta respecto al icono de bandeja. */
function position(size) {
  if (!win) return;
  const width = size?.width || CARD_WIDTH;
  const height = size?.height || 240;

  // Sin icono localizado (p. ej. en "iconos ocultos"): esquina inferior
  // derecha del area de trabajo.
  if (!anchor) {
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    win.setBounds({
      x: Math.round(area.x + area.width - width - 12),
      y: Math.round(area.y + area.height - height - 12),
      width,
      height,
    });
    return;
  }

  const display = screen.getDisplayMatching({
    x: anchor.x,
    y: anchor.y,
    width: anchor.width,
    height: anchor.height,
  });
  const area = display.workArea;

  let x;
  let y;
  if (process.platform === 'darwin') {
    // Barra de menús superior: la tarjeta cuelga hacia abajo, alineada a la izquierda.
    x = anchor.x - 6;
    y = anchor.y + anchor.height + 6;
  } else {
    // Barra de tareas inferior: la tarjeta sube, alineada a la derecha del icono.
    x = anchor.x + anchor.width - width + 6;
    y = anchor.y - height - 8;
  }

  // Ajuste a la pantalla (por ejemplo, iconos muy a la izquierda).
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - height - 8));

  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

/** Ajusta la ventana al tamaño real del contenido y la recoloca. */
function resize(size) {
  if (!win || !size) return;
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  if (!width || !height) return;
  const current = win.getSize();
  if (current[0] === width && current[1] === height) return;
  win.setSize(width, height);
  position({ width, height });
}

function setAnchor(rect) {
  anchor = rect;
}

/**
 * La tarjeta es "click-through" para no tapar la barra de tareas: los clics
 * pasan de largo. Cuando el puntero esta ENCIMA de la tarjeta se vuelve
 * interactiva, para que se puedan pulsar sus botones (el de configuracion).
 */
function setInteractive(on) {
  if (!win) return;
  const value = Boolean(on);
  if (value === interactive) return;
  interactive = value;
  win.setIgnoreMouseEvents(!value, { forward: !value });
  if (process.argv.includes('--verbose')) {
    console.log(`[usagia] tarjeta interactiva=${value}`);
  }
}

function isInteractive() {
  return interactive;
}

function show() {
  if (!win) return;
  // Se recoloca SIEMPRE al mostrarse: el ancla puede haber cambiado desde la
  // ultima vez (o no existir aun la primera vez, con lo que la tarjeta se
  // habia quedado en la esquina de respaldo) y position() solo se llamaba
  // cuando cambiaba el tamano del contenido.
  const [width, height] = win.getSize();
  position({ width, height });
  win.showInactive();
}

function hide() {
  if (!win) return;
  setInteractive(false);
  win.hide();
}

function isVisible() {
  return Boolean(win && win.isVisible());
}

function send(channel, payload) {
  if (!win) return;
  win.webContents.send(channel, payload);
}

function bounds() {
  if (!win) return null;
  return win.getBounds();
}

module.exports = {
  create,
  get,
  position,
  resize,
  setAnchor,
  setInteractive,
  isInteractive,
  show,
  hide,
  isVisible,
  send,
  bounds,
  CARD_WIDTH,
};
