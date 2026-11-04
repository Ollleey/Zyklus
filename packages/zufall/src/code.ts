/**
 * Auftragscode eines Zufallsauftrags, z. B. `SGN-4K7Q2M`: Bauplan, Schwierigkeit, Variante und
 * 30 Bit Startwert (Crockford-Base32). Gleicher Code ergibt überall denselben Auftrag.
 */

export type Blueprint = 'S' | 'T';
export type Difficulty = 'L' | 'G' | 'M';
/** N = neue Anlage programmieren, F = Bestandsanlage mit eingebautem Fehler */
export type Variant = 'N' | 'F';

export interface JobCode {
  blueprint: Blueprint;
  difficulty: Difficulty;
  variant: Variant;
  seed: number;
}

export const BLUEPRINTS: Blueprint[] = ['S', 'T'];
export const DIFFICULTIES: Difficulty[] = ['L', 'G', 'M'];
export const VARIANTS: Variant[] = ['N', 'F'];

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_BITS = 30;

export function formatCode(c: JobCode): string {
  let s = '';
  let v = c.seed >>> 0;
  for (let i = 0; i < SEED_BITS / 5; i++) {
    s = ALPHA[v & 31] + s;
    v >>>= 5;
  }
  return `${c.blueprint}${c.difficulty}${c.variant}-${s}`;
}

/** Code einlesen; verwechselbare Zeichen (O/0, I/L/1) und Leerzeichen sind erlaubt */
export function parseCode(text: string): JobCode | null {
  const t = text.toUpperCase().replace(/[\s_]/g, '');
  const m = /^([ST])([LGM])([NF])-?([0-9A-Z]{6})$/.exec(t);
  if (!m) return null;
  let seed = 0;
  for (const ch of m[4]!.replace(/O/g, '0').replace(/[IL]/g, '1')) {
    const k = ALPHA.indexOf(ch);
    if (k < 0) return null;
    seed = seed * 32 + k;
  }
  return {
    blueprint: m[1] as Blueprint,
    difficulty: m[2] as Difficulty,
    variant: m[3] as Variant,
    seed,
  };
}

/** neuer Code; fehlende Angaben zufällig */
export function randomCode(
  opts: Partial<Omit<JobCode, 'seed'>> = {},
  random: () => number = Math.random,
): JobCode {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]!;
  return {
    blueprint: opts.blueprint ?? pick(BLUEPRINTS),
    difficulty: opts.difficulty ?? pick(DIFFICULTIES),
    variant: opts.variant ?? 'N',
    seed: Math.floor(random() * 2 ** SEED_BITS),
  };
}

/** Tagesauftrag: für alle am selben Tag derselbe Code */
export function dailyCode(date: Date): JobCode {
  const day = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  // einfache Streuung (xorshift), damit benachbarte Tage verschieden aussehen
  let x = (day * 2654435761) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return {
    blueprint: BLUEPRINTS[x % BLUEPRINTS.length]!,
    difficulty: DIFFICULTIES[(x >>> 4) % 3]!,
    variant: (x >>> 8) % 3 === 0 ? 'F' : 'N',
    seed: (x >>> 2) & (2 ** SEED_BITS - 1),
  };
}
