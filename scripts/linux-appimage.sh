#!/bin/bash
# Linux-AppImage lokal bauen (z. B. unter Windows mit Docker/Rancher Desktop), Aufruf im Repository:
#   docker run --rm -v "$PWD:/src:ro" -v "$PWD/apps/desktop/src-tauri/target/linux:/out" \
#     ubuntu:22.04 bash /src/scripts/linux-appimage.sh
# Baut ZYKLUS als AppImage in einem Ubuntu-22.04-Container (ältere glibc = läuft auf mehr Distributionen).
# /src = Repository (nur lesen, Arbeitsstand inkl. ungespeicherter Änderungen), /out = Ausgabe.
# Wiederholt aufrufbar im selben Container: Werkzeuge und Rust-Cache bleiben erhalten.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if [ ! -d /opt/node-v24.16.0-linux-x64 ]; then
  apt-get update -qq
  apt-get install -y -qq build-essential curl wget file git xz-utils ca-certificates rsync \
    libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf >/dev/null
  curl -fsSL https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz | tar -xJ -C /opt
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal >/dev/null
fi
export PATH=/opt/node-v24.16.0-linux-x64/bin:$PATH
. "$HOME/.cargo/env"

mkdir -p /build
rsync -a --delete --exclude node_modules --exclude 'dist*' --exclude target --exclude gen --exclude .git \
  --exclude '*.txt' /src/ /build/
cd /build
[ -d node_modules ] && [ package-lock.json -ot node_modules ] || npm ci --no-audit --no-fund
export APPIMAGE_EXTRACT_AND_RUN=1
cd apps/desktop
npx tauri build --bundles appimage
cp src-tauri/target/release/bundle/appimage/*.AppImage /out/
ls -la /out/*.AppImage
