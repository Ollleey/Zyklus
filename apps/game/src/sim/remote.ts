import type {
  DataType,
  AlarmEntry,
  DiagEntry,
  Edge,
  InstanceField,
  IrProgram,
  Level,
  RunOptions,
  Solution,
  StopInfo,
  TriggerSpec,
  Value,
  ModuleFaultKind,
} from '@zyklus/sim-core';
import {
  World,
  type Layout,
  type Part,
  type PartState,
  type PlantView,
  type Workpiece,
  type WorkpieceSpec,
  type WorldView,
} from '@zyklus/plant-sim';
import {
  queryKey,
  type Command,
  type CpuSnapshot,
  type Query,
  type Reply,
  type Snapshot,
} from './protocol';
import type { CpuView, RunView } from './types';

/** Verbindung zum Worker (oder im Test direkt zum `SimHost`) */
export interface Channel {
  send(cmd: Command): void;
  onReply(fn: (r: Reply) => void): void;
}

let epochs = 0;

/**
 * Spiegel eines Laufs im Web Worker. Liest aus dem letzten Schnappschuss und leitet Eingriffe
 * weiter. Lesewünsche (Kanal-LEDs, Beobachten) werden gesammelt und beim nächsten Block mit
 * beantwortet – bis dahin liefern sie `undefined`.
 */
export class RemoteRun implements RunView {
  readonly epoch = ++epochs;
  time = 0;
  done = false;
  error: string | null = null;
  readonly traces = new Map<string, Edge[]>();
  readonly cpus = new Map<string, RemoteCpu>();
  readonly plant?: RemotePlant;
  /** wartet auf einen Schnappschuss (kein neuer Rechenblock vorher) */
  busy = true;
  private forces = new Map<string, boolean | number>();
  private readonly manual = new Map<string, boolean | number>();
  private readonly values = new Map<string, boolean | number | { error: string }>();
  private readonly queries = new Map<string, Query>();
  private queriesDirty = false;
  private listeners: (() => void)[] = [];

  constructor(
    private readonly channel: Channel,
    level: Level,
    solution: Solution,
    programs: Map<string, IrProgram>,
    opts: RunOptions,
  ) {
    const layout = (level.plant?.type === 'sandbox' ? level.plant.params?.layout : undefined) as
      Layout | undefined;
    if (layout) this.plant = new RemotePlant(layout, (c) => this.command(c));
    for (const m of solution.modules)
      if (programs.has(m.id)) this.cpus.set(m.id, new RemoteCpu(m.id, this));
    channel.send({
      type: 'init',
      epoch: this.epoch,
      level,
      solution,
      programs: [...programs],
      opts,
    });
  }

  /** neuer Schnappschuss angekommen */
  onUpdate(fn: () => void): void {
    this.listeners.push(fn);
  }

  receive(r: Reply): void {
    if (r.epoch !== this.epoch) return;
    if (r.type === 'error') {
      this.error = r.message;
      this.busy = false;
      for (const fn of this.listeners) fn();
      return;
    }
    this.apply(r);
  }

  private apply(s: Snapshot): void {
    this.time = s.time;
    this.done = s.done;
    this.breakHit = s.breakHit;
    for (const [key, edges] of s.traces) {
      const tr = this.traces.get(key);
      if (tr) for (const e of edges) tr.push(e);
      else this.traces.set(key, edges);
    }
    for (const c of s.cpus) this.cpus.get(c.id)?.update(c);
    this.forces = new Map(s.forced);
    for (const [k, v] of s.values) this.values.set(k, v);
    if (s.plant && this.plant) this.plant.update(s.plant);
    this.busy = false;
    for (const fn of this.listeners) fn();
  }

  command(cmd: Command): void {
    if (this.queriesDirty) {
      this.queriesDirty = false;
      this.channel.send({ type: 'queries', queries: [...this.queries.values()] });
    }
    this.busy = true;
    this.channel.send(cmd);
  }

  /** bis `time` weiterrechnen lassen (höchstens `budgetMs` Rechenzeit im Worker) */
  advance(time: number, budgetMs: number): void {
    this.command({ type: 'advance', time, budgetMs });
  }

