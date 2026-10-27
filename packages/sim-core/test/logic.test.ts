import { describe, expect, it } from 'vitest';
import { c, io } from '../src';
import { makeCpu, scanAt } from './harness';

const truth: [boolean, boolean][] = [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
];

describe('Bitlogik', () => {
  it.each([
    ['and', (a: boolean, b: boolean) => a && b],
    ['or', (a: boolean, b: boolean) => a || b],
    ['xor', (a: boolean, b: boolean) => a !== b],
  ] as const)('%s – Wahrheitstabelle', (fn, ref) => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'bin', fn, t: 'BOOL', dst: io('%Q0.0'), a: io('%I0.0'), b: io('%I0.1') });
    });
    for (const [a, bb] of truth) {
      scanAt(cpu, 0, { '%I0.0': a, '%I0.1': bb });
      expect(cpu.read('%Q0.0'), `${a} ${fn} ${bb}`).toBe(ref(a, bb));
    }
  });

  it('NOT', () => {
    const cpu = makeCpu((b) =>
      b.emit({ op: 'un', fn: 'not', t: 'BOOL', dst: io('%Q0.0'), a: io('%I0.0') }),
    );
    scanAt(cpu, 0, { '%I0.0': false });
    expect(cpu.read('%Q0.0')).toBe(true);
    scanAt(cpu, 1, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('Zuweisung (MOVE auf BOOL)', () => {
    const cpu = makeCpu((b) => b.emit({ op: 'mov', dst: io('%Q0.3'), src: io('%I0.5') }));
    scanAt(cpu, 0, { '%I0.5': true });
    expect(cpu.read('%Q0.3')).toBe(true);
    expect(cpu.read('%Q0.2')).toBe(false);
  });
});

describe('S / R', () => {
  it('Setzen und Rücksetzen nur bei VKE = 1', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'set', dst: io('%Q0.0'), cond: io('%I0.0') });
      b.emit({ op: 'reset', dst: io('%Q0.0'), cond: io('%I0.1') });
    });
    scanAt(cpu, 0);
    expect(cpu.read('%Q0.0')).toBe(false);
    scanAt(cpu, 1, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(true);
    scanAt(cpu, 2, { '%I0.0': false });
    expect(cpu.read('%Q0.0')).toBe(true); // bleibt gesetzt
    scanAt(cpu, 3, { '%I0.1': true });
    expect(cpu.read('%Q0.0')).toBe(false);
    // beide aktiv: die zuletzt ausgeführte Anweisung gewinnt
    scanAt(cpu, 4, { '%I0.0': true, '%I0.1': true });
    expect(cpu.read('%Q0.0')).toBe(false);
  });
});

describe('SR / RS – Dominanz', () => {
  const table = (kind: 'SR' | 'RS') => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'sr', kind, s: io('%I0.0'), r: io('%I0.1'), q: io('%M0.0'), out: io('%Q0.0') });
    });
    const step = (t: number, s: boolean, r: boolean) => {
      scanAt(cpu, t, { '%I0.0': s, '%I0.1': r });
      expect(cpu.read('%Q0.0')).toBe(cpu.read('%M0.0'));
      return cpu.read('%Q0.0');
    };
    return step;
  };

  it('SR: Rücksetzen dominant', () => {
    const step = table('SR');
    expect(step(0, false, false)).toBe(false);
    expect(step(1, true, false)).toBe(true);
    expect(step(2, false, false)).toBe(true); // speichert
    expect(step(3, true, true)).toBe(false); // R gewinnt
    expect(step(4, false, false)).toBe(false);
    expect(step(5, true, true)).toBe(false); // auch aus 0 heraus
  });

  it('RS: Setzen dominant', () => {
    const step = table('RS');
    expect(step(0, false, false)).toBe(false);
    expect(step(1, true, true)).toBe(true); // S gewinnt
    expect(step(2, false, false)).toBe(true);
    expect(step(3, false, true)).toBe(false);
    expect(step(4, true, false)).toBe(true);
    expect(step(5, true, true)).toBe(true);
  });

  it('Speicher in einer Variablen statt Merker', () => {
    const cpu = makeCpu((b) => {
      const mem = b.slot('Speicher', 'BOOL');
      b.emit({ op: 'sr', kind: 'SR', s: io('%I0.0'), r: io('%I0.1'), q: mem });
      b.emit({ op: 'mov', dst: io('%Q0.0'), src: mem });
    });
    scanAt(cpu, 0, { '%I0.0': true });
    scanAt(cpu, 1, { '%I0.0': false });
    expect(cpu.readSlot('Speicher')).toBe(true);
    expect(cpu.read('%Q0.0')).toBe(true);
  });
});

