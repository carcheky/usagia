'use strict';

// Tests del cifrado de credenciales.
//
// En Node puro (donde corren las pruebas) safeStorage NO existe, así que el
// cifrado cae a "dejar en claro". Lo que se prueba aquí es:
// 1. El formato enc:v1:<base64> se reconoce.
// 2. Sin safeStorage, encrypt() devuelve el texto tal cual.
// 3. Sin safeStorage, decrypt() de un texto cifrado devuelve null.
// 4. Las cuentas con credenciales cifradas se marcan con _encrypted.
// 5. La cascada de credenciales salta las cifradas en Node puro.

const path = require('path');
const t = require('./test-lib');

const { fakeHome, check, finish } = t;
fakeHome();

const crypto = require(path.join(__dirname, '..', 'src', 'main', 'crypto'));
const config = require(path.join(__dirname, '..', 'src', 'main', 'config'));

// Limpiar la caché entre pruebas.
function resetConfig() {
  config.invalidate();
}

// === crypto.js ===

check('isAvailable es false en Node puro', () => {
  if (crypto.isAvailable()) throw new Error('debería ser false');
});

check('isEncrypted reconoce el prefijo', () => {
  if (!crypto.isEncrypted('enc:v1:abc123')) throw new Error('debería reconocer enc:v1:');
  if (crypto.isEncrypted('sk-abc')) throw new Error('no debería reconocer texto plano');
  if (crypto.isEncrypted(null)) throw new Error('null no debería ser cifrado');
  if (crypto.isEncrypted('')) throw new Error('vacío no debería ser cifrado');
});

check('encrypt sin safeStorage devuelve el texto tal cual', () => {
  const plain = 'mi-clave-secreta';
  const result = crypto.encrypt(plain);
  if (result !== plain) throw new Error(`esperaba ${plain}, got ${result}`);
});

check('decrypt de texto plano devuelve el texto tal cual', () => {
  const plain = 'mi-clave-secreta';
  const result = crypto.decrypt(plain);
  if (result !== plain) throw new Error(`esperaba ${plain}, got ${result}`);
});

check('decrypt de texto cifrado sin safeStorage devuelve null', () => {
  const encrypted = 'enc:v1:YWJjMTIz';
  const result = crypto.decrypt(encrypted);
  if (result !== null) throw new Error(`esperaba null, got ${result}`);
});

// === config.js: cifrado al guardar/leer ===

check('config cifra las credenciales al guardar (en Node puro se queda en claro)', () => {
  resetConfig();
  // En Node puro, el cifrado no está disponible, así que se queda en claro.
  const accounts = [
    { provider: 'minimax', label: 'Test', credentials: { apiKey: 'sk-test-123' } },
  ];
  config.save({ accounts });
  const loaded = config.load();
  // En Node puro las credenciales se quedan en claro (crypto.encrypt devuelve lo mismo).
  const key = loaded.accounts[0]?.credentials?.apiKey;
  if (key !== 'sk-test-123') {
    throw new Error(`esperaba sk-test-123, got ${key}`);
  }
});

check('config descifra credenciales cifradas (en Node puro las marca con _encrypted)', () => {
  resetConfig();
  // Simular que alguien guardó una credencial cifrada (desde Electron).
  const fs = require('fs');
  const cfgPath = config.configPath();
  const fakeEncrypted = {
    accounts: [
      {
        provider: 'minimax',
        label: 'Cifrada',
        credentials: { apiKey: 'enc:v1:YWJjMTIz' },
      },
    ],
  };
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(fakeEncrypted), 'utf8');
  config.invalidate();

  const loaded = config.load();
  const acc = loaded.accounts[0];
  // La credencial cifrada no se pudo descifrar en Node puro.
  if (acc.credentials.apiKey !== undefined) {
    throw new Error(`no debería haber apiKey, got ${acc.credentials.apiKey}`);
  }
  if (!acc._encrypted) {
    throw new Error('debería tener _encrypted: true');
  }
});

check('config no rompe las credenciales en claro existentes', () => {
  resetConfig();
  // Configuración antigua con credenciales en claro.
  const fs = require('fs');
  const cfgPath = config.configPath();
  const existing = {
    accounts: [
      { provider: 'minimax', label: 'Vieja', credentials: { apiKey: 'sk-old-key' } },
    ],
  };
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(existing), 'utf8');
  config.invalidate();

  const loaded = config.load();
  const key = loaded.accounts[0]?.credentials?.apiKey;
  if (key !== 'sk-old-key') {
    throw new Error(`esperaba sk-old-key, got ${key}`);
  }
});

finish('el cifrado funciona en Node puro');
