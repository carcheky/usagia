#!/usr/bin/env bash
# Compila los artefactos de Linux (AppImage + deb) dentro de WSL Debian, para
# validar la configuracion de electron-builder antes de gastar un ciclo de CI.
set -euo pipefail

SRC="/mnt/c/Users/carch/Nextcloud/Scripts/Usagia"
WORK="${1:-/tmp/usagia-build}"

echo "== Copiando el proyecto a $WORK =="
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$SRC"
# Solo lo necesario: sin node_modules de Windows (Electron para Linux se baja aqui).
tar --exclude=node_modules --exclude=dist --exclude=.git --exclude='*.log' -cf - . | (cd "$WORK" && tar -xf -)

cd "$WORK"
echo "== npm ci =="
npm ci --no-audit --no-fund

echo "== electron-builder --linux =="
npx electron-builder --linux --publish never

echo "== ARTEFACTOS =="
ls -la dist/ || true
echo "== FIN =="
