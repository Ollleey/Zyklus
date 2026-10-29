import { parseAddress, sizeOfType, defaultTypeForSize, AddressError, type Area } from './address';
import { createInstance, type InstanceState } from './instances';
import { execute, precomputeEnergy } from './interpreter';
import { INSTANCE_FIELDS, type InstanceField, type IrProgram, type IrTask } from './ir';
import { ByteArea } from './memory';
import type { DataType, Value } from './types';
import { IrValidationError, validateProgram } from './validate';

export interface CpuConfig {
  name: string;
  cycleMs: number;
  maxOpsPerCycle: number;
  /** Größe von Eingangs- und Ausgangsbereich in Byte (Standard 128) */
  ioBytes?: number;
  /** Größe des Merkerbereichs in Byte (Standard 256) */
  mBytes?: number;
  /** Versatz des ersten Zyklus in ms (Standard 0) */
  phaseMs?: number;
}

export type CpuMode = 'RUN' | 'STOP';

export interface StopInfo {
  time: number;
  reason: 'CYCLE_OVERRUN';
  message: string;
}

export interface CpuMetrics {
  cycles: number;
  /** ausgeführte IR-Befehle */
  ops: number;
  /** gewichtete Energie */
  energy: number;
  maxOpsInCycle: number;
  /** ausgeführte Alarm-OBs */
  interrupts: number;
}

/**
 * Eine CPU im zyklischen Betrieb: PAE einlesen → OB1 ausführen → PAA schreiben.
 * `inputs`/`outputs` sind die Peripherie (Klemmen), `pae`/`paa` die Prozessabbilder.
 */
export class Cpu {
  readonly inputs: ByteArea;
  readonly outputs: ByteArea;
  readonly pae: ByteArea;
  readonly paa: ByteArea;
  readonly m: ByteArea;
  readonly slots: Value[];
  readonly instances: InstanceState[];
  mode: CpuMode = 'RUN';
  stopInfo?: StopInfo;
  readonly metrics: CpuMetrics = { cycles: 0, ops: 0, energy: 0, maxOpsInCycle: 0, interrupts: 0 };

  private readonly energy: number[];
  private readonly tempSlots: number[];

  constructor(
    readonly config: CpuConfig,
    readonly program: IrProgram,
  ) {
    if (config.cycleMs < 1 || !Number.isInteger(config.cycleMs)) {
      throw new Error('Zykluszeit muss eine ganze Zahl ≥ 1 ms sein');
    }
    const ioBytes = config.ioBytes ?? 128;
    const mBytes = config.mBytes ?? 256;
    const errors = validateProgram(program, { areaSizes: { I: ioBytes, Q: ioBytes, M: mBytes } });
    if (errors.length) throw new IrValidationError(errors);

    this.inputs = new ByteArea('Peripherie-Eingänge', ioBytes);
    this.outputs = new ByteArea('Peripherie-Ausgänge', ioBytes);
    this.pae = new ByteArea('PAE', ioBytes);
    this.paa = new ByteArea('PAA', ioBytes);
    this.m = new ByteArea('Merker', mBytes);
    this.slots = program.slots.map((s) => s.init);
    this.instances = program.instances.map((d) => createInstance(d.kind));
    this.energy = precomputeEnergy(program);
    this.tempSlots = program.slots.flatMap((s, i) => (s.temp ? [i] : []));
  }

  /** Startet zum Zeitpunkt t ein Zyklus? */
  isDue(t: number): boolean {
    const phase = this.config.phaseMs ?? 0;
    return t >= phase && (t - phase) % this.config.cycleMs === 0;
  }

  /**
   * Ein ms-Tick: zuerst Prozessalarme (Flanke an der Peripherie seit dem letzten Tick),
   * dann fällige Weckalarme, dann OB1, falls dessen Zyklus fällig ist.
   */
  step(now: number): void {
    if (this.mode !== 'RUN') return;
    for (const task of this.program.tasks ?? []) {
      if (task.kind === 'process' && task.input) {
        const v = this.inputs.read('BOOL', task.input.byte, task.input.bit) as boolean;
        const key = `${task.input.byte}.${task.input.bit}`;
        const last = this.lastInputs.get(key);
        this.lastInputs.set(key, v);
        const hit = last !== undefined && (task.edge === 'falling' ? last && !v : !last && v);
        if (hit) this.runTask(task, now);
      }
    }
    for (const task of this.program.tasks ?? []) {
      if (task.kind !== 'cyclic' || !task.intervalMs) continue;
      const phase = task.phaseMs ?? 0;
      if (now >= phase && (now - phase) % task.intervalMs === 0) this.runTask(task, now);
    }
    if (this.mode === 'RUN' && this.isDue(now)) this.scan(now);
  }

