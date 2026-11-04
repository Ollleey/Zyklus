#!/usr/bin/env bash
# ZYKLUS für Linux (x86_64) installieren bzw. aktualisieren:
#   curl -fsSL https://raw.githubusercontent.com/Ollleey/Zyklus/main/scripts/install.sh | bash
# Legt das AppImage des neuesten Releases nach ~/.local/bin/zyklus.AppImage und einen
# Starter ins Anwendungsmenü. Spielstände (~/.local/share/de.zyklus.spiel) bleiben erhalten.
# Entfernen: bash install.sh --uninstall
set -euo pipefail
REPO="Ollleey/Zyklus"
BIN="${ZYKLUS_DIR:-$HOME/.local/bin}"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/128x128/apps"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN/zyklus.AppImage" "$APPS/zyklus.desktop" "$ICONS/zyklus.png"
  echo "ZYKLUS entfernt (Spielstände unter ~/.local/share/de.zyklus.spiel bleiben)."
  exit 0
fi

if [ "$(uname -m)" != "x86_64" ]; then
  echo "Es gibt nur eine Version für x86_64 (64-Bit-PC)." >&2
  exit 1
fi

json="$(curl -fsSL -H 'User-Agent: zyklus-install' "https://api.github.com/repos/$REPO/releases/latest")"
url="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*_amd64\.AppImage"' | head -n1 | cut -d'"' -f4)"
tag="$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | head -n1 | cut -d'"' -f4)"
if [ -z "$url" ]; then
  echo "Im neuesten Release ($tag) fehlt das Linux-AppImage." >&2
  exit 1
fi

mkdir -p "$BIN" "$APPS" "$ICONS"
echo "ZYKLUS $tag: lade AppImage ..."
curl -fL --progress-bar "$url" -o "$BIN/zyklus.AppImage.part"
mv "$BIN/zyklus.AppImage.part" "$BIN/zyklus.AppImage"
chmod +x "$BIN/zyklus.AppImage"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/apps/desktop/src-tauri/icons/128x128.png" -o "$ICONS/zyklus.png" || true

cat > "$APPS/zyklus.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ZYKLUS
Comment=Steuerungsbau nach Auftrag
Exec="$BIN/zyklus.AppImage" %F
Icon=zyklus
Categories=Game;Education;
Terminal=false
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "Fertig: ZYKLUS steht im Anwendungsmenü, Start auch mit $BIN/zyklus.AppImage"
if ! ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then
  echo "Hinweis: AppImages brauchen FUSE 2. Fehlt es, startet ZYKLUS mit:"
  echo "  $BIN/zyklus.AppImage --appimage-extract-and-run"
  echo "oder nach der Installation von libfuse2 (Ubuntu 24.04: sudo apt install libfuse2t64)."
fi
