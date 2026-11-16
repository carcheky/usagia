#!/usr/bin/env node
'use strict';

/**
 * Publica la release de Usagia. Sustituye a semantic-release, que no puede
 * numerar las betas con cuatro digitos: para semver "1.0.0-beta.0012" no es
 * una version valida (ceros a la izquierda), asi que o publicaba "beta.12" o,
 * si se renombraba despues, dejaba de ver la release anterior y volvia a
 * empezar en "beta.1".
 *
 * Reglas (las mismas que seguia semantic-release, mas el relleno):
 *
 *   - La version la deciden los commits desde la ultima ESTABLE:
 *       BREAKING CHANGE -> mayor, feat -> menor, fix/perf -> parche.
 *     Sin estable previa, la base es 1.0.0.
 *   - En `beta` la release es `v<base>-beta.NNNN`, con NNNN = la mayor beta
 *     publicada de esa base + 1, SIEMPRE con cuatro digitos (0001, 0002...).
 *   - En `main` la release es `v<base>`, estable.
 *   - El changelog lleva SOLO cambios de la app: feat, fix, perf y los
 *     cambios incompatibles. ci, chore, docs, test, refactor, build y style
 *     no aparecen ni publican nada.
 *   - Si desde la release anterior no hay ningun commit publicable, no se
 *     publica nada.
 *
 * La release se crea por la API de GitHub, que crea tambien el tag: el bot
 * del pipeline no puede hacer `git push` de tags ni `POST /git/refs`.
 *
 * Uso:
 *   node scripts/release.js            # publica (necesita GITHUB_TOKEN y GITHUB_REPOSITORY)
 *   node scripts/release.js --dry-run  # solo dice que haria
 *
 * Escribe `tag`, `version` y `sha` en $GITHUB_OUTPUT si existe.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');

const DRY = process.argv.includes('--dry-run');
const REPO = process.env.GITHUB_REPOSITORY || 'carcheky/usagia';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DIGITOS = 4;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: 'api.github.com',
        path,
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'usagia-release',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => {
          if (res.statusCode >= 300) {
            reject(new Error(`${method} ${path} -> ${res.statusCode} ${b}`));
            return;
          }
          resolve(b ? JSON.parse(b) : {});
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function releasesPublicadas() {
  const todas = [];
  for (let page = 1; page <= 10; page += 1) {
    const lote = await api('GET', `/repos/${REPO}/releases?per_page=100&page=${page}`);
    todas.push(...lote);
    if (lote.length < 100) break;
  }
  // Los borradores no cuentan: no estan publicados.
  return todas.filter((r) => !r.draft);
}

const ESTABLE = /^v(\d+)\.(\d+)\.(\d+)$/;
const BETA = /^v(\d+\.\d+\.\d+)-beta\.(\d+)$/;

function cmpVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Commits entre `desde` (exclusivo) y HEAD, ya clasificados. */
function commitsDesde(desde) {
  const rango = desde ? `${desde}..HEAD` : 'HEAD';
  const raw = git('log', '--format=%H%x1f%s%x1f%b%x1e', rango);
  return raw
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [sha, asunto, cuerpo = ''] = s.split('\x1f');
      const m = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/.exec(asunto.trim());
      const tipo = m ? m[1] : '';
      const rompe = Boolean((m && m[3]) || /BREAKING CHANGE/.test(cuerpo));
      return { sha, asunto: asunto.trim(), texto: m ? m[4].trim() : asunto.trim(), tipo, rompe };
    });
}

function siguienteBase(ultimaEstable, commits) {
  if (!ultimaEstable) return '1.0.0';
  const [ma, mi, pa] = ultimaEstable.split('.').map(Number);
  if (commits.some((c) => c.rompe)) return `${ma + 1}.0.0`;
  if (commits.some((c) => c.tipo === 'feat')) return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

function notas(commits, anterior, tag) {
  const grupo = (titulo, lista) =>
    lista.length
      ? [`### ${titulo}`, '', ...lista.map((c) => `* ${c.texto} ([${c.sha.slice(0, 7)}](https://github.com/${REPO}/commit/${c.sha}))`), '']
      : [];
  const lineas = [
    ...grupo('Cambios incompatibles', commits.filter((c) => c.rompe)),
    ...grupo('Novedades', commits.filter((c) => c.tipo === 'feat' && !c.rompe)),
    ...grupo('Correcciones', commits.filter((c) => c.tipo === 'fix' && !c.rompe)),
    ...grupo('Rendimiento', commits.filter((c) => c.tipo === 'perf' && !c.rompe)),
  ];
  if (anterior) lineas.push(`**Cambios completos**: https://github.com/${REPO}/compare/${anterior}...${tag}`);
  return lineas.join('\n').trim() + '\n';
}

function salida(valores) {
  const texto = Object.entries(valores).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, texto);
}

async function main() {
  const rama = process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD');
  if (rama !== 'beta' && rama !== 'main') {
    console.log(`La rama ${rama} no publica releases.`);
    salida({ tag: '', version: '', sha: '' });
    return;
  }
  const head = git('rev-parse', 'HEAD');

  const releases = await releasesPublicadas();
  const estables = releases.map((r) => ESTABLE.exec(r.tag_name)).filter(Boolean).map((m) => m.slice(1).join('.'));
  const ultimaEstable = estables.sort(cmpVersion).pop() || null;

  const publicable = (c) => c.rompe || ['feat', 'fix', 'perf'].includes(c.tipo);
  const base = siguienteBase(ultimaEstable, commitsDesde(ultimaEstable ? `v${ultimaEstable}` : null).filter(publicable));

  let tag;
  let anterior;
  if (rama === 'main') {
    tag = `v${base}`;
    anterior = ultimaEstable ? `v${ultimaEstable}` : null;
  } else {
    const betas = releases
      .map((r) => BETA.exec(r.tag_name))
      .filter((m) => m && m[1] === base)
      .map((m) => parseInt(m[2], 10));
    const mayor = betas.length ? Math.max(...betas) : 0;
    tag = `v${base}-beta.${String(mayor + 1).padStart(DIGITOS, '0')}`;
    anterior = mayor ? `v${base}-beta.${String(mayor).padStart(DIGITOS, '0')}` : ultimaEstable ? `v${ultimaEstable}` : null;
  }

  // Si el tag anterior no esta en el clon (fetch-depth insuficiente), se avisa en vez de inventar.
  if (anterior) git('rev-parse', '--verify', `${anterior}^{commit}`);

  const commits = commitsDesde(anterior).filter(publicable);
  console.log(`Rama: ${rama}  base: ${base}  anterior: ${anterior || '(ninguna)'}  siguiente: ${tag}`);
  if (!commits.length) {
    console.log('No hay cambios de la app desde la release anterior: no se publica nada.');
    salida({ tag: '', version: '', sha: '' });
    return;
  }
  const body = notas(commits, anterior, tag);
  console.log(`Cambios (${commits.length}):`);
  for (const c of commits) console.log(`  ${c.tipo}${c.rompe ? '!' : ''}: ${c.texto}`);

  if (DRY) {
    console.log(`\n--dry-run: no se publica. Notas:\n\n${body}`);
    return;
  }
  if (!TOKEN) throw new Error('Falta GITHUB_TOKEN');

  const rel = await api('POST', `/repos/${REPO}/releases`, {
    tag_name: tag,
    target_commitish: head,
    name: tag,
    body,
    draft: false,
    prerelease: rama === 'beta',
  });
  console.log(`Publicada ${rel.tag_name}: ${rel.html_url}`);
  salida({ tag, version: tag.slice(1), sha: head });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
