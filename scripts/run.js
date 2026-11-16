'use strict';

// Lanzador de la app con watchdog.
//
// Electron se comporta como Node si la variable ELECTRON_RUN_AS_NODE esta
// activa (pasa en algunos entornos), asi que la quitamos antes de arrancar.
//
// El watchdog relanza la app si Electron muere de forma anormal (codigo != 0),
// por ejemplo si alguien la mata desde otra sesion. Un cierre normal desde el
// menu de la bandeja (codigo 0) NO se relanza.

const { spawn } = require('child_process');
const { constants: OS_CONSTANTS } = require('os');
const path = require('path');

const electronPath = require('electron');
const appRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 1500;
// Si el hijo llego a vivir mas que esto, la caida no cuenta como "seguida":
// el contador mide rachas, no caidas repartidas por toda la vida de la app.
// Antes no se reiniciaba nunca y tras 10 caidas en meses la app dejaba de
// relanzarse para siempre.
const HEALTHY_LIFETIME_MS = 5 * 60 * 1000;
// Margen entre SIGTERM y SIGKILL al parar el watchdog.
const KILL_GRACE_MS = 3000;

// Un sondeo es de una sola vez: si falla, reintentar 10 veces solo multiplica
// el tiempo de espera del job de CI. El watchdog es para la app de bandeja,
// que debe vivir siempre.
const ONE_SHOT = args.includes('--probe') || args.includes('--preview');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let child = null;
let restartTimer = null;
let restarts = 0;
let stopping = false;
let launchedAt = 0;

// Morir por senal llega como code=null. Traducirlo a 128+senal permite
// distinguirlo de un cierre limpio (codigo 0) sin inventar un 0 falso.
function signalExitCode(signal) {
  const number = OS_CONSTANTS.signals[signal];
  return number ? 128 + number : 1;
}

function launch() {
  // Un solo hijo a la vez: si el anterior sigue vivo (evento de salida
  // duplicado, timer repetido), este arranque sobra y se ignora. Asi no se
  // solapan dos instancias del watchdog ni dos Electron.
  if (child && child.exitCode === null && child.signalCode === null) return child;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const spawned = spawn(electronPath, [appRoot, ...args], {
    env,
    stdio: 'inherit',
    windowsHide: false,
  });

  child = spawned;
  launchedAt = Date.now();

  spawned.on('exit', (code, signal) => {
    // El hijo ya no existe: se suelta la referencia antes de nada para que un
    // relanzamiento no se confunda con el proceso anterior. Se mide su vida
    // ahora mismo y se descarta: un evento duplicado no debe heredar la vida
    // del hijo anterior y resetear la racha por error.
    const livedMs = launchedAt ? Date.now() - launchedAt : 0;
    launchedAt = 0;
    if (child === spawned) child = null;
    if (stopping) return;

    const killedBySignal = code === null;
    const exitCode = killedBySignal ? signalExitCode(signal) : code;

    if (code === 0 || ONE_SHOT) {
      if (code !== 0) console.error(`[usagia] Electron termino con codigo ${exitCode} (${signal}).`);
      // `code || 0` convertia una muerte por senal (code=null) en un exit 0,
      // que parece un cierre limpio. Con senal se propaga 128+N.
      process.exit(killedBySignal ? exitCode : code || 0);
    }

    // Una vida larga rompe la racha de caidas seguidas.
    if (livedMs > HEALTHY_LIFETIME_MS) restarts = 0;

    restarts += 1;
    if (restarts > MAX_RESTARTS) {
      console.error(
        `[usagia] Electron termino con codigo ${exitCode} (${signal}). Abandono tras ${MAX_RESTARTS} reintentos.`
      );
      process.exit(killedBySignal ? exitCode : code || 1);
    }
    console.warn(
      `[usagia] Electron termino con codigo ${exitCode} (${signal}). Relanzando (${restarts}/${MAX_RESTARTS})...`
    );
    restartTimer = setTimeout(() => {
      restartTimer = null;
      launch();
    }, RESTART_DELAY_MS);
  });

  spawned.on('error', (err) => {
    console.error('[usagia] no se pudo arrancar Electron:', err.message);
    if (child === spawned) child = null;
    process.exit(1);
  });

  return spawned;
}

launch();

// Al cerrar el watchdog, el hijo Electron NO muere solo: se quedaria huerfano
// en la bandeja (y ademas la instancia unica ocupada, sin poder volver a abrir
// la app). Se le manda SIGTERM y, si no se va en KILL_GRACE_MS, SIGKILL.
function stop() {
  if (stopping) return;
  stopping = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const running = child;
  if (!running) {
    process.exit(0);
    return;
  }

  // El plazo se arma ANTES del SIGTERM: si el proceso muere entre el kill y
  // la suscripcion al evento, no queremos quedarnos esperando al hijo muerto.
  const forceKill = setTimeout(() => {
    try {
      running.kill('SIGKILL');
    } catch {
      /* ya no existe */
    }
    process.exit(0);
  }, KILL_GRACE_MS);
  running.once('exit', () => {
    clearTimeout(forceKill);
    process.exit(0);
  });
  try {
    running.kill('SIGTERM');
  } catch {
    clearTimeout(forceKill);
    process.exit(0);
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
