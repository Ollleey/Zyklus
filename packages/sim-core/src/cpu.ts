import { parseAddress, sizeOfType, defaultTypeForSize, AddressError, type Area } from './address';
import { createInstance, type InstanceState } from './instances';
import { execute, precomputeEnergy } from './interpreter';
import { INSTANCE_FIELDS, type InstanceField, type IrProgram, type IrTask } from './ir';
import { ByteArea } from './memory';
import { STRING_DEFAULT_LEN, normalize, type DataType, type Value } from './types';
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
  /** Systemmerkerbyte: Bit 0 FirstScan, 1 DiagStatusUpdate, 2 AlwaysTRUE, 3 AlwaysFALSE */
  systemByte?: number;
  /** Taktmerkerbyte: Bit 0 10 Hz, 1 5 Hz, 2 2,5 Hz, 3 2 Hz, 4 1,25 Hz, 5 1 Hz, 6 0,625 Hz, 7 0,5 Hz */
  clockByte?: number;
}

/** Periodendauer der Taktmerker in ms (Bit 0 … 7) */
export const CLOCK_PERIODS = [100, 200, 400, 500, 800, 1000, 1600, 2000] as const;

export type CpuMode = 'RUN' | 'STOP';

export interface StopInfo {
  time: number;
  /** Fehler (Zykluszeit, Programmierfehler), Betriebsartenschalter oder Spannung aus */
  reason: 'CYCLE_OVERRUN' | 'PROGRAM_ERROR' | 'SWITCH' | 'POWER';
  message: string;
}

/** Eintrag im Diagnosepuffer (neueste zuerst) */
export interface DiagEntry {
  time: number;
  /** error: Fehler (STOP, Programmierfehler, Zykluszeit), diag: Baugruppendiagnose, event: Betrieb */
  kind: 'error' | 'diag' | 'event';
  text: string;
}

/** Größe des Diagnosepuffers */
export const DIAG_BUFFER = 50;

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
/** geprüfte Adressen (Adresse bzw. Adresse|Typ → zerlegte Adresse und Datentyp) */
const ACCESS_CACHE = new Map<string, { a: ReturnType<typeof parseAddress>; type: DataType }>();

export class Cpu {
  readonly inputs: ByteArea;
  readonly outputs: ByteArea;
  readonly pae: ByteArea;
  readonly paa: ByteArea;
  readonly m: ByteArea;
  readonly slots: Value[];
  readonly instances: InstanceState[];
  /** Messpunkte: letzter Wert einer Bedingung bzw. Anzahl Durchläufe einer Anweisung */
  readonly probes: Value[];
  mode: CpuMode = 'RUN';
  stopInfo?: StopInfo;
  readonly metrics: CpuMetrics = { cycles: 0, ops: 0, energy: 0, maxOpsInCycle: 0, interrupts: 0 };

