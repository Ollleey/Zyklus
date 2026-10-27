import { describe, expect, it } from 'vitest';
import { c, io, type CallFn, type DataType, type Operand } from '../src';
import { makeCpu } from './harness';

function fn(f: CallFn, t: DataType, args: Operand[], dst: Operand) {
  const cpu = makeCpu((b) => b.emit({ op: 'fn', fn: f, t, dst, args }));
  cpu.scan(0);
  return cpu.read(
    dst.k === 'io' ? (dst.t === 'BOOL' ? '%M10.0' : dst.t === 'INT' ? '%MW10' : '%MD10') : '',
    dst.k === 'io' ? dst.t : undefined,
  );
}
const INT_OUT = io('%MW10');
const REAL_OUT = io('%MD10', 'REAL');

describe('LIMIT / MIN / MAX', () => {
  it('LIMIT begrenzt', () => {
    expect(fn('limit', 'INT', [c.int(0), c.int(-5), c.int(100)], INT_OUT)).toBe(0);
    expect(fn('limit', 'INT', [c.int(0), c.int(50), c.int(100)], INT_OUT)).toBe(50);
    expect(fn('limit', 'INT', [c.int(0), c.int(150), c.int(100)], INT_OUT)).toBe(100);
    expect(fn('limit', 'REAL', [c.real(0), c.real(1.5), c.real(1)], REAL_OUT)).toBe(1);
  });
  it('MIN / MAX mit mehreren Eingängen', () => {
    expect(fn('min', 'INT', [c.int(4), c.int(-2), c.int(9)], INT_OUT)).toBe(-2);
    expect(fn('max', 'INT', [c.int(4), c.int(-2), c.int(9)], INT_OUT)).toBe(9);
    expect(fn('max', 'REAL', [c.real(0.5), c.real(0.25)], REAL_OUT)).toBe(0.5);
  });
});

describe('SEL / MUX', () => {
  it('SEL wählt IN0 bei G = 0, IN1 bei G = 1', () => {
    expect(fn('sel', 'INT', [c.bool(false), c.int(10), c.int(20)], INT_OUT)).toBe(10);
    expect(fn('sel', 'INT', [c.bool(true), c.int(10), c.int(20)], INT_OUT)).toBe(20);
  });
  it('MUX wählt per K, ELSE bei ungültigem K', () => {
    const cpu = makeCpu((b) => {
      b.emit({
        op: 'mux',
        t: 'INT',
        dst: io('%MW10'),
        k: io('%MW0'),
        ins: [c.int(100), c.int(200), c.int(300)],
        alt: c.int(-1),
      });
    });
    const out = [0, 1, 2, 3, -1].map((k) => {
      cpu.setInput('%MW0', k);
      cpu.scan(0);
      return cpu.read('%MW10');
    });
    expect(out).toEqual([100, 200, 300, -1, -1]);
  });
  it('MUX ohne ELSE lässt Ziel unverändert', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'mux', t: 'INT', dst: io('%MW10'), k: io('%MW0'), ins: [c.int(1), c.int(2)] });
    });
    cpu.setInput('%MW0', 1);
    cpu.scan(0);
    cpu.setInput('%MW0', 5);
    cpu.scan(1);
    expect(cpu.read('%MW10')).toBe(2);
  });
});

describe('NORM_X / SCALE_X', () => {
  it('NORM_X normiert linear auf 0…1', () => {
    expect(fn('norm_x', 'INT', [c.int(0), c.int(13824), c.int(27648)], REAL_OUT)).toBe(0.5);
    expect(fn('norm_x', 'INT', [c.int(0), c.int(0), c.int(27648)], REAL_OUT)).toBe(0);
    expect(fn('norm_x', 'INT', [c.int(0), c.int(27648), c.int(27648)], REAL_OUT)).toBe(1);
  });
  it('NORM_X begrenzt nicht (Über-/Unterlauf erkennbar)', () => {
    expect(fn('norm_x', 'INT', [c.int(0), c.int(32767), c.int(27648)], REAL_OUT)).toBeGreaterThan(
      1.18,
    );
    expect(fn('norm_x', 'INT', [c.int(0), c.int(-4864), c.int(27648)], REAL_OUT)).toBeLessThan(0);
  });
  it('NORM_X mit MIN = MAX liefert 0', () => {
    expect(fn('norm_x', 'INT', [c.int(5), c.int(5), c.int(5)], REAL_OUT)).toBe(0);
  });
  it('SCALE_X auf REAL', () => {
    expect(fn('scale_x', 'REAL', [c.real(0), c.real(0.5), c.real(200)], REAL_OUT)).toBe(100);
    expect(fn('scale_x', 'REAL', [c.real(-50), c.real(0.25), c.real(150)], REAL_OUT)).toBe(0);
  });
  it('SCALE_X auf INT rundet half-even und sättigt', () => {
    expect(fn('scale_x', 'INT', [c.int(0), c.real(0.5), c.int(27648)], INT_OUT)).toBe(13824);
    expect(fn('scale_x', 'INT', [c.int(0), c.real(0.5), c.int(5)], INT_OUT)).toBe(2); // 2.5 → 2
    expect(fn('scale_x', 'INT', [c.int(0), c.real(0.5), c.int(7)], INT_OUT)).toBe(4); // 3.5 → 4
    expect(fn('scale_x', 'INT', [c.int(0), c.real(0.75), c.int(5)], INT_OUT)).toBe(4); // 3.75 → 4
    expect(fn('scale_x', 'INT', [c.int(0), c.real(2), c.int(27648)], INT_OUT)).toBe(32767);
  });
  it('NORM_X → SCALE_X: Rohwert 0…27648 in 0…100 %', () => {
    const cpu = makeCpu((b) => {
      const n = b.temp('n', 'REAL');
      b.emit({
        op: 'fn',
        fn: 'norm_x',
        t: 'INT',
        dst: n,
        args: [c.int(0), io('%IW64'), c.int(27648)],
      });
      b.emit({
        op: 'fn',
        fn: 'scale_x',
        t: 'REAL',
        dst: io('%MD0', 'REAL'),
        args: [c.real(0), n, c.real(100)],
      });
    });
    for (const [raw, pct] of [
      [0, 0],
      [6912, 25],
      [27648, 100],
    ]) {
      cpu.setInput('%IW64', raw!);
      cpu.scan(0);
      expect(cpu.read('%MD0', 'REAL')).toBeCloseTo(pct!, 5);
    }
  });
});
