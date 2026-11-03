import { describe, expect, it } from 'vitest';
import { Cpu, type CodeBlock, type InstanceDb } from '@zyklus/sim-core';
import { formatDiagnostic } from '@zyklus/scl-compiler';
import { compilePlcProject, type GraphBody } from '../src';
import { TAGS } from './helpers';

/** Kette: 1 Grundstellung → (Start) 2 Motor an, Lampe nach 50 ms → (Sensor) 3 Hupe setzen → (Stopp) 1 */
const chain: GraphBody = {
  graph: {
    steps: [
      {
        id: 's1',
        no: 1,
        name: 'Grundstellung',
        initial: true,
        actions: [{ id: 'a0', q: 'R', operand: '"Hupe"' }],
      },
      {
        id: 's2',
        no: 2,
        name: 'Fahren',
        actions: [
          { id: 'a1', q: 'N', operand: '"Motor"' },
          { id: 'a2', q: 'D', operand: '"Lampe"', time: 'T#50ms' },
        ],
      },
      { id: 's3', no: 3, name: 'Melden', actions: [{ id: 'a3', q: 'S', operand: '"Hupe"' }] },
    ],
    transitions: [
      { id: 't1', from: 1, to: 2, cond: '"Start"' },
      { id: 't2', from: 2, to: 3, cond: '"Sensor" AND Schrittzeit > T#20ms' },
      { id: 't3', from: 3, to: 1, cond: '"Stopp"' },
    ],
  },
};

function project(graph: GraphBody, kind: 'FB' | 'FC' = 'FB') {
  const fb: CodeBlock = {
    kind,
    name: 'Kette',
    number: 1,
    lang: 'GRAPH',
    iface: {},
    source: '',
    graph,
  };
  const idb: InstanceDb = { kind: 'IDB', name: 'Kette_DB', number: 2, of: 'Kette' };
  return {
    tags: TAGS,
    blocks: [
      {
        kind: 'OB' as const,
        name: 'Main',
        number: 1,
        lang: 'SCL' as const,
        iface: {},
        source: '"Kette_DB"();',
      },
      fb,
      idb,
    ],
  };
}

describe('GRAPH-light', () => {
  it('Schritte, Transitionen und Aktionen N, D, S, R', () => {
    const r = compilePlcProject(project(chain));
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    expect(r.size).toBe(3 + 3 + 4 + 1); // plus Aufruf in Main
    const c = new Cpu({ name: 't', cycleMs: 10, maxOpsPerCycle: 10_000 }, r.program!);
    const at = (t: number, inputs: Record<string, boolean> = {}) => {
      for (const [a, v] of Object.entries(inputs)) c.setInput(a, v);
      c.scan(t);
    };
    at(0);
    expect(c.readSlot('Kette_DB.__Schritt')).toBe(1);
    at(10, { '%I0.0': true });
    at(20, { '%I0.0': false });
    expect(c.read('%Q0.0')).toBe(true);
    expect(c.read('%Q0.1')).toBe(false);
    for (let t = 30; t <= 100; t += 10) at(t);
    expect(c.read('%Q0.1')).toBe(true);
    at(110, { '%I0.2': true });
    expect(c.read('%Q0.0')).toBe(false);
    expect(c.read('%Q0.2')).toBe(true);
    at(120, { '%I0.2': false, '%I0.1': true });
    at(130, { '%I0.1': false });
    expect(c.readSlot('Kette_DB.__Schritt')).toBe(1);
    expect(c.read('%Q0.2')).toBe(false);
  });

  it('Fehler zeigen auf Schritt und Element', () => {
    const bad = JSON.parse(JSON.stringify(chain)) as GraphBody;
    bad.graph.transitions[0]!.to = 9;
    bad.graph.transitions[1]!.cond = '"Sensor" AND';
    bad.graph.steps[1]!.actions[1]!.time = '';
    const r = compilePlcProject(project(bad));
    expect(r.ok).toBe(false);
    const msgs = r.diagnostics.map((d) => `${d.location.network}/${d.location.box}: ${d.message}`);
    expect(msgs.some((m) => m.startsWith('0/t1') && /Schritt 9/.test(m))).toBe(true);
    expect(msgs.some((m) => m.startsWith('1/t2') && /Bedingung/.test(m))).toBe(true);
    expect(msgs.some((m) => m.startsWith('1/a2') && /Zeit/.test(m))).toBe(true);
    expect(compilePlcProject(project(chain, 'FC')).ok).toBe(false);
  });
});
