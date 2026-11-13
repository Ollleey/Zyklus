import { describe, expect, it } from 'vitest';
import type { FupNetwork, LadNetwork } from '@zyklus/fup-model';
import { fupValues, ladFlow, liveText } from '../src/components/liveFlow';

const values: Record<string, boolean | number> = {
  '"Start"': true,
  '"Stopp"': false,
  '"Hand"': false,
  '"T1".Q': true,
  '"T1".ET': 1200,
  '"Wert"': 42,
};
const live = (op: string) => values[op];

describe('Beobachten in KOP: Stromfluss', () => {
  it('Reihe, Öffner und Parallelzweig wie im TIA-Portal', () => {
    const nw: LadNetwork = {
      id: 'n1',
      title: '',
      items: [
        {
          k: 'parallel',
          id: 'p1',
          branches: [
            [{ k: 'contact', id: 'a', operand: '"Start"' }],
            [{ k: 'contact', id: 'b', operand: '"Hand"' }],
          ],
        },
        { k: 'contact', id: 'c', operand: '"Stopp"', neg: true },
      ],
      coils: [{ id: 'q', kind: '=', operand: '"Motor"' }],
    };
    const f = ladFlow(nw, live);
    expect(f.get('p1:0')).toBe(true);
    expect(f.get('p1:1')).toBe(false);
    expect(f.get('p1')).toBe(true);
    expect(f.get('c')).toBe(true);
    expect(f.get('end')).toBe(true);
  });

  it('kein Strom hinter einem offenen Kontakt, unbekannt bei unlesbarem Operanden', () => {
    const nw: LadNetwork = {
      id: 'n1',
      title: '',
      items: [
        { k: 'contact', id: 'a', operand: '"Stopp"' },
        { k: 'contact', id: 'b', operand: '"Unbekannt"' },
      ],
      coils: [],
    };
    const f = ladFlow(nw, live);
    expect(f.get('a')).toBe(false);
    expect(f.get('end')).toBe(false);
    const g = ladFlow({ ...nw, items: [nw.items[1]!] }, live);
    expect(g.get('end')).toBeUndefined();
  });

  it('Zeitbox gibt Strom über Q weiter, Vergleicher wirkt wie ein Kontakt', () => {
    const nw: LadNetwork = {
      id: 'n1',
      title: '',
      items: [
        { k: 'box', id: 't', type: 'TON', operand: '"T1"', inputs: { PT: 'T#2s' }, outputs: {} },
        {
          k: 'box',
          id: 'v',
          type: 'CMP_GT',
          inputs: { IN1: '"Wert"', IN2: '50' },
          outputs: {},
        },
      ],
      coils: [],
    };
    const f = ladFlow(nw, live);
    expect(f.get('t')).toBe(true);
    expect(f.get('v')).toBe(false);
  });
});

describe('Beobachten in FUP: Leitungswerte', () => {
  it('UND aus Operand und Leitung, negierter Eingang, Instanzausgänge', () => {
    const nw: FupNetwork = {
      id: 'n1',
      title: '',
      boxes: [
        {
          id: 'or',
          type: 'OR',
          x: 0,
          y: 0,
          inputs: { IN1: '"Start"', IN2: '"Hand"' },
          outputs: {},
          negated: [],
        },
        {
          id: 'and',
          type: 'AND',
          x: 0,
          y: 0,
          inputs: { IN2: '"Stopp"' },
          outputs: {},
          negated: ['IN2'],
        },
        {
          id: 't',
          type: 'TON',
          x: 0,
          y: 0,
          operand: '"T1"',
          inputs: { PT: 'T#2s' },
          outputs: {},
          negated: [],
        },
      ],
      wires: [
        { from: { box: 'or', pin: 'OUT' }, to: { box: 'and', pin: 'IN1' } },
        { from: { box: 'and', pin: 'OUT' }, to: { box: 't', pin: 'IN' } },
      ],
    };
    const v = fupValues(nw, live);
    expect(v.get('or.OUT')).toBe(true);
    expect(v.get('and.OUT')).toBe(true);
    expect(v.get('t.Q')).toBe(true);
    expect(v.get('t.ET')).toBe(1200);
  });

  it('Anzeige: 1 grün, 0 blau, Zahlen neutral', () => {
    expect(liveText(true)).toEqual({ text: '1', cls: 'on' });
    expect(liveText(false)).toEqual({ text: '0', cls: 'off' });
    expect(liveText(2.5)).toEqual({ text: '2.50', cls: 'num' });
    expect(liveText(undefined)).toBeUndefined();
  });
});
