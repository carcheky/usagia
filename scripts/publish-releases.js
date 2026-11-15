'use strict';

// Publica y comprueba las releases del repo.
//
//   node scripts/publish-releases.js push-beta     # empuja la rama de trabajo
//   node scripts/publish-releases.js push-main     # publica la estable (ff-only)
//   node scripts/publish-releases.js wait <ref>    # espera al workflow y resume
//   node scripts/publish-releases.js verify <tag>  # lista los artefactos de la release
//   node scripts/publish-releases.js drop <tag>    # borra una release y su tag
//
// Todo lo que necesita credenciales va por `gh`, que usa el token que haya
// autenticado en el sistema (gh auth login).

const { spawnSync } = require('child_process');
const path = require('path');

const REPO = 'carcheky/usagia';
const root = path.join(__dirname, '..');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...opts,
  });
  return {
    code: result.status,
    out: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    raw: result.stdout || '',
  };
}

function gh(args, opts = {}) {
  return run('gh', args, opts);
}

function git(args, opts = {}) {
  return run('git', args, opts);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function requireAuth() {
  const status = gh(['auth', 'status']);
  if (status.code !== 0) {
    fail('No hay sesion de GitHub. Ejecuta: gh auth login --hostname github.com --git-protocol https --web');
  }
}

function push(branch) {
  const status = git(['push', '--set-upstream', 'origin', branch]);
  if (status.code !== 0) fail(`No se pudo empujar ${branch}:\n${status.out}`);
  ok(`Rama ${branch} empujada`);
}

function listRuns(branch) {
  const res = gh([
    'run', 'list',
    '--repo', REPO,
    '--branch', branch,
    '--workflow', 'release.yml',
    '--limit', '5',
    '--json', 'databaseId,status,conclusion,headBranch,displayTitle,url',
  ]);
  if (res.code !== 0) return [];
  try {
    return JSON.parse(res.raw || '[]');
  } catch {
    return [];
  }
}

async function waitForRun(branch, timeoutMinutes = 45) {
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  console.log(`Esperando al workflow de '${branch}'...`);

  let seen = new Set();
  while (Date.now() < deadline) {
    const runs = listRuns(branch);
    for (const run of runs) {
      if (seen.has(run.databaseId)) continue;
      seen.add(run.databaseId);
      console.log(`  · ${run.displayTitle} -> ${run.status}/${run.conclusion || '-'}`);
    }
    const finished = runs.find((r) => r.status === 'completed');
    if (finished) {
      ok(`Workflow de '${branch}': ${finished.conclusion}`);
      if (finished.conclusion !== 'success') {
        console.log(`  ${finished.url}`);
        fail(`El workflow de '${branch}》 termino con ${finished.conclusion}`);
      }
      return finished;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  fail(`El workflow de '${branch}' no termino en ${timeoutMinutes} minutos`);
}

function releaseInfo(tag) {
  const res = gh(['release', 'view', tag, '--repo', REPO, '--json', 'tagName,isPrerelease,name,url,assets']);
  if (res.code !== 0) return null;
  try {
    return JSON.parse(res.raw || 'null');
  } catch {
    return null;
  }
}

/** Lista las releases del repo, de la mas nueva a la mas vieja. */
function listReleases() {
  const res = gh(['release', 'list', '--repo', REPO, '--limit', '30', '--json', 'tagName,isPrerelease,url']);
  if (res.code !== 0) return [];
  try {
    return JSON.parse(res.raw || '[]');
  } catch {
    return [];
  }
}

/**
 * Ultima release de un tipo. `prerelease` true = la beta; false = la estable.
 * No se fijan nombres: la version la calcula semantic-release y la primera
 * beta sale como v1.0.0-beta.1.
 */
function latestRelease(kind) {
  const releases = listReleases();
  const match = releases.find((r) => Boolean(r.isPrerelease) === (kind === 'prerelease'));
  return match ? match.tagName : null;
}

function verify(tag) {
  const info = releaseInfo(tag);
  if (!info) fail(`No existe la release ${tag}`);

  console.log(`\nRelease ${info.tagName}${info.isPrerelease ? ' (pre-release)' : ''}`);
  console.log(`  ${info.url}`);

  const assets = (info.assets || []).map((a) => a.name);
  if (!assets.length) fail(`La release ${tag} no tiene artefactos`);

  const required = {
    'windows (.exe)': /\.exe$/i,
    'linux (.deb)': /\.deb$/i,
    'linux (.AppImage)': /\.AppImage$/i,
  };
  const found = {};
  for (const [key, re] of Object.entries(required)) {
    found[key] = assets.find((name) => re.test(name)) || null;
  }

  for (const [key, name] of Object.entries(found)) {
    if (name) ok(`${key}: ${name}`);
    else console.log(`  ✗ ${key}: FALTA`);
  }
  console.log(`\n  todos: ${assets.join(', ')}`);

  const missing = Object.entries(found).filter(([, v]) => !v);
  if (missing.length) {
    fail(`Faltan artefactos en ${tag}: ${missing.map(([k]) => k).join(', ')}`);
  }
  ok(`La release ${tag} tiene Windows (.exe) y Linux (.deb + .AppImage)`);
  return info;
}

function drop(tag) {
  const res = gh(['release', 'delete', tag, '--repo', REPO, '--yes', '--cleanup-tag']);
  if (res.code !== 0) fail(`No se pudo borrar la release ${tag}:\n${res.out}`);
  ok(`Release ${tag} y su tag borrados`);
}

async function main() {
  const [command, argument] = process.argv.slice(2);

  if (command === 'plan') {
    console.log('  1. node scripts/publish-releases.js push-beta       -> v1.0.0-beta.1');
    console.log('  2. node scripts/publish-releases.js wait beta');
    console.log('  3. node scripts/publish-releases.js verify-latest prerelease');
    console.log('  4. node scripts/publish-releases.js push-main       -> v1.0.0');
    console.log('  5. node scripts/publish-releases.js wait main');
    console.log('  6. node scripts/publish-releases.js verify-latest stable');
    console.log('  7. node scripts/publish-releases.js drop-latest stable   (deja solo la beta)');
    console.log('  8. node scripts/publish-releases.js list');
    return;
  }

  requireAuth();

  switch (command) {
    case 'push-beta':
      push('beta');
      break;
    case 'push-main': {
      // main solo recibe beta por fast-forward.
      git(['checkout', 'main']);
      const merge = git(['merge', '--ff-only', 'beta']);
      if (merge.code !== 0) fail(`El merge --ff-only fallo:\n${merge.out}`);
      push('main');
      git(['checkout', 'beta']);
      break;
    }
    case 'wait':
      await waitForRun(argument);
      break;
    case 'verify':
      verify(argument);
      break;
    case 'verify-latest': {
      const tag = latestRelease(argument);
      if (!tag) fail(`No hay ninguna release de tipo '${argument}'`);
      verify(tag);
      break;
    }
    case 'drop':
      drop(argument);
      break;
    case 'drop-latest': {
      const tag = latestRelease(argument);
      if (!tag) fail(`No hay ninguna release de tipo '${argument}'`);
      drop(tag);
      break;
    }
    case 'list': {
      const releases = listReleases();
      if (!releases.length) {
        console.log('No hay releases todavia.');
        break;
      }
      for (const r of releases) {
        const info = releaseInfo(r.tagName);
        const assets = (info?.assets || []).map((a) => a.name).join(', ') || 'SIN ARTEFACTOS';
        console.log(`${r.isPrerelease ? 'beta   ' : 'estable'}  ${r.tagName}`);
        console.log(`         ${assets}`);
      }
      break;
    }
    default:
      console.log(
        'Uso: node scripts/publish-releases.js <push-beta|push-main|wait <branch>|' +
          'verify <tag>|verify-latest <prerelease|stable>|drop <tag>|drop-latest <tipo>|list|plan>'
      );
      process.exit(1);
  }
}

main();
