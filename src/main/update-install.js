'use strict';

/**
 * Instalación real de una actualización: bajarse el binario, instalarlo en su
 * sitio y volver a abrir la app. Es la parte con efectos (red, disco,
 * procesos), separada de la decisión (mirar si hay algo nuevo), que está en
 * `updates.js` y se prueba en Node puro.
 *
 * Por qué no `electron-updater`: su constructor exige una versión semver
 * ESTRICTA, y las betas del proyecto llevan cuatro dígitos
 * (`1.1.0-beta.0002`), que semver declara inválidas: `semver.gt()` lanza
 * "Invalid Version". Aquí la comparación la hace `updates.compareVersions`,
 * que entiende ese formato a propósito (ver scripts/test-updates.js).
 *
 * Estrategia por plataforma:
 *   - **Windows (NSIS)**: se lanza el instalador en silencio (`/S
 *     --updated`), esperando a que termine, y luego se abre la app. El
 *     instalador es por usuario (`%LOCALAPPDATA%\Programs\Usagia`), así que no
 *     pide UAC.
 *   - **Linux (AppImage)**: el binario nuevo se baja al lado del actual y se
 *     reemplaza; luego se relanza.
 *   - Portable, `.deb` y macOS: no se instala nada (el enlace a la release
 *     sigue estando a mano).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/** Carpeta de descargas del actualizador (dentro de los datos de la app). */
function updaterDir(userDataDir) {
  return path.join(userDataDir, 'updater');
}

/** Ruta del registro del actualizador (lo comparten la app y el .cmd). */
function logPath(userDataDir) {
  return path.join(updaterDir(userDataDir), 'update.log');
}

/**
 * Anota una línea en el registro del actualizador.
 *
 * La app corre sin consola (bandeja), así que si una actualización falla en la
 * máquina del usuario no habría forma de saber por qué: esto es lo que queda.
 * Se recorta solo si crece mucho, y **nunca** lanza: un fallo al escribir el
 * log no puede tumbar una actualización.
 *
 * @param {string} userDataDir
 * @param {string} message
 * @param {{fsImpl?: object, maxBytes?: number, now?: Date}} opts
 * @returns {boolean} si se pudo escribir
 */
