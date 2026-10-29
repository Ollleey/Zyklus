import { Rng, hashString } from '../prng';
import type { MetricKey } from './level';

/**
 * Vergleichsverteilungen „anderer Spieler“. Sie werden lokal und deterministisch aus Level-id und
 * Richtwert erzeugt (keine Online-Daten): Die meisten Lösungen liegen etwas über dem Richtwert, ein
 * langer Schwanz deutlich darüber, wenige darunter.
 */

const SPREAD: Record<MetricKey, number> = { cost: 0.3, energy: 0.6, size: 0.7 };
const BELOW: Record<MetricKey, number> = { cost: 0.9, energy: 0.75, size: 0.7 };
export const SAMPLE_SIZE = 600;

export function fakeDistribution(
  levelId: string,
  metric: MetricKey,
  par: number,
  n = SAMPLE_SIZE,
): number[] {
  const rng = new Rng(hashString(`${levelId}:${metric}`));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let f: number;
    if (rng.chance(0.08)) {
      // wenige Spieler finden bessere Lösungen als die Referenz
      f = BELOW[metric] + rng.next() * (1 - BELOW[metric]);
    } else {
      f = 1 + Math.abs(rng.gaussian(0, SPREAD[metric]));
      if (rng.chance(0.15)) f += rng.next() * SPREAD[metric] * 3; // langer Schwanz
    }
    out.push(Math.max(1, Math.round(par * f)));
  }
  return out;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

export interface Histogram {
  bins: Bin[];
  min: number;
  max: number;
}

/** Teilt die Werte in gleich breite Klassen; `include` erweitert den Bereich (eigener Wert). */
export function histogram(values: number[], bins = 14, include: number[] = []): Histogram {
  const all = [...values, ...include];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const width = Math.max(1, (max - min) / bins);
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor((v - min) / width));
    out[i]!.count++;
  }
  return { bins: out, min, max: Math.max(max, min + width * bins) };
}

/** Anteil der Vergleichswerte, die schlechter (größer) sind als v – „besser als x %“. */
export function betterThan(values: number[], v: number): number {
  if (!values.length) return 0;
  return values.filter((x) => x > v).length / values.length;
}
