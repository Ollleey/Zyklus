import { describe, expect, it } from 'vitest';
import {
  LevelError,
  LevelRun,
  ProgramBuilder,
  analyzeBoard,
  compareTrace,
  emptyProject,
  inputSignal,
  io,
  syncDeviceTags,
  validateLevel,
  valueAt,
  verifySolution,
  type Device,
  type Level,
  type Solution,
} from '../src';

const LEVEL: Level = validateLevel({
  id: 'test',
  order: 0,
  title: { de: 'Test' },
  customer: { de: 'Testfirma' },
  mail: { from: { de: 'a' }, subject: { de: 'b' }, body: { de: 'c' } },
  datasheet: { de: 'd' },
  board: { width: 8, ductCapacity: 2 },
  allowedModules: ['cpu-klein', 'cpu-schnell', 'di8', 'do8', 'ai2'],
  toleranceMs: 10,
  devices: [
    { id: 'S1', tag: 'Start', name: { de: 'Start' }, kind: 'DI', side: 'left', role: 'button' },
    {
      id: 'S2',
      tag: 'Stopp',
      name: { de: 'Stopp' },
      kind: 'DI',
      side: 'left',
      role: 'button',
      nc: true,
    },
    { id: 'M1', tag: 'Motor', name: { de: 'Motor' }, kind: 'DO', side: 'right', role: 'motor' },
  ],
  tests: [
    {
      id: 't1',
      name: { de: 'Start/Stopp' },
      durationMs: 500,
      seeds: [1, 2],
      stimuli: {
        S1: [
          [100, true],
          [150, false],
        ],
        S2: [
          [300, true],
          [350, false],
        ],
      },
      expect: {
        M1: [
          [100, true],
          [300, false],
        ],
      },
    },
  ],
});

const SOLUTION: Solution = {
  version: 1,
  modules: [
    { id: 'cpu', type: 'cpu-klein', x: 0 },
    { id: 'di', type: 'di8', x: 2 },
    { id: 'do', type: 'do8', x: 3 },
  ],
  wires: [
    { device: 'S1', module: 'di', channel: 0 },
    { device: 'S2', module: 'di', channel: 1 },
    { device: 'M1', module: 'do', channel: 0 },
  ],
  projects: { cpu: emptyProject() },
};

/** Selbsthaltung: Motor := (Start OR Motor) AND Stopp(Öffner) */
function selfHold() {
  const b = new ProgramBuilder();
  const tmp = b.temp('t', 'BOOL');
  b.emit({ op: 'bin', fn: 'or', t: 'BOOL', dst: tmp, a: io('%I0.0'), b: io('%Q0.0') });
  b.emit({ op: 'bin', fn: 'and', t: 'BOOL', dst: io('%Q0.0'), a: tmp, b: io('%I0.1') });
  return new Map([['cpu', b.build()]]);
}

