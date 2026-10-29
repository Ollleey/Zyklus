import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  ProgramBuilder,
  analyzeBoard,
  c,
  emptyProject,
  io,
  validateLevel,
  type Level,
  type Solution,
} from '../src';

const LEVEL: Level = validateLevel({
  id: 'zwei',
  order: 0,
  title: { de: 'Zwei CPUs' },
  customer: { de: 'Test' },
  mail: { from: { de: 'a' }, subject: { de: 'b' }, body: { de: 'c' } },
  datasheet: { de: 'd' },
  board: { width: 21, ductCapacity: 4, wall: 9 },
  allowedModules: ['cpu-klein', 'di8', 'do8', 'kop'],
  toleranceMs: 30,
  devices: [
    { id: 'S1', tag: 'Start', name: { de: 'Start' }, kind: 'DI', side: 'left', role: 'button' },
    { id: 'H1', tag: 'Lampe', name: { de: 'Lampe' }, kind: 'DO', side: 'right', role: 'lamp' },
  ],
  tests: [
    {
      id: 't',
      name: { de: 't' },
      durationMs: 200,
      seeds: [1],
      stimuli: { S1: [[50, true]] },
      expect: { H1: [[50, true]] },
    },
  ],
});

const SOLUTION: Solution = {
  version: 2,
  modules: [
    { id: 'A', type: 'cpu-klein', x: 0 },
    { id: 'di', type: 'di8', x: 6 },
    { id: 'kA', type: 'kop', x: 7 },
    { id: 'B', type: 'cpu-klein', x: 11 },
    { id: 'kB', type: 'kop', x: 17 },
    { id: 'do', type: 'do8', x: 19 },
  ],
  wires: [
    { device: 'S1', module: 'di', channel: 0 },
    { device: 'H1', module: 'do', channel: 0 },
  ],
  projects: { A: emptyProject(), B: emptyProject() },
};

function programs() {
  const a = new ProgramBuilder();
  a.emit({
    op: 'fn',
    fn: 'sel',
    t: 'WORD',
    dst: io('%QW100', 'WORD'),
    args: [io('%I0.0'), c.word(0), c.word(1)],
  });
  const b = new ProgramBuilder();
  b.emit({
    op: 'cmp',
    fn: 'ne',
    t: 'WORD',
    dst: io('%Q0.0'),
    a: io('%IW100', 'WORD'),
    b: c.word(0),
  });
  return new Map([
    ['A', a.build()],
    ['B', b.build()],
  ]);
}

describe('Trennwand und Koppelmodul', () => {
  it('Koppelmodule verbinden die beiden CPUs', () => {
    const a = analyzeBoard(LEVEL, SOLUTION);
    expect(a.ok).toBe(true);
    expect(a.links).toEqual([['A', 'B']]);
    expect(a.cpuOf.get('do')).toBe('B');
  });

  it('Signal läuft über das Koppelmodul mit höchstens einem Zyklus Verzug', () => {
    const run = new LevelRun(LEVEL, SOLUTION, programs(), { test: LEVEL.tests[0] });
    run.runToEnd();
    const h1 = run.traces.get('H1')!;
    const on = h1.find(([, v]) => v === true)![0];
    // A liest bei t = 50, sendet; B übernimmt im nächsten eigenen Zyklus (t = 60)
    expect(on).toBe(60);
  });

  it('Leitungen kreuzen die Trennwand nicht', () => {
    const a = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: [...SOLUTION.modules, { id: 'di2', type: 'di8', x: 20 }],
      wires: [{ device: 'S1', module: 'di2', channel: 0 }],
    });
    expect(a.issues.some((i) => i.code === 'wall')).toBe(true);
  });

  it('Module rechts der Wand brauchen dort eine eigene CPU; nichts auf der Wand', () => {
    const a = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: SOLUTION.modules.filter((m) => m.id !== 'B'),
    });
    expect(a.issues.find((i) => i.module === 'do')?.code).toBe('io-without-cpu');
    const onWall = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: [...SOLUTION.modules.filter((m) => m.id !== 'kB'), { id: 'kB', type: 'kop', x: 10 }],
    });
    expect(onWall.issues.some((i) => i.code === 'wall' && i.module === 'kB')).toBe(true);
  });

  it('ein Koppelmodul je CPU, einzelnes Koppelmodul ist eine Warnung', () => {
    const two = analyzeBoard(
      { ...LEVEL, board: { width: 10, ductCapacity: 4 } },
      {
        ...SOLUTION,
        modules: [
          { id: 'A', type: 'cpu-klein', x: 0 },
          { id: 'k1', type: 'kop', x: 6 },
          { id: 'k2', type: 'kop', x: 8 },
        ],
        wires: [],
      },
    );
    expect(two.issues.some((i) => i.code === 'coupler' && i.severity === 'error')).toBe(true);
    const lone = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: SOLUTION.modules.filter((m) => m.id !== 'kB'),
    });
    expect(lone.ok).toBe(true);
    expect(lone.issues.some((i) => i.code === 'coupler' && i.severity === 'warning')).toBe(true);
  });
});
