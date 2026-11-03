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

describe('Dezentrale Peripherie', () => {
  const level = {
    ...levelById('01-foerderband')!,
    allowedModules: ['cpu-klein', 'di8', 'do8', 'im-pn'],
  } as Level;
  const modules: PlacedModule[] = [
    { id: 'cpu1', type: 'cpu-klein', x: 0 },
    { id: 'di1', type: 'di8', x: 6 },
    { id: 'im1', type: 'im-pn', x: 9 },
    { id: 'do1', type: 'do8', x: 10 },
  ];
  const wires: Wire[] = [
    { device: 'S1', module: 'di1', channel: 0 },
    { device: 'S2', module: 'di1', channel: 1 },
    { device: 'M1', module: 'do1', channel: 0 },
  ];

  it('Baugruppen hinter dem Interfacemodul gehören zur CPU, Adressen laufen weiter', () => {
    const a = analyzeBoard(level, { version: 2, modules, wires, projects: {} });
    expect(a.ok).toBe(true);
    expect(a.cpuOf.get('do1')).toBe('cpu1');
    expect(a.stationOf.get('do1')).toBe('im1');
    expect(a.bindings.get('M1')).toMatchObject({
      address: '%Q0.0',
      station: { im: 'im1', updateTime: 4 },
    });
  });

  it('Aktualisierungszeit verzögert die Ausgänge; Stationsausfall meldet OB86', () => {
    const src = [
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Bandmotor" := "Start" AND NOT "Stoerung".aus;\nEND_ORGANIZATION_BLOCK',
      'DATA_BLOCK "Stoerung"\nVAR\naus : Bool;\nEND_VAR\nBEGIN\nEND_DATA_BLOCK',
      'ORGANIZATION_BLOCK "Ausfall"\n// Ereignis: Baugruppenausfall\nBEGIN\n"Stoerung".aus := #Event_Class = 16#39;\nEND_ORGANIZATION_BLOCK',
    ].join('\n');
    const s = build(level, modules, wires, src, { im1: { updateTime: 16 } });
    const c = compileSolution(level, s);
    expect(
      [...c.cpus.values()].flatMap((r) =>
        r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
      ),
    ).toEqual([]);
    const test = {
      id: 't',
      name: { de: 't' },
      durationMs: 3000,
      seeds: [1],
      stimuli: { S1: [[100, true]] as [number, boolean][] },
      moduleFaults: [{ device: 'M1', kind: 'station' as const, from: 1000, to: 2000 }],
    };
    const run = new LevelRun(level, s, c.programs, { test, seed: 1 });
    run.runTo(3000);
    const m1 = run.traces.get('M1')!;
    const on = m1.find(([, v]) => v === true)![0];
    expect(on % 16).toBe(0);
    expect(on).toBeGreaterThanOrEqual(100);
    expect(m1.find(([t, v]) => t >= 1000 && v === false)![0]).toBe(1000);
    expect(
      run.cpus.get('cpu1')!.diagnostics.some((e) => /Station im1 ausgefallen/.test(e.text)),
    ).toBe(true);
    // nach der Wiederkehr bleibt das Band per Programm aus, bis OB86 gehend kommt
    expect(m1.at(-1)![1]).toBe(true);
  });
});

