// Release lokal bauen: signierte Windows-Installer (Updater), portable .exe und latest.json für die
// Update-Suche im Spiel. Ein Linux-AppImage aus scripts/linux-appimage.sh wird mit aufgenommen,
// wenn es schon in apps/desktop/src-tauri/target/linux liegt.
//
//   node scripts/release.mjs            # bauen und nach release/ kopieren
//   gh release create v<version> release/*   # hochladen (siehe docs/desktop/README.md)
//
// Der private Signierschlüssel kommt aus TAURI_SIGNING_PRIVATE_KEY bzw. ~/.tauri/zyklus-updater.key
// und gehört nie ins Repository.
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Ollleey/Zyklus';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const keyFile = join(homedir(), '.tauri', 'zyklus-updater.key');
const key =
  process.env.TAURI_SIGNING_PRIVATE_KEY ??
  (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '');
if (!key) {
  console.error(
    'Signierschlüssel fehlt: TAURI_SIGNING_PRIVATE_KEY setzen oder ~/.tauri/zyklus-updater.key anlegen',
  );
  process.exit(1);
}

const skipBuild = process.argv.includes('--no-build');
if (!skipBuild) {
  execSync(`npx tauri build --config "{\\"bundle\\":{\\"createUpdaterArtifacts\\":true}}"`, {
    cwd: join(root, 'apps/desktop'),
    stdio: 'inherit',
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: key,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
    },
  });
  execSync('node scripts/desktop-portable.mjs', { cwd: root, stdio: 'inherit' });
}

const bundle = join(root, 'apps/desktop/src-tauri/target/release/bundle');
const out = join(root, 'release');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const url = (name) => `https://github.com/${REPO}/releases/download/v${version}/${name}`;
const platforms = {};

const setup = `ZYKLUS_${version}_x64-setup.exe`;
copyFileSync(join(bundle, 'nsis', setup), join(out, setup));
platforms['windows-x86_64'] = {
  signature: readFileSync(join(bundle, 'nsis', `${setup}.sig`), 'utf8').trim(),
  url: url(setup),
};
const msi = `ZYKLUS_${version}_x64_de-DE.msi`;
if (existsSync(join(bundle, 'msi', msi))) copyFileSync(join(bundle, 'msi', msi), join(out, msi));
const portable = `ZYKLUS_${version}_x64_portable.exe`;
copyFileSync(join(bundle, 'portable', portable), join(out, portable));

const linuxDir = join(root, 'apps/desktop/src-tauri/target/linux');
const appimage = existsSync(linuxDir)
  ? readdirSync(linuxDir).find((f) => f === `ZYKLUS_${version}_amd64.AppImage`)
  : undefined;
if (appimage) {
  copyFileSync(join(linuxDir, appimage), join(out, appimage));
  const sig = join(linuxDir, `${appimage}.sig`);
  if (existsSync(sig))
    platforms['linux-x86_64'] = { signature: readFileSync(sig, 'utf8').trim(), url: url(appimage) };
} else console.warn('Kein Linux-AppImage für diese Version – nur Windows im Release');

const notesFile = join(root, 'release-notes.md');
const latest = {
  version,
  notes: existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : `ZYKLUS ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(join(out, 'latest.json'), JSON.stringify(latest, null, 2));
console.log(`release/ fertig: ${readdirSync(out).join(', ')}`);
