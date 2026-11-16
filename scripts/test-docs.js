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

// Documentos que se salen del tope de 300 lineas, con su motivo:
//  - historial.md: es un documento de ARCHIVO (consultado por secciones, con su
//    propio indice). No se carga de una vez, asi que el tope no aplica.
const EXENCIONES = [
  { fichero: 'historial.md', motivo: 'documento de archivo: se consulta por secciones' },
];

// Documentos largos de la raiz que deben llevar indice de secciones (H2 -> linea),
// para poder cargarlos por fragmentos.
const CON_INDICE = ['STATUS.md', 'FINDINGS.md'];

const MARCA_INI = '<!-- índice-de-secciones: generado con `node scripts/docs-metrics.js --index <fichero>` -->';
const MARCA_FIN = '<!-- fin-índice -->';

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

/** Las secciones H2 de un fichero, con su linea. */
function seccionesH2(fichero) {
  const out = [];
  fs.readFileSync(fichero, 'utf8')
    .split(/\r?\n/)
    .forEach((linea, i) => {
      const m = /^##\s+(.*)$/.exec(linea);
      if (m) out.push({ titulo: m[1].trim(), linea: i + 1 });
    });
  return out;
}

/** El indice de secciones de un fichero: filas [titulo, linea]. */
function indiceDe(fichero) {
  const texto = fs.readFileSync(fichero, 'utf8');
  const ini = texto.indexOf(MARCA_INI);
  const fin = texto.indexOf(MARCA_FIN);
  if (ini < 0 || fin < 0) return null;
  const filas = [];
  for (const l of texto.slice(ini, fin).split(/\r?\n/)) {
    const m = /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|$/.exec(l);
    if (m && m[1] !== 'Sección' && m[1] !== '---') filas.push({ titulo: m[1], linea: Number(m[2]) });
  }
  return filas;
}

/** Las filas de la tabla de recetas de METODOLOGIA.md. */
function tablaDeRecetas(texto) {
  const seccion = texto.split(/^##\s+4\.\s/m)[1] || '';
  const filas = [];
  for (const linea of seccion.split(/\r?\n/)) {
    if (!linea.startsWith('|')) continue;
    const celdas = linea.split('|').slice(1, -1).map((c) => c.trim());
    if (celdas.length < 3) continue;
    if (celdas[0] === 'Tarea' || /^-+$/.test(celdas[0]) || /^:?-+:?$/.test(celdas[0])) continue;
    filas.push({
      titulo: celdas[0].replace(/\*\*/g, ''),
      texto: linea,
      tieneNo: celdas.length >= 3 && celdas[2].trim().length > 0,
    });
  }
  return filas;
}

/**
 * Las secciones del README que describen una TAREA (no una referencia). Cada una
 * tiene que tener su fila en la tabla de recetas de METODOLOGIA.md.
 *
 * `claves` son alternativas: basta con que una aparezca en el titulo de la fila.
 */
const SECCIONES_README = [
  { seccion: 'Instalación y arranque', claves: ['instalador', 'instalar'] },
  { seccion: 'Cómo se autentican los proveedores', claves: ['credencial'] },
  { seccion: 'Configuración', claves: ['config.json', 'configuración'] },
  { seccion: 'Actualizaciones', claves: ['actualizaciones'] },
  { seccion: 'Añadir un proveedor nuevo', claves: ['añadir un proveedor', 'proveedor'] },
  { seccion: 'Releases', claves: ['releases'] },
  { seccion: 'Interacción', claves: ['hover', 'tarjeta'] },
  { seccion: 'Notas y límites', claves: ['empaquetado', 'asar'] },
];

/** Secciones del README que NO son una tarea: son referencia. */
const SECCIONES_NO_TAREA = ['Estructura', 'Hallazgos y semántica'];

/** Las filas de la tabla de recetas, con su titulo en minusculas. */
function recetas() {
  const metodo = fs.readFileSync(path.join(docs, 'METODOLOGIA.md'), 'utf8');
  return tablaDeRecetas(metodo).map((f) => ({ ...f, tituloLower: f.titulo.toLowerCase() }));
}

/** Los H2 del README. */
function titulosReadme() {
  const texto = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  return [...texto.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1].trim());
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
    .filter((f) => !EXENCIONES.some((x) => path.basename(f) === x.fichero))
    .map((f) => ({ f, n: fs.readFileSync(f, 'utf8').split(/\r?\n/).length }))
    .filter(({ n }) => n > MAX_LINEAS)
    .map(({ f, n }) => `${path.relative(repo, f)} (${n} lineas)`);
  t.assert.deepStrictEqual(largos, [], `demasiado largos, hay que partirlos:\n  ${largos.join('\n  ')}`);
});

