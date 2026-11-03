import { describe, expect, it } from 'vitest';
import type { CodeBlock, InstanceDb, VarDecl } from '@zyklus/sim-core';
import { boxSpec, callType, lowerFupBlock, outputPins } from '../src';
import { box, compile, cpuFor, net, project, scan } from './helpers';

const v = (name: string, type: string): VarDecl => ({ name, type });

const FB: CodeBlock = {
  kind: 'FB',
  name: 'Ventil',
  number: 1,
  lang: 'SCL',
  iface: {
    Input: [v('Auf', 'Bool'), v('Soll', 'Int')],
    Output: [v('Offen', 'Bool'), v('Stellung', 'Int')],
  },
  source: '#Offen := #Auf; #Stellung := #Soll * 2;',
};
const FC: CodeBlock = {
  kind: 'FC',
  name: 'Beide',
  number: 1,
  lang: 'SCL',
  returnType: 'Bool',
  iface: { Input: [v('A', 'Bool'), v('B', 'Bool')], Output: [v('Summe', 'Int')] },
  source: '#Ret_Val := #A AND #B; #Summe := BOOL_TO_INT(#A) + BOOL_TO_INT(#B);',
};
const IDB: InstanceDb = { kind: 'IDB', name: 'Ventil_DB', number: 2, of: 'Ventil' };

