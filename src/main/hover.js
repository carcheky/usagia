'use strict';

// Deteccion de la zona del icono de bandeja para saber si el puntero esta
// encima (y entonces mostrar la tarjeta).
//
//  - macOS / Linux: Electron da el rectangulo real del icono (tray.getBounds).
//  - Windows: el shell es dueno del icono, asi que se localiza por UI
//    Automation usando el texto del tooltip como marca. UI Automation devuelve
//    pixeles fisicos, asi que se convierten a DIP (unidades de Electron).

const { execFile } = require('child_process');
const fs = require('fs');
const { screen } = require('electron');
const scriptPath = require('./local/script-path');

const SCRIPT = scriptPath.script('find-tray-icon.ps1');

// Cada consulta a PowerShell cuesta ~0,5-1,5 s de CPU (arrancar el proceso,
// cargar UIAutomation y compilar el tipo con Add-Type). El timer de sondeo del
// ancla corre cada 10 s, asi que con una cache de 10 s el trabajo se repetia
// SIEMPRE: la cache no llegaba a acertar nunca.
//
// Ahora la cache vive bastante mas que el timer:
//   - icono localizado: 60 s (su posicion no cambia sola)
//   - "iconos ocultos":  20 s (hay que notar pronto que el usuario lo
//     arrastra a la zona visible de la bandeja)
//   - fallo:              5 s (se reintenta pronto, sin martillear)
//
// El cache se invalida cuando cambia la disposicion de pantallas (ver
// `invalidate()`), que es lo unico que puede mover el icono o cambiar el
// factor de escala con el que se converts pixeles fisicos a DIP.
const WIN_CACHE_MS = 60000;
const WIN_CACHE_HIDDEN_MS = 20000;
const WIN_CACHE_FAIL_MS = 5000;

// Cache vigente: { rect, hidden, expiresAt }.
let winCache = null;
// Consulta en marcha: no se lanzan dos PowerShell a la vez.
let winPending = null;
// Sube al invalidar: un resultado que llega de una consulta ya invalidada
// no se guarda en la cache.
let winGeneration = 0;

if (process.argv.includes('--verbose')) {
  console.log(`[usagia] script de bandeja: ${SCRIPT} (existe: ${fs.existsSync(SCRIPT)})`);
}

function runPowerShell(args, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args],
      { timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          if (process.argv.includes('--verbose')) {
            console.log(
              `[usagia] el script de bandeja fallo: ${err.message} ${String(stderr || '').slice(0, 300)}`
            );
          }
          return resolve(null);
        }
        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch {
          if (process.argv.includes('--verbose')) {
            console.log(`[usagia] salida ilegible: ${String(stdout).slice(0, 200)}`);
          }
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
    if (winCache && winCache.expiresAt > now) {
      return { rect: winCache.rect, hidden: winCache.hidden };
    }
    // Ya hay una consulta en marcha: se comparte su resultado en vez de
    // lanzar otro PowerShell en paralelo.
    if (winPending) return winPending;

    const generation = winGeneration;
    winPending = (async () => {
      const res = await runPowerShell(['-Marker', marker]);
      let rect = null;
      let hidden = false;
      let ttl = WIN_CACHE_FAIL_MS;

      if (res && res.ok) {
        rect = physicalToDip({ x: res.x, y: res.y, width: res.w, height: res.h });
        hidden = false;
        ttl = WIN_CACHE_MS;
      } else if (res && res.hidden && res.trayW > 0) {
        // El icono esta en "iconos ocultos": se usa el area de notificacion
        // visible como aproximacion.
        rect = physicalToDip({
          x: res.trayX,
          y: res.trayY,
          width: res.trayW,
          height: res.trayH,
        });
        hidden = true;
        ttl = WIN_CACHE_HIDDEN_MS;
      }

      // Si la cache se invalido mientras corria PowerShell, el resultado
      // puede estar caducado: no se guarda.
      if (generation === winGeneration) {
        winCache = { rect, hidden, expiresAt: Date.now() + ttl };
      }
      return { rect, hidden };
    })().finally(() => {
      winPending = null;
    });

    return winPending;
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

/**
 * Invalida la cache del icono de bandeja.
 *
 * Se llama cuando cambia la disposicion de pantallas (`display-metrics-changed`,
 * `display-added`, `display-removed`): el icono puede haberse movido y el
 * factor de escala con el que se convierten los pixeles fisicos a DIP tambien.
 * La siguiente consulta vuelve a lanzar PowerShell.
 */
function invalidate() {
  winCache = null;
  winGeneration += 1;
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

module.exports = { getTrayAnchor, inside, taskbarFallbackRect, invalidate };
