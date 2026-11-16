'use strict';

// Comprobaciones de la DOCUMENTACION (la red de seguridad del metodo).
//
// La regla de oro del repo: lo que se aprende se documenta en `docs/`, con un
// indice del que se carga solo lo que la tarea pide (ver docs/METODOLOGIA.md).
// Eso se rompe de tres maneras silenciosas: un enlace que ya no existe, un
// documento que nadie enlaza desde el indice (o sea, invisible) y una cabecera
// sin fecha de verificacion (o sea, sin saber si miente). Aqui se comprueban
// las tres, mas el tope de tamano que mantiene cada documento cargable de una
// vez.
//
// Se descubre sola: `scripts/test.js` lanza todas las `scripts/test-*.js`.
//
// Uso:
//   node scripts/test-docs.js      # o `npm test` (entra con las demas)

const fs = require('fs');
const path = require('path');
const t = require('./test-lib');

const repo = path.join(__dirname, '..');
const docs = path.join(repo, 'docs');
const MAX_LINEAS = 300; // un documento de docs/ se carga entero (nivel T1)
const CABECERA = ['Para quién', 'Responde a', 'Verificado']; // lo que decide si cargarlo

// Lo que no es documentacion del repo: dependencias y artefactos de build.
const IGNORAR = new Set(['node_modules', 'dist', '.git', '.github']);

/** Lista los `.md` de un directorio, recursivo y ordenado. */
function markdowns(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORAR.has(entry.name)) out.push(...markdowns(full));
    } else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

/** Quita los bloques de codigo: dentro de ellos no hay enlaces que comprobar. */
function sinBloques(texto) {
  return texto.replace(/^```[\s\S]*?^```/gm, (bloque) => bloque.replace(/[^\n]/g, ' '));
}

/** Enlaces markdown `[texto](destino)` con su numero de linea. */
function enlaces(texto) {
  const out = [];
  sinBloques(texto)
    .split(/\r?\n/)
    .forEach((linea, i) => {
      const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      let m = re.exec(linea);
      while (m) {
        out.push({ destino: m[1], linea: i + 1 });
        m = re.exec(linea);
      }
    });
  return out;
}

/** Ancla de GitHub para un titulo (aproximacion suficiente para enlaces internos). */
function ancla(titulo) {
  return titulo
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/** Anclas que ofrece un fichero: sus titulos. */
function anclas(fichero) {
  const set = new Set();
  for (const linea of fs.readFileSync(fichero, 'utf8').split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (m) set.add(ancla(m[2]));
  }
  return set;
}

const enDocs = (fichero) => fichero.startsWith(docs + path.sep);
const ficheros = markdowns(repo);
const indice = path.join(docs, 'README.md');

/* -------------------------------------------------------- 1) enlaces vivos */

t.section('documentacion: enlaces');
t.check('todo enlace relativo apunta a un fichero que existe', () => {
  const rotos = [];
  for (const fichero of ficheros) {
    for (const { destino, linea } of enlaces(fs.readFileSync(fichero, 'utf8'))) {
      if (/^(https?:|mailto:|#)/.test(destino)) continue;
      const limpio = decodeURIComponent(destino.replace(/^<|>$/g, '')).split('#')[0];
      if (!limpio) continue;
      const destinoAbs = path.resolve(path.dirname(fichero), limpio);
      if (!fs.existsSync(destinoAbs)) {
        rotos.push(`${path.relative(repo, fichero)}:${linea} -> ${destino}`);
      }
    }
  }
  t.assert.deepStrictEqual(rotos, [], `enlaces rotos:\n  ${rotos.join('\n  ')}`);
});

t.check('las anclas de docs/ existen en su documento', () => {
  const malas = [];
  for (const fichero of ficheros.filter(enDocs)) {
    for (const { destino, linea } of enlaces(fs.readFileSync(fichero, 'utf8'))) {
      const [ruta, anclaDestino] = destino.split('#');
      if (!anclaDestino) continue;
      // Solo se comprueban las anclas internas y las de otros documentos de docs/:
      // en STATUS.md y FINDINGS.md hay enlaces historicos a secciones.
      const destinoAbs = path.resolve(path.dirname(fichero), ruta || path.basename(fichero));
      if (!enDocs(destinoAbs) || !fs.existsSync(destinoAbs)) continue;
      if (!anclas(destinoAbs).has(anclaDestino)) {
        malas.push(`${path.relative(repo, fichero)}:${linea} -> #${anclaDestino}`);
      }
    }
  }
  t.assert.deepStrictEqual(malas, [], `anclas sin titulo:\n  ${malas.join('\n  ')}`);
});

/* ------------------------------------------------------ 2) indice completo */

t.section('documentacion: indice');
t.check('todo documento de docs/ esta enlazado desde docs/README.md', () => {
  const texto = fs.readFileSync(indice, 'utf8');
  const fuera = markdowns(docs)
    .filter((f) => f !== indice)
    .filter((f) => {
      const rel = path.relative(docs, f).split(path.sep).join('/');
      return !texto.includes(`](${rel})`) && !texto.includes(`](./${rel})`);
    })
    .map((f) => path.relative(repo, f));
  t.assert.deepStrictEqual(fuera, [], `sin enlazar desde docs/README.md:\n  ${fuera.join('\n  ')}`);
});

/* ---------------------------------------------- 3) cabecera y 4) tamano */

t.section('documentacion: forma');
t.check('cada documento de docs/ declara para quien es y cuando se verifico', () => {
  const incompletos = [];
  for (const fichero of markdowns(docs)) {
    const lineas = fs.readFileSync(fichero, 'utf8').split(/\r?\n/);
    const primera = lineas.find((l) => l.trim());
    const cabecera = lineas.slice(0, 12).join('\n');
    const falta = [];
    if (!/^#\s+\S/.test(primera || '')) falta.push('H1');
    for (const campo of CABECERA) if (!cabecera.includes(campo)) falta.push(campo);
    if (falta.length) incompletos.push(`${path.relative(repo, fichero)}: falta ${falta.join(', ')}`);
  }
  t.assert.deepStrictEqual(incompletos, [], `cabeceras incompletas:\n  ${incompletos.join('\n  ')}`);
});

t.check(`ningun documento de docs/ pasa de ${MAX_LINEAS} lineas (sea cargable de una vez)`, () => {
  const largos = markdowns(docs)
    .map((f) => ({ f, n: fs.readFileSync(f, 'utf8').split(/\r?\n/).length }))
    .filter(({ n }) => n > MAX_LINEAS)
    .map(({ f, n }) => `${path.relative(repo, f)} (${n} lineas)`);
  t.assert.deepStrictEqual(largos, [], `demasiado largos, hay que partirlos:\n  ${largos.join('\n  ')}`);
});

t.finish(`OK: la documentacion esta enlazada, indizada y al dia (${ficheros.length} .md)`);