  stepCycle(cpu?: string): void {
    this.command({ type: 'stepCycle', cpu });
  }

  query(q: Query): Value | undefined {
    const key = queryKey(q);
    if (!this.queries.has(key)) {
      this.queries.set(key, q);
      this.queriesDirty = true;
    }
    const v = this.values.get(key);
    if (v && typeof v === 'object') throw new Error(v.error);
    return v;
  }

  get forcedIds(): string[] {
    return [...this.forces.keys()];
  }

  forced(deviceId: string): boolean | number | undefined {
    return this.forces.get(deviceId);
  }

  force(deviceId: string, value: boolean | number | undefined): void {
    // sofort anzeigen, der Worker bestätigt mit dem nächsten Schnappschuss
    if (value === undefined) this.forces.delete(deviceId);
    else this.forces.set(deviceId, value);
    this.command({ type: 'force', device: deviceId, value });
  }

  isActuated(deviceId: string): boolean | number {
    return this.manual.get(deviceId) ?? false;
  }

  setManual(deviceId: string, value: boolean | number): void {
    this.manual.set(deviceId, value);
    this.command({ type: 'manual', device: deviceId, value });
  }

  setCpuSwitch(cpuId: string, mode: 'RUN' | 'STOP'): void {
    this.command({ type: 'cpuSwitch', cpu: cpuId, mode });
  }

  powerCycle(cpuId: string): void {
    this.command({ type: 'powerCycle', cpu: cpuId });
  }

  breakHit: { cpu: string; block: string; line: number; time: number } | null = null;
  private readonly faults = new Map<string, Set<ModuleFaultKind>>();

  setModuleFault(module: string, kind: 'pulled' | 'noLoad', on: boolean): void {
    const set = this.faults.get(module) ?? new Set();
    if (on) set.add(kind);
    else set.delete(kind);
    this.faults.set(module, set);
    this.command({ type: 'moduleFault', module, kind, on });
  }

  moduleFaults(module: string): Set<ModuleFaultKind> {
    return new Set(this.faults.get(module) ?? []);
  }

  setBreakpoints(cpuId: string, lines: { block: string; line: number }[]): void {
    this.command({ type: 'breakpoints', cpu: cpuId, lines });
  }

  clearBreak(): void {
    this.breakHit = null;
    this.command({ type: 'clearBreak' });
  }

  setTrigger(spec: TriggerSpec | null): void {
    this.command({ type: 'trigger', spec });
  }

  acknowledgeAlarms(): void {
    this.command({ type: 'ackAlarms' });
  }

  load(programs: Map<string, IrProgram>, opts: { keepValues: boolean; restart: boolean }): void {
    this.command({ type: 'load', programs: [...programs], ...opts });
  }

  traceVariable(
    key: string,
    spec: { cpu: string; target: { address: string } | { slot: string } } | undefined,
  ): void {
    this.command({ type: 'traceVar', key, spec });
  }

  setForce(cpuId: string, address: string, value: Value | undefined): void {
    this.command({ type: 'cpuForce', cpu: cpuId, address, value });
  }

  modify(cpuId: string, target: { address: string } | { slot: string }, value: Value): void {
    this.command({ type: 'modify', cpu: cpuId, target, value });
  }
}

class RemoteCpu implements CpuView {
  mode: 'RUN' | 'STOP' = 'RUN';
  stopInfo?: StopInfo;
  load = 0;
  forceCount = 0;
  probes: Value[] = [];
  diagActive = 0;
  diagnostics: DiagEntry[] = [];
  alarms: AlarmEntry[] = [];
  unackedAlarms = new Set<number>();

  constructor(
    private readonly id: string,
    private readonly run: RemoteRun,
  ) {}

  update(c: CpuSnapshot): void {
    this.mode = c.mode;
    this.stopInfo = c.stopInfo;
    this.load = c.load;
    this.forceCount = c.forceCount;
    this.probes = c.probes;
    this.diagActive = c.diagActive;
    this.diagnostics = c.diagnostics;
    this.alarms = c.alarms;
    this.unackedAlarms = new Set(c.unackedAlarms);
  }

