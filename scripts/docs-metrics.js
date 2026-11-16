'use strict';

// Medición del coste documental y generador del índice de secciones.
//
// Por qué existe: el método de [docs/METODOLOGIA.md](../docs/METODOLOGIA.md) promete un
// ahorro de tokens al cargar la documentación de forma selectiva. Prometer no es
// medir: este script mide, con el mismo criterio en los dos lados, para que el número
// se pueda comprobar y volver a comprobar.
//
//   node scripts/docs-metrics.js                # tabla de ficheros + ahorro por tarea
//   node scripts/docs-metrics.js --index FICHERO  # imprime el índice de secciones (H2 -> línea)
//
// El criterio de tokens es `chars / 3,6` (español técnico). El PORCENTAJE de ahorro no
// depende del divisor: se aplica igual a los dos lados, así que el ratio es exacto y
// solo los números absolutos son aproximados.
//
// NO entra en `npm test` a proposito: depende del contenido de `STATUS.md`, que cambia
// con cada sesion. Una prueba que se rompe cada vez que otra sesion actualiza el estado
// no sirve de red de seguridad.

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const R = 3.6; // chars por token (español técnico)
const MARCA_INI = '<!-- índice-de-secciones: generado con `node scripts/docs-metrics.js --index <fichero>` -->';
const MARCA_FIN = '<!-- fin-índice -->';

const tok = (s) => Math.round(s.length / R);
const leer = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** Ruta relativa al repo, con barras hacia adelante. */
const rel = (p) => path.relative(repo, p).split(path.sep).join('/');

/** Secciones H2 de un fichero, con su linea. */
function secciones(fichero) {
  const out = [];
  leer(fichero)
    .split(/\r?\n/)
    .forEach((l, i) => {
      const m = /^##\s+(.*)$/.exec(l);
      if (m) out.push({ titulo: m[1].trim(), linea: i + 1 });
    });
  return out;
}

/** Indice de secciones como tabla markdown, listo para pegar. */
function tablaIndice(fichero) {
  const filas = secciones(fichero).map((s) => `| ${s.titulo} | ${s.linea} |`);
  return [MARCA_INI, '| Sección | Línea |', '|---|---|', ...filas, MARCA_FIN].join('\n');
}

/** Extrae la tabla de indice de un fichero (si la tiene). */
function indiceDe(fichero) {
  const t = leer(fichero);
  const ini = t.indexOf(MARCA_INI);
  const fin = t.indexOf(MARCA_FIN);
  if (ini < 0 || fin < 0) return null;
  const bloque = t.slice(ini, fin + MARCA_FIN.length);
  const filas = [];
  for (const l of bloque.split(/\r?\n/)) {
    const m = /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|$/.exec(l);
    if (m && m[1] !== 'Sección' && m[1] !== '---') filas.push({ titulo: m[1], linea: Number(m[2]) });
  }
  return filas;
}

// ---------------------------------------------------------------- modo --index
const argIndex = process.argv.indexOf('--index');
const argFix = process.argv.indexOf('--fix');
if (argIndex > -1 || argFix > -1) {
  const fichero = process.argv[argIndex > -1 ? argIndex + 1 : argFix + 1];
  if (!fichero) {
    console.error('Falta el fichero: node scripts/docs-metrics.js --index <fichero>');
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), fichero);
  if (!fs.existsSync(abs)) {
    console.error(`No existe: ${abs}`);
    process.exit(1);
  }
  let tabla = tablaIndice(abs);
  if (argFix > -1) {
    // Reescribe el bloque del indice dentro del fichero y vuelve a calcular las
    // lineas hasta que cuadran (el numero de filas no cambia, asi que converge).
    let texto = leer(abs);
    if (!texto.includes(MARCA_INI) || !texto.includes(MARCA_FIN)) {
      console.error(`${rel(abs)} no tiene el bloque de indice (${MARCA_INI})`);
      process.exit(1);
    }
    for (let i = 0; i < 5; i += 1) {
      const ini = texto.indexOf(MARCA_INI);
      const fin = texto.indexOf(MARCA_FIN) + MARCA_FIN.length;
      const nuevo = texto.slice(0, ini) + tabla + texto.slice(fin);
      const nuevaTabla = tablaIndiceTemporal(nuevo);
      if (nuevaTabla === tabla) {
        texto = nuevo;
        break;
      }
      tabla = nuevaTabla;
      texto = texto.slice(0, ini) + tabla + texto.slice(fin);
    }
    fs.writeFileSync(abs, texto, 'utf8');
    console.log(`Indice actualizado en ${rel(abs)}`);
  } else {
    console.log(tabla);
  }
  process.exit(0);
}

/** La tabla de indice que tendra un texto dado (para iterar hasta cuadrar). */
function tablaIndiceTemporal(texto) {
  const filas = [];
  texto.split(/\r?\n/).forEach((l, i) => {
    const m = /^##\s+(.*)$/.exec(l);
    if (m) filas.push(`| ${m[1].trim()} | ${i + 1} |`);
  });
  return [MARCA_INI, '| Sección | Línea |', '|---|---|', ...filas, MARCA_FIN].join('\n');
}

