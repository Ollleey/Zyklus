import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  ProgramBuilder,
  analyzeBoard,
  channelRange,
  emptyProject,
  io,
  moduleType,
  validateLevel,
  type Device,
  type Level,
  type Solution,
} from '../src';

const analog = (id: string, kind: 'AI' | 'AO', signal?: '0-10V' | '4-20mA'): Device => ({
  id,
  tag: id,
  name: { de: id },
  kind,
  side: kind === 'AI' ? 'left' : 'right',
  role: kind === 'AI' ? 'sensor' : 'actuator',
  analog: { unit: '%', min: 0, max: 100 },
  ...(signal ? { signal } : {}),
});

const LEVEL: Level = validateLevel({
  id: 'mod',
  order: 0,
  title: { de: 'Module' },
  customer: { de: 'Test' },
  mail: { from: { de: 'a' }, subject: { de: 'b' }, body: { de: 'c' } },
  datasheet: { de: 'd' },
  board: { width: 20, ductCapacity: 9 },
  allowedModules: ['cpu-kompakt', 'cpu-klein', 'di8', 'dio8', 'ai2', 'ai4', 'ao2', 'di4', 'do4'],
  toleranceMs: 0,
  devices: [
    { id: 'S1', tag: 'S1', name: { de: 'S1' }, kind: 'DI', side: 'left', role: 'button' },
    analog('B1', 'AI', '4-20mA'),
    analog('B2', 'AI', '0-10V'),
    analog('Y1', 'AO', '0-10V'),
  ],
  tests: [
    {
      id: 't',
      name: { de: 't' },
      durationMs: 300,
      seeds: [1],
      stimuli: { B1: [[0, 50]], B2: [[0, 25]] },
      faults: { B1: [[200, 300, 'break']], B2: [[200, 300, 'break']] },
      checks: [],
    },
  ],
});

describe('Baugruppen mit Kanalgruppen', () => {
  it('CPU kompakt: E/A auf der CPU bekommen die ersten Adressen', () => {
    const a = analyzeBoard(LEVEL, {
      version: 2,
      modules: [
        { id: 'cpu', type: 'cpu-kompakt', x: 0 },
        { id: 'di', type: 'di8', x: 8 },
        { id: 'ai', type: 'ai2', x: 9 },
      ],
      wires: [],
      projects: {},
    });
    const addr = (m: string, ch: number) => a.channelAddress.get(`${m}:${ch}`);
    expect([addr('cpu', 0), addr('cpu', 5), addr('cpu', 6), addr('cpu', 9)]).toEqual([
      '%I0.0',
      '%I0.5',
      '%Q0.0',
      '%Q0.3',
    ]);
    expect([addr('cpu', 10), addr('cpu', 11)]).toEqual(['%IW64', '%IW66']);
    expect(addr('di', 0)).toBe('%I1.0');
    expect(addr('ai', 0)).toBe('%IW68');
    expect(a.cpuOf.get('cpu')).toBe('cpu');
    expect(moduleType('cpu-kompakt').channels).toBe(12);
  });

  it('DI 8/DO 8: Kanäle 0–7 Eingänge, 8–15 Ausgänge; Art wird je Kanal geprüft', () => {
    const base: Solution = {
      version: 2,
      modules: [
        { id: 'cpu', type: 'cpu-klein', x: 0 },
        { id: 'm', type: 'dio8', x: 6 },
      ],
      wires: [{ device: 'S1', module: 'm', channel: 3 }],
      projects: {},
    };
    const a = analyzeBoard(LEVEL, base);
    expect(a.channelAddress.get('m:3')).toBe('%I0.3');
    expect(a.channelAddress.get('m:8')).toBe('%Q0.0');
    expect(a.bindings.get('S1')?.address).toBe('%I0.3');
    const wrong = analyzeBoard(LEVEL, {
      ...base,
      wires: [{ device: 'S1', module: 'm', channel: 9 }],
    });
    expect(wrong.issues.map((i) => i.code)).toContain('channel-kind');
    const none = analyzeBoard(LEVEL, {
      ...base,
      wires: [{ device: 'S1', module: 'm', channel: 16 }],
    });
    expect(none.issues.map((i) => i.code)).toContain('bad-wire');
  });
});

describe('Messbereich je Analogkanal', () => {
  const sol = (ranges?: Record<number, '0-10V' | '4-20mA'>): Solution => ({
    version: 2,
    modules: [
      { id: 'cpu', type: 'cpu-klein', x: 0 },
      { id: 'ai', type: 'ai2', x: 6 },
      { id: 'ao', type: 'ao2', x: 7 },
    ],
    wires: [
      { device: 'B1', module: 'ai', channel: 0 },
      { device: 'B2', module: 'ai', channel: 1 },
      { device: 'Y1', module: 'ao', channel: 0 },
    ],
    projects: { cpu: emptyProject() },
    ...(ranges ? { config: { ai: { ranges } } } : {}),
  });

  it('Standard ist 0–10 V; ein 4–20-mA-Geber daran ist eine Warnung', () => {
    const s = sol();
    expect(channelRange(s, 'ai', moduleType('ai2'), 0)).toBe('0-10V');
    const a = analyzeBoard(LEVEL, s);
    expect(a.ok).toBe(true);
    const w = a.issues.filter((i) => i.code === 'range-mismatch');
    expect(w.map((i) => i.device)).toEqual(['B1']);
    expect(w[0]!.message).toMatch(/4–20 mA.*0–10 V/);
    expect(
      analyzeBoard(LEVEL, sol({ 0: '4-20mA' })).issues.some((i) => i.code === 'range-mismatch'),
    ).toBe(false);
  });

  function run(s: Solution) {
    const b = new ProgramBuilder();
    // Analogausgang folgt dem zweiten Eingang
    b.emit({ op: 'mov', dst: io('%QW66'), src: io('%IW66') });
    const r = new LevelRun(LEVEL, s, new Map([['cpu', b.build()]]), { test: LEVEL.tests[0] });
    r.runToEnd();
    const last = (id: string, t: number) =>
      [...r.traces.get(id)!].reverse().find(([tt]) => tt <= t)![1];
    return { r, last };
  }

  it('falscher Bereich liefert Überlauf, richtiger den Messwert', () => {
    const wrong = run(sol());
    expect(wrong.last('B1', 100)).toBe(32767);
    const right = run(sol({ 0: '4-20mA' }));
    expect(right.last('B1', 100)).toBe(13824);
  });

  it('Drahtbruch: 4–20 mA meldet 32767, 0–10 V fällt auf 0', () => {
    const { last } = run(sol({ 0: '4-20mA' }));
    expect(last('B1', 250)).toBe(32767);
    expect(last('B2', 250)).toBe(0);
    expect(last('B2', 100)).toBe(6912);
  });

  it('Analogausgang mit falscher Signalart: am Stellglied kommt nichts an', () => {
    const s = sol({ 0: '4-20mA' });
    s.config!.ao = { ranges: { 0: '4-20mA' } };
    const a = analyzeBoard(LEVEL, s);
    expect(a.issues.some((i) => i.code === 'range-mismatch' && i.device === 'Y1')).toBe(true);
  });

  it('unzulässiger Bereich in der Einstellung fällt auf den Standard zurück', () => {
    const s = sol();
    s.config = { cpu: { ranges: { 10: '4-20mA' } } };
    expect(channelRange(s, 'cpu', moduleType('cpu-kompakt'), 10)).toBe('0-10V');
  });
});
