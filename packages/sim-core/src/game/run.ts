import { Cpu } from '../cpu';
import type { IrProgram } from '../ir';
import { Simulation } from '../simulation';
import type { Value } from '../types';
import { analyzeBoard, type BoardAnalysis, type Solution } from './board';
import type { Device, Edge, Level, TestCase } from './level';
import { moduleType } from './modules';
import { inputSignal, valueAt } from './signals';

export interface RunOptions {
  /** Testfall mit Stimuli; ohne Testfall läuft der Handbetrieb */
  test?: TestCase;
  seed?: number;
}

/**
 * Ein Simulationslauf eines Levels: Feldgeräte ↔ Verdrahtung ↔ CPUs.
 * Schrittweise steuerbar (UI) oder in einem Rutsch (Verifikation).
 */
export class LevelRun {
  readonly sim: Simulation;
  readonly cpus = new Map<string, Cpu>();
  readonly analysis: BoardAnalysis;
  /** aufgezeichnete Verläufe aller Geräte (nur Änderungen) */
  readonly traces = new Map<string, Edge[]>();
  readonly durationMs: number;
  private readonly signals = new Map<string, Edge[]>();
  private readonly manual = new Map<string, boolean | number>();
  private readonly devices: Device[];

  constructor(
    readonly level: Level,
    solution: Solution,
    programs: Map<string, IrProgram>,
    readonly opts: RunOptions = {},
  ) {
    this.analysis = analyzeBoard(level, solution);
    if (!this.analysis.ok) {
      throw new Error(
        this.analysis.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join('\n'),
      );
    }
    for (const m of solution.modules) {
      const t = moduleType(m.type);
      if (t.kind !== 'cpu') continue;
      const program = programs.get(m.id);
      if (!program) throw new Error(`Für ${t.name.de} (${m.id}) fehlt ein übersetztes Programm`);
      this.cpus.set(
        m.id,
        new Cpu(
          { name: m.id, cycleMs: t.cpu!.cycleMs, maxOpsPerCycle: t.cpu!.maxOpsPerCycle },
          program,
        ),
      );
    }
    this.devices = level.devices;
    const seed = opts.seed ?? 1;
    for (const d of this.devices) {
      if (d.kind === 'DI' || d.kind === 'AI') {
        this.signals.set(d.id, inputSignal(d, opts.test?.stimuli[d.id] ?? [], seed));
      }
      this.traces.set(d.id, []);
    }
    this.durationMs = opts.test?.durationMs ?? Infinity;
    this.sim = new Simulation([...this.cpus.values()], {
      beforeScans: (t) => this.applyInputs(t),
      afterScans: (t) => this.record(t),
    });
  }

  get time(): number {
    return this.sim.time;
  }

  get done(): boolean {
    return this.sim.time >= this.durationMs;
  }

  /** Handbetrieb: Betätigung eines Eingangsgeräts (physikalisch, Öffner wird invertiert). */
  setManual(deviceId: string, actuated: boolean | number): void {
    this.manual.set(deviceId, actuated);
  }

  isActuated(deviceId: string): boolean | number {
    return this.manual.get(deviceId) ?? false;
  }

  /** Elektrischer Wert eines Eingangsgeräts zum Zeitpunkt t. */
  inputValue(d: Device, t: number): boolean | number {
    if (!this.opts.test) {
      const a = this.manual.get(d.id) ?? (d.kind === 'AI' ? 0 : false);
      return d.nc && typeof a === 'boolean' ? !a : a;
    }
    return valueAt(this.signals.get(d.id)!, t);
  }

  /** Aktueller Wert eines Ausgangsgeräts (Klemme der CPU). */
  outputValue(d: Device): Value {
    const b = this.analysis.bindings.get(d.id);
    if (!b) return d.kind === 'AO' ? 0 : false;
    return this.cpus.get(b.cpu)!.read(b.address, b.t);
  }

  tick(): void {
    if (!this.done) this.sim.tick();
  }

  runTo(t: number): void {
    while (this.sim.time <= t && !this.done) this.sim.tick();
  }

  runToEnd(): void {
    if (!Number.isFinite(this.durationMs)) throw new Error('Handbetrieb hat kein Ende');
    while (!this.done) this.sim.tick();
  }

  /** bis einschließlich des nächsten Zyklus einer CPU */
  stepCycle(cpuId?: string): void {
    const cpu = cpuId ? this.cpus.get(cpuId)! : [...this.cpus.values()][0]!;
    const before = cpu.metrics.cycles;
    while (cpu.metrics.cycles === before && !this.done && cpu.mode === 'RUN') this.sim.tick();
  }

  private applyInputs(t: number): void {
    for (const d of this.devices) {
      if (d.kind !== 'DI' && d.kind !== 'AI') continue;
      const v = this.inputValue(d, t);
      const b = this.analysis.bindings.get(d.id);
      if (b) this.cpus.get(b.cpu)!.setInput(b.address, v, b.t);
      this.push(d.id, t, v);
    }
  }

  private record(t: number): void {
    for (const d of this.devices) {
      if (d.kind === 'DO' || d.kind === 'AO') this.push(d.id, t, this.outputValue(d));
    }
  }

  private push(id: string, t: number, v: boolean | number): void {
    const tr = this.traces.get(id)!;
    if (!tr.length || tr[tr.length - 1]![1] !== v) tr.push([t, v]);
  }
}
