import type { PlacedModule, Solution } from './board';
import type { Level } from './level';
import { MODULE_TYPES } from './modules';

/**
 * Lösungen der Version 1 lagen auf einem groben Raster (CPU klein = 2, jede E/A-Baugruppe = 1).
 * Ab Version 2 ist ein Rasterschritt 15 mm (TE) und Baugruppen sind maßstäblich breit.
 */
export const SOLUTION_VERSION = 2;

/** Breiten im alten Raster – eingefroren, damit alte Stände immer gleich umgerechnet werden */
const LEGACY_WIDTH: Record<string, number> = {
  'cpu-klein': 2,
  'cpu-mittel': 3,
  'cpu-schnell': 3,
  di8: 1,
  do8: 1,
  di8hf: 1,
  ai2: 1,
  ao2: 1,
  rel4: 1,
  kop: 1,
};

/** Trennwand im alten Raster (nur Level mit Wand) */
const LEGACY_WALL: Record<string, number> = { '13-koppel': 5 };

/** Lücke von einem alten Rasterschritt wird zu so vielen TE */
const GAP_TE = 2;

export interface LegacySolution extends Omit<Solution, 'version'> {
  version: 1;
}

/**
 * Rechnet eine Lösung der Version 1 um: Baugruppen behalten ihre Reihenfolge und werden von links
 * neu gesetzt, Lücken bleiben proportional erhalten. Bei Leveln mit Trennwand wird jede Seite für
 * sich gesetzt. Was danach nicht auf die Schiene passt, bleibt stehen und wird von der
 * Schaltschrankprüfung gemeldet.
 */
export function migrateSolution(level: Pick<Level, 'id' | 'board'>, s: LegacySolution): Solution {
  const oldWall = LEGACY_WALL[level.id];
  const wall = level.board.wall;
  const place = (mods: PlacedModule[], oldStart: number, newStart: number): PlacedModule[] => {
    let oldEnd = oldStart;
    let newEnd = newStart;
    return [...mods]
      .sort((a, b) => a.x - b.x)
      .map((m) => {
        const gap = Math.max(0, m.x - oldEnd);
        const x = newEnd + gap * GAP_TE;
        oldEnd = m.x + (LEGACY_WIDTH[m.type] ?? 1);
        newEnd = x + (MODULE_TYPES[m.type]?.width ?? 1);
        return { ...m, x };
      });
  };
  let modules: PlacedModule[];
  if (oldWall !== undefined && wall !== undefined) {
    const left = s.modules.filter((m) => m.x < oldWall);
    const right = s.modules.filter((m) => m.x >= oldWall);
    modules = [...place(left, 0, 0), ...place(right, oldWall + 1, wall + WALL_WIDTH)];
  } else {
    modules = place(s.modules, 0, 0);
  }
  // Reihenfolge der Baugruppenliste wie gespeichert lassen (ids und Projekte bleiben gleich)
  const byId = new Map(modules.map((m) => [m.id, m]));
  return {
    ...s,
    version: SOLUTION_VERSION,
    modules: s.modules.map((m) => byId.get(m.id)!),
  };
}

/** Breite der Trennwand in TE */
export const WALL_WIDTH = 2;

/** Spalten [von, bis) der Trennwand oder undefined */
export function wallRange(board: { wall?: number }): [number, number] | undefined {
  return board.wall === undefined ? undefined : [board.wall, board.wall + WALL_WIDTH];
}

/** Lösung in beliebiger bekannter Version → aktuelle Version; undefined bei Unbekanntem. */
export function upgradeSolution(
  level: Pick<Level, 'id' | 'board'>,
  s: { version?: unknown } | undefined | null,
): Solution | undefined {
  if (!s) return undefined;
  if (s.version === SOLUTION_VERSION) return s as Solution;
  if (s.version === 1) return migrateSolution(level, s as LegacySolution);
  return undefined;
}
