'use strict';

// Comprobaciones del PAQUETE (lo que se acaba publicando).
//
// LECCION: los scripts de PowerShell que la app ejecuta en tiempo de
// ejecucion (find-tray-icon.ps1, cred-read.ps1, get-claude-usage.ps1) TIENEN
// que ir en el paquete y TIENEN que estar desempaquetados. Sin eso, en la app
// instalada:
//   - la tarjeta NUNCA salia al pasar el raton (sin find-tray-icon.ps1 no se
//     localiza el icono de la bandeja),
//   - Antigravity decia "sin credencial" (sin cred-read.ps1),
//   - Claude solo enseñaba las transcripciones locales (sin
//     get-claude-usage.ps1).
// Y el exe portable de la beta.2 seguia pareciendo funcionar: por eso esto
// se comprueba automaticamente en el job `verify` del pipeline.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const build = pkg.build || {};

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FALLO ${name}: ${err.message}`);
  }
}

console.log('paquete:');

// 1) Los scripts de PowerShell tienen que viajar en el paquete.
check('los scripts se incluyen en el paquete', () => {
  const files = build.files || [];
  assert.ok(
    files.some((pattern) => pattern.replace(/\\/g, '/').startsWith('scripts/')),
    `build.files no incluye la carpeta scripts/: ${JSON.stringify(files)}`
  );
});

// 2) Y tienen que estar DESEMPAQUETADOS: dentro de app.asar son un archivo
//    virtual y PowerShell no puede ejecutarlos.
check('los scripts se desempaquetan del asar', () => {
  const unpack = build.asarUnpack || [];
  assert.ok(
    unpack.some((pattern) => pattern.replace(/\\/g, '/').startsWith('scripts/')),
    `build.asarUnpack no incluye la carpeta scripts/: ${JSON.stringify(unpack)}`
  );
});

// 3) Todo script que el codigo ejecuta tiene que existir de verdad.
check('los scripts que ejecuta el codigo existen', () => {
  const src = path.join(repo, 'src');
  const referenced = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const code = fs.readFileSync(full, 'utf8');
        const re = /script\(\s*'([^']+)'\s*\)/g;
        let m = re.exec(code);
        while (m) {
          referenced.add(m[1]);
          m = re.exec(code);
        }
      }
    }
  };
  walk(src);
  assert.ok(referenced.size > 0, 'no se ha encontrado ningun script referenciado');
  for (const name of referenced) {
    const file = path.join(repo, 'scripts', name);
    assert.ok(fs.existsSync(file), `falta scripts/${name}`);
  }
  console.log(`       (${referenced.size} scripts referenciados)`);
});

// 4) El renderer (tarjeta y configuracion) tiene que estar en el paquete.
check('el renderer se incluye en el paquete', () => {
  const files = build.files || [];
  assert.ok(
    files.some((pattern) => pattern.replace(/\\/g, '/').startsWith('src/')),
    `build.files no incluye src/: ${JSON.stringify(files)}`
  );
  for (const name of ['card.html', 'card.css', 'card.js', 'settings.html', 'settings.css', 'settings.js']) {
    assert.ok(fs.existsSync(path.join(repo, 'src', 'renderer', name)), `falta src/renderer/${name}`);
  }
});

console.log(failures ? `\nFALLO: ${failures} comprobacion(es) fallida(s)` : '\nOK: el paquete esta bien');
process.exit(failures ? 1 : 0);
