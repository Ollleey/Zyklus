import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SIZE,
  betterThan,
  emptyProject,
  fakeDistribution,
  histogram,
  parseSolutionFile,
  toSolutionFile,
  type Solution,
} from '../src';

describe('Vergleichsverteilungen', () => {
  it('sind deterministisch je Level und Metrik', () => {
    expect(fakeDistribution('a', 'energy', 1000)).toEqual(fakeDistribution('a', 'energy', 1000));
    expect(fakeDistribution('a', 'energy', 1000)).not.toEqual(
      fakeDistribution('b', 'energy', 1000),
    );
    expect(fakeDistribution('a', 'cost', 1000)).not.toEqual(fakeDistribution('a', 'energy', 1000));
  });

  it('liegen überwiegend über dem Richtwert, wenige darunter', () => {
    const xs = fakeDistribution('lvl', 'size', 20);
    expect(xs).toHaveLength(SAMPLE_SIZE);
    const below = xs.filter((x) => x < 20).length / xs.length;
    expect(below).toBeGreaterThan(0.02);
    expect(below).toBeLessThan(0.15);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(14);
    expect(Math.max(...xs)).toBeGreaterThan(40);
  });

  it('kleine Richtwerte bleiben ganzzahlig und ≥ 1', () => {
    const xs = fakeDistribution('lvl', 'size', 1);
    expect(xs.every((x) => Number.isInteger(x) && x >= 1)).toBe(true);
  });

  it('Histogramm zählt alle Werte und schließt den eigenen Wert ein', () => {
    const xs = fakeDistribution('lvl', 'energy', 500);
    const h = histogram(xs, 10, [5]);
    expect(h.bins).toHaveLength(10);
    expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(xs.length);
    expect(h.min).toBe(5);
  });

  it('besser als x %', () => {
    expect(betterThan([1, 2, 3, 4], 2)).toBe(0.5);
    expect(betterThan([1, 2, 3, 4], 0)).toBe(1);
    expect(betterThan([], 3)).toBe(0);
  });
});

describe('Lösungsdatei', () => {
  const sol: Solution = {
    version: 2,
    modules: [{ id: 'cpu1', type: 'cpu-klein', x: 0 }],
    wires: [{ device: 'S1', module: 'di1', channel: 0 }],
    projects: { cpu1: emptyProject() },
  };

  it('Export → Import ergibt dieselbe Lösung', () => {
    const text = toSolutionFile('01-foerderband', sol, new Date('2026-10-29T10:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({
      format: 'zyklus-loesung',
      version: 2,
      level: '01-foerderband',
    });
    const r = parseSolutionFile(text, '01-foerderband');
    expect(r).toEqual({
      ok: true,
      level: '01-foerderband',
      solution: sol,
      savedAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it.each([
    ['kein json', /kein gültiges JSON/],
    ['{"format":"anders"}', /keine ZYKLUS-Lösungsdatei/],
    ['{"format":"zyklus-loesung","version":99,"level":"x"}', /Dateiversion 99/],
    [
      '{"format":"zyklus-loesung","version":1,"level":"02-zweihand","solution":{}}',
      /gehört zu Auftrag „02-zweihand“/,
    ],
    [
      '{"format":"zyklus-loesung","version":1,"level":"01-foerderband","solution":{"version":1}}',
      /Baugruppenliste fehlt/,
    ],
    [
      '{"format":"zyklus-loesung","version":1,"level":"01-foerderband","solution":{"version":1,"modules":[{"id":1}],"wires":[],"projects":{}}}',
      /Ungültige Baugruppe/,
    ],
    [
      '{"format":"zyklus-loesung","version":1,"level":"01-foerderband","solution":{"version":1,"modules":[],"wires":[],"projects":{"cpu1":{"tags":[]}}}}',
      /Programm von cpu1 ist unvollständig/,
    ],
  ])('weist ab: %s', (text, re) => {
    const r = parseSolutionFile(text, '01-foerderband');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});
