'use strict';

// Simula el entorno de CI: sin ~/.dsh, sin ~/.claude, sin credenciales de
// Windows. El job `verify` del pipeline ejecuta `node scripts/probe.js`
// en un runner limpio, y si el sondeo falla al no encontrar credenciales,
// TODAS las releases se bloquean.
//
// Comprueba que: (1) termina con codigo 0, (2) los cuatro proveedores
// responden "unconfigured" (no un error), (3) no revienta.
//
// NOTA: el sondeo va en Node PURO a proposito. Con Electron, en un entorno sin
// HOME valido, Chromium revienta con STATUS_BREAKPOINT (0x80000003) y el
// proceso muere sin decir nada: por eso el pipeline no arranca la GUI.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = path.join(__dirname, '..');
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'usagia-ci-'));

console.log(`HOME simulado (sin credenciales): ${fakeHome}`);

const env = {
  ...process.env,
  USERPROFILE: fakeHome,
  HOME: fakeHome,
  APPDATA: path.join(fakeHome, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(fakeHome, 'AppData', 'Local'),
  MINIMAX_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GOOGLE_API_KEY: '',
  // El Administrador de credenciales de Windows es del SISTEMA: un HOME falso
  // no lo esconde, y su credencial de Antigravity no se puede renovar sin el
  // IDE instalado (LOCALAPPDATA tambien es falso). Sin esta variable, el
  // sondeo fallaria en la maquina del autor y daria un falso positivo: en el
  // runner de CI no hay ninguna credencial guardada, asi que alli no hace falta.
  USAGIA_SIMULATE_CLEAN_ENV: '1',
};
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(process.execPath, [path.join(repo, 'scripts', 'probe.js')], {
  cwd: repo,
  env,
  encoding: 'utf8',
  timeout: 120000,
});

const out = `${result.stdout || ''}${result.stderr || ''}`;
console.log(`\ncodigo de salida: ${result.status}`);
console.log('\n--- salida ---');
console.log(out.trim().split('\n').slice(0, 60).join('\n'));

// Cada proveedor deberia aparecer con status unconfigured.
const providers = ['minimax', 'claude', 'antigravity', 'deepseek'];
const missing = providers.filter((p) => !out.includes(`=== ${p} ===`));
const errors = providers.filter((p) => {
  const i = out.indexOf(`=== ${p} ===`);
  if (i < 0) return false;
  const block = out.slice(i, out.indexOf('===', i + 5) < 0 ? undefined : out.indexOf('===', i + 5));
  return /"status": "error"/.test(block);
});

console.log(`\nproveedores sin salida: ${missing.length ? missing.join(', ') : 'ninguno'}`);
console.log(`proveedores en error:   ${errors.length ? errors.join(', ') : 'ninguno'}`);

fs.rmSync(fakeHome, { recursive: true, force: true });

const ok = result.status === 0 && !missing.length && !errors.length;
console.log(`\n${ok ? 'OK' : 'FALLO'}: el job verify puede correr en CI.`);
process.exit(ok ? 0 : 1);