  private readonly energy: number[];
  private readonly tempSlots: number[];
  /** Diagnosepuffer, neueste Einträge zuerst */
  readonly diagnostics: DiagEntry[] = [];
  /** anstehende Diagnoseereignisse (Drahtbruch, Lastspannung, Baugruppe) → ERROR-LED */
  private readonly activeDiag = new Set<string>();
  /** Zykluszeitüberschreitung im letzten Zyklus (OB80 toleriert sie einmal) */
  private overrun = false;
  /** gerade läuft ein Fehler-OB (keine Rekursion) */
  private inErrorOb = false;
  /** Forceaufträge an der Peripherie (Eingänge vor dem PAE, Ausgänge nach dem PAA) */
  private readonly forces = new Map<
    string,
    { area: 'I' | 'Q'; type: DataType; byte: number; bit: number; value: Value }
  >();
  /** Anlauf-OBs liefen seit dem letzten Neustart */
  private started = false;
  private powered = true;
  /** Stellung des Betriebsartenschalters */
  private switchPos: CpuMode = 'RUN';

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
    this.probes = (program.probes ?? []).map((p) => (p.kind === 'line' ? 0 : false));
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
    this.applyInputForces();
    if (this.mode !== 'RUN') return;
    if (!this.started && !this.startup(now)) return;
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
    this.writeOutputs();
    this.metrics.interrupts++;
  }

  /** PAA an die Ausgangsklemmen, dann geforcte Ausgänge */
  private writeOutputs(): void {
    this.outputs.copyFrom(this.paa);
    this.applyOutputForces();
  }

  private applyInputForces(): void {
    for (const f of this.forces.values()) {
      if (f.area === 'I') this.inputs.write(f.type, f.byte, f.bit, f.value);
    }
  }

  private applyOutputForces(): void {
    for (const f of this.forces.values()) {
      if (f.area === 'Q') this.outputs.write(f.type, f.byte, f.bit, f.value);
    }
  }

  /**
   * Forcen wie in TIA: ein Eingang erhält den Wert an der Peripherie statt des Feldsignals,
   * ein Ausgang gibt ihn statt des PAA aus – auch in STOP. `undefined` hebt den Auftrag auf.
   */
  force(address: string, value: Value | undefined, t?: DataType): void {
    const { a, type } = this.access(address, t);
    if (a.area === 'M') throw new AddressError('Forcen geht nur an Ein- und Ausgängen (%I, %Q)');
    const key = `${a.area}${a.byte}.${a.bit}|${type}`;
    if (value === undefined) {
      this.forces.delete(key);
      return;
    }
    this.forces.set(key, { area: a.area, type, byte: a.byte, bit: a.bit, value });
    if (a.area === 'Q') this.applyOutputForces();
    else this.applyInputForces();
  }

  /** Anzahl aktiver Forceaufträge (MAINT-LED) */
  get forceCount(): number {
    return this.forces.size;
  }

  /**
   * Steuern (einmalig): Eingänge ins PAE, Ausgänge ins PAA, Merker direkt; Variablen über den
   * Slotnamen (`Daten.Wert`, `Feld[2]`). Der nächste Zyklus kann den Wert wieder überschreiben.
   */
  modify(target: { address: string; t?: DataType } | { slot: string }, value: Value): void {
    if ('slot' in target) {
      const i = this.slotIndex(target.slot);
      const d = this.program.slots[i]!;
      const n = normalize(d.t, value);
      this.slots[i] = d.t === 'STRING' ? (n as string).slice(0, d.len ?? STRING_DEFAULT_LEN) : n;
      return;
    }
    const { a, type } = this.access(target.address, target.t);
    this.area(a.area, 'image').write(type, a.byte, a.bit, value);
  }

  /** erster Zyklus nach dem Anlauf (Systemmerker FirstScan) */
  private firstScan = true;

  /** System- und Taktmerker wie in den CPU-Eigenschaften (vor jedem Zyklus von OB1) */
  private writeSystemMemory(now: number): void {
    const { systemByte, clockByte } = this.config;
    if (clockByte !== undefined && this.m.fits('BYTE', clockByte)) {
      let v = 0;
      CLOCK_PERIODS.forEach((p, bit) => {
        if (now % p < p / 2) v |= 1 << bit;
      });
      this.m.write('BYTE', clockByte, 0, v);
    }
    if (systemByte !== undefined && this.m.fits('BYTE', systemByte)) {
      const v = (this.firstScan ? 1 : 0) | (this.diagChanged ? 2 : 0) | 4;
      this.m.write('BYTE', systemByte, 0, v);
    }
    this.firstScan = false;
    this.diagChanged = false;
  }

  /** Diagnosezustand hat sich seit dem letzten Zyklus geändert (Systemmerker DiagStatusUpdate) */
  diagChanged = false;

  /**
   * Anlauf: Anlauf-OBs (OB100) einmal ausführen. **Spielregel:** Das PAE ist schon aktuell,
   * Ausgänge wirken erst mit dem ersten Zyklus. false, wenn die CPU dabei in STOP geht.
   */
  private startup(now: number): boolean {
    this.started = true;
    this.firstScan = true;
    this.overrun = false;
    this.log(now, 'event', 'Anlauf (Warmstart)');
    for (const task of this.program.tasks ?? []) {
      if (task.kind !== 'startup') continue;
      this.pae.copyFrom(this.inputs);
      if (!this.runCode(now, task.start, task.end)) return false;
    }
    return true;
  }

  /**
   * Neustart (Warmstart): nicht remanente Daten auf Startwerte, Instanzen (Zeiten, Zähler)
   * zurückgesetzt, Merker und Prozessabbilder gelöscht; remanente Daten bleiben.
   * Danach laufen die Anlauf-OBs vor dem ersten Zyklus.
   */
  private warmRestart(): void {
    this.program.slots.forEach((s, i) => {
      if (!s.retain) this.slots[i] = s.init;
    });
    this.program.instances.forEach((d, i) => {
      this.instances[i] = createInstance(d.kind);
    });
    this.m.clear();
    this.pae.clear();
    this.paa.clear();
    this.lastInputs.clear();
    this.started = false;
  }

  /** Führt einen Codebereich aus; false bei Zykluszeitüberschreitung (CPU in STOP). */
  private task(kind: IrTask['kind']): IrTask | undefined {
    return this.program.tasks?.find((t) => t.kind === kind);
  }

  /** Eintrag in den Diagnosepuffer */
  log(time: number, kind: DiagEntry['kind'], text: string): void {
    this.diagnostics.unshift({ time, kind, text });
    if (this.diagnostics.length > DIAG_BUFFER) this.diagnostics.length = DIAG_BUFFER;
  }

  /** anstehende Diagnose (ERROR-LED leuchtet) */
  get diagActive(): number {
    return this.activeDiag.size;
  }

  /**
   * Diagnoseereignis einer Baugruppe (kommend/gehend), z. B. Drahtbruch: Diagnosepuffer, ERROR-LED,
   * Diagnosealarm OB82. Ohne OB82 bleibt die CPU in RUN (wie S7-1500).
   */
  diagnosticEvent(time: number, key: string, text: string, coming: boolean): void {
    this.raise(time, key, text, coming, 'diagnostic');
  }

  /** Baugruppenausfall bzw. -wiederkehr: OB86, sonst wie Diagnose */
  rackEvent(time: number, key: string, text: string, coming: boolean): void {
    this.raise(time, key, text, coming, 'rackFailure');
  }

  private raise(
    time: number,
    key: string,
    text: string,
    coming: boolean,
    kind: 'diagnostic' | 'rackFailure',
  ): void {
    if (coming === this.activeDiag.has(key)) return;
    if (coming) this.activeDiag.add(key);
    else this.activeDiag.delete(key);
    this.diagChanged = true;
    this.log(time, 'diag', `${coming ? 'kommend' : 'gehend'}: ${text}`);
    const t = this.task(kind);
    if (t && this.mode === 'RUN' && this.started) {
      // Startinformation wie in TIA: Event_Class 16#39 kommend, 16#38 gehend
      if (t.eventClass !== undefined) this.slots[t.eventClass] = coming ? 0x39 : 0x38;
      this.runTask(t, time);
    }
  }

  private runCode(now: number, start?: number, end?: number): boolean {
    for (const i of this.tempSlots) this.slots[i] = this.program.slots[i]!.init;
    const ob121 = this.task('programError');
    const errors: string[] = [];
    const handled = this.program.localErrors || (ob121 && !this.inErrorOb);
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
      probes: this.probes,
      opTimeMs: this.config.cycleMs / this.config.maxOpsPerCycle,
      ...(handled
        ? {
            onError: (id: number, message: string) => {
              errors.push(`${message} (16#${id.toString(16).toUpperCase()})`);
            },
          }
        : {}),
    });
    this.metrics.ops += res.ops;
    this.metrics.energy += res.energy;
    this.metrics.maxOpsInCycle = Math.max(this.metrics.maxOpsInCycle, res.ops);
    for (const e of errors) this.log(now, 'error', `Programmierfehler: ${e}`);
    if (errors.length && ob121 && !this.program.localErrors) {
      // Programmierfehler-OB einmal je Durchlauf, danach geht es weiter
      this.inErrorOb = true;
      const ok = this.runCode(now, ob121.start, ob121.end);
      this.inErrorOb = false;
      if (!ok) return false;
    }
    if (!res.ok) {
      if (res.reason === 'PROGRAM_ERROR') {
        this.log(now, 'error', `Programmierfehler: ${res.message} – kein OB121`);
        this.stop(now, `Programmierfehler: ${res.message}`, 'PROGRAM_ERROR');
        return false;
      }
      const ob80 = this.task('timeError');
      if (ob80 && !this.overrun && !this.inErrorOb) {
        // Zykluszeitfehler-OB: einmal toleriert, der Zyklus ist abgebrochen
        this.overrun = true;
        this.log(now, 'error', 'Zykluszeitüberschreitung – OB80 aufgerufen');
        this.inErrorOb = true;
        const ok = this.runCode(now, ob80.start, ob80.end);
        this.inErrorOb = false;
        return ok;
      }
      const msg = this.overrun
        ? 'Zykluszeitüberschreitung zweimal hintereinander'
        : `Zykluszeitüberschreitung: mehr als ${this.config.maxOpsPerCycle} Befehle in einem Zyklus`;
      this.stop(now, msg);
      return false;
    }
    return true;
  }

  /** Ein vollständiger Zyklus zum Zeitpunkt `now` (ms). In STOP passiert nichts. */
  scan(now: number): void {
    this.applyInputForces();
    if (this.mode !== 'RUN') return;
    if (!this.started && !this.startup(now)) return;
    this.pae.copyFrom(this.inputs);
    this.writeSystemMemory(now);
    const before = this.overrun;
    const ok = this.runCode(now);
    // ein vollständiger Zyklus ohne Überschreitung setzt die Toleranz von OB80 zurück
    if (ok && before === this.overrun) this.overrun = false;
    this.metrics.cycles++;
    if (ok) this.writeOutputs();
  }

  /** CPU geht in STOP: Ausgänge werden abgeschaltet. */
  stop(time: number, message: string, reason: StopInfo['reason'] = 'CYCLE_OVERRUN'): void {
    this.mode = 'STOP';
    this.stopInfo = { time, reason, message };
    this.log(
      time,
      reason === 'SWITCH' || reason === 'POWER' ? 'event' : 'error',
      `STOP: ${message}`,
    );
    this.paa.clear();
    this.outputs.clear();
    this.applyOutputForces();
  }

  /**
   * Betriebsartenschalter. STOP → RUN ist ein Neustart (Warmstart): nur remanente Daten
   * behalten ihre Werte, danach laufen die Anlauf-OBs.
   */
  setSwitch(mode: CpuMode, time: number): void {
    this.switchPos = mode;
    if (!this.powered || mode === this.mode) return;
    if (mode === 'STOP') {
      this.stop(time, 'Betriebsartenschalter auf STOP', 'SWITCH');
      return;
    }
    this.warmRestart();
    this.mode = 'RUN';
    this.stopInfo = undefined;
  }

  /** Spannung aus: CPU steht, Ausgänge aus. */
  powerOff(time: number): void {
    if (!this.powered) return;
    this.powered = false;
    this.stop(time, 'Spannung aus', 'POWER');
  }

  /** Spannung ein: Neustart wie nach STOP → RUN, sofern der Schalter auf RUN steht. */
  powerOn(time: number): void {
    if (this.powered) return;
    this.powered = true;
    this.warmRestart();
    if (this.switchPos === 'RUN') {
      this.mode = 'RUN';
      this.stopInfo = undefined;
    } else {
      this.stopInfo = { time, reason: 'SWITCH', message: 'Betriebsartenschalter auf STOP' };
    }
  }

  get isPowered(): boolean {
    return this.powered;
  }

  /**
   * Laden: Zustand einer CPU mit dem bisherigen Programm übernehmen (Peripherie, Merker,
   * Betriebsart, Forceaufträge, Kennzahlen). `keepValues`: Variablen und Instanzen mit gleichem
   * Namen und Typ behalten ihren Istwert, sonst gelten die Startwerte. `restart`: danach läuft der
   * Anlauf wie nach STOP → RUN (Laden mit STOP); sonst geht es im nächsten Zyklus weiter
   * (Laden in RUN).
   */
  adoptFrom(old: Cpu, keepValues: boolean, restart: boolean): void {
    for (const [a, b] of [
      [this.inputs, old.inputs],
      [this.outputs, old.outputs],
      [this.pae, old.pae],
      [this.paa, old.paa],
      [this.m, old.m],
    ] as const) {
      a.bytes.set(b.bytes.subarray(0, Math.min(a.size, b.size)));
    }
    if (keepValues) {
      const byName = new Map(
        old.program.slots.map((s, i) => [`${s.name.toLowerCase()}|${s.t}`, i]),
      );
      this.program.slots.forEach((s, i) => {
        if (s.temp) return;
        const j = byName.get(`${s.name.toLowerCase()}|${s.t}`);
        if (j !== undefined) this.slots[i] = old.slots[j]!;
      });
      const inst = new Map(
        old.program.instances.map((d, i) => [`${d.name.toLowerCase()}|${d.kind}`, i]),
      );
      this.program.instances.forEach((d, i) => {
        const j = inst.get(`${d.name.toLowerCase()}|${d.kind}`);
        if (j !== undefined) this.instances[i] = { ...old.instances[j]! };
      });
    }
    for (const [k, f] of old.forces) this.forces.set(k, f);
    this.diagnostics.push(...old.diagnostics);
    for (const k of old.activeDiag) this.activeDiag.add(k);
    Object.assign(this.metrics, old.metrics);
    this.powered = old.powered;
    this.switchPos = old.switchPos;
    this.mode = old.mode;
    this.stopInfo = old.stopInfo;
    for (const [k, v] of old.lastInputs) this.lastInputs.set(k, v);
    if (restart) {
      // Laden mit STOP: Prozessabbilder neu, danach Anlauf
      this.pae.clear();
      this.paa.clear();
      this.started = false;
      if (this.powered && this.switchPos === 'RUN') {
        this.mode = 'RUN';
        this.stopInfo = undefined;
      }
    } else {
      this.started = old.started;
    }
  }

  /** Mittlere Auslastung des Befehlsbudgets je Zyklus (0…1) */
  get load(): number {
    if (!this.metrics.cycles) return 0;
    return this.metrics.ops / this.metrics.cycles / this.config.maxOpsPerCycle;
  }

  private area(area: Area, which: 'peripheral' | 'image'): ByteArea {
    if (area === 'M') return this.m;
    if (area === 'I') return which === 'peripheral' ? this.inputs : this.pae;
    return which === 'peripheral' ? this.outputs : this.paa;
  }

  private access(address: string, t?: DataType) {
    // Peripheriezugriffe kommen jede ms mit denselben Adressen: geprüftes Ergebnis merken
    const key = t ? `${address}|${t}` : address;
    const hit = ACCESS_CACHE.get(key);
    if (hit) return hit;
    const a = parseAddress(address);
    const type = t ?? defaultTypeForSize(a.size);
    if (sizeOfType(type) !== a.size)
      throw new AddressError(`Typ ${type} passt nicht zu ${address}`);
    const r = { a, type };
    ACCESS_CACHE.set(key, r);
    return r;
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
    return this.slots[this.slotIndex(name)]!;
  }

  private slotIndex(name: string): number {
    const i = this.program.slots.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`Variable „${name}“ unbekannt`);
    return i;
  }

  readInstance(name: string, field: InstanceField): Value {
    const i = this.program.instances.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`Instanz „${name}“ unbekannt`);
    const decl = this.program.instances[i]!;
    if (!INSTANCE_FIELDS[decl.kind][field]) throw new Error(`${decl.kind} hat kein Feld ${field}`);
    return this.instances[i]![field];
  }
}
