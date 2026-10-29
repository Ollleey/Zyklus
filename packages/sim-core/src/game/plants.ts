import type { Value } from '../types';
import type { Device, Edge, Level, TestCase } from './level';
import { fromRaw, valueAt } from './signals';

/**
 * Dynamisches Anlagenmodell: liefert physikalische Werte für Eingangsgeräte und rechnet mit den
 * Ausgängen der Steuerung weiter. Zeitschritt 1 ms, deterministisch.
 */
export interface Plant {
  /** physikalische Werte der Messgeräte zum aktuellen Zeitpunkt */
  inputs(): Record<string, number | boolean>;
  /** einen Zeitschritt (1 ms) mit den Ausgangswerten (nach Relaisverzögerung) weiterrechnen */
  step(t: number, outputs: Record<string, Value>): void;
  /** Zustandsgrößen für Kriterien und Darstellung (`plant.<name>`) */
  state(): Record<string, number>;
}

type Params = Record<string, unknown>;

/** Rundungsreserve für Endlagen (Positionen werden in Bruchteilen je ms aufaddiert) */
const EPS = 1e-6;

/**
 * Tank mit Zulaufpumpe und veränderlichem Ablauf (Angaben in % Füllstand je Sekunde).
 * params: sensor, pump, inflow, level0, outflow (Edge[] in %/s)
 */
class Tank implements Plant {
  private level: number;
  private readonly sensor: string;
  private readonly pump: string;
  private readonly inflow: number;
  private readonly outflow: Edge[];

  constructor(p: Params) {
    this.sensor = String(p.sensor);
    this.pump = String(p.pump);
    this.inflow = Number(p.inflow ?? 10);
    this.level = Number(p.level0 ?? 50);
    this.outflow = (p.outflow as Edge[]) ?? [[0, 4]];
  }

  inputs() {
    return { [this.sensor]: this.level };
  }

  step(t: number, outputs: Record<string, Value>) {
    const q =
      (outputs[this.pump] === true ? this.inflow : 0) - (valueAt(this.outflow, t, 0) as number);
    this.level = Math.min(100, Math.max(0, this.level + q / 1000));
  }

  state() {
    return { level: Math.round(this.level * 100) / 100 };
  }
}

/**
 * Bohrstation: Spannzylinder, Bohrmotor und Vorschub (Senken/Heben). Position 0 = oben,
 * 100 = Bohrtiefe; ab 60 steckt der Bohrer im Werkstück.
 * params: up, down, clamped (Sensoren), clamp, motor, lower, raise (Ausgänge),
 * downSpeed, upSpeed (%/s), clampMs (Spannzeit), dwellMs (Mindestverweilzeit unten)
 */
class Drill implements Plant {
  private pos = 0;
  private clamp = 0;
  private dwell = 0;
  private visited = false;
  private holes = 0;
  private bad = 0;
  private damage = 0;
  private readonly ids: Record<
    'up' | 'down' | 'clamped' | 'clamp' | 'motor' | 'lower' | 'raise',
    string
  >;
  private readonly downSpeed: number;
  private readonly upSpeed: number;
  private readonly clampMs: number;
  private readonly dwellMs: number;

  constructor(p: Params) {
    this.ids = {
      up: String(p.up),
      down: String(p.down),
      clamped: String(p.clamped),
      clamp: String(p.clamp),
      motor: String(p.motor),
      lower: String(p.lower),
      raise: String(p.raise),
    };
    this.downSpeed = Number(p.downSpeed ?? 100);
    this.upSpeed = Number(p.upSpeed ?? 200);
    this.clampMs = Number(p.clampMs ?? 150);
    this.dwellMs = Number(p.dwellMs ?? 200);
  }

  inputs() {
    return {
      [this.ids.up]: this.pos <= EPS,
      [this.ids.down]: this.pos >= 100 - EPS,
      [this.ids.clamped]: this.clamp >= 1,
    };
  }

