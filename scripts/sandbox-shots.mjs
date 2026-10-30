// Screenshots des Sandkastens und Leistungsmessung (50 Werkstücke, 30 Bauteile, ×100).
// Aufruf: node scripts/sandbox-shots.mjs [docs/sandbox] [http://localhost:5173] [http://localhost:4173]
// Voraussetzung: laufender Dev-Server (npm run dev -w @zyklus/game) und Microsoft Edge. Die
// Leistung wird auf der dritten Adresse gemessen (Produktions-Build über `npm run preview`),
// ohne Angabe auf dem Dev-Server.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(process.argv[2] ?? 'docs/sandbox');
const base = process.argv[3] ?? 'http://localhost:5173';
const perfBase = process.argv[4] ?? base;
const ROOT = resolve('.').replace(/\\/g, '/');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const button = (text) => page.getByRole('button', { name: text, exact: true }).first();
const tab = (text) => page.locator('.dock-tab', { hasText: text }).first();

async function fresh() {
  await page.goto(base);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('zyklus.')) localStorage.removeItem(k);
    localStorage.setItem('zyklus.version', '3');
  });
  await page.reload();
}

async function openSandbox() {
  await page.locator('button', { hasText: 'Sandkasten' }).first().click();
  await page.waitForSelector('.pe-svg');
  await page.waitForTimeout(400);
}

