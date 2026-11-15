'use strict';

// Comprueba si electron-builder admite un artifactName distinto por target
// (necesario: el instalador NSIS y el portable son los dos .exe).

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'scheme.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const defs = schema.definitions || {};

for (const key of ['NsisOptions', 'PortableOptions', 'TargetSpecificOptions', 'DebOptions']) {
  const def = defs[key];
  if (!def) {
    console.log(`${key}: NO DEFINIDO`);
    continue;
  }
  const parents = (def.allOf || []).map((x) => x.$ref || JSON.stringify(x));
  console.log(`${key}: ${parents.join(' + ')}`);
  console.log(`   propiedades propias: ${Object.keys(def.properties || {}).join(', ') || '(ninguna)'}`);
}

const tso = defs.TargetSpecificOptions;
console.log(`\nTargetSpecificOptions incluye artifactName: ${Boolean(tso?.properties?.artifactName)}`);
console.log(`TargetSpecificOptions incluye target: ${Boolean(tso?.properties?.target)}`);
