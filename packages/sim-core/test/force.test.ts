import { describe, expect, it } from 'vitest';
import { c, Cpu, io, ProgramBuilder } from '../src';

/** OB1: %Q0.0 := %I0.0; Zähler := Zähler + 1 */
function cpu() {
  const b = new ProgramBuilder();
  const n = b.slot('Daten.Zaehler', 'INT');
  b.emit({ op: 'mov', dst: io('%Q0.0'), src: io('%I0.0') });
  b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: n, a: n, b: c.int(1) });
  return new Cpu({ name: 'A', cycleMs: 1, maxOpsPerCycle: 100 }, b.build());
}

describe('Forcen und Steuern', () => {
  it('Eingang forcen ersetzt das Feldsignal, Aufheben gibt es frei', () => {
    const k = cpu();
    k.force('%I0.0', true);
    k.setInput('%I0.0', false);
    k.scan(0);
    expect(k.read('%Q0.0')).toBe(true);
    expect(k.forceCount).toBe(1);
    k.force('%I0.0', undefined);
    k.setInput('%I0.0', false);
    k.scan(1);
    expect(k.read('%Q0.0')).toBe(false);
  });

  it('Ausgang forcen wirkt an der Klemme, auch in STOP', () => {
    const k = cpu();
    k.force('%Q0.0', true);
    k.scan(0);
    expect(k.read('%Q0.0')).toBe(true);
    expect(k.readImage('%Q0.0')).toBe(false);
    k.setSwitch('STOP', 1);
    expect(k.read('%Q0.0')).toBe(true);
    expect(() => k.force('%M0.0', true)).toThrow(/nur an Ein- und Ausgängen/);
  });

  it('Steuern schreibt einmalig in Variable bzw. Prozessabbild', () => {
    const k = cpu();
    k.modify({ slot: 'daten.zaehler' }, 41);
    k.scan(0);
    expect(k.readSlot('Daten.Zaehler')).toBe(42);
    k.modify({ address: '%MW2' }, 7);
    expect(k.read('%MW2')).toBe(7);
  });
});
