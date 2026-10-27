import { describe, expect, it } from 'vitest';
import { c, Cpu, io, ProgramBuilder, Simulation, CPU_TYPES, IrValidationError } from '../src';
import { makeCpu } from './harness';

describe('Zyklusmodell', () => {
  it('PAE wird zu Zyklusbeginn eingefroren', () => {
    const cpu = makeCpu((b) => b.emit({ op: 'mov', dst: io('%Q0.0'), src: io('%I0.0') }));
    cpu.setInput('%I0.0', true);
    expect(cpu.readImage('%I0.0')).toBe(false); // noch nicht eingelesen
    cpu.scan(0);
    expect(cpu.readImage('%I0.0')).toBe(true);
    cpu.setInput('%I0.0', false);
    expect(cpu.readImage('%I0.0')).toBe(true); // Abbild bleibt bis zum nächsten Zyklus
  });

  it('Ausgänge erscheinen erst am Zyklusende an der Peripherie', () => {
    // Zwischenzustand im PAA darf nicht an die Klemme
    const cpu = makeCpu((b) => {
      b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
      b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(false) });
    });
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('Zyklen nur im Raster der Zykluszeit (mit Phasenversatz)', () => {
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
    const cpu = new Cpu({ name: 'A', cycleMs: 10, maxOpsPerCycle: 100, phaseMs: 3 }, b.build());
    const sim = new Simulation([cpu]);
    const scans: number[] = [];
    sim.env.afterScans = (t) => {
      if (cpu.metrics.cycles > scans.length) scans.push(t);
    };
    sim.run(40);
    expect(scans).toEqual([3, 13, 23, 33]);
  });

  it('Impuls kürzer als die Zykluszeit wird verpasst', () => {
    const b = new ProgramBuilder();
    const z = b.instance('Z', 'CTU');
    b.emit({ op: 'ctr', i: z.i, cu: io('%I0.0'), pv: c.int(100) });
    const cpu = new Cpu({ ...CPU_TYPES.klein, name: 'klein' }, b.build());
    const sim = new Simulation([cpu], {
      // 3-ms-Impulse bei t = 2, 12, 22 … liegen nie auf einem 10-ms-Raster
      beforeScans: (t) => cpu.setInput('%I0.0', t % 10 >= 2 && t % 10 < 5),
    });
    sim.run(200);
    expect(cpu.readInstance('Z', 'CV')).toBe(0);

    // Gleiche Impulse auf einer 1-ms-CPU werden alle gezählt
    const fast = new Cpu({ ...CPU_TYPES.schnell, name: 'schnell' }, b.build());
    const sim2 = new Simulation([fast], {
      beforeScans: (t) => fast.setInput('%I0.0', t % 10 >= 2 && t % 10 < 5),
    });
    sim2.run(200);
    expect(fast.readInstance('Z', 'CV')).toBe(20);
  });

  it('TEMP-Variablen starten jeden Zyklus neu, statische behalten ihren Wert', () => {
    const cpu = makeCpu((b) => {
      const tmp = b.temp('tmp', 'INT');
      const stat = b.slot('stat', 'INT', 10);
      b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: tmp, a: tmp, b: c.int(1) });
      b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: stat, a: stat, b: c.int(1) });
    });
    cpu.scan(0);
    cpu.scan(1);
    cpu.scan(2);
    expect(cpu.readSlot('tmp')).toBe(1);
    expect(cpu.readSlot('stat')).toBe(13);
  });

  it('mehrere CPUs auf einer Zeitachse mit eigener Zykluszeit', () => {
    const prog = () => {
      const b = new ProgramBuilder();
      const n = b.slot('n', 'DINT');
      b.emit({ op: 'bin', fn: 'add', t: 'DINT', dst: n, a: n, b: c.dint(1) });
      return b.build();
    };
    const a = new Cpu({ name: 'A', cycleMs: 1, maxOpsPerCycle: 10 }, prog());
    const b = new Cpu({ name: 'B', cycleMs: 5, maxOpsPerCycle: 10 }, prog());
    const sim = new Simulation([a, b]);
    sim.run(100);
    expect(a.readSlot('n')).toBe(100);
    expect(b.readSlot('n')).toBe(20);
    expect(sim.metrics().cycles).toBe(120);
  });
});