  step(_t: number, out: Record<string, Value>) {
    const on = (id: string) => out[id] === true;
    const lower = on(this.ids.lower);
    const raise = on(this.ids.raise);
    const motor = on(this.ids.motor);
    // Spannzylinder fährt in clampMs aus und doppelt so schnell zurück
    this.clamp = on(this.ids.clamp)
      ? Math.min(1, this.clamp + 1 / this.clampMs)
      : Math.max(0, this.clamp - 2 / this.clampMs);
    let v = 0;
    if (lower && raise) this.damage = 1;
    else if (lower) v = this.downSpeed / 1000;
    else if (raise) v = -this.upSpeed / 1000;
    const inPart = this.pos >= 60;
    // Werkstück lose bzw. Bohrer steht im Material
    if (inPart && (v !== 0 || motor) && this.clamp < 1) this.damage = 1;
    if (inPart && v > 0 && !motor) this.damage = 1;
    this.pos = Math.min(100, Math.max(0, this.pos + v));
    if (this.pos >= 100 - EPS) {
      this.visited = true;
      if (motor) this.dwell++;
    }
    if (this.pos <= EPS && this.visited) {
      if (this.dwell >= this.dwellMs) this.holes++;
      else this.bad++;
      this.visited = false;
      this.dwell = 0;
    }
  }

  state() {
    return {
      pos: Math.round(this.pos * 10) / 10,
      clamp: Math.round(this.clamp * 100) / 100,
      holes: this.holes,
      bad: this.bad,
      damage: this.damage,
    };
  }
}

/**
 * Sortierstrecke mit Dauerlauf-Band: Pakete passieren die Messlichtschranke (mit
 * Höhenmessung), nach `travelMs` die Lichtschranke vor der Weiche. Am Ende dieser
 * Lichtschranke entscheidet die Weichenstellung: hohe Pakete (über `threshold`) zur Seite.
 * params: measure, height, gate (Sensoren), diverter (Ausgang), packages ([t, Höhe in mm][]),
 * travelMs, lengthMs, threshold
 */
class Sorter implements Plant {
  private readonly packages: [number, number][];
  private readonly ids: Record<'measure' | 'height' | 'gate' | 'diverter', string>;
  private readonly travel: number;
  private readonly length: number;
  private readonly threshold: number;
  private t = 0;
  private sorted = 0;
  private wrong = 0;

  constructor(p: Params) {
    this.packages = (p.packages as [number, number][]) ?? [];
    this.ids = {
      measure: String(p.measure),
      height: String(p.height),
      gate: String(p.gate),
      diverter: String(p.diverter),
    };
    this.travel = Number(p.travelMs ?? 900);
    this.length = Number(p.lengthMs ?? 250);
    this.threshold = Number(p.threshold ?? 120);
  }

  private under(offset: number): [number, number] | undefined {
    return this.packages.find(
      ([t0]) => this.t >= t0 + offset && this.t < t0 + offset + this.length,
    );
  }

  inputs() {
    const m = this.under(0);
    return {
      [this.ids.measure]: !!m,
      [this.ids.height]: m ? m[1] : 0,
      [this.ids.gate]: !!this.under(this.travel),
    };
  }

  step(t: number, out: Record<string, Value>) {
    this.t = t + 1;
    for (const [t0, h] of this.packages) {
      if (t0 + this.travel + this.length !== t) continue;
      if ((out[this.ids.diverter] === true) === h > this.threshold) this.sorted++;
      else this.wrong++;
    }
  }

  state() {
    return { sorted: this.sorted, wrong: this.wrong };
  }
}

/**
 * Wärmestrecke 1. Ordnung (PT1) mit Totzeit: T' = (Tumg + K·u(t − Tt) − Verlust − T) / τ.
 * params: sensor (AI, °C), heater (AO, %), tau (ms), gain (°C bei 100 %), ambient, temp0,
 * deadMs (Totzeit), loss (Edge[]: zusätzliche Wärmeverluste in °C)
 */
class Thermal implements Plant {
  private temp: number;
  private heat = 0;
  private readonly sensor: string;
  private readonly heater: string;
  private readonly heaterDev?: Device;
  private readonly tau: number;
  private readonly gain: number;
  private readonly ambient: number;
  private readonly loss: Edge[];
  /** Ringpuffer der Heizleistung für die Totzeit */
  private readonly delay: number[];
  private head = 0;

  constructor(p: Params, level: Level) {
    this.sensor = String(p.sensor);
    this.heater = String(p.heater);
    this.heaterDev = level.devices.find((d) => d.id === this.heater);
    this.tau = Number(p.tau ?? 8000);
    this.gain = Number(p.gain ?? 100);
    this.ambient = Number(p.ambient ?? 20);
    this.temp = Number(p.temp0 ?? this.ambient);
    this.loss = (p.loss as Edge[]) ?? [];
    this.delay = new Array(Math.max(0, Number(p.deadMs ?? 0))).fill(0);
  }

