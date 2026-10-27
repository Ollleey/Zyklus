import { describe, expect, it } from 'vitest';
import {
  c,
  Cpu,
  CPU_TYPES,
  deriveSeed,
  energyOf,
  io,
  ProgramBuilder,
  Rng,
  Simulation,
  ENERGY,
} from '../src';

/** Ein kleines, aber gemischtes Programm: Entprellung, Zähler, Analogskalierung. */
function program() {
  const b = new ProgramBuilder();
  const ton = b.instance('Entprell', 'TON');
  const ctu = b.instance('Zaehler', 'CTU');
  const pct = b.slot('Prozent', 'REAL');
  const n = b.temp('n', 'REAL');
  b.emit({ op: 'tmr', i: ton.i, in: io('%I0.0'), pt: c.time(20) });
  b.emit({ op: 'ctr', i: ctu.i, cu: ton.field('Q'), r: io('%I0.1'), pv: c.int(10) });
  b.emit({ op: 'mov', dst: io('%Q0.0'), src: ctu.field('Q') });
  b.emit({ op: 'fn', fn: 'norm_x', t: 'INT', dst: n, args: [c.int(0), io('%IW64'), c.int(27648)] });
  b.emit({ op: 'fn', fn: 'scale_x', t: 'REAL', dst: pct, args: [c.real(0), n, c.real(100)] });
  b.emit({ op: 'cmp', fn: 'gt', t: 'REAL', dst: io('%Q0.1'), a: pct, b: c.real(50) });
  return b.build();
}

function run(seed: number) {
  const cpu = new Cpu({ ...CPU_TYPES.mittel }, program());
  const rngButton = new Rng(deriveSeed(seed, 'taster'));
  const rngAnalog = new Rng(deriveSeed(seed, 'analog'));
  const trace: string[] = [];
  const sim = new Simulation([cpu], {
    beforeScans: (t) => {
      // prellender Taster: zufällige Umschaltungen
      if (rngButton.chance(0.02)) cpu.setInput('%I0.0', !cpu.read('%I0.0'));
      cpu.setInput('%I0.1', t % 3000 === 0);
      const raw = Math.round(13824 + rngAnalog.gaussian(0, 3000));
      cpu.setInput('%IW64', Math.max(0, Math.min(27648, raw)));
    },
    afterScans: (t) => trace.push(`${t}:${cpu.read('%Q0.0') ? 1 : 0}${cpu.read('%Q0.1') ? 1 : 0}`),
  });
  sim.run(10_000);
  return { metrics: sim.metrics(), trace: trace.join(','), cv: cpu.readInstance('Zaehler', 'CV') };
}

describe('Determinismus', () => {
  it('gleiche Lösung + gleicher Seed → identische Verläufe und Metriken', () => {
    const a = run(42);
    const b = run(42);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.trace).toBe(b.trace);
    expect(a.cv).toBe(b.cv);
  });

  it('anderer Seed → anderer Verlauf', () => {
    expect(run(1).trace).not.toBe(run(2).trace);
  });

  it('Metriken: Zyklen, Befehle und Energie stimmen mit den Gewichten überein', () => {
    const r = run(7);
    expect(r.metrics.cycles).toBe(2000); // 10 000 ms / 5 ms
    expect(r.metrics.ops).toBe(2000 * 6);
    const perCycle = program().code.reduce((s, i) => s + energyOf(i), 0);
    expect(perCycle).toBe(ENERGY.stateful * 2 + ENERGY.move + ENERGY.real * 3);
    expect(r.metrics.energy).toBe(2000 * perCycle);
  });
});

describe('Rng', () => {
  it('ist reproduzierbar und gleichverteilt genug', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('int() liegt im Bereich', () => {
    const r = new Rng(9);
    const vals = Array.from({ length: 500 }, () => r.int(3, 6));
    expect(new Set(vals)).toEqual(new Set([3, 4, 5, 6]));
  });
  it('gaussian hat ungefähr Mittelwert und Streuung', () => {
    const r = new Rng(5);
    const xs = Array.from({ length: 5000 }, () => r.gaussian(10, 2));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(10, 0);
    expect(sd).toBeGreaterThan(1.8);
    expect(sd).toBeLessThan(2.2);
  });
  it('deriveSeed trennt Kanäle', () => {
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
    expect(deriveSeed(1, 'a')).toBe(deriveSeed(1, 'a'));
  });
});
