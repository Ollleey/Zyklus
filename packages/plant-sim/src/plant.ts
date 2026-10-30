import {
  MODULE_TYPES,
  Rng,
  deriveSeed,
  registerPlantModel,
  type FaultKind,
  type Level,
  type Plant,
  type Value,
} from '@zyklus/sim-core';
import { connectionsOf, identifier, type Connection } from './devices';
import { bool, num, type Layout, type Part } from './model';
import type { ControlStep } from './publish';
import { SENSOR_TYPES, detect } from './sensors';
import { STEP_MS, World } from './world';

/**
 * Anlagenmodell des Sandkastens für `LevelRun`: rechnet die Mechanik im 2-ms-Takt und liefert
 * jede ms die Werte der Bedienelemente, Endlagen und Sensoren.
 */
export class SandboxPlant implements Plant {
  readonly world: World;
  private readonly conns: Connection[];
  private readonly cutOutputs: Connection[];
  private cache: Record<string, number | boolean> = {};
  private ms = 0;
  /** Rohwert (ohne Ansprechzeit) und Ausgang je Sensor */
  private readonly raw = new Map<string, boolean | number>();
  private readonly filters = new Map<string, DiFilter>();
  private stateCache?: Record<string, number>;
  private stateAt = -1;
  /** Behälter und Tanks mit ihrem Schlüssel in `state()` */
  private readonly stateKeys: [Part, string][];

  /** Bedienfolge eines Prüflaufs (veröffentlichte Aufträge), nach Zeit sortiert */
  private readonly controls: ControlStep[];
  private nextControl = 0;

  constructor(
    readonly layout: Layout,
    seed = layout.seed,
    controls: ControlStep[] = [],
  ) {
    this.controls = [...controls].sort((a, b) => a[0] - b[0]);
    this.world = new World(layout, seed);
    this.stateKeys = layout.parts
      .filter((p) => p.type === 'bin' || p.type === 'tank')
      .map((p) => [p, identifier(p.tag)]);
    const all = connectionsOf(layout);
    this.conns = all.filter((c) => c.io.kind === 'DI' || c.io.kind === 'AI');
    this.cutOutputs = all.filter(
      (c) => (c.io.kind === 'DO' || c.io.kind === 'AO') && c.part.fault === 'drahtbruch',
    );
    for (const p of layout.parts) {
      if (!SENSOR_TYPES.has(p.type)) continue;
      const bounce = p.type === 'limit' && bool(p.params, 'bounce', true);
      this.filters.set(
        p.id,
        new DiFilter(
          num(p.params, 'responseMs'),
          bounce ? new Rng(deriveSeed(seed, `prellen:${p.id}`)) : undefined,
        ),
      );
    }
    this.sense();
    this.refresh();
  }

  inputs(): Record<string, number | boolean> {
    return this.cache;
  }

  step(t: number, outputs: Record<string, Value>): void {
    while (this.nextControl < this.controls.length && this.controls[this.nextControl]![0] <= t) {
      const [, ref, value] = this.controls[this.nextControl++]!;
      const part = this.world.find(ref);
      if (part?.type === 'estop' && !value) this.world.releaseEstop(ref);
      else this.world.setControl(ref, value);
    }
    // Drahtbruch an einem Ausgang: am Gerät kommt nichts an
    let out = outputs;
    for (const c of this.cutOutputs) {
      if (out === outputs) out = { ...outputs };
      out[c.device.id] = c.io.kind === 'AO' ? 0 : false;
    }
    this.world.setOutputs(out);
    // Lagen ändern sich nur im Mechanikschritt: dann neu erfassen, sonst nur Ansprechzeit/Prellen
    if (++this.ms % STEP_MS === 0) {
      this.world.step();
      this.sense();
    } else this.tickFilters();
    this.refresh();
  }

  /** aktueller Wert eines Sensors nach Ansprechzeit und Prellen (für die LED am Sensor) */
  sensed(partId: string): boolean | number | undefined {
    const f = this.filters.get(partId);
    const r = this.raw.get(partId);
    return typeof r === 'number' ? r : f?.value(this.ms);
  }

  private tickFilters(): void {
    for (const [id, f] of this.filters) {
      const v = this.raw.get(id);
      if (typeof v === 'boolean') f.update(v, this.ms);
    }
  }