  inputs() {
    return { [this.sensor]: this.temp };
  }

  step(t: number, out: Record<string, Value>) {
    const raw = Number(out[this.heater] ?? 0);
    const a = this.heaterDev?.analog;
    this.heat = Math.max(0, Math.min(100, a ? fromRaw(raw, a) : raw));
    let u = this.heat;
    if (this.delay.length) {
      u = this.delay[this.head]!;
      this.delay[this.head] = this.heat;
      this.head = (this.head + 1) % this.delay.length;
    }
    const target = this.ambient + (this.gain * u) / 100 - (valueAt(this.loss, t, 0) as number);
    this.temp += (target - this.temp) / this.tau;
  }

  state() {
    return { temp: Math.round(this.temp * 100) / 100, heat: Math.round(this.heat * 10) / 10 };
  }
}

/** Zwei unabhängige Behälter (params a, b wie beim Tank); Zustand levelA, levelB */
class TwoTanks implements Plant {
  private readonly a: Tank;
  private readonly b: Tank;

  constructor(p: Params) {
    this.a = new Tank((p.a as Params) ?? {});
    this.b = new Tank((p.b as Params) ?? {});
  }

  inputs() {
    return { ...this.a.inputs(), ...this.b.inputs() };
  }

  step(t: number, out: Record<string, Value>) {
    this.a.step(t, out);
    this.b.step(t, out);
  }

  state() {
    return { levelA: this.a.state().level, levelB: this.b.state().level };
  }
}

/**
 * Antrieb am Frequenzumrichter ohne eigene Rampe: Mit Freigabe folgt die Frequenz sofort dem
 * analogen Sollwert, ohne Freigabe trudelt der Motor aus. Ändert sich die Frequenz unter Freigabe
 * schneller als `maxRate` (Hz/s, gemessen über 100 ms), zählt das als Überlastung.
 * params: setpoint (AO, Hz), enable (DO), feedback (AI, Hz), maxRate, coast (Hz/s)
 */
class Drive implements Plant {
  private freq = 0;
  private overload = 0;
  private hot = false;
  private readonly history: number[] = new Array(100).fill(0);
  private head = 0;
  private readonly ids: Record<'setpoint' | 'enable' | 'feedback', string>;
  private readonly spec?: Device;
  private readonly maxRate: number;
  private readonly coast: number;

  constructor(p: Params, level: Level) {
    this.ids = {
      setpoint: String(p.setpoint),
      enable: String(p.enable),
      feedback: String(p.feedback),
    };
    this.spec = level.devices.find((d) => d.id === this.ids.setpoint);
    this.maxRate = Number(p.maxRate ?? 15);
    this.coast = Number(p.coast ?? 25);
  }

  inputs() {
    return { [this.ids.feedback]: this.freq };
  }

  step(_t: number, out: Record<string, Value>) {
    const enabled = out[this.ids.enable] === true;
    const raw = Number(out[this.ids.setpoint] ?? 0);
    const a = this.spec?.analog;
    const target = Math.max(0, a ? fromRaw(raw, a) : raw);
    this.freq = enabled ? target : Math.max(0, this.freq - this.coast / 1000);
    const before = this.history[this.head]!;
    this.history[this.head] = this.freq;
    this.head = (this.head + 1) % this.history.length;
    const tooFast = enabled && Math.abs(this.freq - before) > this.maxRate * 0.1 + 0.05;
    if (tooFast && !this.hot) this.overload++;
    this.hot = tooFast;
  }

  state() {
    return { freq: Math.round(this.freq * 100) / 100, overload: this.overload };
  }
}

const MODELS: Record<string, (p: Params, level: Level) => Plant> = {
  tank: (p) => new Tank(p),
  tanks: (p) => new TwoTanks(p),
  drill: (p) => new Drill(p),
  sorter: (p) => new Sorter(p),
  thermal: (p, l) => new Thermal(p, l),
  drive: (p, l) => new Drive(p, l),
};

/** Anlagenmodell zu einem Level (Testparameter überschreiben Levelparameter), sonst undefined. */
export function createPlant(level: Level, test?: TestCase): Plant | undefined {
  const type = level.plant?.type;
  const make = type ? MODELS[type] : undefined;
  return make?.({ ...(level.plant?.params ?? {}), ...(test?.plant ?? {}) }, level);
}