// ------------------------------------------------------------------- medicion
const FICHEROS = [
  ['README', 'README.md'],
  ['AGENTS', 'AGENTS.md'],
  ['STATUS', 'STATUS.md'],
  ['FINDINGS', 'FINDINGS.md'],
  ['PLAN', 'PLAN-ANDROID.md'],
  ['INDICE', 'docs/README.md'],
  ['METODO', 'docs/METODOLOGIA.md'],
  ['ADR1', 'docs/decisions/0001-documentacion-para-humanos-y-agentes.md'],
];

const size = {};
for (const [k, p] of FICHEROS) {
  const t = leer(path.join(repo, p));
  size[k] = { lineas: t.split('\n').length, tokens: tok(t) };
}

/** Tokens de una seccion H2 de un fichero. */
function sec(fichero, aguja) {
  const lineas = leer(path.join(repo, fichero)).split('\n');
  let ini = -1;
  let fin = lineas.length;
  for (let i = 0; i < lineas.length; i += 1) {
    if (ini < 0) {
      if (new RegExp(`^##\\s+.*${aguja}`).test(lineas[i])) ini = i;
    } else if (/^##\s+/.test(lineas[i])) {
      fin = i;
      break;
    }
  }
  if (ini < 0) throw new Error(`seccion no encontrada en ${fichero}: ${aguja}`);
  return tok(lineas.slice(ini, fin).join('\n'));
}

const raiz = size.README.tokens + size.AGENTS.tokens + size.STATUS.tokens + size.FINDINGS.tokens;
const indice = size.INDICE.tokens;
const RECETA = 45; // una fila de la tabla de recetas, con sus enlaces

const CASOS = [
  ['retomar tras otra sesión', raiz, indice + RECETA + sec('STATUS.md', 'Sesiones activas') + sec('STATUS.md', 'Pendiente')],
  ['saber qué está publicado', raiz, indice + RECETA + sec('STATUS.md', 'Versiones')],
  ['bug de cuota/credenciales', raiz, indice + RECETA + sec('FINDINGS.md', 'Convención de semántica') + sec('FINDINGS.md', 'Endpoints y credenciales')],
  ['añadir un proveedor', raiz, indice + RECETA + sec('README.md', 'Añadir un proveedor') + sec('FINDINGS.md', 'Endpoints y credenciales')],
  ['tocar tarjeta/configuración', raiz, indice + RECETA + sec('README.md', 'Interacción') + sec('README.md', 'Configuración')],
  ['empaquetado / asar', raiz, indice + RECETA + sec('README.md', 'Notas y límites')],
  ['ramas y releases', raiz, indice + RECETA + sec('README.md', 'Releases') + sec('AGENTS.md', 'Ramas')],
  ['actualizaciones', raiz, indice + RECETA + sec('README.md', 'Actualizaciones')],
  ['revisión transversal', raiz, indice + RECETA + sec('AGENTS.md', 'Reglas de la app') + size.ADR1.tokens],
  ['medir cuotas', raiz, indice + RECETA + sec('FINDINGS.md', 'Valores verificados')],
  ['documentar algo nuevo', raiz, indice + RECETA + sec('docs/METODOLOGIA.md', 'Dónde va cada cosa')],
  ['Android', raiz + size.PLAN.tokens, indice + RECETA + size.PLAN.tokens],
];

console.log('FICHEROS (tokens ~ chars/3,6)');
for (const [k, v] of Object.entries(size)) console.log(`  ${k.padEnd(8)} ${String(v.lineas).padStart(5)} lineas  ${String(v.tokens).padStart(6)} tok`);
console.log(`\n  Raiz (README+AGENTS+STATUS+FINDINGS): ${raiz} tok`);
console.log(`  Indice: ${indice} tok | fila de receta: ${RECETA} tok`);

console.log('\nPOR TAREA (raiz -> receta)');
let sb = 0;
let sc = 0;
for (const [nombre, b, c] of CASOS) {
  sb += b;
  sc += c;
  const p = (((b - c) / b) * 100).toFixed(0);
  console.log(`  ${nombre.padEnd(26)} ${String(b).padStart(6)} -> ${String(c).padStart(5)} tok   ahorro ${p.padStart(4)} %`);
}
console.log(`\n  MEDIA (${CASOS.length} tareas)         ${String(Math.round(sb / CASOS.length)).padStart(6)} -> ${String(Math.round(sc / CASOS.length)).padStart(5)} tok   ahorro ${(((sb - sc) / sb) * 100).toFixed(0)} %`);
console.log(`  PEOR caso: ${Math.min(...CASOS.map(([, b, c]) => ((b - c) / b) * 100)).toFixed(0)} % de ahorro`);

// ------------------------------------------------------------------ exportado
module.exports = { secciones, tablaIndice, indiceDe, tok, MARCA_INI, MARCA_FIN };
