import { LevelRun, type Edge, type Value } from '@zyklus/sim-core';
import { SandboxPlant } from '@zyklus/plant-sim';
import {
  queryKey,
  type Command,
  type PlantSnapshot,
  type Query,
  type Reply,
  type WpTuple,
} from './protocol';

/**
 * Seite des Web Workers: besitzt den eigentlichen `LevelRun`, führt Befehle aus und meldet nach
 * jedem Rechenblock einen Schnappschuss. Ohne Worker-Abhängigkeit, damit sie testbar bleibt.
 */
export class SimHost {
  private run: LevelRun | null = null;
  private epoch = 0;
  private queries: Query[] = [];
  /** schon gemeldete Flanken je Spur */
  private sent = new Map<string, number>();

  constructor(private readonly post: (r: Reply) => void) {}

  handle(cmd: Command): void {
    if (cmd.type === 'init') {
      this.epoch = cmd.epoch;
      this.sent = new Map();
      try {
        this.run = new LevelRun(cmd.level, cmd.solution, new Map(cmd.programs), cmd.opts);
      } catch (e) {
        this.run = null;
        this.post({ type: 'error', epoch: cmd.epoch, message: (e as Error).message });
        return;
      }
      this.snapshot();
      return;
    }
    if (cmd.type === 'queries') {
      this.queries = cmd.queries;
      return;
    }
    const run = this.run;
    if (!run) return;
    const plant = run.plant instanceof SandboxPlant ? run.plant : null;
    switch (cmd.type) {
      case 'advance': {
        const start = performance.now();
        while (run.time <= cmd.time && !run.done && performance.now() - start < cmd.budgetMs) {
          run.runTo(Math.min(cmd.time, run.time + 25));
        }
        break;
      }
      case 'stepCycle':
        run.stepCycle(cmd.cpu);
        break;
      case 'manual':
        run.setManual(cmd.device, cmd.value);
        break;
      case 'force':
        run.force(cmd.device, cmd.value);
        break;
      case 'cpuSwitch':
        run.setCpuSwitch(cmd.cpu, cmd.mode);
        break;
      case 'powerCycle':
        run.powerCycle(cmd.cpu);
        break;
      case 'traceVar':
        run.traceVariable(cmd.key, cmd.spec);
        break;
      case 'cpuForce':
        run.setForce(cmd.cpu, cmd.address, cmd.value);
        break;
      case 'modify':
        run.modify(cmd.cpu, cmd.target, cmd.value);
        break;
      case 'control':
        plant?.setControl(cmd.ref, cmd.value);
        break;
      case 'estop':
        plant?.world.releaseEstop(cmd.ref);
        break;
      case 'magazine':
        plant?.world.triggerMagazine(cmd.ref);
        break;
      case 'moveWp':
        plant?.world.moveWorkpiece(cmd.id, cmd.x, cmd.y, cmd.z);
        break;
      case 'addWp':
        plant?.world.addWorkpiece(cmd.spec, cmd.x, cmd.y, cmd.z);
        break;
      case 'removeWp':
        plant?.world.removeWorkpiece(cmd.id);
        break;
      case 'snapshot':
        break;
    }
    this.snapshot();
  }

  private snapshot(): void {
    const run = this.run;
    if (!run) return;
    const traces: [string, Edge[]][] = [];
    for (const [key, edges] of run.traces) {
      const n = this.sent.get(key) ?? 0;
      if (edges.length > n) {
        traces.push([key, edges.slice(n)]);
        this.sent.set(key, edges.length);
      }
    }
    const values: [string, boolean | number | { error: string }][] = [];
    for (const q of this.queries) {
      const cpu = run.cpus.get(q.cpu);
      if (!cpu) continue;
      let v: Value | { error: string };
      try {
        v =
          q.kind === 'read'
            ? cpu.read(q.address, q.t)
            : q.kind === 'image'
              ? cpu.readImage(q.address, q.t)
              : q.kind === 'slot'
                ? cpu.readSlot(q.name)
                : cpu.readInstance(q.name, q.field);
      } catch (e) {
        v = { error: (e as Error).message };
      }
      values.push([queryKey(q), v as boolean | number | { error: string }]);
    }
    this.post({
      type: 'snapshot',
      epoch: this.epoch,
      time: run.time,
      done: run.done,
      traces,
      cpus: [...run.cpus].map(([id, c]) => ({
        id,
        mode: c.mode,
        stopInfo: c.stopInfo,
        load: c.load,
        forceCount: c.forceCount,
        probes: [...c.probes],
      })),
      forced: run.forcedIds.map((id) => [id, run.forced(id)!]),
      values,
      plant: run.plant instanceof SandboxPlant ? plantSnapshot(run.plant) : undefined,
    });
  }
}

function plantSnapshot(p: SandboxPlant): PlantSnapshot {
  const w = p.world;
  const workpieces: WpTuple[] = [];
  for (const k of w.workpieces) {
    if (k.state !== 'free') continue;
    workpieces.push([
      k.id,
      k.spec.material,
      k.spec.color,
      k.spec.size,
      k.x,
      k.y,
      k.z,
      k.s,
      k.h,
      k.state,
      k.grounded,
      k.angle,
    ]);
  }
  return {
    time: w.time,
    spawned: w.spawned,
    tally: w.tally(),
    states: w.parts.map((part) => [part.id, w.st(part)]),
    sensed: w.parts.map((part) => [part.id, p.sensed(part.id)]),
    workpieces,
  };
}
