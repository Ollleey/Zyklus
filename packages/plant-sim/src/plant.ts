import {
  MODULE_TYPES,
  registerPlantModel,
  type Level,
  type Plant,
  type Value,
} from '@zyklus/sim-core';
import { connectionsOf, identifier, type Connection } from './devices';
import type { Layout, Part } from './model';
import { STEP_MS, World } from './world';

/**
 * Anlagenmodell des Sandkastens für `LevelRun`: rechnet die Mechanik im 2-ms-Takt und liefert
 * jede ms die Werte der Bedienelemente, Endlagen und Sensoren.
 */
export class SandboxPlant implements Plant {
  readonly world: World;
  private readonly conns: Connection[];
  private cache: Record<string, number | boolean> = {};
  private ms = 0;

  constructor(
    readonly layout: Layout,
    seed = layout.seed,
  ) {
    this.world = new World(layout, seed);
    this.conns = connectionsOf(layout).filter((c) => c.io.kind === 'DI' || c.io.kind === 'AI');
    this.refresh();
  }

  inputs(): Record<string, number | boolean> {
    return this.cache;
  }

  step(_t: number, outputs: Record<string, Value>): void {
    this.world.setOutputs(outputs);
    if (++this.ms % STEP_MS === 0) this.world.step();
    this.refresh();
  }

  state(): Record<string, number> {
    const w = this.world;
    const t = w.tally();
    const out: Record<string, number> = { spawned: w.spawned, binned: t.binned, lost: t.lost };
    for (const p of w.parts) {
      if (p.type === 'bin') out[identifier(p.tag)] = w.st(p).total;
      if (p.type === 'tank') out[identifier(p.tag)] = Math.round(w.levelOf(p) * 10) / 10;
    }
    return out;
  }

  /** Bedienelement betätigen (Handbetrieb in der Anlagenansicht) */
  setControl(ref: string, value: number | boolean): void {
    this.world.setControl(ref, value);
    this.refresh();
  }

  private refresh(): void {
    const next: Record<string, number | boolean> = {};
    for (const c of this.conns) {
      const v = this.read(c.part, c.io.key);
      if (v !== undefined) next[c.device.id] = v;
    }
    this.cache = next;
  }

  /** Wert eines Eingangs vor der Öffner-Umkehr (betätigt bzw. erkannt = true) */
  private read(p: Part, key: string): number | boolean | undefined {
    const w = this.world;
    const st = w.st(p);
    switch (p.type) {
      case 'button':
      case 'switch':
      case 'estop':
        return st.control >= 1;
      case 'selector':
        return key === 'hand' ? st.control === 1 : st.control === 2;
      case 'poti':
        return st.control;
      case 'turntable':
        return key === 'pos0' ? st.angle <= 0.5 : st.angle >= 89.5;
      case 'lift':
        return key === 'oben' ? st.pos >= 0.99 : st.pos <= 0.01;
      case 'magazine':
        return w.remaining(p) <= 0;
    }
    return undefined;
  }
}

registerPlantModel('sandbox', (p, _level, seed) => new SandboxPlant(p.layout as Layout, seed));

/** Aus einer Anlage entsteht zur Laufzeit ein gewöhnliches Level mit Handbetrieb. */
export function levelFromLayout(layout: Layout, title = 'Sandkasten'): Level {
  return {
    id: 'sandkasten',
    order: 0,
    title: { de: title },
    customer: { de: 'Eigene Anlage' },
    mail: {
      from: { de: 'Werkstatt' },
      subject: { de: title },
      body: { de: 'Frei gebaute Anlage ohne Prüfung.' },
    },
    datasheet: { de: '' },
    board: { width: 48, ductCapacity: 16 },
    allowedModules: Object.keys(MODULE_TYPES),
    devices: connectionsOf(layout).map((c) => c.device),
    plant: { type: 'sandbox', params: { layout } },
    toleranceMs: 0,
    tests: [
      {
        id: 'frei',
        name: { de: 'Freier Lauf' },
        durationMs: 60000,
        seeds: [layout.seed],
        stimuli: {},
        checks: [],
      },
    ],
  };
}