/** Taster/Schalter in der laufenden Anlage anklicken */
async function clickPart(tag) {
  const g = page
    .locator('.pe-part', { has: page.locator('.pe-tag', { hasText: new RegExp(`^${tag}$`) }) })
    .first();
  const box = await g.locator('g').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// 1. Erster Besuch: Sortierstation
await fresh();
await openSandbox();
await shot('01-sortierstation-draufsicht');
await button('Seitenansicht').click();
await page.waitForTimeout(200);
await shot('02-sortierstation-seitenansicht');
await button('Draufsicht').click();

// 2. Live: Start, Schalter S1 ein, ×10
await page.locator('button', { hasText: 'Start' }).first().click();
await page.waitForTimeout(200);
await clickPart('S1');
await button('×10').click();
await page.waitForTimeout(6000);
await shot('03-sortierstation-live');

// 3. Schaltschrank und Signale mit Forcewert
await tab('Schaltschrank').click();
await page.waitForTimeout(300);
await shot('04-schaltschrank');
await tab('Signale').click();
await page.waitForTimeout(200);
const row = page.locator('.signals-table tbody tr', { hasText: 'Leuchte' }).first();
await row.locator('.signals-force input[type=checkbox]').click();
await page.waitForTimeout(300);
await shot('05-signale-forcen');
await tab('Anlage').click();
await button('❚❚ Pause')
  .click()
  .catch(() => {});

// 4. Meine Anlagen mit Vorlagen
await page.locator('.menu > button', { hasText: 'Mehr' }).click();
await page.locator('.menu-item', { hasText: 'Meine Anlagen' }).click();
await page.waitForTimeout(300);
await shot('06-meine-anlagen');

// 5. Tankanlage (Vorlage) im Automatikbetrieb
await page
  .locator('.myplants-templates li', { hasText: 'Tankanlage' })
  .locator('button', { hasText: 'Mit Beispielprogramm' })
  .click();
await page.waitForTimeout(400);
await page.locator('button', { hasText: 'Start' }).first().click();
await page.waitForTimeout(200);
await clickPart('S1');
await clickPart('S1'); // Hand → Auto
await button('×10').click();
await page.waitForTimeout(5000);
await button('Seitenansicht').click();
await page.waitForTimeout(300);
await shot('07-tankanlage-seitenansicht');

// 6. Sortierstation als Auftrag veröffentlichen und im Posteingang spielen
await fresh();
await openSandbox();
await page.locator('.menu > button', { hasText: 'Mehr' }).click();
await page.locator('.menu-item', { hasText: 'Als Auftrag veröffentlichen' }).click();
await page.locator('.publish input').first().fill('Sortieren für Kesselbach');
await page.locator('button', { hasText: 'Mit meiner Lösung prüfen' }).click();
await page.locator('.publish-ok').waitFor({ timeout: 60000 });
await shot('09-auftrag-veroeffentlichen');
await page.locator('.publish button', { hasText: 'Veröffentlichen' }).click();
await page.locator('button', { hasText: 'Posteingang' }).first().click();
// Lösung aus dem Sandkasten übernehmen (wie ein Spieler, der die Anlage selbst gebaut hat)
await page.evaluate(() =>
  localStorage.setItem(
    'zyklus.loesung.eigen-sortieren-fuer-kesselbach',
    localStorage.getItem('zyklus.loesung.sandkasten'),
  ),
);
await page.locator('.custom-item button.mail-item').first().click();
await page
  .locator('.brief .icon-btn')
  .click()
  .catch(() => {});
await page.locator('button', { hasText: 'Prüfen' }).first().click();
await page.waitForTimeout(8000);
await shot('10-eigener-auftrag-geprueft');
const verdict = await page
  .locator('[role=dialog]')
  .first()
  .innerText()
  .catch(() => '');
console.log('Eigener Auftrag geprüft:', verdict.split('\n').slice(0, 3).join(' | '));

// 7. Leistung: 30 Bauteile, 50 Werkstücke, ×100 (Aufbau über die Module des Dev-Servers)
await fresh();
const data = await page.evaluate(async (ROOT) => {
  const R = `/@fs/${ROOT}`;
  const ps = await import(`${R}/packages/plant-sim/src/index.ts`);
  const core = await import(`${R}/packages/sim-core/src/index.ts`);
  const sc = await import(`${R}/packages/scl-compiler/src/index.ts`);
  const parts = [];
  const add = (type, x, y, z, rot = 0) => {
    const p = ps.createPart(type, parts, { x, y, z });
    p.rot = rot;
    parts.push(p);
  };
  for (let i = 0; i < 5; i++) {
    const x = 300 + i * 600;
    add('belt', x, 200, 100);
    add('inductive', x - 150, 236, 115, 270);
    add('diffuse', x, 275, 115, 270);
    add('thrubeam', x + 150, 150, 115, 90);
    add('cylinder', x + 200, 290, 100, 270);
  }
  for (let i = 0; i < 4; i++) add('bin', 300 + i * 600, 70, 60);
  add('stopper', 2990, 200, 100);
  const layout = { formatVersion: 1, parts, seed: 1, area: { w: 4000, h: 1200 }, workpieces: [] };
  for (let i = 0; i < 50; i++)
    layout.workpieces.push({
      material: i % 2 ? 'stahl' : 'holz',
      color: i % 2 ? 'silber' : 'natur',
      size: 'mittel',
      x: 20 + i * 58,
      y: 200,
      z: 100,
    });
  const level = ps.levelFromLayout(layout);
  const modules = [
    { id: 'cpu1', type: 'cpu-schnell', x: 0 },
    { id: 'dio1', type: 'dio8', x: 7 },
    { id: 'dio2', type: 'dio8', x: 9 },
    { id: 'rel1', type: 'rel4', x: 11 },
    { id: 'rel2', type: 'rel4', x: 13 },
  ];
  const wired = core.autoWire(level, { ...core.emptySolution(), modules }).solution;
  const a = core.analyzeBoard(level, wired);
  const tags = core.syncDeviceTags(level, a, 'cpu1', core.emptyProject()).tags;
  const belts = parts.filter((p) => p.type === 'belt').map((p) => `"${p.tag}_Bandmotor" := TRUE;`);
  const src = `ORGANIZATION_BLOCK "Main"\nBEGIN\n${belts.join('\n')}\nEND_ORGANIZATION_BLOCK`;
  const project = sc.sourceToProject(src, tags).project;
  return { layout, solution: { ...wired, projects: { cpu1: { tags, blocks: project.blocks } } } };
}, ROOT);
await page.goto(perfBase);
await page.evaluate((d) => {
  for (const k of Object.keys(localStorage))
    if (k.startsWith('zyklus.')) localStorage.removeItem(k);
  localStorage.setItem('zyklus.version', '3');
  localStorage.setItem('zyklus.anlage.aktuell', JSON.stringify(d.layout));
  localStorage.setItem('zyklus.anlage.angaben', JSON.stringify({ name: 'Leistungstest' }));
  localStorage.setItem('zyklus.loesung.sandkasten', JSON.stringify(d.solution));
}, data);
await page.reload();
await openSandbox();
await page.locator('button', { hasText: 'Start' }).first().click();
await button('×100').click();
await page.waitForTimeout(1500);
const perf = await page.evaluate(async () => {
  const simTime = () =>
    Number(document.querySelector('.sim-time b')?.textContent?.replace(' s', '') ?? 0);
  const t0 = simTime();
  const w0 = performance.now();
  let frames = 0;
  await new Promise((done) => {
    const tick = () => {
      frames++;
      if (performance.now() - w0 < 5000) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const wall = (performance.now() - w0) / 1000;
  return { fps: frames / wall, speed: (simTime() - t0) / wall };
});
await shot('08-leistungstest');
const build = perfBase === base ? 'Dev-Server' : 'Produktions-Build';
const report = `Leistungstest (${build}, 50 Werkstücke, 30 Bauteile, eingestellt ×100): ${perf.fps.toFixed(1)} Bilder/s, Simulation ×${perf.speed.toFixed(0)}`;
console.log(report);
writeFileSync(join(out, 'leistung.txt'), `${report}\n`);
await browser.close();