/* ------------------------------------ 5) indice de secciones de lo largo */

t.section('documentacion: indice de secciones');
t.check('el indice de secciones de cada documento largo cuadra con sus titulos', () => {
  const malos = [];
  for (const relativo of CON_INDICE) {
    const fichero = path.join(repo, relativo);
    const filas = indiceDe(fichero);
    if (!filas) {
      malos.push(`${relativo}: no tiene el bloque de indice`);
      continue;
    }
    const reales = seccionesH2(fichero);
    if (filas.length !== reales.length) {
      malos.push(`${relativo}: el indice lista ${filas.length} secciones y hay ${reales.length}`);
      continue;
    }
    for (let i = 0; i < reales.length; i += 1) {
      if (filas[i].titulo !== reales[i].titulo) {
        malos.push(`${relativo}: el indice dice "${filas[i].titulo}" y el titulo es "${reales[i].titulo}"`);
        break;
      }
      // La linea puede moverse al editar el documento: se avisa, pero no es fallo.
      // Lo que no vale es que apunte a otra seccion.
      const desvio = Math.abs(filas[i].linea - reales[i].linea);
      if (desvio > 3) {
        malos.push(`${relativo}: "${reales[i].titulo}" esta en la linea ${reales[i].linea}, el indice dice ${filas[i].linea}`);
      }
    }
  }
  t.assert.deepStrictEqual(malos, [], `indices que no cuadran:\n  ${malos.join('\n  ')}`);
});

/* ------------------------------------------------ 6) cobertura de recetas */

t.section('documentacion: cobertura de recetas');
t.check('toda seccion del README que es una tarea tiene su receta', () => {
  const titulos = titulosReadme();
  const sinReceta = [];
  for (const { seccion, claves } of SECCIONES_README) {
    if (!titulos.some((t) => t.toLowerCase().startsWith(seccion.toLowerCase()))) {
      sinReceta.push(`(el README ya no tiene la seccion "${seccion}")`);
      continue;
    }
    if (!recetas().some((f) => claves.some((c) => f.tituloLower.includes(c.toLowerCase())))) {
      sinReceta.push(`"${seccion}" (busca una receta con: ${claves.join(' / ')})`);
    }
  }
  t.assert.deepStrictEqual(
    sinReceta,
    [],
    `secciones del README sin receta:\n  ${sinReceta.join('\n  ')}`
  );
});

t.check('toda seccion nueva del README tiene receta o es una referencia', () => {
  const conocidas = new Set(SECCIONES_README.map((s) => s.seccion.toLowerCase()));
  const nuevas = titulosReadme()
    .filter((t) => !SECCIONES_NO_TAREA.includes(t))
    .filter((t) => ![...conocidas].some((k) => t.toLowerCase().startsWith(k)));
  t.assert.deepStrictEqual(
    nuevas,
    [],
    `secciones del README sin receta (anade la fila o marcala como referencia):\n  ${nuevas.join('\n  ')}`
  );
});

t.check('cada receta apunta a documentos que existen', () => {
  const rotas = [];
  for (const fila of recetas()) {
    for (const { destino } of enlaces(fila.texto)) {
      if (/^(https?:|mailto:|#)/.test(destino)) continue;
      const limpio = destino.split('#')[0];
      if (!limpio) continue;
      const abs = path.resolve(docs, limpio);
      if (!fs.existsSync(abs)) rotas.push(`${fila.titulo} -> ${destino}`);
    }
  }
  t.assert.deepStrictEqual(rotas, [], `recetas que apuntan a nada:\n  ${rotas.join('\n  ')}`);
});

t.check('las recetas dicen tambien que NO hace falta leer', () => {
  const sinColumna = recetas()
    .filter((f) => !f.tieneNo)
    .map((f) => f.titulo);
  t.assert.deepStrictEqual(
    sinColumna,
    [],
    `recetas sin la columna "no hace falta":\n  ${sinColumna.join('\n  ')}`
  );
});

t.finish(`OK: la documentacion esta enlazada, indizada y al dia (${ficheros.length} .md)`);
