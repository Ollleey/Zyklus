import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeBoard,
  syncDeviceTags,
  verifySolution,
  type Level,
  type PlacedModule,
  type Solution,
  type Wire,
} from '@zyklus/sim-core';
import { formatDiagnostic, sourceToProject } from '@zyklus/scl-compiler';
import { LEVELS, compileSolution, levelById } from '../src';

const DATA = join(__dirname, '..', 'data', 'reference');
const BOARDS = JSON.parse(readFileSync(join(DATA, 'boards.json'), 'utf8')) as Record<
  string,
  { modules: PlacedModule[]; wires: Wire[] }
>;

/** Lösung aus Aufbau + SCL-Quelle; Variablentabelle kommt aus der Verdrahtung. */
function solutionFor(level: Level, scl: string, board = BOARDS[level.id]!): Solution {
  const base: Solution = { version: 1, ...board, projects: {} };
  const analysis = analyzeBoard(level, base);
  const cpu = board.modules.find((m) => m.type.startsWith('cpu'))!.id;
  const imported = sourceToProject(scl);
  if (!imported.project) throw new Error(imported.diagnostics.map(formatDiagnostic).join('\n'));
  return { ...base, projects: { [cpu]: syncDeviceTags(level, analysis, cpu, imported.project) } };
}

function reference(level: Level): Solution {
  return solutionFor(level, readFileSync(join(DATA, `${level.id}.scl`), 'utf8'));
}

/** OB1 mit nur einem Anweisungsteil (für Fehllösungen) */
const ob = (body: string, dbs = '') =>
  `${dbs}\nORGANIZATION_BLOCK "Main"\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;

function verify(level: Level, solution: Solution) {
  const c = compileSolution(level, solution);
  if (!c.ok) {
    const msgs = [...c.cpus.values()].flatMap((x) => x.diagnostics.map(formatDiagnostic));
    throw new Error(
      `Lösung übersetzt nicht:\n${[...c.analysis.issues.map((i) => i.message), ...msgs].join('\n')}`,
    );
  }
  return verifySolution(level, solution, c.programs, c.size);
}

describe('Kampagne', () => {
  it('alle Level sind gültig und fortlaufend nummeriert', () => {
    expect(LEVELS.map((l) => l.order)).toEqual([1, 2, 3]);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))(
    'Referenzlösung %s besteht alle Tests',
    (_, level) => {
      const v = verify(level, reference(level));
      const failed = v.runs
        .filter((r) => !r.passed)
        .map((r) => `${r.testId}/Seed ${r.seed}: ${JSON.stringify(r.checks)} ${r.stop ?? ''}`);
      expect(failed).toEqual([]);
      expect(v.passed).toBe(true);
      expect(v.metrics.cost).toBe(8);
    },
  );

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s ist deterministisch', (_, level) => {
    const a = verify(level, reference(level));
    const b = verify(level, reference(level));
    expect(a.metrics).toEqual(b.metrics);
    expect(a.runs.map((r) => r.traces)).toEqual(b.runs.map((r) => r.traces));
  });
});

describe('Typische Fehllösungen fallen durch', () => {
  const fails = (id: string, src: string, board?: { modules: PlacedModule[]; wires: Wire[] }) => {
    const level = levelById(id)!;
    const v = verify(level, solutionFor(level, src, board));
    expect(v.passed).toBe(false);
    return v;
  };

  it('Level 1: ohne Selbsthaltung', () => {
    fails('01-foerderband', ob('"Bandmotor" := "Start" AND "Stopp";'));
  });
  it('Level 1: Stopp als Schließer behandelt', () => {
    fails('01-foerderband', ob('"Bandmotor" := ("Start" OR "Bandmotor") AND NOT "Stopp";'));
  });
  it('Level 1: Start hat Vorrang statt Stopp', () => {
    fails('01-foerderband', ob('"Bandmotor" := "Start" OR ("Bandmotor" AND "Stopp");'));
  });

  it('Level 2: einfache UND-Verknüpfung (kein Zeitfenster)', () => {
    const v = fails('02-zweihand', ob('"Presse" := "Links" AND "Rechts";'));
    expect(v.runs.filter((r) => !r.passed).map((r) => r.testId)).toEqual([
      'zu-spaet',
      'nachgreifen',
    ]);
  });

  it('Level 3: ohne Entprellung', () => {
    const v = fails(
      '03-stromstoss',
      ob(
        '"Flanke"(CLK := "Taster");\n"Licht" := "Licht" XOR "Flanke".Q;',
        'DATA_BLOCK "Flanke"\nNON_RETAIN\nR_TRIG\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
    // mindestens ein Seed erwischt das Prellen
    expect(v.runs.some((r) => !r.passed)).toBe(true);
  });

  it('Level 3: ohne Entprellung auf schneller CPU fällt bei allen Seeds durch', () => {
    const board = {
      ...BOARDS['03-stromstoss']!,
      modules: BOARDS['03-stromstoss']!.modules.map((m) =>
        m.type === 'cpu-klein' ? { ...m, type: 'cpu-schnell' } : m,
      ),
    };
    board.modules = board.modules.map((m) => (m.id === 'cpu1' ? m : { ...m, x: m.x + 1 }));
    const v = fails(
      '03-stromstoss',
      ob(
        '"Flanke"(CLK := "Taster");\n"Licht" := "Licht" XOR "Flanke".Q;',
        'DATA_BLOCK "Flanke"\nNON_RETAIN\nR_TRIG\nBEGIN\nEND_DATA_BLOCK',
      ),
      board,
    );
    expect(v.runs.every((r) => !r.passed)).toBe(true);
  });
});

describe('Übersetzen von Lösungen', () => {
  it('meldet Programme, die zu groß für die CPU sind', () => {
    const level = levelById('01-foerderband')!;
    const body = Array.from({ length: 41 }, () => '"Bandmotor" := "Start";').join('\n');
    const c = compileSolution(level, solutionFor(level, ob(body)));
    expect(c.ok).toBe(false);
    expect(c.cpus.get('cpu1')!.diagnostics[0]!.message).toMatch(/zu groß für CPU klein: 41 von 40/);
  });
});
