import { describe, expect, it } from 'vitest';
import { inputPins, lowerFupBlock, countBoxes, BOX_SPECS, CATEGORIES } from '../src';
import { box, compile, cpuFor, net, project, scan } from './helpers';
import type { CodeBlock, GlobalDb, InstanceDb } from '@zyklus/sim-core';

const IDB = (name: string, of: string): InstanceDb => ({ kind: 'IDB', name, number: 2, of });
const DB = (name: string, vars: [string, string][]): GlobalDb => ({
  kind: 'DB',
  name,
  number: 3,
  vars: vars.map(([n, t]) => ({ name: n, type: t })),
});

/** Selbsthaltung: (Start ≥1 Motor) & Stopp → = Motor */
function selfHold() {
  return net(
    [
      box('OR', { id: 'or', inputs: { IN1: '"Start"', IN2: '"Motor"' } }),
      box('AND', { id: 'and', inputs: { IN2: '"Stopp"' } }),
      box('ASSIGN', { id: 'q', operand: '"Motor"' }),
    ],
    [
      ['or', 'OUT', 'and', 'IN1'],
      ['and', 'OUT', 'q', 'IN'],
    ],
  );
}

describe('Katalog', () => {
  it('enthält alle Kategorien und erweiterbare Eingänge', () => {
    expect(CATEGORIES.every((c) => Object.values(BOX_SPECS).some((s) => s.category === c))).toBe(
      true,
    );
    expect(inputPins('AND', 4).map((p) => p.name)).toEqual(['IN1', 'IN2', 'IN3', 'IN4']);
    expect(inputPins('MUX', 3).map((p) => p.name)).toEqual([
      'EN',
      'K',
      'IN0',
      'IN1',
      'IN2',
      'ELSE',
    ]);
    expect(inputPins('ADD').map((p) => p.name)).toEqual(['EN', 'IN1', 'IN2']);
  });
});

describe('Absenkung nach SCL', () => {
  it('Baumstruktur wird zu einem Ausdruck ohne Hilfsvariablen', () => {
    const p = project([selfHold()]);
    const l = lowerFupBlock(p.blocks[0] as CodeBlock, p);
    expect(l.diagnostics).toEqual([]);
    expect(l.block.source).toBe('// Netzwerk 1\n"Motor" := ("Start" OR "Motor") AND "Stopp";');
    expect(l.block.iface.Temp ?? []).toEqual([]);
    expect(l.lines[1]).toEqual({ network: 0, box: 'q' });
  });

  it('Verzweigung (ein Ausgang, mehrere Ziele) nutzt eine Hilfsvariable', () => {
    const p = project([
      net(
        [
          box('AND', { id: 'a', inputs: { IN1: '"Start"', IN2: '"Sensor"' } }),
          box('ASSIGN', { id: 'x', operand: '"Motor"' }),
          box('ASSIGN', { id: 'y', operand: '"Lampe"' }),
        ],
        [
          ['a', 'OUT', 'x', 'IN'],
          ['a', 'OUT', 'y', 'IN'],
        ],
      ),
    ]);
    const l = lowerFupBlock(p.blocks[0] as CodeBlock, p);
    expect(l.block.source).toContain('#__fup1 := "Start" AND "Sensor";');
    expect(l.block.source).toContain('"Motor" := #__fup1;');
    expect(l.block.source).toContain('"Lampe" := #__fup1;');
  });

  it('Netzwerktitel erscheinen als Kommentar', () => {
    const p = project([net([], [], 'Band ein')]);
    expect(lowerFupBlock(p.blocks[0] as CodeBlock, p).block.source).toBe('// Netzwerk 1: Band ein');
  });
});

