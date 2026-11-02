// Offline-Prüfung: liefert einen Build über einen lokalen Server aus, sperrt jede Anfrage an andere
// Adressen und öffnet Posteingang, Auftrag 1 (Monaco) und Sandkasten (Web Worker).
// Aufruf: node scripts/offline-check.mjs [apps/game/dist-desktop]
// Beendet sich mit Code 1, wenn eine externe Anfrage versucht wurde oder ein Fehler auftrat.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const dir = resolve(process.argv[2] ?? 'apps/game/dist-desktop');
if (!existsSync(join(dir, 'index.html'))) {
  console.error(
    `Kein Build in ${dir} – erst bauen (npm run build -w @zyklus/game -- --mode desktop)`,
  );
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dir, path);
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory())
    file = join(dir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const external = [];
const errors = [];
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:'))
    return route.continue();
  external.push(url);
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const t0 = Date.now();
await page.goto(origin);
await page.locator('.inbox').waitFor();
const startMs = Date.now() - t0;
await page.locator('.mail-item').first().click();
await page
  .locator('.monaco-editor, .fup-editor')
  .first()
  .waitFor({ timeout: 20000 })
  .catch(() => {});
await page.locator('button', { hasText: 'Posteingang' }).first().click();
await page.locator('button', { hasText: 'Sandkasten' }).first().click();
await page.locator('.pe-svg').waitFor();
await page
  .locator('button', { hasText: 'Start' })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(1500);
await browser.close();
server.close();

console.log(`Start bis Posteingang: ${startMs} ms`);
if (external.length) console.error('Externe Anfragen:\n' + [...new Set(external)].join('\n'));
if (errors.length) console.error('Fehler:\n' + errors.join('\n'));
if (external.length || errors.length) process.exit(1);
console.log('Offline-Prüfung bestanden: keine externen Anfragen, keine Fehler.');
