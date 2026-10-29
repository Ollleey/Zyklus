import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeBoard,
  emptyProject,
  migrateSolution,
  parseSolutionFile,
  upgradeSolution,
  type LegacySolution,
  type PlacedModule,
  type Wire,
} from '@zyklus/sim-core';
import { LEVELS, levelById } from '../src';

const BOARDS = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'reference', 'boards.json'), 'utf8'),
) as Record<string, { modules: PlacedModule[]; wires: Wire[] }>;

/** Alte Breiten (Version 1) – wie gespeicherte Stände vor dem 15-mm-Raster */
const OLD_WIDTH: Record<string, number> = {
  'cpu-klein': 2,
  'cpu-mittel': 3,
  'cpu-schnell': 3,
  di8: 1,
  do8: 1,
  di8hf: 1,
  ai2: 1,
  ao2: 1,
  rel4: 1,
  kop: 1,
};

/** Referenzaufbau so, wie er in Version 1 gespeichert war (lückenlos, Wand bei 5 in Level 13) */
function legacy(id: string): LegacySolution {
  const board = BOARDS[id]!;
  const level = levelById(id)!;
  let x = 0;
  const modules = [...board.modules]
    .sort((a, b) => a.x - b.x)
    .map((m) => {
      if (level.board.wall !== undefined && m.x > level.board.wall && x <= 5) x = 6;
      const out = { ...m, x };
      x += OLD_WIDTH[m.type]!;
      return out;
    });
  const projects = Object.fromEntries(
    modules.filter((m) => m.type.startsWith('cpu')).map((m) => [m.id, emptyProject()]),
  );
  return { version: 1, modules, wires: board.wires, projects };
}

describe('Migration auf das 15-mm-Raster', () => {
  it.each(LEVELS.map((l) => [l.id] as const))('alter Referenzaufbau von %s bleibt gültig', (id) => {
    const level = levelById(id)!;
    const up = migrateSolution(level, legacy(id));
    expect(up.version).toBe(2);
    const a = analyzeBoard(level, up);
    expect(a.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // gleiche Adressen wie mit dem heutigen Referenzaufbau
    const ref = analyzeBoard(level, { version: 2, ...BOARDS[id]!, projects: {} });
    expect([...a.bindings]).toEqual([...ref.bindings]);
  });

  it('Lücken bleiben proportional, Reihenfolge und ids bleiben', () => {
    const level = levelById('01-foerderband')!;
    const old: LegacySolution = {
      version: 1,
      modules: [
        { id: 'do1', type: 'do8', x: 5 },
        { id: 'cpu1', type: 'cpu-klein', x: 0 },
        { id: 'di1', type: 'di8', x: 2 },
      ],
      wires: [],
      projects: { cpu1: emptyProject() },
    };
    const up = migrateSolution(level, old);
    expect(up.modules).toEqual([
      { id: 'do1', type: 'do8', x: 6 + 1 + 2 * 2 },
      { id: 'cpu1', type: 'cpu-klein', x: 0 },
      { id: 'di1', type: 'di8', x: 6 },
    ]);
  });

  it('Level mit Trennwand: rechte Seite beginnt hinter der Wand', () => {
    const level = levelById('13-koppel')!;
    const up = migrateSolution(level, legacy('13-koppel'));
    const a = analyzeBoard(level, up);
    expect(a.ok).toBe(true);
    expect(a.links).toEqual([['cpu1', 'cpu2']]);
    expect(up.modules.find((m) => m.id === 'cpu2')!.x).toBe(level.board.wall! + 2);
  });

  it('zu breite Altaufbauten laden und werden als „ragt über die Hutschiene“ gemeldet', () => {
    const level = levelById('11-sortierweiche')!;
    const old: LegacySolution = {
      version: 1,
      modules: [
        { id: 'cpu1', type: 'cpu-mittel', x: 0 },
        { id: 'di1', type: 'di8', x: 7 },
      ],
      wires: [],
      projects: {},
    };
    const a = analyzeBoard(level, migrateSolution(level, old));
    expect(a.issues.map((i) => i.code)).toContain('out-of-board');
  });

  it('Lösungsdatei der Version 1 wird beim Import umgerechnet', () => {
    const text = JSON.stringify({
      format: 'zyklus-loesung',
      version: 1,
      level: '07-tank',
      savedAt: '2026-10-01T00:00:00.000Z',
      solution: legacy('07-tank'),
    });
    const r = parseSolutionFile(text, '07-tank', levelById);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solution.version).toBe(2);
    expect(analyzeBoard(levelById('07-tank')!, r.solution).ok).toBe(true);
  });

  it('unbekannte Versionen werden nicht geraten', () => {
    expect(upgradeSolution(levelById('01-foerderband')!, { version: 7 })).toBeUndefined();
    expect(upgradeSolution(levelById('01-foerderband')!, null)).toBeUndefined();
  });
});
