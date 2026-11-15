'use strict';

// Rutas de los scripts de PowerShell que la app ejecuta en tiempo de ejecucion.
//
// En un paquete, los ficheros viven dentro de `app.asar`, que es un ARCHIVO
// con un sistema de ficheros virtual: Electron lo parchea para `fs`, pero
// PowerShell no lo entiende y no puede ejecutar un `.ps1` que este dentro
// ("bad option"/"no se encuentra"). Por eso los scripts se desempaquetan
// (asarUnpack en package.json) y aqui se traduce la ruta a su equivalente
// real en `app.asar.unpacked`.
//
// Sin esto, en la app instalada: la tarjeta NUNCA salia al pasar el raton
// (faltaba find-tray-icon.ps1 para localizar el icono), Antigravity ponia
// "sin credencial" (faltaba cred-read.ps1) y Claude solo mostrava las
// transcripciones locales (faltaba get-claude-usage.ps1).

const fs = require('fs');
const path = require('path');

// Raiz del proyecto o de la app instalada: src/main/local -> src/main -> src -> raiz
const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Traduce una ruta dentro de app.asar a su ruta real en app.asar.unpacked.
 * Si el fichero no esta desempaquetado, se devuelve la ruta original.
 */
function realPath(file) {
  const marker = 'app.asar';
  const index = file.indexOf(`${marker}${path.sep}`);
  if (index < 0) return file;
  // El separador va despues de "app.asar": hay que conservarlo, o la ruta
  // sale como "app.asar.unpackedscripts\..." y no existe.
  const unpacked = `${file.slice(0, index)}${marker}.unpacked${file.slice(index + marker.length)}`;
  try {
    if (fs.existsSync(unpacked)) return unpacked;
  } catch {
    /* si no se puede comprobar, se deja la ruta original */
  }
  return file;
}

/** Ruta real de un script de la carpeta `scripts/`. */
function script(...parts) {
  return realPath(path.join(ROOT, 'scripts', ...parts));
}

module.exports = { script, realPath, ROOT };
