import { Rng, deriveSeed } from '../prng';
import type { Device, Edge } from './level';

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