describe('Level-Validierung', () => {
  it('meldet alle Probleme', () => {
    try {
      validateLevel({
        ...LEVEL,
        board: { width: 0, ductCapacity: 1 },
        allowedModules: ['xx'],
        tests: [{ ...LEVEL.tests[0]!, expect: { S1: [[600, true]] } }],
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LevelError);
      const p = (e as LevelError).problems.join('\n');
      expect(p).toMatch(/board/);
      expect(p).toMatch(/unbekanntes Modul xx/);
      expect(p).toMatch(/Soll für S1 ist kein Ausgangsgerät/);
      expect(p).toMatch(/hinter dem Testende/);
    }
  });
});

describe('Schaltschrank', () => {
  it('vergibt Adressen wie TIA und bindet Geräte', () => {
    const a = analyzeBoard(LEVEL, SOLUTION);
    expect(a.ok).toBe(true);
    expect(a.bindings.get('S2')).toEqual({ cpu: 'cpu', address: '%I0.1', t: 'BOOL' });
    expect(a.bindings.get('M1')).toEqual({ cpu: 'cpu', address: '%Q0.0', t: 'BOOL' });
    expect(a.cost).toBe(4 + 2 + 2);
  });

  it('zweites DI-Modul bekommt das nächste Byte, AI beginnt bei %IW64', () => {
    const a = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: [
        ...SOLUTION.modules,
        { id: 'di2', type: 'di8', x: 4 },
        { id: 'ai', type: 'ai2', x: 5 },
      ],
      wires: [],
    });
    expect(a.channelAddress.get('di2:7')).toBe('%I1.7');
    expect(a.channelAddress.get('ai:1')).toBe('%IW66');
  });

  it('Kabelkanal: Leitungen von links belasten die Spalten bis zum Modul', () => {
    const a = analyzeBoard(LEVEL, SOLUTION);
    // S1, S2 von links bis Spalte 2; M1 von rechts ab Spalte 3
    expect(a.ductLoad).toEqual([2, 2, 2, 1, 1, 1, 1, 1]);
    // DI ganz rechts, DO links: alle Leitungen kreuzen den ganzen Kanal → überfüllt
    const far = analyzeBoard(LEVEL, {
      ...SOLUTION,
      modules: [
        { id: 'cpu', type: 'cpu-klein', x: 0 },
        { id: 'do', type: 'do8', x: 2 },
        { id: 'di', type: 'di8', x: 7 },
      ],
    });
    expect(far.ductLoad).toEqual([2, 2, 3, 3, 3, 3, 3, 3]);
    expect(far.issues.filter((i) => i.code === 'duct-full').map((i) => i.column)).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);
  });

  it.each([
    [{ modules: [{ id: 'cpu', type: 'cpu-mittel', x: 0 }] }, 'not-allowed'],
    [{ modules: [{ id: 'cpu', type: 'cpu-klein', x: 7 }] }, 'out-of-board'],
    [
      {
        modules: [
          { id: 'cpu', type: 'cpu-klein', x: 0 },
          { id: 'di', type: 'di8', x: 1 },
        ],
      },
      'overlap',
    ],
    [
      {
        modules: [
          { id: 'di', type: 'di8', x: 0 },
          { id: 'cpu', type: 'cpu-klein', x: 1 },
        ],
      },
      'io-without-cpu',
    ],
    [{ modules: [{ id: 'di', type: 'di8', x: 0 }] }, 'no-cpu'],
    [{ wires: [{ device: 'M1', module: 'di', channel: 2 }] }, 'channel-kind'],
    [
      {
        wires: [
          { device: 'S1', module: 'di', channel: 0 },
          { device: 'S2', module: 'di', channel: 0 },
        ],
      },
      'channel-used',
    ],
    [{ wires: [{ device: 'S1', module: 'di', channel: 9 }] }, 'bad-wire'],
    [
      {
        wires: [
          { device: 'S1', module: 'di', channel: 0 },
          { device: 'S1', module: 'di', channel: 1 },
        ],
      },
      'device-twice',
    ],
  ] as const)('Fehler %#: %s', (patch, code) => {
    const a = analyzeBoard(LEVEL, { ...SOLUTION, ...(patch as unknown as Partial<Solution>) });
    expect(a.issues.map((i) => i.code)).toContain(code);
    expect(a.ok).toBe(false);
  });

  it('überfüllter Kabelkanal', () => {
    const a = analyzeBoard({ ...LEVEL, board: { width: 8, ductCapacity: 1 } }, SOLUTION);
    expect(a.issues.find((i) => i.code === 'duct-full')?.message).toMatch(
      /Spalte 1 ist überfüllt \(2 von 1/,
    );
  });

  it('nicht angeschlossene Geräte sind nur eine Warnung', () => {
    const a = analyzeBoard(LEVEL, { ...SOLUTION, wires: [] });
    expect(a.ok).toBe(true);
    expect(a.issues.filter((i) => i.code === 'unwired')).toHaveLength(3);
  });

  it('Gerätevariablen werden in die Variablentabelle übernommen und nachgeführt', () => {
    const a = analyzeBoard(LEVEL, SOLUTION);
    let p = syncDeviceTags(LEVEL, a, 'cpu', emptyProject());
    expect(p.tags.map((t) => [t.name, t.address])).toEqual([
      ['Start', '%I0.0'],
      ['Stopp', '%I0.1'],
      ['Motor', '%Q0.0'],
    ]);
    // umbenennen bleibt erhalten, umstecken ändert die Adresse
    p = { ...p, tags: p.tags.map((t) => (t.name === 'Start' ? { ...t, name: 'Taster_Ein' } : t)) };
    const moved = analyzeBoard(LEVEL, {
      ...SOLUTION,
      wires: SOLUTION.wires.map((w) => (w.device === 'S1' ? { ...w, channel: 5 } : w)),
    });
    p = syncDeviceTags(LEVEL, moved, 'cpu', p);
    expect(p.tags[0]).toMatchObject({ name: 'Taster_Ein', address: '%I0.5' });
  });
});

