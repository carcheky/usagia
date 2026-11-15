'use strict';

// Inspecciona el esquema de electron-builder para las opciones de Linux.

const fs = require('fs');
const path = require('path');

const schema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'scheme.json'),
    'utf8'
  )
);
const defs = schema.definitions || {};

const linux = defs.LinuxConfiguration?.properties || {};
console.log('opciones de linux relevantes:');
for (const key of ['icon', 'category', 'synopsis', 'description', 'maintainer', 'desktop', 'desktopEntry', 'synopsis']) {
  if (linux[key]) console.log(`  ${key}: ${JSON.stringify(linux[key]).slice(0, 120)}`);
}

console.log('\nbusca "syncDesktopName" en todo el esquema:');
const raw = JSON.stringify(schema);
console.log(raw.includes('syncDesktopName') ? '  SI existe' : '  NO existe (el aviso del builder menciona un nombre que no esta en el esquema)');

console.log('\nbusca "desktopName":');
console.log(raw.includes('desktopName') ? '  SI existe' : '  NO existe');

const packageProps = defs.PackageJson?.properties || {};
console.log('\nopciones de package.json relevantes:');
for (const key of ['author', 'desktopName', 'executableName', 'name', 'version']) {
  console.log(`  ${key}: ${packageProps[key] ? JSON.stringify(packageProps[key]).slice(0, 100) : 'NO DEFINIDA'}`);
}
