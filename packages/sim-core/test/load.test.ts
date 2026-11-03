import { describe, expect, it } from 'vitest';
import { c, Cpu, io, loadCompatible, ProgramBuilder, type IrProgram } from '../src';

/** Zähler := Zähler + schritt; %Q0.0 := TRUE; optional weitere Variable */
function prog(step: number, extra = false): IrProgram {
  const b = new ProgramBuilder();
  const n = b.slot('D.Zaehler', 'INT', 100);
  if (extra) b.slot('D.Neu', 'INT');
  b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: n, a: n, b: c.int(step) });
  b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
  return b.build();
}

const cfg = { name: 'A', cycleMs: 1, maxOpsPerCycle: 100 };

describe('Laden', () => {
  it('Laden in RUN behält Istwerte und läuft ohne Anlauf weiter', () => {
    const old = new Cpu(cfg, prog(1));
    for (let t = 0; t < 5; t++) old.scan(t);
    expect(loadCompatible(old.program, prog(10))).toEqual({ ok: true });
    const next = new Cpu(cfg, prog(10));
    next.adoptFrom(old, true, false);
    expect(next.read('%Q0.0')).toBe(true);
    next.scan(5);
    expect(next.readSlot('D.Zaehler')).toBe(115);
    expect(next.metrics.cycles).toBe(6);
  });

  it('geänderte Datenstruktur braucht STOP; Istwerte behalten oder zurücksetzen', () => {
    const old = new Cpu(cfg, prog(1));
    for (let t = 0; t < 3; t++) old.scan(t);
    const r = loadCompatible(old.program, prog(1, true));
    expect(r.ok).toBe(false);
    const keep = new Cpu(cfg, prog(1, true));
    keep.adoptFrom(old, true, true);
    keep.scan(3);
    expect(keep.readSlot('D.Zaehler')).toBe(104);
    const reset = new Cpu(cfg, prog(1, true));
    reset.adoptFrom(old, false, true);
    reset.scan(3);
    expect(reset.readSlot('D.Zaehler')).toBe(101);
  });

  it('Betriebsart und Forceaufträge bleiben', () => {
    const old = new Cpu(cfg, prog(1));
    old.force('%Q0.1', true);
    old.setSwitch('STOP', 0);
    const next = new Cpu(cfg, prog(2));
    next.adoptFrom(old, true, false);
    expect(next.mode).toBe('STOP');
    expect(next.forceCount).toBe(1);
    expect(next.read('%Q0.1')).toBe(true);
  });
});
