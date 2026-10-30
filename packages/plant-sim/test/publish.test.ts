import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySolution } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { parseAnlageFile, publishLevel, type AnlageFile, type PublishTest } from '../src';

const load = (name: string): AnlageFile => {
  const r = parseAnlageFile(readFileSync(join(__dirname, '..', 'vorlagen', name), 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.file;
};

const META = {
  title: 'Sortieren für Kesselbach',
  customer: 'Kesselbach',
  mail: 'Bitte sortieren.',
  notes: '',
};
const TEST: PublishTest = {
  name: '20 Teile',
  durationMs: 40_000,
  seeds: [7, 8],
  controls: [[100, 'S1', true]],
  rules: [
    { kind: 'sorted' },
    { kind: 'noLoss' },
    { kind: 'minIn', bin: 'K2', n: 5 },
    { kind: 'neverOn', output: 'H1' },
  ],
};

describe('Anlage als Auftrag veröffentlichen', () => {
  it('erzeugt ein gültiges Level mit Datenblatt und Prüfkriterien', () => {
    const file = load('sortierstation.anlage.json');
    const level = publishLevel(file.layout, META, [TEST]);
    expect(level.id).toBe('eigen-sortieren-fuer-kesselbach');
    expect(level.tests[0]!.checks).toHaveLength(4);
    expect(level.datasheet.de).toMatch(/\| B1 \| DI \|/);
    expect(level.datasheet.de).toMatch(/Kein Teil landet im falschen Behälter/);
  });

  it('die Beispiellösung besteht, ohne Programm fällt sie durch', () => {
    const file = load('sortierstation.anlage.json');
    // ohne Leuchte H1 als Regel: das Beispiel schaltet sie mit S1 ein
    const level = publishLevel(file.layout, META, [{ ...TEST, rules: TEST.rules.slice(0, 3) }]);
    const good = compileSolution(level, file.solution);
    const v = verifySolution(level, file.solution, good.programs, good.size);
    expect(
      v.runs.flatMap((r) =>
        r.criteria.filter((c) => !c.ok).map((c) => `${c.name.de}: ${c.detail}`),
      ),
    ).toEqual([]);
    expect(v.passed).toBe(true);

    const empty = load('sortierstation-leer.anlage.json');
    const bad = compileSolution(level, empty.solution);
    expect(verifySolution(level, empty.solution, bad.programs, bad.size).passed).toBe(false);
  }, 60_000);

  it('Regel „bleibt aus“ erkennt die eingeschaltete Leuchte', () => {
    const file = load('sortierstation.anlage.json');
    const level = publishLevel(file.layout, META, [TEST]);
    const c = compileSolution(level, file.solution);
    expect(verifySolution(level, file.solution, c.programs, c.size).passed).toBe(false);
  }, 60_000);

  it('meldet fehlende Angaben', () => {
    const file = load('sortierstation.anlage.json');
    expect(() => publishLevel(file.layout, META, [])).toThrow(/Testfall/);
    expect(() => publishLevel(file.layout, META, [{ ...TEST, rules: [] }])).toThrow(/Prüfregel/);
    expect(() =>
      publishLevel(file.layout, META, [{ ...TEST, rules: [{ kind: 'neverOn', output: 'X9' }] }]),
    ).toThrow(/Unbekannter Anschluss/);
  });
});
