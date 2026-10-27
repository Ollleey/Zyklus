import { describe, expect, it } from 'vitest';
import { c, io, type Instr } from '../src';
import { makeCpu } from './harness';

/** Zähler mit CU=%I0.0, CD=%I0.1, R=%I0.2, LD=%I0.3, PV=%IW2 */
function counter(kind: 'CTU' | 'CTD' | 'CTUD', pv: number) {
  const cpu = makeCpu((b) => {
    const z = b.instance('Z', kind);
    const ins: Extract<Instr, { op: 'ctr' }> = { op: 'ctr', i: z.i, pv: c.int(pv) };
    if (kind !== 'CTD') ins.cu = io('%I0.0');
    if (kind !== 'CTU') ins.cd = io('%I0.1');
    if (kind !== 'CTD') ins.r = io('%I0.2');
    if (kind !== 'CTU') ins.ld = io('%I0.3');
    b.emit(ins);
  });
  let t = 0;
  const step = (x: { cu?: boolean; cd?: boolean; r?: boolean; ld?: boolean } = {}) => {
    cpu.setInput('%I0.0', !!x.cu);
    cpu.setInput('%I0.1', !!x.cd);
    cpu.setInput('%I0.2', !!x.r);
    cpu.setInput('%I0.3', !!x.ld);
    cpu.scan(t++);
    return cpu;
  };
  const pulse = (pin: 'cu' | 'cd', n = 1) => {
    for (let k = 0; k < n; k++) {
      step({ [pin]: true });
      step();
    }
  };
  return { cpu, step, pulse, cv: () => cpu.readInstance('Z', 'CV') };
}

describe('CTU', () => {
  it('zählt nur steigende Flanken', () => {
    const z = counter('CTU', 3);
    z.step({ cu: true });
    z.step({ cu: true });
    z.step({ cu: true });
    expect(z.cv()).toBe(1);
    z.step();
    z.pulse('cu', 2);
    expect(z.cv()).toBe(3);
    expect(z.cpu.readInstance('Z', 'Q')).toBe(true);
  });
  it('Q = CV ≥ PV', () => {
    const z = counter('CTU', 2);
    z.pulse('cu');
    expect(z.cpu.readInstance('Z', 'Q')).toBe(false);
    z.pulse('cu');
    expect(z.cpu.readInstance('Z', 'Q')).toBe(true);
  });
  it('R hat Vorrang, Flanke während R geht verloren', () => {
    const z = counter('CTU', 5);
    z.pulse('cu', 3);
    z.step({ cu: true, r: true });
    expect(z.cv()).toBe(0);
    z.step({ cu: true }); // CU war schon 1 → keine neue Flanke
    expect(z.cv()).toBe(0);
  });
  it('bleibt bei INT-Maximum stehen', () => {
    const z = counter('CTU', 0);
    z.cpu.instances[0]!.CV = 32766;
    z.pulse('cu', 3);
    expect(z.cv()).toBe(32767);
  });
});

describe('CTD', () => {
  it('LD lädt PV, CD zählt runter, Q bei CV ≤ 0', () => {
    const z = counter('CTD', 2);
    expect(z.cpu.readInstance('Z', 'Q')).toBe(false); // vor dem ersten Zyklus
    z.step({ ld: true });
    expect(z.cv()).toBe(2);
    expect(z.cpu.readInstance('Z', 'Q')).toBe(false);
    z.pulse('cd', 2);
    expect(z.cv()).toBe(0);
    expect(z.cpu.readInstance('Z', 'Q')).toBe(true);
    z.pulse('cd');
    expect(z.cv()).toBe(-1);
  });
  it('bleibt bei INT-Minimum stehen', () => {
    const z = counter('CTD', 0);
    z.cpu.instances[0]!.CV = -32767;
    z.pulse('cd', 3);
    expect(z.cv()).toBe(-32768);
  });
});

describe('CTUD', () => {
  it('zählt hoch und runter, QU/QD', () => {
    const z = counter('CTUD', 2);
    z.pulse('cu', 3);
    expect(z.cv()).toBe(3);
    expect(z.cpu.readInstance('Z', 'QU')).toBe(true);
    z.pulse('cd', 3);
    expect(z.cv()).toBe(0);
    expect(z.cpu.readInstance('Z', 'QU')).toBe(false);
    expect(z.cpu.readInstance('Z', 'QD')).toBe(true);
  });
  it('gleichzeitige Flanken an CU und CD heben sich auf', () => {
    const z = counter('CTUD', 5);
    z.step({ cu: true, cd: true });
    expect(z.cv()).toBe(0);
  });
  it('R vor LD vor Zählen', () => {
    const z = counter('CTUD', 7);
    z.step({ ld: true });
    expect(z.cv()).toBe(7);
    z.step({ ld: true, r: true });
    expect(z.cv()).toBe(0);
    z.step({ ld: true, cu: true });
    expect(z.cv()).toBe(7);
  });
});