describe('Sprünge und Schleifen', () => {
  it('IF/ELSE über jz/jmp', () => {
    // IF %I0.0 THEN %MW0 := 1 ELSE %MW0 := 2
    const cpu = makeCpu((b) => {
      const jz = b.emit({ op: 'jz', cond: io('%I0.0'), to: -1 });
      b.emit({ op: 'mov', dst: io('%MW0'), src: c.int(1) });
      const jmp = b.emit({ op: 'jmp', to: -1 });
      jz.to = b.pc;
      b.emit({ op: 'mov', dst: io('%MW0'), src: c.int(2) });
      jmp.to = b.pc;
    });
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    expect(cpu.read('%MW0')).toBe(1);
    cpu.setInput('%I0.0', false);
    cpu.scan(1);
    expect(cpu.read('%MW0')).toBe(2);
  });

  it('FOR-Schleife summiert 1..10', () => {
    const cpu = makeCpu((b) => {
      const i = b.temp('i', 'INT', 1);
      const sum = b.temp('sum', 'INT');
      const cond = b.temp('cond', 'BOOL');
      const top = b.pc;
      b.emit({ op: 'cmp', fn: 'le', t: 'INT', dst: cond, a: i, b: c.int(10) });
      const exit = b.emit({ op: 'jz', cond, to: -1 });
      b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: sum, a: sum, b: i });
      b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: i, a: i, b: c.int(1) });
      b.emit({ op: 'jmp', to: top });
      exit.to = b.pc;
      b.emit({ op: 'mov', dst: io('%MW0'), src: sum });
    });
    cpu.scan(0);
    expect(cpu.read('%MW0')).toBe(55);
    expect(cpu.metrics.ops).toBe(1 + 10 * 5 + 1 + 1);
  });

  it('Endlosschleife → Zykluszeitüberschreitung → STOP, Ausgänge aus', () => {
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: c.bool(true) });
    const loop = b.pc;
    b.emit({ op: 'jnz', cond: io('%I0.0'), to: loop });
    const cpu = new Cpu({ name: 'X', cycleMs: 1, maxOpsPerCycle: 50 }, b.build());
    const sim = new Simulation([cpu]);
    sim.run(5);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.mode).toBe('RUN');

    cpu.setInput('%I0.0', true);
    sim.run(5);
    expect(cpu.mode).toBe('STOP');
    expect(cpu.stopInfo).toMatchObject({ time: 5, reason: 'CYCLE_OVERRUN' });
    expect(cpu.stopInfo!.message).toMatch(/Zykluszeitüberschreitung/);
    expect(cpu.read('%Q0.0')).toBe(false);
    expect(cpu.metrics.cycles).toBe(6); // nach STOP keine weiteren Zyklen

    cpu.setInput('%I0.0', false);
    sim.run(5);
    expect(cpu.mode).toBe('STOP'); // bleibt in STOP
  });

  it('genau am Budget ist noch erlaubt', () => {
    const b = new ProgramBuilder();
    for (let n = 0; n < 10; n++) b.emit({ op: 'mov', dst: io('%MW0'), src: c.int(n) });
    const cpu = new Cpu({ name: 'X', cycleMs: 1, maxOpsPerCycle: 10 }, b.build());
    cpu.scan(0);
    expect(cpu.mode).toBe('RUN');
    const cpu2 = new Cpu({ name: 'Y', cycleMs: 1, maxOpsPerCycle: 9 }, b.build());
    cpu2.scan(0);
    expect(cpu2.mode).toBe('STOP');
  });
});

