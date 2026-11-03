import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  analyzeBoard,
  syncDeviceTags,
  verifySolution,
  type Level,
  type PlacedModule,
  type Solution,
  type Wire,
} from '@zyklus/sim-core';
import { formatDiagnostic, sourceToProject } from '@zyklus/scl-compiler';
import { compileSolution, levelById } from '../src';

const ob = (body: string, dbs = '') =>
  `${dbs}\nORGANIZATION_BLOCK "Main"\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;

function build(
  level: Level,
  modules: PlacedModule[],
  wires: Wire[],
  scl: string,
  config: Solution['config'] = {},
): Solution {
  const base: Solution = { version: 2, modules, wires, projects: {}, config };
  const analysis = analyzeBoard(level, base);
  if (!analysis.ok) throw new Error(analysis.issues.map((i) => i.message).join('\n'));
  const p = sourceToProject(scl);
  if (!p.project) throw new Error(p.diagnostics.map(formatDiagnostic).join('\n'));
  return { ...base, projects: { cpu1: syncDeviceTags(level, analysis, 'cpu1', p.project) } };
}

describe('Schneller Zähler (HSC) auf DI 8 HF', () => {
  const level = levelById('14-impulse')!;
  const modules: PlacedModule[] = [
    { id: 'cpu1', type: 'cpu-mittel', x: 0 },
    { id: 'di1', type: 'di8hf', x: 7 },
    { id: 'do1', type: 'do8', x: 8 },
  ];
  const wires: Wire[] = [
    { device: 'B1', module: 'di1', channel: 0 },
    { device: 'S1', module: 'di1', channel: 1 },
    { device: 'Y1', module: 'do1', channel: 0 },
  ];
  const src = ob(
    [
      '// Zähler mit der Startflanke zurücksetzen, Ventil zu bei 120 Impulsen',
      '%Q112.0 := "Start" AND NOT %M0.0;',
      '%M0.0 := "Start";',
      'IF "Start" THEN "Ventil" := TRUE; END_IF;',
      'IF %ID112 >= 120 THEN "Ventil" := FALSE; END_IF;',
    ].join('\n'),
  );

  it('Auftrag 14 ohne Prozessalarm: die Baugruppe zählt jede Flanke', () => {
    const s = build(level, modules, wires, src, { di1: { hsc: 112 } });
    const c = compileSolution(level, s);
    expect(c.ok).toBe(true);
    expect(verifySolution(level, s, c.programs, c.size).passed).toBe(true);
  });

  it('ohne HSC verpasst der Zyklus Impulse', () => {
    const s = build(
      level,
      modules,
      wires,
      src
        .replace(/%ID112/g, '%MD4')
        .replace(
          '%M0.0 := "Start";',
          '%M0.0 := "Start";\nIF "Durchfluss" AND NOT %M0.1 THEN %MD4 := %MD4 + 1; END_IF;\n%M0.1 := "Durchfluss";\nIF %Q112.0 THEN %MD4 := 0; END_IF;',
        ),
    );
    const c = compileSolution(level, s);
    expect(verifySolution(level, s, c.programs, c.size).passed).toBe(false);
  });
});

/** Positionierachse: Eilgang, Schleichgang, Inkrementalgeber 1 Impuls/mm */
const AXIS: Level = {
  ...levelById('14-impulse')!,
  id: 'test-achse',
  allowedModules: ['cpu-mittel', 'di8hf', 'do8', 'dq4hf'],
  devices: [
    { id: 'B1', tag: 'Geber', name: { de: 'Geber' }, kind: 'DI', side: 'left', role: 'sensor' },
    { id: 'M1', tag: 'Eilgang', name: { de: 'Eilgang' }, kind: 'DO', side: 'right', role: 'motor' },
    {
      id: 'M2',
      tag: 'Schleich',
      name: { de: 'Schleichgang' },
      kind: 'DO',
      side: 'right',
      role: 'motor',
    },
    {
      id: 'Y1',
      tag: 'Takt',
      name: { de: 'Taktausgang' },
      kind: 'DO',
      side: 'right',
      role: 'valve',
    },
  ],
  plant: { type: 'axis', params: { motor: 'M1', creep: 'M2', encoder: 'B1' } },
  tests: [],
} as Level;

describe('Positionierachse und schnelle Ausgänge', () => {
  const modules: PlacedModule[] = [
    { id: 'cpu1', type: 'cpu-mittel', x: 0 },
    { id: 'di1', type: 'di8hf', x: 7 },
    { id: 'do1', type: 'do8', x: 8 },
    { id: 'dq1', type: 'dq4hf', x: 9 },
  ];
  const wires: Wire[] = [
    { device: 'B1', module: 'di1', channel: 0 },
    { device: 'M1', module: 'do1', channel: 0 },
    { device: 'M2', module: 'do1', channel: 1 },
    { device: 'Y1', module: 'dq1', channel: 0 },
  ];

  it('mit HSC und Schleichgang hält die Achse auf 0,5 mm genau', () => {
    const src = ob('"Eilgang" := %ID112 < 480;\n"Schleich" := %ID112 < 500;\n%QW120 := 250;');
    const s = build(AXIS, modules, wires, src, {
      di1: { hsc: 112 },
      dq1: { pulse: { 0: { mode: 'pwm', period: 40 } } },
    });
    const c = compileSolution(AXIS, s);
    expect(c.ok).toBe(true);
    const run = new LevelRun(AXIS, s, c.programs, {});
    run.runTo(8000);
    const pos = run.plant!.state().pos!;
    expect(Math.abs(pos - 500)).toBeLessThan(0.6);
    // PWM 25 % bei 40 ms Periode: 10 ms ein, 30 ms aus
    const y = run.traces.get('Y1')!.filter(([t]) => t >= 1000 && t < 1200);
    const ons = y.filter(([, v]) => v === true).map(([t]) => t);
    const offs = y.filter(([, v]) => v === false).map(([t]) => t);
    expect(ons.length).toBe(5);
    expect(offs[0]! - ons[0]!).toBe(10);
  });

  it('PTO erzeugt eine Impulsfolge mit der Frequenz aus dem Stellwort', () => {
    const s = build(AXIS, modules, wires, ob('%QW120 := 100;'), {
      dq1: { pulse: { 0: { mode: 'pto' } } },
    });
    const c = compileSolution(AXIS, s);
    const run = new LevelRun(AXIS, s, c.programs, {});
    run.runTo(2000);
    const rises = run.traces.get('Y1')!.filter(([t, v]) => v === true && t >= 1000 && t < 2000);
    expect(rises.length).toBe(100);
  });
});
