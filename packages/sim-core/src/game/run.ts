import { Cpu } from '../cpu';
import type { IrProgram } from '../ir';
import { Simulation } from '../simulation';
import type { Value } from '../types';
import { analyzeBoard, type BoardAnalysis, type Solution } from './board';
import type { Device, Edge, Level, TestCase } from './level';
import { moduleType } from './modules';
import { createPlant, type Plant } from './plants';
import { AnalogDisturbance, faultAt, inputSignal, interpolate, toRaw, valueAt } from './signals';

export interface RunOptions {
  /** Testfall mit Stimuli; ohne Testfall läuft der Handbetrieb */
  test?: TestCase;
  seed?: number;
}

interface RelayState {
  phys: boolean;
  pending: boolean;
  since: number;
}

/**
 * Ein Simulationslauf eines Levels: Feldgeräte ↔ Verdrahtung ↔ CPUs ↔ Anlagenmodell.
 * Schrittweise steuerbar (UI) oder in einem Rutsch (Verifikation).
 *
 * Aufgezeichnet werden (nur Änderungen):
 * - je Gerät der elektrische Wert (DI/DO Bool, AI/AO Rohwert; Ausgänge hinter dem Relais)
 * - `true.<AI>`: Rohwert ohne Rauschen und Geberfehler
 * - `plant.<größe>`: Zustand des Anlagenmodells
 */
export class LevelRun {
  readonly sim: Simulation;
  readonly cpus = new Map<string, Cpu>();
  readonly analysis: BoardAnalysis;
  readonly traces = new Map<string, Edge[]>();
  readonly durationMs: number;
  readonly plant?: Plant;
  private readonly signals = new Map<string, Edge[]>();
  private readonly disturb = new Map<string, AnalogDisturbance>();
  private readonly manual = new Map<string, boolean | number>();
  private readonly relays = new Map<string, RelayState>();
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
      if (d.kind === 'DI')
        this.signals.set(d.id, inputSignal(d, opts.test?.stimuli[d.id] ?? [], seed));
      if (d.kind === 'AI') {
        this.disturb.set(d.id, new AnalogDisturbance(d, seed));
        this.traces.set(`true.${d.id}`, []);
      }
      this.traces.set(d.id, []);
    }
    this.plant = createPlant(level, opts.test);
    for (const k of Object.keys(this.plant?.state() ?? {})) this.traces.set(`plant.${k}`, []);
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

  /** Handbetrieb: Betätigung eines Tasters bzw. physikalischer Wert eines Analoggebers. */
  setManual(deviceId: string, value: boolean | number): void {
    this.manual.set(deviceId, value);
  }

  isActuated(deviceId: string): boolean | number {
    return this.manual.get(deviceId) ?? false;
  }

  /** Physikalischer Wert eines Analoggebers (ohne Störung). */
  analogPhysical(d: Device, t: number): number {
    const fromPlant = this.plant?.inputs()[d.id];
    if (typeof fromPlant === 'number') return fromPlant;
    if (!this.opts.test) {
      const m = this.manual.get(d.id);
      return typeof m === 'number' ? m : d.analog!.min;
    }
    return interpolate(this.opts.test.stimuli[d.id] ?? [], t, d.analog!.min);
  }

  /** Elektrischer Wert eines Digitaleingangs zum Zeitpunkt t. */
  inputValue(d: Device, t: number): boolean | number {
    if (!this.opts.test) {
      const a = this.manual.get(d.id) ?? false;
      return d.nc && typeof a === 'boolean' ? !a : a;
    }
    return valueAt(this.signals.get(d.id)!, t);
  }

  /** Aktueller Wert eines Ausgangsgeräts (hinter einem evtl. Relais). */
  outputValue(d: Device): Value {
    const r = this.relays.get(d.id);
    if (r) return r.phys;
    return this.commanded(d);
  }

  private commanded(d: Device): Value {
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
      let v: boolean | number;
      if (d.kind === 'DI') {
        v = this.inputValue(d, t);
      } else if (d.kind === 'AI') {
        const clean = toRaw(this.analogPhysical(d, t), d.analog!);
        v = this.disturb.get(d.id)!.apply(clean, faultAt(this.opts.test?.faults?.[d.id], t));
        this.push(`true.${d.id}`, t, clean);
      } else {
        continue;
      }
      const b = this.analysis.bindings.get(d.id);
      if (b) this.cpus.get(b.cpu)!.setInput(b.address, v, b.t);
      this.push(d.id, t, v);
    }
  }

  private record(t: number): void {
    const outputs: Record<string, Value> = {};
    for (const d of this.devices) {
      if (d.kind !== 'DO' && d.kind !== 'AO') continue;
      const cmd = this.commanded(d);
      const delay = this.analysis.bindings.get(d.id)?.delay;
      if (delay && typeof cmd === 'boolean') {
        // Relais: Kontakt folgt dem Befehl erst nach Ansprech- bzw. Abfallzeit
        let r = this.relays.get(d.id);
        if (!r) {
          r = { phys: false, pending: false, since: t };
          this.relays.set(d.id, r);
        }
        if (cmd === r.phys) {
          r.pending = cmd;
        } else {
          if (r.pending !== cmd) {
            r.pending = cmd;
            r.since = t;
          }
          if (t - r.since >= (cmd ? delay.on : delay.off)) r.phys = cmd;
        }
      }
      outputs[d.id] = this.outputValue(d);
      this.push(d.id, t, outputs[d.id]!);
    }
    if (this.plant) {
      this.plant.step(t, outputs);
      for (const [k, v] of Object.entries(this.plant.state())) this.push(`plant.${k}`, t, v);
    }
  }

  private push(id: string, t: number, v: boolean | number): void {
    let tr = this.traces.get(id);
    if (!tr) {
      tr = [];
      this.traces.set(id, tr);
    }
    if (!tr.length || tr[tr.length - 1]![1] !== v) tr.push([t, v]);
  }
}