describe('CPU-CPU-Kommunikation (TSEND_C/TRCV_C)', () => {
  const level = levelById('13-koppel')!;
  const BOARD = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'reference', 'boards.json'), 'utf8'),
  )['13-koppel'] as { modules: PlacedModule[]; wires: Wire[] };
  // ohne Koppelmodule: die CPUs reden über die Verbindung ID 1
  const modules = BOARD.modules.filter((m) => m.type !== 'kop');

  function solution(cpu1: string, cpu2: string): Solution {
    const base: Solution = { version: 2, modules, wires: BOARD.wires, projects: {} };
    const a = analyzeBoard(level, base);
    const projects = Object.fromEntries(
      Object.entries({ cpu1, cpu2 }).map(([id, src]) => {
        const p = sourceToProject(src);
        if (!p.project) throw new Error(p.diagnostics.map(formatDiagnostic).join('\n'));
        return [id, syncDeviceTags(level, a, id, p.project)];
      }),
    );
    return { ...base, projects };
  }

  const DB = (name: string, of: string) =>
    `DATA_BLOCK "${name}"\nNON_RETAIN\n${of}\nBEGIN\nEND_DATA_BLOCK\n`;
  const DATA =
    'DATA_BLOCK "Daten"\nVAR\nwerte : Array[0..2] of Int;\nstatus : Word;\nfertig : Int;\nfehler : Bool;\nEND_VAR\nBEGIN\nEND_DATA_BLOCK\n';

  it('sendet eine Struktur über mehrere Zyklen, DONE/NDR je einen Aufruf', () => {
    const sender =
      DB('Senden', 'TSEND_C') +
      DATA +
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Daten".werte[0] := 11; "Daten".werte[1] := 22; "Daten".werte[2] := 33;\n' +
      '"Senden"(REQ := "Ein", ID := 1, DATA := "Daten".werte);\n' +
      'IF "Senden".DONE THEN "Daten".fertig := "Daten".fertig + 1; END_IF;\n' +
      '"Daten".status := "Senden".STATUS;\nEND_ORGANIZATION_BLOCK';
    const receiver =
      DB('Empfang', 'TRCV_C') +
      DATA +
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Empfang"(EN_R := TRUE, ID := 1, DATA := "Daten".werte);\n' +
      'IF "Empfang".NDR THEN "Daten".fertig := "Daten".fertig + 1; END_IF;\nEND_ORGANIZATION_BLOCK';
    const s = solution(sender, receiver);
    const c = compileSolution(level, s);
    expect(
      [...c.cpus.values()].flatMap((r) =>
        r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
      ),
    ).toEqual([]);
    const test = {
      id: 't',
      name: { de: 't' },
      durationMs: 600,
      seeds: [1],
      stimuli: { S1: [[100, true]] as [number, boolean][] },
    };
    const run = new LevelRun(level, s, c.programs, { test, seed: 1 });
    run.runTo(105);
    const a = run.cpus.get('cpu1')!;
    const b = run.cpus.get('cpu2')!;
    expect(a.readSlot('Daten.status')).toBe(0x7001);
    run.runTo(600);
    expect(b.readSlot('Daten.werte[1]')).toBe(22);
    expect(b.readSlot('Daten.fertig')).toBe(1);
    expect(a.readSlot('Daten.fertig')).toBe(1);
    expect(a.readSlot('Daten.status')).toBe(0x7000);
  });

  it('Fehler: keine Verbindung bzw. Datentypen passen nicht', () => {
    const sender =
      DB('Senden', 'TSEND_C') +
      DATA +
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Senden"(REQ := "Ein", ID := 7, DATA := "Daten".werte);\n"Daten".fehler := "Senden".ERROR;\n"Daten".status := "Senden".STATUS;\nEND_ORGANIZATION_BLOCK';
    const s = solution(sender, ob(''));
    const c = compileSolution(level, s);
    const test = {
      id: 't',
      name: { de: 't' },
      durationMs: 300,
      seeds: [1],
      stimuli: { S1: [[100, true]] as [number, boolean][] },
    };
    const run = new LevelRun(level, s, c.programs, { test, seed: 1 });
    run.runTo(300);
    expect(run.cpus.get('cpu1')!.readSlot('Daten.fehler')).toBe(true);
    expect(run.cpus.get('cpu1')!.readSlot('Daten.status')).toBe(0x80a3);

    const s2 = solution(
      DB('Senden', 'TSEND_C') +
        DATA +
        'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Senden"(REQ := "Ein", ID := 1, DATA := "Daten".werte);\nEND_ORGANIZATION_BLOCK',
      DB('Empfang', 'TRCV_C') +
        DATA +
        'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Empfang"(EN_R := TRUE, ID := 1, DATA := "Daten".fertig);\n"Daten".status := "Empfang".STATUS;\nEND_ORGANIZATION_BLOCK',
    );
    const c2 = compileSolution(level, s2);
    const run2 = new LevelRun(level, s2, c2.programs, { test, seed: 1 });
    run2.runTo(300);
    expect(run2.cpus.get('cpu2')!.readSlot('Daten.status')).toBe(0x80b3);
  });
});

