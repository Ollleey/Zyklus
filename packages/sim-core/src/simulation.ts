import type { Cpu } from './cpu';

/**
 * Umgebung (Anlage, Stimuli, Störungen). Pro ms-Tick wird zuerst `beforeScans` aufgerufen
 * (Eingangsklemmen setzen), dann scannen alle fälligen CPUs, dann `afterScans`
 * (Ausgangsklemmen auswerten, Anlage weiterrechnen).
 */
export interface Environment {
  beforeScans?(t: number, sim: Simulation): void;
  afterScans?(t: number, sim: Simulation): void;
}

export interface SimMetrics {
  cycles: number;
  ops: number;
  energy: number;
}

/** Gemeinsame Zeitachse für eine oder mehrere CPUs, Auflösung 1 ms. */
export class Simulation {
  /** Zeit des nächsten Ticks in ms */
  time = 0;

  constructor(
    readonly cpus: Cpu[],
    readonly env: Environment = {},
  ) {}

  tick(): void {
    const t = this.time;
    this.env.beforeScans?.(t, this);
    // CPUs in Listenreihenfolge; Rechenzeit innerhalb eines Ticks = 0
    for (const cpu of this.cpus) if (cpu.isDue(t)) cpu.scan(t);
    this.env.afterScans?.(t, this);
    this.time = t + 1;
  }

  run(ms: number): void {
    for (let n = 0; n < ms; n++) this.tick();
  }

  /** läuft bis einschließlich Tick `t` */
  runUntil(t: number): void {
    while (this.time <= t) this.tick();
  }

  metrics(): SimMetrics {
    return this.cpus.reduce(
      (acc, c) => ({
        cycles: acc.cycles + c.metrics.cycles,
        ops: acc.ops + c.metrics.ops,
        energy: acc.energy + c.metrics.energy,
      }),
      { cycles: 0, ops: 0, energy: 0 },
    );
  }
}
