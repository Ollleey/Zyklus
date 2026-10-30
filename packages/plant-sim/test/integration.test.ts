import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LevelRun } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { SandboxPlant, levelFromLayout, parseAnlageFile, type AnlageFile } from '../src';

function load(name: string): AnlageFile {
  const r = parseAnlageFile(readFileSync(join(__dirname, '..', 'vorlagen', name), 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.file;
}

function start(file: AnlageFile) {
  const level = levelFromLayout(file.layout);
  const c = compileSolution(level, file.solution);
  if (!c.ok) throw new Error('Programm nicht übersetzbar');
  const run = new LevelRun(level, file.solution, c.programs, { seed: file.layout.seed });
  return { run, plant: run.plant as SandboxPlant };
}

describe('Vorlagen mit Beispielprogramm', () => {
  it('Sortierstation sortiert 100 Teile (fester Seed) ohne Fehlsortierung', () => {
    const { run, plant } = start(load('sortierstation.anlage.json'));
    plant.setControl('S1', true);
    const w = plant.world;
    while (run.time < 250_000) {
      run.runTo(run.time + 1000);
      const t = w.tally();
      if (t.binned + t.lost >= 100) break;
    }
    const [k1, k2] = ['K1', 'K2'].map((tag) => w.st(w.find(tag)!));
    expect(w.spawned).toBe(100);
    expect(w.tally()).toEqual({ free: 0, binned: 100, lost: 0 });
    expect(k1!.missorted + k2!.missorted).toBe(0);
    // beide Werkstoffe kommen vor
    expect(k1!.total).toBeGreaterThan(20);
    expect(k2!.total).toBeGreaterThan(20);
    expect(k1!.counts.stahl).toBe(k1!.total);
    expect(k2!.counts.holz).toBe(k2!.total);
  }, 120_000);

  it('Materialprüfung trennt Metall, Holz und Kunststoff', () => {
    const { run, plant } = start(load('materialpruefung.anlage.json'));
    plant.setControl('S1', true);
    run.runTo(70_000);
    const w = plant.world;
    expect(w.tally()).toEqual({ free: 0, binned: 12, lost: 0 });
    for (const tag of ['K1', 'K2', 'K3']) {
      expect(w.st(w.find(tag)!)).toMatchObject({ total: 4, missorted: 0 });
    }
  }, 120_000);

  it('Tankanlage regelt im Automatikbetrieb zwischen 40 und 70 %', () => {
    const { run, plant } = start(load('tankanlage.anlage.json'));
    plant.setControl('S1', 2); // Auto
    const w = plant.world;
    const tank = w.find('T1')!;
    let lo = 100;
    let hi = 0;
    run.runTo(40_000);
    for (let t = 40_000; t < 160_000; t += 500) {
      run.runTo(t);
      lo = Math.min(lo, w.levelOf(tank));
      hi = Math.max(hi, w.levelOf(tank));
    }
    expect(lo).toBeGreaterThan(37);
    expect(lo).toBeLessThan(42);
    expect(hi).toBeGreaterThan(68);
    expect(hi).toBeLessThan(73);
  }, 120_000);
});