describe('Bedienpanel (HMI) und Program_Alarm', () => {
  const level = {
    ...levelById('01-foerderband')!,
    id: 'test-hmi',
    devices: [
      {
        id: 'P1',
        tag: 'P_Start',
        name: { de: 'Start (Panel)' },
        kind: 'DI',
        side: 'left',
        role: 'button',
        hmi: true,
      },
      {
        id: 'P2',
        tag: 'P_Betrieb',
        name: { de: 'Betrieb (Panel)' },
        kind: 'DO',
        side: 'right',
        role: 'lamp',
        hmi: true,
      },
      {
        id: 'P3',
        tag: 'P_Soll',
        name: { de: 'Sollwert (Panel)' },
        kind: 'AI',
        side: 'left',
        role: 'sensor',
        hmi: true,
        analog: { unit: '°C', min: 0, max: 200 },
      },
      {
        id: 'P4',
        tag: 'P_Anzeige',
        name: { de: 'Anzeige (Panel)' },
        kind: 'AO',
        side: 'right',
        role: 'display',
        hmi: true,
        analog: { unit: '°C', min: 0, max: 400 },
      },
      {
        id: 'M1',
        tag: 'Bandmotor',
        name: { de: 'Bandmotor' },
        kind: 'DO',
        side: 'right',
        role: 'motor',
      },
    ],
    tests: [],
  } as unknown as Level;
  const modules: PlacedModule[] = [
    { id: 'cpu1', type: 'cpu-klein', x: 0 },
    { id: 'do1', type: 'do8', x: 6 },
  ];
  const wires: Wire[] = [{ device: 'M1', module: 'do1', channel: 0 }];

  it('Panel-Elemente bekommen Merkeradressen und Variablen, ohne Verdrahtung', () => {
    const a = analyzeBoard(level, { version: 2, modules, wires, projects: {} });
    expect(a.ok).toBe(true);
    expect(a.issues.filter((i) => i.code === 'unwired')).toEqual([]);
    expect(a.bindings.get('P1')).toMatchObject({ address: '%M200.0', hmi: true });
    expect(a.bindings.get('P2')).toMatchObject({ address: '%M200.1' });
    expect(a.bindings.get('P3')).toMatchObject({ address: '%MW220', t: 'INT' });
    const bad = analyzeBoard(level, {
      version: 2,
      modules,
      wires,
      projects: {},
      hmi: { tags: { P1: '%I0.0' } },
    });
    expect(bad.issues.find((i) => i.device === 'P1')?.message).toMatch(/Merkeradresse/);
  });

  it('Taster schreibt bei Änderung, Lampe und Anzeige folgen im Bildtakt; Meldungen', () => {
    const src = [
      'DATA_BLOCK "Hoch"\nNON_RETAIN\nProgram_Alarm\nBEGIN\nEND_DATA_BLOCK',
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Bandmotor" := "P_Start";\n"P_Betrieb" := "Bandmotor";\n"P_Anzeige" := "P_Soll" * 2;\n"Hoch"(SIG := "P_Soll" > 100, TEXT := \'Sollwert hoch\');\nEND_ORGANIZATION_BLOCK',
    ].join('\n');
    const s = build(level, modules, wires, src);
    const c = compileSolution(level, s);
    expect(
      [...c.cpus.values()].flatMap((r) =>
        r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
      ),
    ).toEqual([]);
    const test = {
      id: 't',
      name: { de: 't' },
      durationMs: 1000,
      seeds: [1],
      stimuli: {
        P1: [
          [100, true],
          [300, false],
        ] as [number, boolean][],
        P3: [
          [0, 50],
          [500, 150],
        ] as [number, number][],
      },
    };
    const run = new LevelRun(level, s, c.programs, { test, seed: 1 });
    run.runTo(1000);
    const m1 = run.traces.get('M1')!;
    expect(m1.find(([, v]) => v === true)![0]).toBeGreaterThanOrEqual(100);
    expect(m1.find(([, v]) => v === true)![0]).toBeLessThan(115);
    const lamp = run.traces.get('P2')!;
    expect(lamp.find(([, v]) => v === true)![0] % 50).toBe(0);
    expect(run.traces.get('P4')!.at(-1)![1]).toBe(300);
    const cpu = run.cpus.get('cpu1')!;
    expect(cpu.activeAlarms.size).toBe(1);
    expect(cpu.alarms[0]!.text).toBe('Sollwert hoch');
  });
});
