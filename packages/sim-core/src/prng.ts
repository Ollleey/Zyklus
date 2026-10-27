/** FNV-1a über einen String (32 bit). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Leitet aus einem Basis-Seed und einem Namen (z. B. Kanal) einen unabhängigen Seed ab. */
export function deriveSeed(base: number, label: string): number {
  return hashString(`${base >>> 0}:${label}`);
}

/** Deterministischer Zufallsgenerator (mulberry32). Gleicher Seed → gleiche Folge, plattformunabhängig. */
export class Rng {
  private state: number;
  private spare: number | undefined;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** gleichverteilt in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** ganze Zahl in [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normalverteilt (Box-Muller) */
  gaussian(mean = 0, sd = 1): number {
    if (this.spare !== undefined) {
      const s = this.spare;
      this.spare = undefined;
      return mean + sd * s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  }
}