describe('Flanken', () => {
  it('P_TRIG liefert genau einen Zyklus TRUE bei steigender Flanke', () => {
    const cpu = makeCpu((b) =>
      b.emit({ op: 'edge', kind: 'P', clk: io('%I0.0'), mem: io('%M0.0'), out: io('%Q0.0') }),
    );
    const seq = [false, true, true, false, true, false];
    const out = seq.map((v, t) => (scanAt(cpu, t, { '%I0.0': v }), cpu.read('%Q0.0')));
    expect(out).toEqual([false, true, false, false, true, false]);
  });

  it('N_TRIG liefert genau einen Zyklus TRUE bei fallender Flanke', () => {
    const cpu = makeCpu((b) =>
      b.emit({ op: 'edge', kind: 'N', clk: io('%I0.0'), mem: io('%M0.0'), out: io('%Q0.0') }),
    );
    const seq = [false, true, true, false, false, true, false];
    const out = seq.map((v, t) => (scanAt(cpu, t, { '%I0.0': v }), cpu.read('%Q0.0')));
    expect(out).toEqual([false, false, false, true, false, false, true]);
  });

  it('R_TRIG / F_TRIG als Instanz', () => {
    const cpu = makeCpu((b) => {
      const r = b.instance('Hoch', 'R_TRIG');
      const f = b.instance('Runter', 'F_TRIG');
      b.emit({ op: 'trig', i: r.i, clk: io('%I0.0') });
      b.emit({ op: 'trig', i: f.i, clk: io('%I0.0') });
      b.emit({ op: 'mov', dst: io('%Q0.0'), src: r.field('Q') });
      b.emit({ op: 'mov', dst: io('%Q0.1'), src: f.field('Q') });
    });
    const seq = [true, true, false, false, true];
    const rise: boolean[] = [];
    const fall: boolean[] = [];
    seq.forEach((v, t) => {
      scanAt(cpu, t, { '%I0.0': v });
      rise.push(cpu.read('%Q0.0') as boolean);
      fall.push(cpu.read('%Q0.1') as boolean);
    });
    // R_TRIG startet mit Flankenmerker 0 → TRUE im ersten Zyklus, wenn CLK schon 1 ist
    expect(rise).toEqual([true, false, false, false, true]);
    expect(fall).toEqual([false, false, true, false, false]);
  });

  it('zwei Flankenauswertungen auf demselben Merker stören sich (wie echt)', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'edge', kind: 'P', clk: io('%I0.0'), mem: io('%M0.0'), out: io('%Q0.0') });
      b.emit({ op: 'edge', kind: 'P', clk: io('%I0.0'), mem: io('%M0.0'), out: io('%Q0.1') });
    });
    scanAt(cpu, 0, { '%I0.0': true });
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(false);
  });
});

describe('Vergleicher', () => {
  it.each([
    ['eq', [false, true, false]],
    ['ne', [true, false, true]],
    ['lt', [true, false, false]],
    ['le', [true, true, false]],
    ['gt', [false, false, true]],
    ['ge', [false, true, true]],
  ] as const)('%s auf INT', (fn, expected) => {
    const cpu = makeCpu((b) =>
      b.emit({ op: 'cmp', fn, t: 'INT', dst: io('%Q0.0'), a: io('%IW0'), b: c.int(5) }),
    );
    const out = [4, 5, 6].map((v, t) => (scanAt(cpu, t, { '%IW0': v }), cpu.read('%Q0.0')));
    expect(out).toEqual(expected);
  });

  it('REAL-Vergleich', () => {
    const cpu = makeCpu((b) =>
      b.emit({
        op: 'cmp',
        fn: 'gt',
        t: 'REAL',
        dst: io('%Q0.0'),
        a: io('%MD0', 'REAL'),
        b: c.real(1.5),
      }),
    );
    cpu.setInput('%MD0', 1.6, 'REAL');
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(true);
  });

  it('IN_RANGE / OUT_RANGE inkl. Grenzen', () => {
    const cpu = makeCpu((b) => {
      b.emit({
        op: 'fn',
        fn: 'in_range',
        t: 'INT',
        dst: io('%Q0.0'),
        args: [c.int(10), io('%IW0'), c.int(20)],
      });
      b.emit({
        op: 'fn',
        fn: 'out_range',
        t: 'INT',
        dst: io('%Q0.1'),
        args: [c.int(10), io('%IW0'), c.int(20)],
      });
    });
    const res = [9, 10, 15, 20, 21].map((v, t) => {
      scanAt(cpu, t, { '%IW0': v });
      return [cpu.read('%Q0.0'), cpu.read('%Q0.1')];
    });
    expect(res).toEqual([
      [false, true],
      [true, false],
      [true, false],
      [true, false],
      [false, true],
    ]);
  });
});