describe('Validierung', () => {
  const fails = (build: (b: ProgramBuilder) => void, re: RegExp) => {
    const b = new ProgramBuilder();
    build(b);
    expect(() => new Cpu({ name: 'V', cycleMs: 1, maxOpsPerCycle: 10 }, b.build())).toThrow(re);
  };

  it('Typfehler werden abgewiesen', () => {
    fails(
      (b) =>
        b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: io('%MW0'), a: io('%I0.0'), b: c.int(1) }),
      /Typ BOOL, erwartet INT/,
    );
    fails(
      (b) =>
        b.emit({
          op: 'bin',
          fn: 'add',
          t: 'BOOL',
          dst: io('%M0.0'),
          a: c.bool(true),
          b: c.bool(true),
        }),
      /add nicht auf BOOL/,
    );
    fails(
      (b) =>
        b.emit({
          op: 'cmp',
          fn: 'lt',
          t: 'BOOL',
          dst: io('%M0.0'),
          a: c.bool(true),
          b: c.bool(true),
        }),
      /lt nicht auf BOOL/,
    );
    fails((b) => b.emit({ op: 'mov', dst: io('%MD0', 'REAL'), src: c.int(1) }), /erwartet INT/);
    fails(
      (b) =>
        b.emit({
          op: 'bin',
          fn: 'mod',
          t: 'REAL',
          dst: io('%MD0', 'REAL'),
          a: c.real(1),
          b: c.real(1),
        }),
      /MOD/,
    );
  });

  it('Konstanten und Instanzausgänge sind nicht beschreibbar', () => {
    fails((b) => b.emit({ op: 'mov', dst: c.int(1), src: c.int(2) }), /nicht beschreibbar/);
    fails((b) => {
      const t = b.instance('T', 'TON');
      b.emit({ op: 'mov', dst: t.field('Q'), src: c.bool(true) });
    }, /nicht beschreibbar/);
  });

  it('falsche Instanzart, fehlende Pins, ungültige Felder', () => {
    fails((b) => {
      const z = b.instance('Z', 'CTU');
      b.emit({ op: 'tmr', i: z.i, in: c.bool(true), pt: c.time(1) });
    }, /passt nicht/);
    fails((b) => {
      const t = b.instance('T', 'TON');
      b.emit({ op: 'tmr', i: t.i, in: c.bool(true), pt: c.time(1), r: c.bool(false) });
    }, /R gibt es nur bei TONR/);
    fails((b) => {
      const z = b.instance('Z', 'CTU');
      b.emit({ op: 'ctr', i: z.i, pv: c.int(1) });
    }, /CU fehlt/);
    fails((b) => {
      const z = b.instance('Z', 'CTU');
      b.emit({ op: 'ctr', i: z.i, cu: c.bool(true), ld: c.bool(true), pv: c.int(1) });
    }, /LD gibt es nicht bei CTU/);
    fails((b) => {
      const t = b.instance('T', 'TON');
      b.emit({ op: 'mov', dst: io('%MW0'), src: t.field('CV') });
    }, /ungültige Referenz/);
  });

  it('Adressen außerhalb, Sprungziele, doppelte Namen', () => {
    fails((b) => b.emit({ op: 'mov', dst: io('%Q200.0'), src: c.bool(true) }), /außerhalb/);
    fails((b) => b.emit({ op: 'jmp', to: 5 }), /Sprungziel/);
    fails((b) => {
      b.slot('x', 'INT');
      b.slot('X', 'INT');
    }, /doppelt/);
  });

  it('IrValidationError enthält alle Fehler', () => {
    const b = new ProgramBuilder();
    b.emit({ op: 'jmp', to: 99 });
    b.emit({ op: 'mov', dst: c.int(1), src: c.int(1) });
    try {
      new Cpu({ name: 'V', cycleMs: 1, maxOpsPerCycle: 10 }, b.build());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IrValidationError);
      expect((e as IrValidationError).errors).toHaveLength(2);
    }
  });
});
