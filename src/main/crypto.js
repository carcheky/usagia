'use strict';

// Cifrado de credenciales con safeStorage de Electron.
//
// - Electron: usa DPAPI en Windows, Keychain en macOS, kwallet/gnome-keyring en
//   Linux. El cifrado es por usuario del sistema: lo que cifra un usuario no lo
//   puede descifrar otro.
// - Node puro (scripts/probe.js, el pipeline de CI): safeStorage no existe.
//   Las credenciales cifradas NO se pueden leer; la cascada las salta.
//
// El formato de texto cifrado es "enc:v1:<base64>", donde el base64 es el
// resultado de safeStorage.encryptString(). Un texto que no empieza con
// "enc:v1:" se trata como texto plano (compatibilidad con configuraciones
// anteriores).

const PREFIX = 'enc:v1:';

/**
 * Devuelve safeStorage de Electron, o null si no está disponible (Node puro,
 * Linux sin keyring, app no lista).
 */
function safeStorage() {
  try {
    const electron = require('electron');
    const ss = electron && electron.safeStorage;
    if (!ss || typeof ss.isEncryptionAvailable !== 'function') return null;
    // En Linux, safeStorage puede existir pero no estar disponible.
    if (!ss.isEncryptionAvailable()) return null;
    return ss;
  } catch {
    return null;
  }
}

/**
 * Indica si el cifrado está disponible.
 */
function isAvailable() {
  return safeStorage() !== null;
}

/**
 * Cifra una cadena de texto.
 * @param {string} text Texto a cifrar.
 * @returns {string} Texto cifrado con prefijo "enc:v1:", o el texto original si
 *   el cifrado no está disponible.
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  const ss = safeStorage();
  if (!ss) return text;
  try {
    const buffer = ss.encryptString(text);
    return PREFIX + buffer.toString('base64');
  } catch {
    // Fallo inesperado: no reventar, dejar en claro.
    return text;
  }
}

/**
 * Descifra una cadena de texto.
 * @param {string} text Texto a descifrar (con o sin prefijo).
 * @returns {string|null} Texto descifrado, o null si no se pudo descifrar
 *   (cifrado en otra máquina, Node puro, etc.). Un texto sin prefijo se
 *   devuelve tal cual.
 */
function decrypt(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.startsWith(PREFIX)) return text;

  const ss = safeStorage();
  if (!ss) {
    // Node puro o sin keyring: no se puede descifrar. Devolver null para que
    // la cascada de credenciales lo salte.
    return null;
  }

  try {
    const base64 = text.slice(PREFIX.length);
    const buffer = Buffer.from(base64, 'base64');
    return ss.decryptString(buffer);
  } catch {
    // Cifrado inválido o de otro usuario: devolver null.
    return null;
  }
}

/**
 * Indica si un texto está cifrado (tiene el prefijo).
 */
function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(PREFIX);
}

module.exports = {
  isAvailable,
  encrypt,
  decrypt,
  isEncrypted,
};
