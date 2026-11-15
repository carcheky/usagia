'use strict';

// Deteccion de la zona del icono de bandeja para saber si el puntero esta
// encima (y entonces mostrar la tarjeta).
//
//  - macOS / Linux: Electron da el rectangulo real del icono (tray.getBounds).
//  - Windows: el shell es dueno del icono, asi que se localiza por UI
//    Automation usando el texto del tooltip como marca. UI Automation devuelve
//    pixeles fisicos, asi que se convierten a DIP (unidades de Electron).

const { execFile } = require('child_process');
const path = require('path');
const { screen } = require('electron');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'find-tray-icon.ps1');
const WIN_CACHE_MS = 10000;

let winCache = { at: 0, rect: null, hidden: false };

function runPowerShell(args, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args],
      { timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/** Convierte pixeles fisicos (UI Automation) a DIP de Electron. */
function physicalToDip(rect) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  for (const display of screen.getAllDisplays()) {
    const s = display.scaleFactor || 1;
    const dipX = centerX / s;
    const dipY = centerY / s;
    const b = display.bounds;
    if (dipX >= b.x && dipX <= b.x + b.width && dipY >= b.y && dipY <= b.y + b.height) {
      return {
        x: rect.x / s,
        y: rect.y / s,
        width: rect.width / s,
        height: rect.height / s,
      };
    }
  }
  const s = screen.getPrimaryDisplay().scaleFactor || 1;
  return { x: rect.x / s, y: rect.y / s, width: rect.width / s, height: rect.height / s };
}

/**
 * Rectangulo del icono de bandeja en coordenadas de pantalla (DIP).
 * @returns {Promise<{rect: object|null, hidden: boolean}>}
 */
async function getTrayAnchor(tray, marker = 'Usagia') {
  if (process.platform === 'win32') {
    const now = Date.now();
    if (now - winCache.at < WIN_CACHE_MS && winCache.rect) {
      return { rect: winCache.rect, hidden: winCache.hidden };
    }

    const res = await runPowerShell(['-Marker', marker]);
    if (res && res.ok) {
      const rect = physicalToDip({ x: res.x, y: res.y, width: res.w, height: res.h });
      winCache = { at: now, rect, hidden: false };
      return { rect, hidden: false };
    }
    if (res && res.hidden && res.trayW > 0) {
      // El icono esta en "iconos ocultos": se usa el area de notificacion
      // visible como aproximacion.
      const rect = physicalToDip({
        x: res.trayX,
        y: res.trayY,
        width: res.trayW,
        height: res.trayH,
      });
      winCache = { at: now, rect, hidden: true };
      return { rect, hidden: true };
    }
    winCache = { at: now, rect: null, hidden: false };
    return { rect: null, hidden: false };
  }

  // macOS y Linux: Electron conoce el rectangulo del icono.
  try {
    const bounds = tray.getBounds();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return { rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, hidden: false };
    }
  } catch {
    /* sin soporte de bandeja: sin zona de hover */
  }
  return { rect: null, hidden: false };
}

/** ¿El punto (x,y) cae dentro del rectangulo (con margen)? */
function inside(point, rect, margin = 4) {
  if (!rect) return false;
  return (
    point.x >= rect.x - margin &&
    point.x <= rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.height + margin
  );
}

/** Rectangulo del area de notificacion como ultimo recurso en Windows. */
function taskbarFallbackRect() {
  if (process.platform !== 'win32') return null;
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const taskbarHeight = display.bounds.height - height;
  if (taskbarHeight <= 0) return null;
  return { x: x + width - 260, y: y + height, width: 260, height: taskbarHeight };
}

module.exports = { getTrayAnchor, inside, taskbarFallbackRect };
