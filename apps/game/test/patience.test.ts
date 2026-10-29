import { describe, expect, it } from 'vitest';
import {
  COLORS,
  deal,
  fits,
  isRun,
  maxRun,
  move,
  toRail,
  won,
  type Card,
  type Game,
} from '../src/patience/rules';

const c = (color: Card['color'], rank: number): Card => ({ color, rank });

describe('Klemmen-Patience', () => {
  it('teilt 40 verschiedene Klemmen reproduzierbar aus', () => {
    const g = deal(7);
    const all = g.columns.flat();
    expect(all).toHaveLength(40);
    expect(new Set(all.map((x) => `${x.color}${x.rank}`)).size).toBe(40);
    expect(g.columns.map((col) => col.length)).toEqual([7, 7, 7, 7, 6, 6]);
    expect(deal(7)).toEqual(g);
    expect(deal(8)).not.toEqual(g);
  });

  it('Kanalregel: nächstkleinerer Querschnitt, andere Farbgruppe', () => {
    expect(fits(c('grau', 3), c('braun', 4))).toBe(true);
    expect(fits(c('schwarz', 3), c('braun', 4))).toBe(false);
    expect(fits(c('grau', 2), c('braun', 4))).toBe(false);
    expect(isRun([c('braun', 5), c('blau', 4), c('schwarz', 3)], 0)).toBe(true);
    expect(isRun([c('braun', 5), c('blau', 4), c('grau', 3)], 0)).toBe(false);
  });

  const empty = (): Game => ({
    seed: 0,
    columns: [[], [], [], [], [], []],
    cells: [null, null],
    rails: [-1, -1, -1, -1],
    moves: 0,
  });

  it('Sammelschiene nur in Farbe und aufsteigend', () => {
    const g = { ...empty(), columns: [[c('blau', 0)], [c('blau', 1)], [], [], [], []] };
    expect(move(g, { kind: 'column', i: 1, index: 0 }, { kind: 'rail', i: 3 })).toBeNull();
    const a = toRail(g, { kind: 'column', i: 0, index: 0 })!;
    expect(a.rails[COLORS.indexOf('blau')]).toBe(0);
    const b = toRail(a, { kind: 'column', i: 1, index: 0 })!;
    expect(b.rails[3]).toBe(1);
    expect(b.moves).toBe(2);
  });

  it('Reihen ziehen ist durch freie Ablagen und Kanäle begrenzt', () => {
    const run = [c('braun', 9), c('grau', 8), c('schwarz', 7), c('blau', 6)];
    const g: Game = {
      ...empty(),
      columns: [
        run,
        [c('braun', 1)],
        [c('grau', 1)],
        [c('schwarz', 1)],
        [c('blau', 1)],
        [c('braun', 0)],
      ],
      cells: [c('grau', 0), c('blau', 0)],
    };
    expect(maxRun(g, true)).toBe(1);
    expect(move(g, { kind: 'column', i: 0, index: 2 }, { kind: 'column', i: 1 })).toBeNull();
    const freed = { ...g, cells: [null, null] };
    // zwei freie Ablagen: 3 Klemmen; Ziel muss passen
    expect(move(freed, { kind: 'column', i: 0, index: 1 }, { kind: 'column', i: 5 })).toBeNull();
    expect(maxRun(freed, false)).toBe(3);
  });

  it('Ablage nimmt eine Klemme, Ziel-Ablage muss frei sein', () => {
    const g = { ...empty(), columns: [[c('braun', 3), c('grau', 2)], [], [], [], [], []] };
    const a = move(g, { kind: 'column', i: 0, index: 1 }, { kind: 'cell', i: 0 })!;
    expect(a.cells[0]).toEqual(c('grau', 2));
    expect(move(a, { kind: 'column', i: 0, index: 0 }, { kind: 'cell', i: 0 })).toBeNull();
    expect(move(a, { kind: 'cell', i: 0 }, { kind: 'column', i: 0 })).not.toBeNull();
  });

  it('gewonnen, wenn alle Schienen voll sind', () => {
    expect(won({ ...empty(), rails: [9, 9, 9, 9] })).toBe(true);
    expect(won({ ...empty(), rails: [9, 9, 9, 8] })).toBe(false);
  });
});
