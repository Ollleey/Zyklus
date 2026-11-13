import { describe, expect, it } from 'vitest';
import { Cpu, type CodeBlock, type InstanceDb } from '@zyklus/sim-core';
import { formatDiagnostic } from '@zyklus/scl-compiler';
import { compilePlcProject, type GraphBody } from '../src';
import { TAGS } from './helpers';

/** Kette in FB „Kette“, Aufruf in OB1 mit den angegebenen Parametern */
function run(graph: GraphBody, call = '"Kette_DB"();') {
  const fb: CodeBlock = {
    kind: 'FB',
    name: 'Kette',
    number: 1,
    lang: 'GRAPH',
    iface: {},
    source: '',
    graph,
  };
  const idb: InstanceDb = { kind: 'IDB', name: 'Kette_DB', number: 2, of: 'Kette' };
  const r = compilePlcProject({
    tags: TAGS,
    blocks: [
      { kind: 'OB', name: 'Main', number: 1, lang: 'SCL', iface: {}, source: call },
      fb,
      idb,
    ],
  });
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  const c = new Cpu({ name: 't', cycleMs: 10, maxOpsPerCycle: 100_000 }, r.program!);
  let t = 0;
  const cycle = (inputs: Record<string, boolean | number> = {}) => {
    for (const [a, v] of Object.entries(inputs)) c.setInput(a, v);
    c.scan(t);
    t += 10;
  };
  const x = (no: number) => c.readSlot(`Kette_DB.__X${no}`);
  const v = (name: string) => c.readSlot(`Kette_DB.${name}`);
  return { c, cycle, x, v };
}

const step = (no: number, extra: Partial<GraphBody['graph']['steps'][number]> = {}) => ({
  id: `s${no}`,
  no,
  name: `S${no}`,
  actions: [],
  ...(no === 1 ? { initial: true } : {}),
  ...extra,
});

describe('GRAPH: Simultanverzweigung und Synchronisation', () => {
  it('zwei Zweige laufen gleichzeitig, weiter erst, wenn beide fertig sind', () => {
    const g: GraphBody = {
      graph: {
        steps: [
          step(1),
          step(2, { actions: [{ id: 'a', q: 'N', operand: '"Motor"' }] }),
          step(3, { actions: [{ id: 'b', q: 'N', operand: '"Lampe"' }] }),
          step(4),
          step(5),
          step(6, { actions: [{ id: 'c', q: 'N', operand: '"Hupe"' }] }),
        ],
        transitions: [
          { id: 't1', from: 1, to: [2, 3], cond: '"Start"' },
          { id: 't2', from: 2, to: 4, cond: '"Sensor"' },
          { id: 't3', from: 3, to: 5, cond: 'Schrittzeit >= T#50ms' },
          { id: 't4', from: [4, 5], to: 6, cond: 'TRUE' },
        ],
      },
    };
    const { c, cycle, x, v } = run(g);
    cycle();
    expect(v('__Schritt')).toBe(1);
    cycle({ '%I0.0': true });
    cycle({ '%I0.0': false });
    expect([x(2), x(3)]).toEqual([true, true]);
    expect(c.read('%Q0.0')).toBe(true);
    expect(c.read('%Q0.1')).toBe(true);
    cycle({ '%I0.2': true });
    expect([x(4), x(3)]).toEqual([true, true]);
    // Synchronisation wartet auf Schritt 5
    expect(x(6)).toBe(false);
    for (let k = 0; k < 8; k++) cycle({ '%I0.2': false });
    expect(x(6)).toBe(true);
    expect(c.read('%Q0.2')).toBe(true);
    expect(v('S_NO')).toBe(6);
  });
});

