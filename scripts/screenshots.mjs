// Screenshots für den Design-Vergleich (before/after).
// Aufruf: node scripts/screenshots.mjs docs/design/before [http://localhost:5173]
// Voraussetzung: laufender Dev-Server (npm run dev -w @zyklus/game) und Microsoft Edge.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(process.argv[2] ?? 'docs/design/after');
const base = process.argv[3] ?? 'http://localhost:5173';
const ROOT = resolve('.').replace(/\\/g, '/');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** Spielstand leeren, Referenzlösungen einspielen (im Browser über die Dev-Server-Module). */
async function prepare(solutions, solvedUpTo = 14) {
  await page.goto(base);
  await page.evaluate(
    async ({ ROOT, solutions, solvedUpTo }) => {
      for (const k of Object.keys(localStorage))
        if (k.startsWith('zyklus.')) localStorage.removeItem(k);
      const R = `/@fs/${ROOT}`;
      const core = await import(`${R}/packages/sim-core/src/index.ts`);
      const sc = await import(`${R}/packages/scl-compiler/src/index.ts`);
      const lv = await import(`${R}/packages/levels/src/index.ts`);
      const { SANDBOX } = await import(`${R}/apps/game/src/sandbox.ts`);
      const boards = JSON.parse(
        (await import(`${R}/packages/levels/data/reference/boards.json?raw`)).default,
      );
      const progress = {};
      for (const l of lv.LEVELS) progress[l.id] = { solved: l.order <= solvedUpTo, history: [] };
      for (const s of solutions) {
        const level = s.id === 'sandbox' ? SANDBOX : lv.levelById(s.id);
        const board = s.board ?? boards[s.id];
        const sol = { version: 1, ...board, projects: {} };
        const a = core.analyzeBoard(level, sol);
        for (const m of board.modules) {
          if (!m.type.startsWith('cpu')) continue;
          const src = s.source
            ? s.source
            : (await import(`${R}/packages/levels/data/reference/${s.id}.scl?raw`)).default;
          sol.projects[m.id] = core.syncDeviceTags(level, a, m.id, sc.sourceToProject(src).project);
        }
        localStorage.setItem(`zyklus.loesung.${s.id}`, JSON.stringify(sol));
      }
      localStorage.setItem('zyklus.fortschritt', JSON.stringify(progress));
      localStorage.setItem('zyklus.version', '2');
    },
    { ROOT, solutions, solvedUpTo },
  );
  await page.reload();
}

const button = (text) => page.locator('button', { hasText: text }).first();
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
const closeBrief = async () => {
  const close = page.locator('.brief .icon-btn');
  if (await close.count()) await close.click();
};
const startSim = async (speed, ms) => {
  await button(`×${speed}`).click();
  await page.locator('.sim-buttons button', { hasText: 'Start' }).click();
  await page.waitForTimeout(ms);
  const pause = page.locator('.sim-buttons button', { hasText: 'Pause' });
  if (await pause.count()) await pause.click();
};

// Posteingang
await prepare([], 3);
await shot('01-posteingang');

// Level 1 leer
await page.locator('.mail-item').first().click();
await page.waitForTimeout(800);
await closeBrief();
await shot('02-level1-leer');

// Level 1 gelöst während der Simulation
await prepare([{ id: '01-foerderband' }]);
await page.locator('.mail-item').first().click();
await page.waitForTimeout(1000);
await startSim(1, 2500);
await shot('03-level1-simulation');

// Analog-Level (Tank)
await prepare([{ id: '07-tank' }]);
await page.locator('.mail-item', { hasText: 'Pumpe taktet' }).click();
await page.waitForTimeout(1000);
await startSim(100, 1500);
await shot('04-analog-tank');

// Sandkasten mit allen Modultypen
const types = ['cpu-klein', 'di8', 'di8hf', 'do8', 'rel4', 'ai2', 'ao2', 'kop'];
let x = 0;
const modules = types.map((type, i) => {
  const m = { id: `m${i}`, type, x };
  x += type.startsWith('cpu') ? 2 : 1;
  return m;
});
await prepare([
  {
    id: 'sandbox',
    board: {
      modules,
      wires: [
        { device: 'S1', module: 'm1', channel: 0 },
        { device: 'B1', module: 'm5', channel: 0 },
        { device: 'H1', module: 'm3', channel: 0 },
        { device: 'M1', module: 'm4', channel: 0 },
        { device: 'P1', module: 'm6', channel: 0 },
      ],
    },
    source:
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Lampe_1" := "Taster_1";\n"Anzeige" := "Poti";\nEND_ORGANIZATION_BLOCK',
  },
]);
await button('Sandkasten').click();
await page.waitForTimeout(1000);
await closeBrief();
await shot('05-sandkasten-alle-module');

// Handbuch und Bonusspiel
await page.goto(base);
await button('Handbuch').click();
await page.waitForTimeout(400);
await page.locator('.handbook-link', { hasText: 'Baugruppen' }).click();
await shot('06-handbuch');
await page.goto(base);
await button('Klemmen-Patience').click();
await page.waitForTimeout(400);
await shot('07-patience');

// aufräumen
await page.evaluate(() => {
  for (const k of Object.keys(localStorage))
    if (k.startsWith('zyklus.')) localStorage.removeItem(k);
});
await browser.close();
console.log(`Screenshots in ${out}`);