describe('Ausführung', () => {
  it('Selbsthaltung', () => {
    const cpu = cpuFor([selfHold()]);
    const s = (t: number, a: boolean, b: boolean) => (
      scan(cpu, t, { '%I0.0': a, '%I0.1': b }),
      cpu.read('%Q0.0')
    );
    expect(s(0, false, true)).toBe(false);
    expect(s(1, true, true)).toBe(true);
    expect(s(2, false, true)).toBe(true);
    expect(s(3, false, false)).toBe(false);
  });

  it('negierte Eingänge und Ausgänge', () => {
    const cpu = cpuFor([
      net(
        [
          box('AND', { id: 'a', inputs: { IN1: '"Start"', IN2: '"Stopp"' }, negated: ['IN2'] }),
          box('ASSIGN', { id: 'q', operand: '"Motor"', negated: ['IN'] }),
        ],
        [['a', 'OUT', 'q', 'IN']],
      ),
    ]);
    scan(cpu, 0, { '%I0.0': true, '%I0.1': false });
    expect(cpu.read('%Q0.0')).toBe(false); // NOT(Start AND NOT Stopp)
    scan(cpu, 1, { '%I0.0': true, '%I0.1': true });
    expect(cpu.read('%Q0.0')).toBe(true);
  });

  it('XOR mit drei Eingängen (Parität), S und R', () => {
    const cpu = cpuFor([
      net(
        [
          box('XOR', {
            id: 'x',
            count: 3,
            inputs: { IN1: '"Start"', IN2: '"Stopp"', IN3: '"Sensor"' },
          }),
          box('ASSIGN', { id: 'q', operand: '"Lampe"' }),
        ],
        [['x', 'OUT', 'q', 'IN']],
      ),
      net([box('SET', { operand: '"Motor"', inputs: { IN: '"Start"' } })]),
      net([box('RESET', { operand: '"Motor"', inputs: { IN: '"Stopp"' } })]),
    ]);
    scan(cpu, 0, { '%I0.0': true, '%I0.1': true, '%I0.2': true });
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%Q0.0')).toBe(false); // R im späteren Netzwerk gewinnt
    scan(cpu, 1, { '%I0.0': false, '%I0.1': false, '%I0.2': false });
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('SR (Rücksetzen dominant) und RS (Setzen dominant) mit Speicherbit', () => {
    const cpu = cpuFor([
      net(
        [
          box('SR', { id: 's', operand: '"Merker"', inputs: { S: '"Start"', R1: '"Stopp"' } }),
          box('ASSIGN', { id: 'a', operand: '"Motor"' }),
        ],
        [['s', 'Q', 'a', 'IN']],
      ),
      net([
        box('RS', {
          id: 'r',
          operand: '%M41.0',
          inputs: { S1: '"Start"', R: '"Stopp"' },
          outputs: { Q: '"Lampe"' },
        }),
      ]),
    ]);
    scan(cpu, 0, { '%I0.0': true, '%I0.1': true });
    expect(cpu.read('%Q0.0')).toBe(false);
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%M40.0')).toBe(false);
  });

  it('P_TRIG mit Flankenmerker', () => {
    const cpu = cpuFor([
      net(
        [
          box('P_TRIG', { id: 'p', operand: '"Flanke"', inputs: { CLK: '"Start"' } }),
          box('ASSIGN', { id: 'a', operand: '"Lampe"' }),
        ],
        [['p', 'Q', 'a', 'IN']],
      ),
    ]);
    const out = [false, true, true, false, true].map(
      (v, t) => (scan(cpu, t, { '%I0.0': v }), cpu.read('%Q0.1')),
    );
    expect(out).toEqual([false, true, false, false, true]);
  });

  it('TON mit IEC_TIMER-DB, Q verbunden, ET auf Operand', () => {
    const cpu = cpuFor(
      [
        net(
          [
            box('TON', {
              id: 't',
              operand: '"T1_DB"',
              inputs: { IN: '"Start"', PT: 'T#50ms' },
              outputs: { ET: '"Zeit"' },
            }),
            box('ASSIGN', { id: 'a', operand: '"Motor"' }),
          ],
          [['t', 'Q', 'a', 'IN']],
        ),
      ],
      [IDB('T1_DB', 'IEC_TIMER')],
    );
    scan(cpu, 0, { '%I0.0': true });
    scan(cpu, 30);
    expect(cpu.read('%MD30', 'TIME')).toBe(30);
    expect(cpu.read('%Q0.0')).toBe(false);
    scan(cpu, 50);
    expect(cpu.read('%Q0.0')).toBe(true);
  });

  it('typisierter Instanz-DB (TOF_TIME) und Instanz im Global-DB', () => {
    const cpu = cpuFor(
      [
        net([
          box('TOF', {
            operand: '"Aus"',
            inputs: { IN: '"Start"', PT: 'T#10ms' },
            outputs: { Q: '"Lampe"' },
          }),
        ]),
        net([
          box('TP', {
            operand: '"Daten".Puls',
            inputs: { IN: '"Start"', PT: 'T#5ms' },
            outputs: { Q: '"Hupe"' },
          }),
        ]),
      ],
      [IDB('Aus', 'TOF_TIME'), DB('Daten', [['Puls', 'TP_TIME']])],
    );
    scan(cpu, 0, { '%I0.0': true });
    scan(cpu, 1, { '%I0.0': false });
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%Q0.2')).toBe(true);
    scan(cpu, 11);
    expect(cpu.read('%Q0.1')).toBe(false);
    expect(cpu.read('%Q0.2')).toBe(false);
  });

  it('CTU an IEC_COUNTER: Q wird aus QU gelesen', () => {
    const cpu = cpuFor(
      [
        net(
          [
            box('CTU', {
              id: 'z',
              operand: '"Z"',
              inputs: { CU: '"Sensor"', R: '"Stopp"', PV: '2' },
              outputs: { CV: '"Wert"' },
            }),
            box('ASSIGN', { id: 'a', operand: '"Lampe"' }),
          ],
          [['z', 'Q', 'a', 'IN']],
        ),
      ],
      [IDB('Z', 'IEC_COUNTER')],
    );
    [true, false, true, false].forEach((v, t) => scan(cpu, t, { '%I0.2': v }));
    expect(cpu.read('%MW10')).toBe(2);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('Vergleicher und IN_RANGE', () => {
    const cpu = cpuFor([
      net(
        [
          box('CMP_GE', { id: 'c', inputs: { IN1: '"Wert"', IN2: '100' } }),
          box('ASSIGN', { id: 'a', operand: '"Motor"' }),
        ],
        [['c', 'OUT', 'a', 'IN']],
      ),
      net(
        [
          box('IN_RANGE', { id: 'r', inputs: { MIN: '10', VAL: '"Wert"', MAX: '20' } }),
          box('ASSIGN', { id: 'b', operand: '"Lampe"' }),
        ],
        [['r', 'OUT', 'b', 'IN']],
      ),
    ]);
    scan(cpu, 0, { '%MW10': 15 });
    expect([cpu.read('%Q0.0'), cpu.read('%Q0.1')]).toEqual([false, true]);
    scan(cpu, 1, { '%MW10': 100 });
    expect([cpu.read('%Q0.0'), cpu.read('%Q0.1')]).toEqual([true, false]);
  });

  it('MOVE mit EN, ADD mit ENO, CONV, MUX mit ELSE', () => {
    const cpu = cpuFor([
      net([box('MOVE', { inputs: { EN: '"Start"', IN: '42' }, outputs: { OUT1: '"Wert"' } })]),
      net(
        [
          box('ADD', {
            id: 'add',
            count: 3,
            inputs: { IN1: '"Wert"', IN2: '1', IN3: '2' },
            outputs: { OUT: '"Wert2"' },
          }),
          box('ASSIGN', { id: 'eno', operand: '"Lampe"' }),
        ],
        [['add', 'ENO', 'eno', 'IN']],
      ),
      net([box('CONV', { inputs: { IN: '"Wert2"' }, outputs: { OUT: '"Real"' } })]),
      net([
        box('MUX', {
          count: 2,
          inputs: { K: '5', IN0: '1', IN1: '2', ELSE: '"Wert"' },
          outputs: { OUT: '"Wert"' },
        }),
      ]),
    ]);
    scan(cpu, 0, { '%I0.0': false });
    expect(cpu.read('%MW10')).toBe(0);
    expect(cpu.read('%MW12')).toBe(3);
    expect(cpu.read('%Q0.1')).toBe(true);
    scan(cpu, 1, { '%I0.0': true });
    expect(cpu.read('%MW10')).toBe(42);
    expect(cpu.read('%MW12')).toBe(45);
    expect(cpu.read('%MD20', 'REAL')).toBe(45);
  });

  it('Netzwerke werden von oben nach unten ausgewertet', () => {
    const cpu = cpuFor([
      net([box('ASSIGN', { operand: '"Merker"', inputs: { IN: '"Start"' } })]),
      net([box('ASSIGN', { operand: '"Motor"', inputs: { IN: '"Merker"' } })]),
    ]);
    scan(cpu, 0, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(true); // im selben Zyklus
  });

  it('Reihenfolge im Netzwerk folgt den Verbindungen, nicht der Lage', () => {
    // Zuweisung liegt optisch oben, hängt aber vom Zeitglied darunter ab
    const cpu = cpuFor(
      [
        net(
          [
            box('ASSIGN', { id: 'a', operand: '"Motor"', y: 0 }),
            box('TON', { id: 't', operand: '"T"', inputs: { IN: '"Start"', PT: 'T#0ms' }, y: 100 }),
          ],
          [['t', 'Q', 'a', 'IN']],
        ),
      ],
      [IDB('T', 'TON_TIME')],
    );
    scan(cpu, 0, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(true);
  });
});

describe('Fehler werden der Box zugeordnet', () => {
  const first = (r: ReturnType<typeof compile>) =>
    r.diagnostics.find((d) => d.severity === 'error')!;

  it.each([
    [
      [
        box('AND', { id: 'x', inputs: { IN1: '"Start"' } }),
        box('ASSIGN', { id: 'y', operand: '"Motor"' }),
      ],
      [['x', 'OUT', 'y', 'IN']],
      /Eingang IN2 ist offen/,
      'x',
      'IN2',
    ],
    [
      [box('ASSIGN', { id: 'x', inputs: { IN: '"Start"' } })],
      [],
      /Operand über der Box fehlt/,
      'x',
      undefined,
    ],
    [
      [box('MOVE', { id: 'x', inputs: { IN: '1' } })],
      [],
      /Ausgang OUT1 braucht einen Operanden/,
      'x',
      'OUT1',
    ],
    [
      [box('ASSIGN', { id: 'x', operand: '"Motor"', inputs: { IN: '"Start" AND "Stopp"' } })],
      [],
      /nur ein Operand oder eine Konstante/,
      'x',
      'IN',
    ],
    [
      [box('ASSIGN', { id: 'x', operand: '"Motor"', inputs: { IN: '"Sta' } })],
      [],
      /Operand „"Sta“/,
      'x',
      'IN',
    ],
  ] as const)('%#', (boxes, wires, re, boxId, pin) => {
    const d = first(compile([net([...boxes], wires as never)]));
    expect(d.message).toMatch(re);
    expect(d.location).toMatchObject({ network: 0, box: boxId, ...(pin ? { pin } : {}) });
  });

  it('Verbindung und Operand am selben Eingang', () => {
    const d = first(
      compile([
        net(
          [
            box('AND', { id: 'a', inputs: { IN1: '"Start"', IN2: '"Stopp"' } }),
            box('ASSIGN', { id: 'q', operand: '"Motor"', inputs: { IN: '"Start"' } }),
          ],
          [['a', 'OUT', 'q', 'IN']],
        ),
      ]),
    );
    expect(d.message).toMatch(/zusätzlich einen Operanden/);
  });

  it('Rückkopplung', () => {
    const r = compile([
      net(
        [
          box('AND', { id: 'a', inputs: { IN1: '"Start"' } }),
          box('OR', { id: 'o', inputs: { IN2: '"Stopp"' } }),
        ],
        [
          ['a', 'OUT', 'o', 'IN1'],
          ['o', 'OUT', 'a', 'IN2'],
        ],
      ),
    ]);
    expect(r.ok).toBe(false);
    expect(
      r.diagnostics.filter((d) => /Rückkopplung/.test(d.message)).map((d) => d.location.box),
    ).toEqual(['a', 'o']);
  });

  it('Wert-Pins lassen sich nicht verbinden', () => {
    const d = first(
      compile([
        net(
          [
            box('AND', { id: 'a', inputs: { IN1: '"Start"', IN2: '"Stopp"' } }),
            box('MOVE', { id: 'm', outputs: { OUT1: '"Wert"' } }),
          ],
          [['a', 'OUT', 'm', 'IN']],
        ),
      ]),
    );
    expect(d.message).toMatch(/Nur Bool-Signale/);
  });

  it('Typfehler aus dem SCL-Compiler zeigen auf die Box', () => {
    const r = compile([
      net([box('ASSIGN', { id: 'ok', operand: '"Lampe"', inputs: { IN: '"Start"' } })]),
      net(
        [
          box('CMP_GT', { id: 'cmp', inputs: { IN1: '"Start"', IN2: '5' } }),
          box('ASSIGN', { id: 'q', operand: '"Motor"' }),
        ],
        [['cmp', 'OUT', 'q', 'IN']],
      ),
    ]);
    const d = first(r);
    expect(d.message).toMatch(/nicht auf Bool/);
    expect(d.location).toMatchObject({ network: 1, box: 'q' });
  });

  it('unbekannter Instanz-DB wird gemeldet', () => {
    const d = first(
      compile([
        net([box('TON', { id: 't', operand: '"Gibts"', inputs: { IN: '"Start"', PT: 'T#1s' } })]),
      ]),
    );
    expect(d.message).toMatch(/Gibts/);
    expect(d.location.box).toBe('t');
  });

  it('unverbundener Logikausgang ist eine Warnung', () => {
    const r = compile([net([box('AND', { id: 'a', inputs: { IN1: '"Start"', IN2: '"Stopp"' } })])]);
    expect(r.ok).toBe(true);
    expect(r.diagnostics[0]).toMatchObject({ severity: 'warning', location: { box: 'a' } });
  });
});

describe('Programmgröße', () => {
  it('zählt Boxen und Netzwerke', () => {
    const r = compile([
      selfHold(),
      net([box('ASSIGN', { operand: '"Lampe"', inputs: { IN: '"Start"' } })]),
    ]);
    expect(r.size).toBe(4);
    expect(r.networks).toBe(2);
    expect(r.lang).toBe('FUP');
    expect(countBoxes({ networks: [selfHold()] })).toBe(3);
  });
});