describe('Eingangssignale', () => {
  const button: Device = {
    id: 'B',
    tag: 'B',
    name: { de: 'B' },
    kind: 'DI',
    side: 'left',
    role: 'button',
    bounce: { minToggles: 2, maxToggles: 6, gapMs: [1, 4] },
  };

  it('Prellen ist reproduzierbar und endet im Betätigungszustand', () => {
    const a = inputSignal(
      button,
      [
        [100, true],
        [400, false],
      ],
      7,
    );
    expect(
      inputSignal(
        button,
        [
          [100, true],
          [400, false],
        ],
        7,
      ),
    ).toEqual(a);
    expect(
      inputSignal(
        button,
        [
          [100, true],
          [400, false],
        ],
        8,
      ),
    ).not.toEqual(a);
    expect(valueAt(a, 99)).toBe(false);
    expect(valueAt(a, 100)).toBe(true);
    expect(valueAt(a, 200)).toBe(true);
    expect(valueAt(a, 500)).toBe(false);
    expect(a.length).toBeGreaterThan(3); // es prellt wirklich
    expect(a.filter(([t]) => t > 100 && t < 400).every(([t]) => t <= 100 + 6 * 4)).toBe(true);
  });

  it('Öffner ist im Ruhezustand 1', () => {
    const nc: Device = { ...button, nc: true, bounce: undefined };
    const s = inputSignal(
      nc,
      [
        [100, true],
        [200, false],
      ],
      1,
    );
    expect(s).toEqual([
      [0, true],
      [100, false],
      [200, true],
    ]);
  });
});

describe('Soll/Ist-Vergleich', () => {
  it('Abweichung innerhalb der Toleranz um eine Soll-Flanke ist erlaubt', () => {
    const r = compareTrace(
      [[100, true]],
      [
        [0, false],
        [108, true],
      ],
      200,
      10,
    );
    expect(r).toMatchObject({ ok: true, mismatches: [], expectedEdges: 1, actualEdges: 1 });
  });
  it('zu späte Flanke ergibt ein Fehlerintervall', () => {
    const r = compareTrace([[100, true]], [[130, true]], 200, 10);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual([[111, 130]]);
  });
  it('kurzer Fehlimpuls im Toleranzfenster fällt über die Flankenzahl auf', () => {
    const r = compareTrace(
      [[100, true]],
      [
        [95, true],
        [97, false],
        [100, true],
      ],
      200,
      10,
    );
    expect(r.mismatches).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.actualEdges).toBe(3);
  });
});

describe('Levellauf und Verifikation', () => {
  it('Selbsthaltung besteht alle Testfälle', () => {
    const v = verifySolution(LEVEL, SOLUTION, selfHold(), 1);
    expect(v.passed).toBe(true);
    expect(v.runs).toHaveLength(2);
    expect(v.metrics).toMatchObject({ cost: 8, size: 1 });
    expect(v.metrics.energy).toBe(50 * 2); // 50 Zyklen à 10 ms, je 2 Bitbefehle
    expect(v.runs[0]!.traces.M1).toEqual([
      [0, false],
      [100, true],
      [300, false],
    ]);
  });

  it('falsche Verdrahtung fällt durch', () => {
    const wrong = {
      ...SOLUTION,
      wires: SOLUTION.wires.map((w) => (w.device === 'S2' ? { ...w, channel: 4 } : w)),
    };
    const v = verifySolution(LEVEL, wrong, selfHold(), 1);
    expect(v.passed).toBe(false);
  });

  it('Handbetrieb: Taster per Klick', () => {
    const run = new LevelRun(LEVEL, SOLUTION, selfHold());
    run.runTo(20);
    expect(run.outputValue(LEVEL.devices[2]!)).toBe(false);
    run.setManual('S1', true);
    run.runTo(40);
    run.setManual('S1', false);
    run.runTo(60);
    expect(run.outputValue(LEVEL.devices[2]!)).toBe(true);
    run.setManual('S2', true); // Öffner betätigt → Signal 0
    run.runTo(80);
    expect(run.outputValue(LEVEL.devices[2]!)).toBe(false);
  });

  it('Einzelzyklus läuft genau bis zum nächsten Zyklus', () => {
    const run = new LevelRun(LEVEL, SOLUTION, selfHold(), { test: LEVEL.tests[0] });
    run.stepCycle();
    expect(run.time).toBe(1);
    run.stepCycle();
    expect(run.time).toBe(11);
  });
});