describe('eigene Bausteine als Box', () => {
  it('Pins kommen aus der Schnittstelle (EN/ENO, FC mit Ret_Val)', () => {
    const p = project([net([])], [FB, FC, IDB]);
    lowerFupBlock(p.blocks[0] as CodeBlock, p);
    const fb = boxSpec(callType('Ventil'));
    expect(fb.inputs.map((x) => x.name)).toEqual(['EN', 'Auf', 'Soll']);
    expect(fb.operandLabel).toBe('Instanz');
    expect(outputPins(callType('Beide')).map((x) => `${x.name}:${x.kind}`)).toEqual([
      'ENO:bool',
      'Ret_Val:bool',
      'Summe:value',
    ]);
  });

  it('FB-Box mit Instanz-DB, Bool-Ausgang verbunden, Wertausgang auf Operand', () => {
    const cpu = cpuFor(
      [
        net(
          [
            box(callType('Ventil'), {
              id: 'v',
              operand: '"Ventil_DB"',
              inputs: { Auf: '"Start"', Soll: '21' },
              outputs: { Stellung: '"Wert"' },
            }),
            box('ASSIGN', { id: 'a', operand: '"Motor"' }),
          ],
          [['v', 'Offen', 'a', 'IN']],
        ),
      ],
      [FB, IDB],
    );
    scan(cpu, 0, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%MW10', 'INT')).toBe(42);
    scan(cpu, 1, { '%I0.0': false });
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('FC-Box: Ret_Val verbunden, EN sperrt den Aufruf, ENO folgt EN', () => {
    const cpu = cpuFor(
      [
        net(
          [
            box(callType('Beide'), {
              id: 'f',
              inputs: { EN: '"Sensor"', A: '"Start"', B: '"Stopp"' },
              outputs: { Summe: '"Wert"', ENO: '"Hupe"' },
            }),
            box('ASSIGN', { id: 'a', operand: '"Lampe"' }),
          ],
          [['f', 'Ret_Val', 'a', 'IN']],
        ),
      ],
      [FC],
    );
    scan(cpu, 0, { '%I0.0': true, '%I0.1': true, '%I0.2': true });
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%Q0.2')).toBe(true);
    expect(cpu.read('%MW10', 'INT')).toBe(2);
    scan(cpu, 1, { '%I0.1': false, '%I0.2': false });
    expect(cpu.read('%MW10', 'INT')).toBe(2); // nicht aufgerufen
    expect(cpu.read('%Q0.2')).toBe(false);
  });

  it('fehlender Baustein und fehlende Instanz werden an der Box gemeldet', () => {
    const r = compile([net([box(callType('Gibtsnicht'), { id: 'x' })])]);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toContain('Gibtsnicht');
    const r2 = compile([net([box(callType('Ventil'), { id: 'y' })])], [FB]);
    expect(r2.ok).toBe(false);
    expect(r2.diagnostics[0].message).toContain('Instanz');
  });
});

describe('eigene Bausteine in KOP', () => {
  it('FB-Box im Strompfad: Kontakt → EN, ENO → Spule; Umwandlung FUP ↔ KOP', async () => {
    const { ladToFup, fupToLad } = await import('../src');
    const p = project([net([])], [FB, IDB]);
    p.blocks[0] = {
      ...(p.blocks[0] as CodeBlock),
      lang: 'KOP',
      fup: undefined,
      kop: {
        lad: [
          {
            id: 'n1',
            title: '',
            items: [
              { k: 'contact', id: 'c1', operand: '"Start"' },
              {
                k: 'box',
                id: 'v',
                type: callType('Ventil'),
                operand: '"Ventil_DB"',
                inputs: { Auf: '"Sensor"', Soll: '5' },
                outputs: { Stellung: '"Wert"' },
              },
            ],
            coils: [{ id: 'q', kind: '=', operand: '"Motor"' }],
          },
        ],
      },
    } as CodeBlock;
    const { compilePlcProject } = await import('../src');
    const r = compilePlcProject(p);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const { Cpu } = await import('@zyklus/sim-core');
    const cpu = new Cpu({ name: 't', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
    scan(cpu, 0, { '%I0.0': true, '%I0.2': true });
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%MW10', 'INT')).toBe(10);
    scan(cpu, 1, { '%I0.0': false });
    expect(cpu.read('%Q0.0')).toBe(false);
    expect(cpu.read('%MW10', 'INT')).toBe(10);
    const back = fupToLad(ladToFup((p.blocks[0] as CodeBlock & { kop: any }).kop.lad[0]));
    expect('lad' in back).toBe(true);
  });
});

describe('Bausteinschutz', () => {
  it('geschützter Baustein läuft, zählt aber nicht zur Programmgröße', () => {
    const call = net([
      box(callType('Ventil'), {
        id: 'v',
        operand: '"Ventil_DB"',
        inputs: { Auf: '"Start"' },
        outputs: { Offen: '"Motor"' },
      }),
    ]);
    const open = compile([call], [FB, IDB]);
    const locked = compile([call], [{ ...FB, protected: true }, IDB]);
    expect(locked.ok).toBe(true);
    expect(open.size - locked.size).toBe(2);
  });
});

describe('Multiinstanz', () => {
  it('FB-Box in einem FUP-FB nutzt eine statische Variable als Instanz', () => {
    const outer: CodeBlock = {
      kind: 'FB',
      name: 'Aussen',
      number: 2,
      lang: 'FUP',
      iface: {
        Input: [v('Ein', 'Bool')],
        Output: [v('Aus', 'Bool')],
        Static: [v('Innen', '"Ventil"')],
      },
      source: '',
      fup: {
        networks: [
          net([
            box(callType('Ventil'), {
              id: 'v',
              operand: '#Innen',
              inputs: { Auf: '#Ein' },
              outputs: { Offen: '#Aus' },
            }),
          ]),
        ],
      },
    };
    const cpu = cpuFor(
      [
        net([
          box(callType('Aussen'), {
            id: 'a',
            operand: '"Aussen_DB"',
            inputs: { Ein: '"Start"' },
            outputs: { Aus: '"Lampe"' },
          }),
        ]),
      ],
      [FB, outer, { kind: 'IDB', name: 'Aussen_DB', number: 3, of: 'Aussen' }],
    );
    scan(cpu, 0, { '%I0.0': true });
    expect(cpu.read('%Q0.1')).toBe(true);
  });
});

describe('Kommunikation in FUP', () => {
  it('TSEND_C-Box wird zum Aufruf mit DATA, DONE ist verbindbar', () => {
    const p = project(
      [
        net(
          [
            box('TSEND_C', {
              id: 's',
              operand: '"Senden"',
              inputs: { REQ: '"Start"', ID: '1', DATA: '"Wert"' },
              outputs: { STATUS: '"Wert2"' },
            }),
            box('ASSIGN', { id: 'a', operand: '"Lampe"' }),
          ],
          [['s', 'DONE', 'a', 'IN']],
        ),
      ],
      [{ kind: 'IDB', name: 'Senden', number: 4, of: 'TSEND_C' }],
    );
    const l = lowerFupBlock(p.blocks[0] as CodeBlock, p);
    expect(l.diagnostics).toEqual([]);
    expect(l.block.source).toContain('"Senden"(REQ := "Start", ID := 1, DATA := "Wert")');
    const r = compile((p.blocks[0] as CodeBlock & { fup: { networks: never[] } }).fup.networks, [
      { kind: 'IDB', name: 'Senden', number: 4, of: 'TSEND_C' },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('Bibliothek', () => {
  it('unveränderte Bibliotheksbausteine zählen nicht zur Programmgröße, geänderte schon', async () => {
    const { blockFingerprint } = await import('@zyklus/sim-core');
    const call = net([
      box(callType('Ventil'), {
        id: 'v',
        operand: '"Ventil_DB"',
        inputs: { Auf: '"Start"' },
        outputs: { Offen: '"Motor"' },
      }),
    ]);
    const lib = {
      ...FB,
      library: { name: 'Ventil', version: 1, fingerprint: blockFingerprint(FB) },
    };
    const plain = compile([call], [FB, IDB]);
    const reused = compile([call], [lib, IDB]);
    expect(plain.size - reused.size).toBe(2);
    const changed = compile([call], [{ ...lib, source: lib.source + ' #Offen := TRUE;' }, IDB]);
    expect(changed.size).toBe(plain.size + 1);
  });
});
