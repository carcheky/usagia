#!/usr/bin/env bash
# Simula el versionado de semantic-release contra un remoto bare LOCAL, para
# comprobar SIN GitHub que:
#   - la rama beta produce una pre-release (v0.1.0-beta.1)
#   - la rama main, al recibir beta por fast-forward, gradua a la estable
#     (v0.1.0)
#
# Todo ocurre dentro del filesystem de WSL (/tmp), no sobre /mnt/c: git fetch
# sobre un remoto local en drvfs falla con exit 128.
set -euo pipefail

SRC="/mnt/c/Users/carch/Nextcloud/Scripts/Usagia"
BARE="/tmp/usagia-remote.git"
WORK="/tmp/usagia-semrel"

echo "== clonando el repo (estado commiteado) al disco de WSL =="
rm -rf "$BARE" "$WORK"
# Un clon basta: para el versionado solo importan los COMMITS, no el estado
# del arbol de trabajo.
git clone -q "$SRC" "$WORK"
cd "$WORK"
git checkout -q beta

echo "== remoto bare local =="
git init --bare -q "$BARE"
# El bare nace con HEAD -> refs/heads/master, que no existe: semantic-release
# hace "git fetch --tags -- <remoto>" y falla con "couldn't find remote ref
# HEAD". Se apunta HEAD a main, que si existe.
git -C "$BARE" symbolic-ref HEAD refs/heads/main
git remote remove origin-test 2>/dev/null || true
git remote add origin-test "$BARE"
git push -q origin-test main beta
git -C "$BARE" symbolic-ref HEAD refs/heads/main

echo "== config de semantic-release SIN el plugin de GitHub =="
cat > .releaserc-test.json <<'JSON'
{
  "branches": [
    "main",
    { "name": "beta", "prerelease": "beta" },
    "+([0-9])?(.{+([0-9]),x}).x"
  ],
  "tagFormat": "v${version}",
  "repositoryUrl": "file:///tmp/usagia-remote.git",
  "plugins": [
    [
      "@semantic-release/commit-analyzer",
      {
        "preset": "conventionalcommits",
        "presetConfig": {},
        "releaseRules": [
          { "breaking": true, "release": "major" },
          { "type": "feat", "release": "minor" },
          { "type": "fix", "release": "patch" },
          { "type": "perf", "release": "patch" },
          { "type": "refactor", "release": false },
          { "type": "docs", "release": false },
          { "type": "chore", "release": false },
          { "type": "test", "release": false },
          { "type": "ci", "release": false },
          { "type": "build", "release": false },
          { "type": "style", "release": false }
        ]
      }
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/git",
      {
        "assets": [],
        "message": "Release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ]
  ]
}
JSON
mv .releaserc.json .releaserc.real.json
cp .releaserc-test.json .releaserc.json

SR="npx --yes -p semantic-release@25 -p conventional-changelog-conventionalcommits@9 -p @semantic-release/git@11 semantic-release --no-ci"

echo
echo "########## 1) RAMA beta: release REAL (crea el tag) ##########"
git checkout -q beta
$SR 2>&1 | grep -Ei "next release version|will publish|tag |Add tag|✔" | tail -8 || true
echo "--- tags tras la beta ---"
git -C "$BARE" tag -l | sed 's/^/    /' || true

echo
echo "########## 2) RAMA main (tras merge --ff-only beta): debe GRADUAR ##########"
git checkout -q main
git merge -q --ff-only beta
$SR 2>&1 | grep -Ei "next release version|will publish|tag |Add tag|✔" | tail -8 || true
echo "--- tags tras la estable ---"
git -C "$BARE" tag -l | sed 's/^/    /' || true

echo
echo "########## 3) RAMA beta OTRA VEZ (tras la estable) ##########"
git checkout -q beta
$SR 2>&1 | grep -Ei "next release|will publish|version.*is|prerelease" | tail -5 || true

echo
echo "== FIN =="
