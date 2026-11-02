// Portable Ausgabe: die gebaute zyklus.exe mit Versionsnummer neben die Installer legen.
// Läuft ohne Installation auf Windows 10/11 (WebView2 ist dort vorhanden); Spielstände liegen
// trotzdem im Benutzerprofil (%APPDATA%\de.zyklus.spiel).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const release = join(root, 'apps/desktop/src-tauri/target/release');
const exe = join(release, 'zyklus.exe');
if (!existsSync(exe)) {
  console.error('zyklus.exe fehlt – erst npm run build:desktop');
  process.exit(1);
}
const outDir = join(release, 'bundle/portable');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `ZYKLUS_${version}_x64_portable.exe`);
copyFileSync(exe, out);
console.log('Portable:', out);
