import { Rng } from '@zyklus/sim-core';

/**
 * Klemmen-Patience: 40 Reihenklemmen in vier Aderfarben und zehn Querschnitten.
 * Ziel: jede Farbe auf ihrer Sammelschiene aufsteigend von 0,5 mm² bis 25 mm² stecken.
 *
 * - Sechs Kabelkanäle, alle Klemmen offen ausgeteilt.
 * - Im Kanal liegt auf einer Klemme nur der nächstkleinere Querschnitt in einer Farbe der
 *   anderen Gruppe (dunkel: Braun, Schwarz – hell: Grau, Blau). Ein leerer Kanal nimmt jede Klemme.
 * - Zwei Ablagen halten je eine Klemme.
 * - Eine geordnete Reihe zieht man am Stück, wenn genug Ablagen und leere Kanäle frei sind.
 */

export const COLORS = ['braun', 'schwarz', 'grau', 'blau'] as const;
export type Color = (typeof COLORS)[number];
export const RANKS = ['0,5', '0,75', '1', '1,5', '2,5', '4', '6', '10', '16', '25'] as const;

export interface Card {
  color: Color;
  /** Index in RANKS */
  rank: number;
}

export interface Game {
  seed: number;
  columns: Card[][];
  cells: (Card | null)[];
  /** höchster gesteckter Querschnitt je Farbe (−1 = leer), Reihenfolge wie COLORS */
  rails: number[];
  moves: number;
}

export type Source = { kind: 'column'; i: number; index: number } | { kind: 'cell'; i: number };
export type Target = { kind: 'column' | 'cell' | 'rail'; i: number };

export const COLUMNS = 6;
export const CELLS = 2;

export const isDark = (c: Card) => c.color === 'braun' || c.color === 'schwarz';

/** Darf `card` im Kanal auf `onto` liegen? */
export const fits = (card: Card, onto: Card) =>
  card.rank === onto.rank - 1 && isDark(card) !== isDark(onto);

/** Mischt und teilt aus (Fisher-Yates mit festem Seed). */
export function deal(seed: number): Game {
  const deck: Card[] = COLORS.flatMap((color) => RANKS.map((_, rank) => ({ color, rank })));
  const rng = new Rng(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const columns: Card[][] = Array.from({ length: COLUMNS }, () => []);
  deck.forEach((c, i) => columns[i % COLUMNS]!.push(c));
  return { seed, columns, cells: new Array(CELLS).fill(null), rails: [-1, -1, -1, -1], moves: 0 };
}

/** Ist der Kanal ab `index` eine geordnete Reihe? */
export function isRun(col: Card[], index: number): boolean {
  for (let k = index + 1; k < col.length; k++) if (!fits(col[k]!, col[k - 1]!)) return false;
  return index >= 0 && index < col.length;
}

/** Längste Reihe, die auf einmal bewegt werden kann */
export function maxRun(g: Game, toEmptyColumn: boolean): number {
  const free = g.cells.filter((c) => !c).length;
  const empty = g.columns.filter((c) => !c.length).length - (toEmptyColumn ? 1 : 0);
  return (free + 1) * 2 ** Math.max(0, empty);
}

function picked(g: Game, s: Source): Card[] {
  if (s.kind === 'cell') {
    const c = g.cells[s.i];
    return c ? [c] : [];
  }
  const col = g.columns[s.i] ?? [];
  return isRun(col, s.index) ? col.slice(s.index) : [];
}

/** Führt einen Zug aus; null, wenn er nicht erlaubt ist. */
export function move(g: Game, s: Source, t: Target): Game | null {
  const cards = picked(g, s);
  if (!cards.length) return null;
  const first = cards[0]!;
  if (t.kind === 'cell') {
    if (cards.length !== 1 || g.cells[t.i] || (s.kind === 'cell' && s.i === t.i)) return null;
  } else if (t.kind === 'rail') {
    const ci = COLORS.indexOf(first.color);
    if (cards.length !== 1 || ci !== t.i || g.rails[ci] !== first.rank - 1) return null;
  } else {
    if (s.kind === 'column' && s.i === t.i) return null;
    const dest = g.columns[t.i]!;
    const top = dest[dest.length - 1];
    if (top && !fits(first, top)) return null;
    if (cards.length > maxRun(g, !top)) return null;
  }

  const next: Game = {
    ...g,
    columns: g.columns.map((c) => [...c]),
    cells: [...g.cells],
    rails: [...g.rails],
    moves: g.moves + 1,
  };
  if (s.kind === 'cell') next.cells[s.i] = null;
  else next.columns[s.i]!.splice(s.index);
  if (t.kind === 'cell') next.cells[t.i] = first;
  else if (t.kind === 'rail') next.rails[t.i] = first.rank;
  else next.columns[t.i]!.push(...cards);
  return next;
}

/** Klemme auf ihre Sammelschiene, falls möglich */
export function toRail(g: Game, s: Source): Game | null {
  const c = s.kind === 'cell' ? g.cells[s.i] : g.columns[s.i]?.[g.columns[s.i]!.length - 1];
  if (!c) return null;
  const src: Source =
    s.kind === 'cell' ? s : { kind: 'column', i: s.i, index: g.columns[s.i]!.length - 1 };
  return move(g, src, { kind: 'rail', i: COLORS.indexOf(c.color) });
}

export const won = (g: Game) => g.rails.every((r) => r === RANKS.length - 1);
