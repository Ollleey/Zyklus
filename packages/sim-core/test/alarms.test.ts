import { describe, expect, it } from 'vitest';
import { c, Cpu, CPU_TYPES, io, IrValidationError, ProgramBuilder, Simulation } from '../src';
import type { IrTask } from '../src';

/** OB1 zählt Flanken an %I0.0 in Z1, der Alarm-OB zählt seine Aufrufe in n. */
function program(task: Omit<IrTask, 'start' | 'end' | 'name'>) {
  const b = new ProgramBuilder();
  const z1 = b.instance('Z1', 'CTU');
  const n = b.slot('n', 'INT', 0);
  b.emit({ op: 'ctr', i: z1.i, cu: io('%I0.0'), pv: c.int(1000) });
  const mainEnd = b.build().code.length;
  // Alarm-OB: zählt seine Aufrufe
  b.emit({ op: 'bin', fn: 'add', t: 'INT', a: n, b: c.int(1), dst: n });
  b.emit({ op: 'mov', dst: io('%Q0.0'), src: io('%I0.0') });
  const p = b.build();
  return {
    ...p,
    mainEnd,
    tasks: [{ name: 'OB', start: mainEnd, end: p.code.length, ...task } as IrTask],
  };
}

describe('Alarm-OBs', () => {
  it('Weckalarm läuft im eigenen Takt unabhängig vom OB1-Zyklus', () => {
    const cpu = new Cpu(
      { ...CPU_TYPES.mittel, name: 'A' },
      program({ kind: 'cyclic', intervalMs: 2, phaseMs: 1 }),
    );
    new Simulation([cpu]).run(20);
    expect(cpu.metrics.cycles).toBe(4); // OB1 alle 5 ms
    expect(cpu.metrics.interrupts).toBe(10); // t = 1,3,…,19
    expect(cpu.readSlot('n')).toBe(10);
  });

  it('Prozessalarm fängt Impulse, die der OB1-Zyklus verpasst', () => {
    const cpu = new Cpu(
      { ...CPU_TYPES.klein, name: 'A' },
      program({ kind: 'process', input: { byte: 0, bit: 0 }, edge: 'rising' }),
    );
    const sim = new Simulation([cpu], {
      beforeScans: (t) => cpu.setInput('%I0.0', t % 10 >= 2 && t % 10 < 4),
    });
    sim.run(100);
    expect(cpu.readInstance('Z1', 'CV')).toBe(0);
    expect(cpu.readSlot('n')).toBe(10);
  });

  it('Ausgänge eines Alarm-OBs wirken sofort', () => {
    const cpu = new Cpu(
      { ...CPU_TYPES.klein, name: 'A' },
      program({ kind: 'process', input: { byte: 0, bit: 0 }, edge: 'rising' }),
    );
    const sim = new Simulation([cpu], { beforeScans: (t) => cpu.setInput('%I0.0', t >= 3) });
    sim.run(4);
    expect(cpu.read('%Q0.0')).toBe(true);
  });

  it('fallende Flanke und kein Alarm beim ersten Abtasten', () => {
    const cpu = new Cpu(
      { ...CPU_TYPES.klein, name: 'A' },
      program({ kind: 'process', input: { byte: 0, bit: 0 }, edge: 'falling' }),
    );
    cpu.setInput('%I0.0', true);
    const sim = new Simulation([cpu], { beforeScans: (t) => cpu.setInput('%I0.0', t < 5) });
    sim.run(10);
    expect(cpu.metrics.interrupts).toBe(1);
  });

  it('Alarm-OB mit Endlosschleife bringt die CPU in STOP', () => {
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
    b.emit({ op: 'jmp', to: 1 });
    const p = { ...b.build(), mainEnd: 1 };
    p.tasks = [{ kind: 'cyclic', name: 'OB30', start: 1, end: 2, intervalMs: 3 }];
    const cpu = new Cpu({ ...CPU_TYPES.mittel, name: 'A' }, p);
    new Simulation([cpu]).run(5);
    expect(cpu.mode).toBe('STOP');
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('ungültiger Codebereich wird abgelehnt', () => {
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
    const p = { ...b.build(), mainEnd: 1 };
    p.tasks = [{ kind: 'cyclic', name: 'OB30', start: 0, end: 5, intervalMs: 3 }];
    expect(() => new Cpu({ ...CPU_TYPES.mittel, name: 'A' }, p)).toThrow(IrValidationError);
  });
});