  private readonly lastInputs = new Map<string, boolean>();

  /**
   * Alarm-OB ausführen. **Spielregel:** Der OB liest frische Eingänge (PAE wird vorher
   * aktualisiert) und seine Ausgänge wirken sofort.
   */
  private runTask(task: IrTask, now: number): void {
    this.pae.copyFrom(this.inputs);
    if (!this.runCode(now, task.start, task.end)) return;
    this.outputs.copyFrom(this.paa);
    this.metrics.interrupts++;
  }

  /** Führt einen Codebereich aus; false bei Zykluszeitüberschreitung (CPU in STOP). */
  private runCode(now: number, start?: number, end?: number): boolean {
    for (const i of this.tempSlots) this.slots[i] = this.program.slots[i]!.init;
    const res = execute({
      program: this.program,
      energy: this.energy,
      slots: this.slots,
      instances: this.instances,
      areas: { I: this.pae, Q: this.paa, M: this.m },
      now,
      budget: this.config.maxOpsPerCycle,
      start,
      end,
    });
    this.metrics.ops += res.ops;
    this.metrics.energy += res.energy;
    this.metrics.maxOpsInCycle = Math.max(this.metrics.maxOpsInCycle, res.ops);
    if (!res.ok) {
      this.stop(
        now,
        `Zykluszeitüberschreitung: mehr als ${this.config.maxOpsPerCycle} Befehle in einem Zyklus`,
      );
      return false;
    }
    return true;
  }

  /** Ein vollständiger Zyklus zum Zeitpunkt `now` (ms). In STOP passiert nichts. */
  scan(now: number): void {
    if (this.mode !== 'RUN') return;
    this.pae.copyFrom(this.inputs);
    const ok = this.runCode(now);
    this.metrics.cycles++;
    if (ok) this.outputs.copyFrom(this.paa);
  }

  /** CPU geht in STOP: Ausgänge werden abgeschaltet. */
  stop(time: number, message: string): void {
    this.mode = 'STOP';
    this.stopInfo = { time, reason: 'CYCLE_OVERRUN', message };
    this.paa.clear();
    this.outputs.clear();
  }

  private area(area: Area, which: 'peripheral' | 'image'): ByteArea {
    if (area === 'M') return this.m;
    if (area === 'I') return which === 'peripheral' ? this.inputs : this.pae;
    return which === 'peripheral' ? this.outputs : this.paa;
  }

  private access(address: string, t?: DataType) {
    const a = parseAddress(address);
    const type = t ?? defaultTypeForSize(a.size);
    if (sizeOfType(type) !== a.size)
      throw new AddressError(`Typ ${type} passt nicht zu ${address}`);
    return { a, type };
  }

  /** Setzt einen Wert an der Peripherie (Eingangsklemme) bzw. im Merkerbereich. */
  setInput(address: string, value: Value, t?: DataType): void {
    const { a, type } = this.access(address, t);
    if (a.area === 'Q') throw new AddressError('Ausgänge können nicht von außen gesetzt werden');
    this.area(a.area, 'peripheral').write(type, a.byte, a.bit, value);
  }

  /** Liest die Peripherie (Ausgangsklemmen, Eingangsklemmen) bzw. Merker. */
  read(address: string, t?: DataType): Value {
    const { a, type } = this.access(address, t);
    return this.area(a.area, 'peripheral').read(type, a.byte, a.bit);
  }

  /** Liest das Prozessabbild (PAE/PAA) bzw. Merker. */
  readImage(address: string, t?: DataType): Value {
    const { a, type } = this.access(address, t);
    return this.area(a.area, 'image').read(type, a.byte, a.bit);
  }

  readSlot(name: string): Value {
    const i = this.program.slots.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`Variable „${name}“ unbekannt`);
    return this.slots[i]!;
  }

  readInstance(name: string, field: InstanceField): Value {
    const i = this.program.instances.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`Instanz „${name}“ unbekannt`);
    const decl = this.program.instances[i]!;
    if (!INSTANCE_FIELDS[decl.kind][field]) throw new Error(`${decl.kind} hat kein Feld ${field}`);
    return this.instances[i]![field];
  }
}
