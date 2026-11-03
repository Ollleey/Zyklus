import { describe, expect, it } from 'vitest';
import { emptyProject, type PlcProject } from '@zyklus/sim-core';
import { findTrigger } from '../src/components/LogicAnalyzer';
import { formatAs, parseValue, resolveOperand, timeText } from '../src/state/online';

const project: PlcProject = {
  ...emptyProject(),
  tags: [{ name: 'Start', address: '%I0.0', t: 'BOOL' }],
  blocks: [
    ...emptyProject().blocks,
    { kind: 'DB', name: 'Daten', number: 1, vars: [{ name: 'Feld', type: 'Array[0..3] of Int' }] },
    { kind: 'IDB', name: 'T1', number: 2, of: 'TON_TIME' },
  ],
};

describe('Beobachtungstabelle', () => {
  it('Operanden auflösen', () => {
    expect(resolveOperand(project, '"Start"')).toEqual({
      kind: 'address',
      address: '%I0.0',
      t: 'BOOL',
    });
    expect(resolveOperand(project, '%mw10')).toEqual({ kind: 'address', address: '%MW10' });
    expect(resolveOperand(project, '"Daten".Feld[ 2 ]')).toEqual({
      kind: 'slot',
      name: 'Daten.Feld[2]',
    });
    expect(resolveOperand(project, '"T1".et')).toEqual({
      kind: 'instance',
      name: 'T1',
      field: 'ET',
    });
    expect(resolveOperand(project, '"Gibts"')).toHaveProperty('error');
  });

  it('Werte lesen und anzeigen', () => {
    expect(parseValue('TRUE')).toBe(true);
    expect(parseValue('-5')).toBe(-5);
    expect(parseValue('16#FF')).toBe(255);
    expect(parseValue('T#1s500ms')).toBe(1500);
    expect(parseValue("'abc'")).toBe('abc');
    expect(parseValue('Unsinn')).toBeUndefined();
    expect(formatAs(255, 'hex')).toBe('16#FF');
    expect(formatAs(5, 'bin')).toBe('2#101');
    expect(formatAs(-1, 'hex')).toBe('16#FFFFFFFF');
    expect(timeText(61_500)).toBe('T#1m_1s_500ms');
  });
});

describe('Trace-Trigger', () => {
  const edges: [number, boolean | number][] = [
    [0, false],
    [100, true],
    [300, false],
    [500, true],
  ];
  it('Flanken ab dem Scharfschalten', () => {
    const c = { signal: 'x', value: 0, pre: 0, post: 0 };
    expect(findTrigger(edges, { ...c, cond: 'rise' }, 0)).toBe(100);
    expect(findTrigger(edges, { ...c, cond: 'rise' }, 200)).toBe(500);
    expect(findTrigger(edges, { ...c, cond: 'fall' }, 0)).toBe(300);
  });
  it('Wertvergleich', () => {
    const a: [number, number][] = [
      [0, 0],
      [50, 10],
      [80, 30],
    ];
    const c = { signal: 'x', pre: 0, post: 0 };
    expect(findTrigger(a, { ...c, cond: 'gt', value: 20 }, 0)).toBe(80);
    expect(findTrigger(a, { ...c, cond: 'eq', value: 10 }, 0)).toBe(50);
  });
});