describe('GRAPH: Überwachung, Verriegelung, Quittieren', () => {
  const g: GraphBody = {
    graph: {
      steps: [
        step(1),
        step(2, {
          actions: [{ id: 'a', q: 'N', operand: '"Motor"' }],
          interlock: 'NOT "Stopp"',
          supervision: 'Schrittzeit > T#100ms',
        }),
        step(3),
      ],
      transitions: [
        { id: 't1', from: 1, to: 2, cond: '"Start"' },
        { id: 't2', from: 2, to: 3, cond: '"Sensor"' },
      ],
    },
  };

  it('Verriegelung schaltet die Aktionen ab und meldet eine Störung, solange sie fehlt', () => {
    const { c, cycle, v } = run(g, '"Kette_DB"(ACK_EF := "Merker");');
    cycle({ '%I0.0': true });
    cycle({ '%I0.0': false });
    expect(c.read('%Q0.0')).toBe(true);
    cycle({ '%I0.1': true });
    expect(c.read('%Q0.0')).toBe(false);
    expect(v('ERR_FLT')).toBe(true);
    cycle({ '%I0.1': false });
    expect(c.read('%Q0.0')).toBe(true);
    expect(v('ERR_FLT')).toBe(false);
  });

  it('Überwachung hält die Kette an, bis quittiert ist', () => {
    const { cycle, x, v } = run(g, '"Kette_DB"(ACK_EF := "Merker");');
    cycle({ '%I0.0': true });
    cycle({ '%I0.0': false });
    for (let k = 0; k < 15; k++) cycle();
    expect(v('ERR_FLT')).toBe(true);
    expect(v('__Fehler')).toBe(2);
    // Transition gesperrt, solange die Störung ansteht
    cycle({ '%I0.2': true });
    expect(x(3)).toBe(false);
    cycle({ '%M40.0': true });
    cycle({ '%M40.0': false });
    expect(x(3)).toBe(true);
  });
});

describe('GRAPH: Betriebsarten und dauernde Anweisungen', () => {
  const g: GraphBody = {
    graph: {
      steps: [step(1), step(2), step(3)],
      transitions: [
        { id: 't1', from: 1, to: 2, cond: 'TRUE' },
        { id: 't2', from: 2, to: 3, cond: 'TRUE' },
      ],
      pre: '"Wert" := "Wert" + 1;',
      post: '"Lampe" := #S_NO = 3;',
    },
  };
  const call =
    '"Kette_DB"(SW_AUTO := "Start", SW_TAP := "Stopp", SW_MAN := "Sensor", T_PUSH := "Merker", S_SEL := "Wert2", S_ON := "Flanke", INIT_SQ := %M40.2);';

  it('Tippen schaltet nur mit T_PUSH weiter, Hand wählt einen Schritt, INIT_SQ setzt zurück', () => {
    const { c, cycle, x, v } = run(g, call);
    cycle({ '%I0.1': true }); // Tippen
    cycle({ '%I0.1': false });
    expect(v('TAP_ON')).toBe(true);
    cycle();
    expect(x(1)).toBe(true);
    cycle({ '%M40.0': true });
    cycle({ '%M40.0': false });
    expect(x(2)).toBe(true);
    cycle({ '%I0.2': true }); // Hand
    cycle({ '%I0.2': false, '%MW12': 1 });
    cycle({ '%M40.1': true });
    expect([x(1), x(2), x(3)]).toEqual([true, false, false]);
    cycle({ '%M40.1': false });
    cycle({ '%I0.0': true }); // Automatik
    cycle({ '%I0.0': false });
    cycle();
    cycle();
    expect(x(3)).toBe(true);
    expect(c.read('%Q0.1')).toBe(true); // post
    expect(Number(c.read('%MW10'))).toBeGreaterThan(5); // pre jeden Zyklus
    cycle({ '%M40.2': true });
    expect([x(1), x(2), x(3)]).toEqual([true, false, false]);
  });

  it('alte Ketten (eine Zahl je Seite) laufen unverändert in Automatik', () => {
    const { cycle, x } = run({
      graph: {
        steps: [step(1), step(2)],
        transitions: [{ id: 't1', from: 1, to: 2, cond: '"Start"' }],
      },
    });
    cycle({ '%I0.0': true });
    expect(x(2)).toBe(true);
  });
});