  read(address: string, t?: DataType): Value {
    return this.run.query({ kind: 'read', cpu: this.id, address, t }) as Value;
  }

  readImage(address: string, t?: DataType): Value {
    return this.run.query({ kind: 'image', cpu: this.id, address, t }) as Value;
  }

  readSlot(name: string): Value {
    return this.run.query({ kind: 'slot', cpu: this.id, name }) as Value;
  }

  readInstance(name: string, field: InstanceField): Value {
    return this.run.query({ kind: 'instance', cpu: this.id, name, field }) as Value;
  }
}

/** Spiegel der Anlage; Geometrie (Auflageflächen) aus einer lokalen Welt mit gespiegeltem Zustand */
class RemotePlant implements PlantView {
  readonly world: RemoteWorld;
  private sensedMap = new Map<string, boolean | number | undefined>();

  constructor(layout: Layout, send: (c: Command) => void) {
    this.world = new RemoteWorld(layout, send);
  }

  update(s: NonNullable<Snapshot['plant']>): void {
    this.world.update(s);
    this.sensedMap = new Map(s.sensed);
  }

  sensed(partId: string): boolean | number | undefined {
    return this.sensedMap.get(partId);
  }

  setControl(ref: string, value: number | boolean): void {
    this.world.send({ type: 'control', ref, value });
  }
}

class RemoteWorld implements WorldView {
  private readonly geo: World;
  workpieces: Workpiece[] = [];
  time = 0;
  spawned = 0;
  private counts = { free: 0, binned: 0, lost: 0 };
  private readonly byId = new Map<number, Workpiece>();

  constructor(
    layout: Layout,
    readonly send: (c: Command) => void,
  ) {
    // ohne Startwerkstücke: die kommen mit dem ersten Schnappschuss
    this.geo = new World({ ...layout, workpieces: [] });
  }

  get parts(): readonly Part[] {
    return this.geo.parts;
  }

  update(s: NonNullable<Snapshot['plant']>): void {
    this.time = s.time;
    this.spawned = s.spawned;
    this.counts = s.tally;
    for (const [id, st] of s.states) {
      const p = this.geo.find(id);
      if (p) Object.assign(this.geo.st(p) as PartState, st);
    }
    const next: Workpiece[] = [];
    const seen = new Map<number, Workpiece>();
    for (const [
      id,
      material,
      color,
      size,
      x,
      y,
      z,
      sz,
      h,
      state,
      grounded,
      angle,
    ] of s.workpieces) {
      const w: Workpiece = this.byId.get(id) ?? {
        id,
        spec: { material, color, size },
        x,
        y,
        z,
        s: sz,
        h,
        mass: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        state,
        grounded,
        angle,
      };
      Object.assign(w, { x, y, z, state, grounded, angle });
      seen.set(id, w);
      next.push(w);
    }
    this.byId.clear();
    for (const [id, w] of seen) this.byId.set(id, w);
    this.workpieces = next;
  }

  st(p: Part): PartState {
    return this.geo.st(p);
  }

  find(ref: string): Part | undefined {
    return this.geo.find(ref);
  }

  levelOf(tank: Part): number {
    return this.geo.levelOf(tank);
  }

  remaining(p: Part): number {
    return this.geo.remaining(p);
  }

  tally() {
    return this.counts;
  }

  topAt(x: number, y: number): number {
    return this.geo.topAt(x, y);
  }

  releaseEstop(ref: string): void {
    this.send({ type: 'estop', ref });
  }

  triggerMagazine(ref: string): boolean {
    this.send({ type: 'magazine', ref });
    return true;
  }

  moveWorkpiece(id: number, x: number, y: number, z?: number): void {
    const w = this.byId.get(id);
    if (w) Object.assign(w, { x, y, z: z ?? w.z });
    this.send({ type: 'moveWp', id, x, y, z });
  }

  addWorkpiece(spec: WorkpieceSpec, x: number, y: number, z: number): void {
    this.send({ type: 'addWp', spec, x, y, z });
  }

  removeWorkpiece(id: number): void {
    this.workpieces = this.workpieces.filter((w) => w.id !== id);
    this.send({ type: 'removeWp', id });
  }
}
