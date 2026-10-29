import { describe, expect, it } from 'vitest';
import {
  AnalogDisturbance,
  LevelRun,
  ProgramBuilder,
  analyzeBoard,
  c,
  evaluateCheck,
  emptyProject,
  interpolate,
  io,
  toRaw,
  fromRaw,
  validateLevel,
  type Device,
  type Level,
  type Solution,
} from '../src';

const sensor: Device = {
  id: 'B1',
  tag: 'Fuellstand',
  name: { de: 'Füllstand' },
  kind: 'AI',
  side: 'left',
  role: 'sensor',
  analog: { unit: '%', min: 0, max: 100, noise: 50 },
};

describe('Analogwerte', () => {
  it('Normbereich 0…27648, Über-/Untersteuerung begrenzt', () => {
    const a = sensor.analog!;
    expect(toRaw(0, a)).toBe(0);
    expect(toRaw(50, a)).toBe(13824);
    expect(toRaw(100, a)).toBe(27648);
    expect(toRaw(500, a)).toBe(32511);
    expect(toRaw(-100, a)).toBe(-4864);
    expect(fromRaw(13824, a)).toBe(50);
  });

  it('lineare Interpolation der Stimuli', () => {
    const pts: [number, number][] = [
      [0, 10],
      [1000, 20],
      [2000, 20],
    ];
    expect(interpolate(pts, 500)).toBe(15);
    expect(interpolate(pts, 1500)).toBe(20);
    expect(interpolate(pts, 5000)).toBe(20);
    expect(interpolate([], 5, 3)).toBe(3);
  });

  it('Rauschen ist reproduzierbar, Geberfehler setzen Sonderwerte', () => {
    const a = new AnalogDisturbance(sensor, 7);
    const b = new AnalogDisturbance(sensor, 7);
    const xs = Array.from({ length: 200 }, () => a.apply(10000, undefined));
    expect(Array.from({ length: 200 }, () => b.apply(10000, undefined))).toEqual(xs);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(Math.abs(mean - 10000)).toBeLessThan(15);
    expect(new Set(xs).size).toBeGreaterThan(50);
    expect(a.apply(10000, 'break')).toBe(32767);
    expect(a.apply(10000, 'underflow')).toBe(-32768);
  });

  it('Ausreißer', () => {
    const d = new AnalogDisturbance(
      {
        ...sensor,
        analog: { ...sensor.analog!, noise: 0, spikes: { perSecond: 100, amplitude: 5000 } },
      },
      3,
    );
    const xs = Array.from({ length: 1000 }, () => d.apply(10000, undefined));
    const spikes = xs.filter((x) => Math.abs(x - 10000) === 5000).length;
    expect(spikes).toBeGreaterThan(70);
    expect(spikes).toBeLessThan(140);
  });
});

/** Level mit Tank, Pumpe am Relais und Zweipunktregelung im Test */
const TANK: Level = validateLevel({
  id: 'tank',
  order: 0,
  title: { de: 't' },
  customer: { de: 'k' },
  mail: { from: { de: 'a' }, subject: { de: 'b' }, body: { de: 'c' } },
  datasheet: { de: 'd' },
  board: { width: 10, ductCapacity: 4 },
  allowedModules: ['cpu-klein', 'ai2', 'rel4', 'do8'],
  toleranceMs: 10,
  plant: {
    type: 'tank',
    params: { sensor: 'B1', pump: 'P1', inflow: 10, level0: 50, outflow: [[0, 5]] },
  },
  devices: [
    sensor,
    {
      id: 'P1',
      tag: 'Pumpe',
      name: { de: 'Pumpe' },
      kind: 'DO',
      side: 'right',
      role: 'motor',
      power: true,
    },
  ],
  tests: [
    {
      id: 'halten',
      name: { de: 'halten' },
      durationMs: 20000,
      seeds: [1],
      stimuli: {},
      checks: [
        {
          kind: 'range',
          name: { de: 'Füllstand' },
          signal: 'plant.level',
          min: 30,
          max: 70,
          from: 0,
          to: 20000,
        },
        { kind: 'maxChanges', name: { de: 'Pumpe' }, signal: 'P1', max: 10 },
      ],
    },
  ],
});

const SOL: Solution = {
  version: 2,
  modules: [
    { id: 'cpu', type: 'cpu-klein', x: 0 },
    { id: 'ai', type: 'ai2', x: 6 },
    { id: 'rel', type: 'rel4', x: 7 },
  ],
  wires: [
    { device: 'B1', module: 'ai', channel: 0 },
    { device: 'P1', module: 'rel', channel: 0 },
  ],
  projects: { cpu: emptyProject() },
};

