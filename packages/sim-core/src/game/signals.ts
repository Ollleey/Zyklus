import { Rng, deriveSeed } from '../prng';
import type { AnalogSpec, Device, Edge, FaultKind } from './level';

/** S7-Normbereich und Sonderwerte */
export const RAW_NOMINAL = 27648;
export const RAW_OVERRANGE = 32511;
export const RAW_UNDERRANGE = -4864;
export const RAW_OVERFLOW = 32767;
export const RAW_UNDERFLOW = -32768;

/** Physikalischer Wert → Rohwert 0…27648 (Über-/Untersteuerbereich begrenzt wie bei S7). */
export function toRaw(v: number, a: AnalogSpec): number {
  const raw = Math.round(((v - a.min) / (a.max - a.min)) * RAW_NOMINAL);
  return Math.max(RAW_UNDERRANGE, Math.min(RAW_OVERRANGE, raw));
}

export function fromRaw(raw: number, a: AnalogSpec): number {
  return a.min + (raw / RAW_NOMINAL) * (a.max - a.min);
}

/** Linear interpolierter Wert einer Punktfolge (vor dem ersten Punkt: erster Wert). */
export function interpolate(points: Edge[], t: number, initial = 0): number {
  if (!points.length) return initial;
  if (t <= points[0]![0]) return points[0]![1] as number;
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i]! as [number, number];
    if (t <= t1) {
      const [t0, v0] = points[i - 1]! as [number, number];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1]![1] as number;
}

export function faultAt(
  faults: [number, number, FaultKind][] | undefined,
  t: number,
): FaultKind | undefined {
  return faults?.find(([a, b]) => t >= a && t < b)?.[2];
}

/**
 * Störungen eines Analogeingangs. Muss genau einmal je ms aufgerufen werden, damit die
 * Zufallsfolge (Seed) reproduzierbar bleibt.
 */
export class AnalogDisturbance {
  private readonly rng: Rng;

  constructor(
    private readonly device: Device,
    seed: number,
  ) {
    this.rng = new Rng(deriveSeed(seed, `analog:${device.id}`));
  }

  /** Rohwert mit Rauschen, Ausreißern und Geberfehlern */
  apply(cleanRaw: number, fault: FaultKind | undefined): number {
    const a = this.device.analog!;
    let raw = cleanRaw;
    if (a.noise) raw += this.rng.gaussian(0, a.noise);
    if (a.spikes && this.rng.chance(a.spikes.perSecond / 1000)) {
      raw += (this.rng.chance(0.5) ? 1 : -1) * a.spikes.amplitude;
    }
    if (fault === 'break' || fault === 'overflow') return RAW_OVERFLOW;
    if (fault === 'underflow') return RAW_UNDERFLOW;
    return Math.max(RAW_UNDERFLOW, Math.min(RAW_OVERFLOW, Math.round(raw)));
  }
}

/** Wert eines stückweise konstanten Signals zum Zeitpunkt t (vor der ersten Flanke: `initial`). */
export function valueAt(
  edges: Edge[],
  t: number,
  initial: boolean | number = false,
): boolean | number {
  let lo = 0;
  let hi = edges.length - 1;
  let v = initial;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid]![0] <= t) {
      v = edges[mid]![1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return v;
}

/** Entfernt Flanken ohne Wertänderung. */
export function compact(edges: Edge[], initial: boolean | number = false): Edge[] {
  const out: Edge[] = [];
  let last = initial;
  for (const e of edges) {
    if (e[1] === last) continue;
    out.push(e);
    last = e[1];
  }
  return out;
}

/**
 * Elektrisches Signal eines Eingangsgeräts aus seiner Betätigung:
 * Prellen (reproduzierbar über Seed) und Öffner-Logik (NC = invertiert).
 */
export function inputSignal(device: Device, actuation: Edge[], seed: number): Edge[] {
  const rng = new Rng(deriveSeed(seed, `prellen:${device.id}`));
  const physical = compact(actuation);
  let edges: Edge[] = [];
  physical.forEach(([t, v], i) => {
    edges.push([t, v]);
    const b = device.bounce;
    if (!b || typeof v !== 'boolean') return;
    const next = physical[i + 1]?.[0] ?? Infinity;
    let toggles = rng.int(b.minToggles, b.maxToggles);
    toggles -= toggles % 2; // gerade Anzahl: Endzustand bleibt v
    let at = t;
    let state = v;
    const bounce: Edge[] = [];
    for (let k = 0; k < toggles; k++) {
      at += rng.int(b.gapMs[0], b.gapMs[1]);
      state = !state;
      bounce.push([at, state]);
    }
    // nur vollständige Paare übernehmen, die vor der nächsten Betätigung liegen
    while (bounce.length && bounce[bounce.length - 1]![0] >= next) bounce.splice(-2, 2);
    edges.push(...bounce);
  });
  if (device.nc) edges = edges.map(([t, v]) => [t, typeof v === 'boolean' ? !v : v]);
  // Ruhezustand explizit bei t = 0, damit das Signal ohne Vorwissen lesbar ist
  const rest: boolean | number = device.kind === 'AI' ? 0 : !!device.nc;
  const result = compact(edges, rest);
  return result[0]?.[0] === 0 ? result : [[0, rest], ...result];
}
