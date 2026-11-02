// App-Icon aus Code: stilisierte E/A-Baugruppe (Gehäuse, Anzeige, LED, Klemmen) als SVG,
// gerendert zu 1024 × 1024 PNG. `tauri icon` erzeugt daraus alle Größen.
// Aufruf: node scripts/make-icon.mjs (aus apps/desktop über `npm run icon`)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/desktop/src-tauri/icons');
mkdirSync(out, { recursive: true });

const vents = Array.from(
  { length: 7 },
  (_, i) => `<rect x="${330 + i * 56}" y="190" width="30" height="70" rx="10" fill="#14171B"/>`,
).join('');
const terminals = Array.from(
  { length: 4 },
  (_, i) =>
    `<rect x="${318 + i * 102}" y="752" width="78" height="96" rx="14" fill="#F08A1C"/><circle cx="${357 + i * 102}" cy="800" r="16" fill="#7A3E05"/>`,
).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="40" y="40" width="944" height="944" rx="200" fill="#1A1E23"/>
  <rect x="120" y="470" width="784" height="84" rx="12" fill="#6C737C"/>
  <rect x="270" y="130" width="484" height="764" rx="48" fill="#2A3038" stroke="#4A535E" stroke-width="12"/>
  ${vents}
  <rect x="320" y="300" width="384" height="230" rx="22" fill="#0E1A17" stroke="#3CC8DC" stroke-width="6"/>
  <text x="512" y="478" text-anchor="middle" font-family="Consolas, monospace" font-weight="700" font-size="200" fill="#3FD98A">Z</text>
  <circle cx="360" cy="610" r="30" fill="#3FD98A"/>
  <circle cx="450" cy="610" r="30" fill="#F4C443"/>
  <rect x="520" y="590" width="180" height="40" rx="10" fill="#14171B"/>
  ${terminals}
</svg>`;
writeFileSync(resolve(out, 'source.svg'), svg);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: resolve(out, 'source.png'), omitBackground: true });
await browser.close();
console.log('Icon geschrieben:', resolve(out, 'source.png'));