/** Zweipunktregler mit Hysterese 40…60 % auf %IW64 → %Q0.0 */
function hysteresis() {
  const b = new ProgramBuilder();
  const lo = b.temp('lo', 'BOOL');
  const hi = b.temp('hi', 'BOOL');
  b.emit({
    op: 'cmp',
    fn: 'lt',
    t: 'INT',
    dst: lo,
    a: io('%IW64'),
    b: c.int(toRaw(40, sensor.analog!)),
  });
  b.emit({
    op: 'cmp',
    fn: 'gt',
    t: 'INT',
    dst: hi,
    a: io('%IW64'),
    b: c.int(toRaw(60, sensor.analog!)),
  });
  b.emit({ op: 'set', dst: io('%Q0.0'), cond: lo });
  b.emit({ op: 'reset', dst: io('%Q0.0'), cond: hi });
  return new Map([['cpu', b.build()]]);
}

describe('Relais, Anlage, Kriterien', () => {
  it('Schütz am DO-Kanal wird abgewiesen', () => {
    const a = analyzeBoard(TANK, {
      ...SOL,
      modules: [...SOL.modules, { id: 'do', type: 'do8', x: 9 }],
      wires: [SOL.wires[0]!, { device: 'P1', module: 'do', channel: 0 }],
    });
    expect(a.issues.map((i) => i.code)).toContain('needs-relay');
  });

  it('Relais belegt ein Ausgangsbyte und verzögert', () => {
    const a = analyzeBoard(TANK, SOL);
    expect(a.bindings.get('P1')).toMatchObject({ address: '%Q0.0', delay: { on: 15, off: 30 } });
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: io('%I0.0') });
    const run = new LevelRun(
      TANK,
      { ...SOL, wires: [SOL.wires[1]!] },
      new Map([['cpu', b.build()]]),
    );
    run.runTo(5);
    run.cpus.get('cpu')!.setInput('%I0.0', true);
    // Programm setzt Q nur bei 10-ms-Zyklen; Befehl ab t = 10, Kontakt 15 ms später
    run.runTo(24);
    expect(run.outputValue(TANK.devices[1]!)).toBe(false);
    run.runTo(25);
    expect(run.outputValue(TANK.devices[1]!)).toBe(true);
  });

  it('Tankmodell mit Zweipunktregelung: Füllstand bleibt im Band', () => {
    const run = new LevelRun(TANK, SOL, hysteresis(), { test: TANK.tests[0], seed: 1 });
    run.runToEnd();
    const traces = Object.fromEntries(run.traces);
    for (const chk of TANK.tests[0]!.checks!)
      expect(evaluateCheck(chk, traces, 20000).ok).toBe(true);
    const level = traces['plant.level']!;
    expect(Math.min(...level.map((e) => e[1] as number))).toBeLessThan(42);
    expect(Math.max(...level.map((e) => e[1] as number))).toBeGreaterThan(58);
    expect(traces['true.B1']!.length).toBeGreaterThan(10);
  });

  it('Kriterien melden Verletzungen mit Zeitpunkt', () => {
    const tr = {
      a: [
        [0, false],
        [100, true],
        [300, false],
      ] as [number, boolean][],
      b: [
        [0, false],
        [250, true],
      ] as [number, boolean][],
      x: [
        [0, 10],
        [500, 90],
      ] as [number, number][],
    };
    const n = { de: 'k' };
    expect(
      evaluateCheck({ kind: 'exclusive', name: n, signals: ['a', 'b'] }, tr, 1000),
    ).toMatchObject({ ok: false, detail: 'bei 0.25 s gleichzeitig: a, b' });
    expect(
      evaluateCheck(
        { kind: 'always', name: n, signal: 'a', value: true, from: 100, to: 300 },
        tr,
        1000,
      ).ok,
    ).toBe(true);
    expect(
      evaluateCheck(
        { kind: 'always', name: n, signal: 'a', value: true, from: 100, to: 301 },
        tr,
        1000,
      ).ok,
    ).toBe(false);
    expect(
      evaluateCheck(
        { kind: 'range', name: n, signal: 'x', min: 0, max: 50, from: 0, to: 1000 },
        tr,
        1000,
      ).detail,
    ).toBe('bei 0.50 s: 90');
    expect(evaluateCheck({ kind: 'maxChanges', name: n, signal: 'a', max: 1 }, tr, 1000).ok).toBe(
      false,
    );
    expect(
      evaluateCheck(
        { kind: 'track', name: n, signal: 'x', reference: 'x', tolerance: 0, from: 0 },
        tr,
        1000,
      ).ok,
    ).toBe(true);
  });
});
