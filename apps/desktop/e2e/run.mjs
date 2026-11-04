// E2E-Test der gebauten Desktop-Anwendung über tauri-driver (WebDriver).
// Aufruf: npm run e2e -w @zyklus/desktop   (vorher: npm run build:desktop bzw. tauri build --no-bundle)
// Voraussetzung: `cargo install tauri-driver`; msedgedriver passend zur WebView2 wird bei Bedarf
// nach e2e/.drivers geladen. Spielstände liegen in e2e/.tmp (ZYKLUS_DATA_DIR/ZYKLUS_DOCS_DIR),
// echte Spielstände bleiben unberührt.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exe = resolve(here, '../src-tauri/target/release/zyklus.exe');
const tmp = resolve(here, '.tmp');
const data = join(tmp, 'daten');
const docs = join(tmp, 'dokumente');
const PORT = 4444;
const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

if (!existsSync(exe)) {
  console.error(`App fehlt: ${exe} – erst bauen (npx tauri build --no-bundle in apps/desktop)`);
  process.exit(1);
}

/** msedgedriver passend zur installierten WebView2 */
async function edgeDriver() {
  const base = 'C:/Program Files (x86)/Microsoft/EdgeWebView/Application';
  const version = readdirSync(base).find((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d));
  if (!version) throw new Error('WebView2 nicht gefunden');
  const dir = resolve(here, '.drivers', version);
  const driver = join(dir, 'msedgedriver.exe');
  if (existsSync(driver)) return driver;
  mkdirSync(dir, { recursive: true });
  const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip`;
  console.log(`lade msedgedriver ${version} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status} ${url}`);
  const zip = join(dir, 'driver.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${dir}'`]);
  return driver;
}

// ---------------------------------------------------------------- WebDriver
async function wd(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
  return json.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(args = []) {
  const s = await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: { browserName: 'wry', 'tauri:options': { application: exe, args } },
    },
  });
  const id = s.sessionId;
  const find = async (css, timeout = 15000) => {
    const end = Date.now() + timeout;
    for (;;) {
      try {
        const v = await wd('POST', `/session/${id}/element`, { using: 'css selector', value: css });
        return v[W3C_ELEMENT];
      } catch (e) {
        if (Date.now() > end) throw new Error(`nicht gefunden: ${css}`);
        await sleep(200);
      }
    }
  };
  const byText = async (css, text, timeout = 15000) => {
    const end = Date.now() + timeout;
    for (;;) {
      const els = await wd('POST', `/session/${id}/elements`, {
        using: 'css selector',
        value: css,
      });
      for (const e of els) {
        const t = await wd('GET', `/session/${id}/element/${e[W3C_ELEMENT]}/text`);
        if (t.includes(text)) return e[W3C_ELEMENT];
      }
      if (Date.now() > end) throw new Error(`nicht gefunden: ${css} mit „${text}“`);
      await sleep(200);
    }
  };
  return {
    find,
    byText,
    click: async (el) => wd('POST', `/session/${id}/element/${el}/click`, {}),
    text: async (el) => wd('GET', `/session/${id}/element/${el}/text`),
    title: async () => wd('GET', `/session/${id}/title`),
    exists: async (css) =>
      (await wd('POST', `/session/${id}/elements`, { using: 'css selector', value: css })).length >
      0,
    close: async () => wd('DELETE', `/session/${id}`),
  };
}

// ---------------------------------------------------------------- Ablauf
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};

rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(data, 'loesungen'), { recursive: true });
mkdirSync(docs, { recursive: true });
// Lösung für Auftrag 1 hinterlegen (wie vom Spieler gebaut)
copyFileSync(
  join(here, 'fixtures/01-foerderband.json'),
  join(data, 'loesungen/01-foerderband.json'),
);

const driverPath = await edgeDriver();
const tauriDriver = join(homedir(), '.cargo/bin/tauri-driver.exe');
const driver = spawn(tauriDriver, ['--port', String(PORT), '--native-driver', driverPath], {
  env: { ...process.env, ZYKLUS_DATA_DIR: data, ZYKLUS_DOCS_DIR: docs },
  stdio: 'ignore',
});
await sleep(1500);

