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
const path = require('path');

const electronPath = require('electron');
const appRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 1500;

// Un sondeo es de una sola vez: si falla, reintentar 10 veces solo multiplica
// el tiempo de espera del job de CI. El watchdog es para la app de bandeja,
// que debe vivir siempre.
const ONE_SHOT = args.includes('--probe') || args.includes('--preview');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let restarts = 0;
let stopping = false;

function launch() {
  const child = spawn(electronPath, [appRoot, ...args], {
    env,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (code === 0 || ONE_SHOT) {
      if (code !== 0) console.error(`[usagia] Electron termino con codigo ${code} (${signal}).`);
      process.exit(code || 0);
    }
    restarts += 1;
    if (restarts > MAX_RESTARTS) {
      console.error(`[usagia] Electron termino con codigo ${code} (${signal}). Abandono tras ${MAX_RESTARTS} reintentos.`);
      process.exit(code || 1);
    }
    console.warn(
      `[usagia] Electron termino con codigo ${code} (${signal}). Relanzando (${restarts}/${MAX_RESTARTS})...`
    );
    setTimeout(launch, RESTART_DELAY_MS);
  });

  child.on('error', (err) => {
    console.error('[usagia] no se pudo arrancar Electron:', err.message);
    process.exit(1);
  });

  return child;
}

launch();

process.on('SIGINT', () => {
  stopping = true;
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopping = true;
  process.exit(0);
});
