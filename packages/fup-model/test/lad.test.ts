import { describe, expect, it } from 'vitest';
import { Cpu, type Block, type PlcProject } from '@zyklus/sim-core';
import { formatDiagnostic } from '@zyklus/scl-compiler';
import {
  compilePlcProject,
  countLadElements,
  fupToLad,
  ladToFup,
  type LadBody,
  type LadNetwork,
} from '../src';
import { TAGS, box, net } from './helpers';

const c = (id: string, operand: string, neg = false) =>
  ({ k: 'contact', id, operand, ...(neg ? { neg } : {}) }) as const;

function ladProject(lad: LadNetwork[], blocks: Block[] = []): PlcProject {
  const kop: LadBody = { lad };
  return {
    tags: TAGS,
    blocks: [
      { kind: 'OB', name: 'Main', number: 1, lang: 'KOP', iface: {}, source: '', kop },
      ...blocks,
    ],
  };
}

function run(p: PlcProject): Cpu {
  const r = compilePlcProject(p);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 1000 }, r.program!);
}

/** Selbsthaltung: (Start ODER Motor) UND NICHT Stopp → Motor */
const SELF: LadNetwork = {
  id: 'nw1',
  title: 'Selbsthaltung',
  items: [
    { k: 'parallel', id: 'p1', branches: [[c('c1', '"Start"')], [c('c2', '"Motor"')]] },
    c('c3', '"Stopp"', true),
  ],
  coils: [{ id: 'q1', kind: '=', operand: '"Motor"' }],
};

describe('KOP', () => {
  it('Selbsthaltung mit Parallelzweig und Öffner', () => {
    const cpu = run(ladProject([SELF]));
    const step = (start: boolean, stopp: boolean, t: number) => {
      cpu.setInput('%I0.0', start);
      cpu.setInput('%I0.1', stopp);
      cpu.scan(t);
      return cpu.read('%Q0.0');
    };
    expect(step(true, false, 0)).toBe(true);
    expect(step(false, false, 1)).toBe(true);
    expect(step(false, true, 2)).toBe(false);
    expect(countLadElements({ lad: [SELF] })).toBe(4);
  });

  it('Spulen S, R, negiert, P-Spule; P-Kontakt; Zeit als Box; Vergleicher als Kontakt', () => {
    const cpu = run(
      ladProject(
        [
          {
            id: 'a',
            title: '',
            items: [c('a1', '"Start"')],
            coils: [{ id: 'a2', kind: 'S', operand: '"Lampe"' }],
          },
          {
            id: 'b',
            title: '',
            items: [c('b1', '"Stopp"')],
            coils: [{ id: 'b2', kind: 'R', operand: '"Lampe"' }],
          },
          {
            id: 'c',
            title: '',
            items: [{ k: 'edge', id: 'c1', operand: '"Start"', mem: '"Flanke"', dir: 'P' }],
            coils: [{ id: 'c2', kind: '=', operand: '"Hupe"' }],
          },
          {
            id: 'd',
            title: '',
            items: [
              c('d1', '"Sensor"'),
              {
                k: 'box',
                id: 'd2',
                type: 'TON',
                operand: '"T1"',
                inputs: { PT: 'T#3ms' },
                outputs: {},
              },
            ],
            coils: [{ id: 'd3', kind: '/=', operand: '"Merker"' }],
          },
          {
            id: 'e',
            title: '',
            items: [
              {
                k: 'box',
                id: 'e1',
                type: 'CMP_GT',
                inputs: { IN1: '"Wert"', IN2: '10' },
                outputs: {},
              },
            ],
            coils: [{ id: 'e2', kind: '=', operand: '%Q0.3' }],
          },
        ],
        [{ kind: 'IDB', name: 'T1', number: 1, of: 'IEC_TIMER' }],
      ),
    );
    cpu.setInput('%I0.0', true);
    cpu.setInput('%I0.2', true);
    cpu.setInput('%MW10', 11);
    cpu.scan(0);
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%Q0.2')).toBe(true);
    expect(cpu.read('%M40.0')).toBe(true);
    expect(cpu.read('%Q0.3')).toBe(true);
    cpu.scan(1);
    expect(cpu.read('%Q0.2')).toBe(false); // P-Kontakt nur einen Zyklus
    for (let t = 2; t < 6; t++) cpu.scan(t);
    expect(cpu.read('%M40.0')).toBe(false); // TON abgelaufen, negierte Spule
    cpu.setInput('%I0.1', true);
    cpu.scan(6);
    expect(cpu.read('%Q0.1')).toBe(false);
  });

  it('Meldungen zeigen auf das KOP-Element', () => {
    const r = compilePlcProject(
      ladProject([
        {
          id: 'x',
          title: '',
          items: [c('k1', '"Gibtsnicht"')],
          coils: [{ id: 'k2', kind: '=', operand: '"Lampe"' }],
        },
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.location).toMatchObject({ network: 0, box: 'k2' });
  });
});

describe('Umschalten FUP ↔ KOP', () => {
  it('FUP-Baum lässt sich in KOP darstellen und zurück', () => {
    const fup = ladToFup(SELF);
    const back = fupToLad(fup);
    expect('lad' in back).toBe(true);
    if (!('lad' in back)) return;
    // gleiche Semantik
    const a = run(ladProject([SELF]));
    const b = run(ladProject([back.lad]));
    for (const [s, st, t] of [
      [true, false, 0],
      [false, false, 1],
      [false, true, 2],
    ] as const) {
      for (const k of [a, b]) {
        k.setInput('%I0.0', s);
        k.setInput('%I0.1', st);
        k.scan(t);
      }
      expect(b.read('%Q0.0')).toBe(a.read('%Q0.0'));
    }
  });

  it('Verzweigung eines Ausgangs ist in KOP nicht darstellbar', () => {
    const r = fupToLad(
      net(
        [
          box('AND', { id: 'g', inputs: { IN1: '"Start"', IN2: '"Sensor"' } }),
          box('ASSIGN', { id: 'q1', operand: '"Motor"' }),
          box('OR', { id: 'o', inputs: { IN2: '"Stopp"' } }),
          box('ASSIGN', { id: 'q2', operand: '"Lampe"' }),
        ],
        [
          ['g', 'OUT', 'q1', 'IN'],
          ['g', 'OUT', 'o', 'IN1'],
          ['o', 'OUT', 'q2', 'IN'],
        ],
      ),
    );
    expect('reason' in r).toBe(true);
  });
});