try {
  // 1. Start, Angebot zum Web-Import ablehnen, Auftrag 1 prüfen
  const t0 = Date.now();
  let s = await session();
  await s.find('.inbox');
  check('Start bis Posteingang', true, `${Date.now() - t0} ms`);
  if (await s.exists('.confirm')) await s.click(await s.byText('.confirm button', 'neu beginnen'));
  // Auftrag 1 (vor ihm steht die Einführung)
  await s.click(await s.byText('.mail-item', 'Kesselbach'));
  await s.find('.topbar');
  if (await s.exists('.brief .icon-btn')) await s.click(await s.find('.brief .icon-btn'));
  await s.click(await s.byText('.topbar button', 'Prüfen'));
  const verdict = await s.text(await s.find('.result h2, [role=dialog] h2', 60000));
  check('Auftrag 1 besteht die Prüfung', /erfüllt/.test(verdict), verdict);
  await s.click(await s.byText('[role=dialog] button', 'Schließen'));
  await s.click(await s.byText('button', 'Posteingang'));
  const p1 = await s.text(await s.find('.inbox-progress'));
  check('Fortschritt nach dem Lösen', p1.startsWith('1 /'), p1);
  await sleep(1200); // gebündeltes Schreiben abwarten
  await s.close();
  await sleep(1500);

  // 2. Neustart: Fortschritt aus den Dateien
  s = await session();
  const p2 = await s.text(await s.find('.inbox-progress'));
  check('Fortschritt nach Neustart', p2.startsWith('1 /'), p2);
  check('Spielstand als Datei', existsSync(join(data, 'fortschritt.json')));
  // Sprache wechseln: die Oberfläche lädt neu, die Wahl muss vorher in der Datei stehen
  await s.click(await s.find('.lang-select option[value=en]'));
  const en = await s.byText('.inbox-progress', 'jobs done').then(
    () => true,
    () => false,
  );
  check('Englisch nach dem Umschalten', en);
  await s.close();
  await sleep(1500);
  s = await session();
  const en2 = await s.byText('.inbox-progress', 'jobs done').then(
    () => true,
    () => false,
  );
  check('Englisch nach Neustart', en2);
  await s.click(await s.find('.lang-select option[value=de]'));
  await s.byText('.inbox-progress', 'erledigt');
  // Update-Suche gegen das veröffentlichte Release (braucht Internet, nur mit ZYKLUS_E2E_UPDATE=1)
  if (process.env.ZYKLUS_E2E_UPDATE) {
    await s.click(await s.byText('.workshop .btn', 'Einstellungen'));
    await s.click(await s.byText('.settings .btn', 'Nach Updates suchen'));
    const r = await s.text(
      await s.find(
        '.settings-updates .publish-ok, .settings-updates .pe-error, .settings-found',
        30000,
      ),
    );
    check('Update-Suche', !/fehlgeschlagen/.test(r), r);
  }
  await s.close();
  await sleep(1500);

  // 3. Doppelklick auf eine Anlagendatei bei laufendem Spiel: zweiter Aufruf mit der Datei gibt
  //    sie an das offene Fenster weiter (eine Instanz). Den Kaltstart mit Datei kann msedgedriver
  //    nicht nachstellen (er reicht Argumente als Browser-Schalter weiter); er steht in der Checkliste.
  const anlage = join(tmp, 'Tankanlage.anlage');
  copyFileSync(join(here, 'fixtures/Tankanlage.anlage'), anlage);
  s = await session();
  await s.find('.inbox');
  spawn(exe, [anlage], { stdio: 'ignore', detached: true }).unref();
  await s.find('.pe-svg', 20000);
  const customer = await s.text(await s.find('.topbar .customer'));
  check('Anlagendatei öffnet den Sandkasten', customer.includes('Tankanlage'), customer);
  check('Fenstertitel', (await s.title()).includes('Tankanlage'), await s.title());
  await sleep(1500);
  const saved = existsSync(join(docs, 'ZYKLUS', 'Anlagen'))
    ? readdirSync(join(docs, 'ZYKLUS', 'Anlagen')).filter((f) => f.endsWith('.anlage'))
    : [];
  check(
    'Anlage unter „Meine Anlagen“ gespeichert',
    saved.some((f) => f.startsWith('Tankanlage')),
    saved.join(', '),
  );
  await s.close();
} catch (e) {
  check('Ablauf', false, e.message);
} finally {
  driver.kill();
}

// 4. Offline: App direkt starten, jeder Netzzugriff der WebView geht an einen toten Proxy.
//    Kaltstart mit Anlagendatei; der Fenstertitel kommt aus der Oberfläche und zeigt, dass sie läuft.
{
  await sleep(1500);
  const anlage = join(tmp, 'Offline.anlage');
  copyFileSync(join(here, 'fixtures/Tankanlage.anlage'), anlage);
  const app = spawn(exe, [anlage], {
    env: {
      ...process.env,
      ZYKLUS_DATA_DIR: data,
      ZYKLUS_DOCS_DIR: docs,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        '--proxy-server=http://127.0.0.1:9 --proxy-bypass-list=<-loopback>',
    },
    stdio: 'ignore',
  });
  let title = '';
  for (let i = 0; i < 30 && !title.includes('Tankanlage'); i++) {
    await sleep(500);
    title = execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${app.pid} -ErrorAction SilentlyContinue).MainWindowTitle`,
    ])
      .toString()
      .trim();
  }
  check('Offline-Kaltstart mit Anlagendatei', title.includes('Tankanlage'), title);
  app.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} Prüfung(en) fehlgeschlagen` : 'E2E bestanden');
process.exit(failed ? 1 : 0);