  private sense(): void {
    for (const p of this.world.parts) {
      const f = this.filters.get(p.id);
      if (!f) continue;
      const prev = this.raw.get(p.id) ?? false;
      const v = detect(p, this.world, prev);
      this.raw.set(p.id, v);
      if (typeof v === 'boolean') f.update(v, this.ms);
    }
  }

  /** Zustandsgrößen; ändern sich nur im Mechanikschritt, LevelRun fragt jede ms */
  state(): Record<string, number> {
    if (this.stateCache && this.stateAt === this.world.time) return this.stateCache;
    this.stateAt = this.world.time;
    this.stateCache = this.computeState();
    return this.stateCache;
  }

  private computeState(): Record<string, number> {
    const w = this.world;
    const t = w.tally();
    let missorted = 0;
    for (const p of w.parts) if (p.type === 'bin') missorted += w.st(p).missorted;
    const out: Record<string, number> = {
      spawned: w.spawned,
      binned: t.binned,
      lost: t.lost,
      missorted,
    };
    for (const [p, key] of this.stateKeys) {
      if (p.type === 'bin') out[key] = w.st(p).total;
      else out[key] = Math.round(w.levelOf(p) * 10) / 10;
    }
    return out;
  }

  /** Bedienelement betätigen (Handbetrieb in der Anlagenansicht) */
  setControl(ref: string, value: number | boolean): void {
    this.world.setControl(ref, value);
    this.refresh();
  }

  private refresh(): void {
    // gleiches Objekt weiterverwenden: wird jede ms gelesen
    const next = this.cache;
    for (const c of this.conns) {
      const v = withFault(c, this.read(c.part, c.io.key));
      if (v !== undefined) next[c.device.id] = v;
      else delete next[c.device.id];
    }
  }

  /** Analogeingang mit Drahtbruch: Geberfehler wie in der Kampagne (4–20 mA: 32767) */
  fault(deviceId: string): FaultKind | undefined {
    const c = this.conns.find((x) => x.device.id === deviceId);
    return c?.io.kind === 'AI' && c.part.fault === 'drahtbruch' ? 'break' : undefined;
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
    if (SENSOR_TYPES.has(p.type)) return this.sensed(p.id);
    return undefined;
  }
}

/**
 * Störungen digitaler Eingänge als elektrischer Wert: dauernd 0, dauernd 1, Drahtbruch (= 0).
 * Zurückgegeben wird der Wert vor der Öffner-Umkehr, die `LevelRun` anwendet.
 */
function withFault(c: Connection, v: number | boolean | undefined): number | boolean | undefined {
  const f = c.part.fault;
  if (!f || c.io.kind !== 'DI') return v;
  const electrical = f === 'dauer1';
  if (f !== 'dauer0' && f !== 'dauer1' && f !== 'drahtbruch') return v;
  return c.io.nc ? !electrical : electrical;
}

/**
 * Schaltausgang eines Sensors: folgt dem Rohwert erst, wenn er `responseMs` lang ansteht;
 * mechanische Kontakte prellen nach jeder Flanke 2…6-mal im Abstand von 1…3 ms.
 */
class DiFilter {
  private out = false;
  private target = false;
  private since = 0;
  private toggles: number[] = [];

  constructor(
    private readonly responseMs: number,
    private readonly rng?: Rng,
  ) {}

  update(raw: boolean, t: number): void {
    if (raw !== this.target) {
      this.target = raw;
      this.since = t;
    }
    if (this.out !== this.target && t - this.since >= this.responseMs) {
      this.out = this.target;
      if (this.rng) {
        const n = 2 * this.rng.int(1, 3);
        let at = t;
        this.toggles = [];
        for (let i = 0; i < n; i++) this.toggles.push((at += this.rng.int(1, 3)));
      }
    }
  }

  value(t: number): boolean {
    let flips = 0;
    for (const at of this.toggles) if (at <= t) flips++;
    if (flips === this.toggles.length) this.toggles = [];
    return flips % 2 ? !this.out : this.out;
  }
}

registerPlantModel(
  'sandbox',
  (p, _level, seed) =>
    new SandboxPlant(p.layout as Layout, seed, (p.controls as ControlStep[]) ?? []),
);

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