function appendLog(userDataDir, message, opts = {}) {
  const { fsImpl = fs, maxBytes = 256 * 1024, now = new Date() } = opts;
  try {
    const dir = updaterDir(userDataDir);
    const file = logPath(userDataDir);
    fsImpl.mkdirSync(dir, { recursive: true });
    // Recorte: si el log ya es grande, se empieza de cero en vez de crecer
    // sin límite (son pocas líneas, pero la app vive meses en la bandeja).
    try {
      if (fsImpl.statSync(file).size > maxBytes) fsImpl.writeFileSync(file, '', 'utf8');
    } catch {
      /* no existía */
    }
    const line = `[${now.toISOString()}] ${message}\n`;
    fsImpl.appendFileSync(file, line, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Ruta donde se baja un asset concreto. */
function downloadPath(userDataDir, assetName) {
  // Solo el nombre: un asset no puede venir con separadores de ruta.
  return path.join(updaterDir(userDataDir), path.basename(String(assetName || 'update.bin')));
}

/**
 * Script `.cmd` que instala en silencio y (si toca) vuelve a abrir la app.
 *
 * Se genera un fichero en vez de encadenar comandos en la línea de `spawn`
 * porque las rutas de Windows llevan espacios (`Program Files`, nombres de
 * usuario) y así no hay que escapar nada por tres capas.
 *
 * El `ping` es un "espera N s": al lanzar el instalador la app aún se está
 * cerrando, y si el `.exe` sigue abierto el instalador NSIS **aborta con
 * código 2** y no instala nada (comprobado: pasa con el instalador de
 * cualquier versión). (`timeout` no vale: falla cuando no hay consola.)
 *
 * Si el instalador falla, se deja un marcador `failed-<version>` y se vuelve
 * a abrir la app: sin eso, el usuario se queda sin app, sin saber qué pasó y
 * con la misma actualización pendiente para siempre.
 *
 * @param {{installer: string, exe?: string, relaunch?: boolean, log?: string, sleepSeconds?: number,
 *          version?: string, failMarker?: string}} opts
 * @returns {string} contenido del .cmd
 */
function installScript(opts) {
  const { installer, exe, relaunch = true, log, sleepSeconds = 3, version, failMarker } = opts || {};
  const lines = ['@echo off'];
  if (log) lines.push(`echo [%DATE% %TIME%] empieza la instalacion>>"${log}"`);
  if (sleepSeconds > 0) lines.push(`ping -n ${Math.floor(sleepSeconds) + 1} 127.0.0.1 >nul`);
  // `start /wait` es lo que hace que el script espere al instalador NSIS.
  lines.push(`start /wait "" "${installer}" /S --updated`);
  lines.push('if errorlevel 1 goto fallo');
  if (log) lines.push(`echo [%DATE% %TIME%] instalado>>"${log}"`);
  if (relaunch && exe) lines.push(`start "" "${exe}"`);
  lines.push('exit /b 0');
  lines.push(':fallo');
  if (log) lines.push(`echo [%DATE% %TIME%] el instalador FALLO (errorlevel %ERRORLEVEL%)>>"${log}"`);
  if (failMarker) lines.push(`echo ${version || 'desconocida'}>"${failMarker}"`);
  // Si la instalación la pidió el usuario, la app tiene que volver aunque el
  // instalador falle: si no, se queda sin bandeja y sin saber por qué. Si era
  // la instalación al salir, no se relanza (el usuario está cerrando).
  if (relaunch && exe) lines.push(`start "" "${exe}"`);
  lines.push('exit /b 1');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Marcador de "esta versión no se pudo instalar", para no reintentarla en
 * bucle en cada arranque (queda el enlace a la release, a mano).
 */
function failMarkerPath(userDataDir, version) {
  return path.join(updaterDir(userDataDir), `failed-${String(version || 'desconocida').replace(/[^\w.-]/g, '_')}`);
}

/** ¿Falló ya la instalación de esta versión? */
function hasFailed(userDataDir, version, opts = {}) {
  const { fsImpl = fs } = opts;
  try {
    return fsImpl.existsSync(failMarkerPath(userDataDir, version));
  } catch {
    return false;
  }
}

/** Escribe el `.cmd` en la carpeta temporal y devuelve su ruta. */
function writeInstallScript(content, name = 'usagia-update.cmd') {
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

/**
 * Lanza un `.cmd` suelto (sin esperar ni capturar salida) para que siga
 * viviendo después de que la app se cierre.
 *
 * Se usa `wscript` con un VBScript mínimo para ejecutar el CMD **sin
 * ventana visible**: `windowsHide: true` de Node no oculta la ventana
 * de un proceso CMD que a su vez hace `ping` (el ping abre su propia
 * consola). El VBScript con `vbHide` la oculta de verdad.
 */
function runDetached(file, args = [], spawnImpl = spawn) {
  // VBScript que lanza el CMD oculto.
  const vbs = path.join(os.tmpdir(), 'usagia-update-hidden.vbs');
  const cmdLine = `"${process.env.ComSpec || 'cmd.exe'}" /c "${file}"`;
  fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run ${JSON.stringify(cmdLine)}, 0, False\n`, 'utf8');

  const child = spawnImpl('wscript.exe', [vbs], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child && typeof child.unref === 'function') child.unref();
  return child;
}

/**
 * Descarga un fichero con el `net` de Electron (sigue las redirecciones de
 * GitHub y usa la pila de red de Chromium, con su proxy y sus certificados).
 *
 * @param {string} url
 * @param {string} dest
 * @param {{onProgress?: (info: {received: number, total: number, percent: number}) => void, expectedSize?: number, net?: object, fsImpl?: object}} opts
 * @returns {Promise<{file: string, bytes: number}>}
 */
function download(url, dest, opts = {}) {
  const { onProgress, expectedSize = 0, fsImpl = fs } = opts;
  // Se pide a Electron en el momento: este modulo tambien se carga en las
  // pruebas de Node puro (donde `electron` es solo una ruta).
  const electronNet = opts.net || require('electron').net;

  return new Promise((resolve, reject) => {
    fsImpl.mkdirSync(path.dirname(dest), { recursive: true });
    const partial = `${dest}.part`;
    const out = fsImpl.createWriteStream(partial);
    let received = 0;
    let total = expectedSize > 0 ? expectedSize : 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        out.destroy();
      } catch {
        /* puede no haber llegado a abrirse */
      }
      try {
        fsImpl.unlinkSync(partial);
      } catch {
        /* puede no existir */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    // Sin esto, un disco lleno o un permiso denegado dejaba la promesa colgada
    // para siempre (y el fichero a medias sin que nadie se enterara): lo cazó
    // la prueba contra un instalador de verdad, no la suite.
    out.on('error', fail);

    const request = electronNet.request({ url, redirect: 'follow' });
    request.on('error', fail);
    request.on('response', (response) => {
      const status = Number(response.statusCode) || 0;
      if (status !== 200) {
        fail(new Error(`la descarga respondio HTTP ${status}`));
        return;
      }
      if (!total) total = Number(response.headers['content-length']) || 0;

      response.on('data', (chunk) => {
        received += chunk.length;
        // Contrapresión: si el disco no da abasto, se para de leer hasta que
        // el stream drene. Con 100 MB en memoria también funcionaría, pero no
        // hay razón para gastarlos.
        if (out.write(chunk) === false && typeof response.pause === 'function') {
          response.pause();
          out.once('drain', () => response.resume());
        }
        if (typeof onProgress === 'function') {
          onProgress({ received, total, percent: require('./updates').downloadPercent(received, total) });
        }
      });
      response.on('error', fail);
      response.on('end', () => {
        out.end(() => {
          if (settled) return;
          // Integridad barata: el tamaño que anuncia GitHub tiene que cuadrar.
          if (total > 0 && received !== total) {
            fail(new Error(`la descarga quedo incompleta (${received} de ${total} bytes)`));
            return;
          }
          let existe = true;
          try {
            existe = typeof fsImpl.existsSync !== 'function' ? true : fsImpl.existsSync(partial);
          } catch {
            existe = false;
          }
          if (!existe) {
            fail(new Error('la descarga no llego a escribir el fichero'));
            return;
          }
          try {
            fsImpl.renameSync(partial, dest);
          } catch (err) {
            fail(err);
            return;
          }
          settled = true;
          resolve({ file: dest, bytes: received });
        });
      });
    });
    request.end();
  });
}

/**
 * Instala la actualización en Windows: escribe el `.cmd` y lo lanza suelto.
 * @returns {{script: string, cmd: string}}
 */
function installWindows(opts) {
  const { installer, exe, relaunch = true, log, sleepSeconds = 3, version, userDataDir } = opts || {};
  const failMarker = userDataDir ? failMarkerPath(userDataDir, version) : undefined;
  const script = installScript({ installer, exe, relaunch, log, sleepSeconds, version, failMarker });
  const cmd = writeInstallScript(script, `usagia-update-${Date.now()}.cmd`);
  runDetached(cmd);
  return { script, cmd, failMarker };
}

/**
 * Instala la actualización en Linux: reemplaza el AppImage en su sitio.
 * @returns {{ok: boolean, file: string}}
 */
function installAppImage(opts) {
  const { downloaded, current } = opts || {};
  fs.chmodSync(downloaded, 0o755);
  fs.renameSync(downloaded, current);
  return { ok: true, file: current };
}

/** Relanza la app (un binario nuevo) sin esperar a que termine. */
function relaunch(exePath, args = []) {
  const child = spawn(exePath, args, { detached: true, stdio: 'ignore', windowsHide: true });
  if (child && typeof child.unref === 'function') child.unref();
  return child;
}

module.exports = {
  updaterDir,
  logPath,
  appendLog,
  downloadPath,
  failMarkerPath,
  hasFailed,
  installScript,
  writeInstallScript,
  runDetached,
  download,
  installWindows,
  installAppImage,
  relaunch,
};
