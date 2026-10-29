import {
  emptySolution,
  upgradeSolution,
  type Level,
  type Metrics,
  type Solution,
} from '@zyklus/sim-core';

const SOLUTION_KEY = (levelId: string) => `zyklus.loesung.${levelId}`;
const PROGRESS_KEY = 'zyklus.fortschritt';
const VERSION_KEY = 'zyklus.version';

/** Version des Speicherformats im localStorage. Bei Änderungen erhöhen und in `migrate` umbauen. */
export const STORAGE_VERSION = 3;

export type Best = Metrics;

export interface RunRecord extends Metrics {
  /** ISO-Zeitpunkt */
  at: string;
}

export interface LevelProgress {
  solved: boolean;
  /** Bestwert je Metrik (können aus verschiedenen Lösungen stammen) */
  best?: Best;
  /** letzte bestandene Prüfungen, neueste zuerst */
  history?: RunRecord[];
}

const HISTORY_LENGTH = 10;

// localStorage kann in privaten Fenstern fehlen oder werfen – das Spiel läuft dann ohne Speichern
function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speichern nicht möglich */
  }
}

/**
 * Hebt ältere Spielstände auf das aktuelle Format.
 * - Version 1 (ohne Versionsschlüssel): Fortschritt ohne Verlauf – Verlauf entsteht neu.
 * - Version 2 → 3: gespeicherte Lösungen vom groben Raster auf 15-mm-Rasterschritte umrechnen.
 */
export function migrate(levels: Pick<Level, 'id' | 'board'>[]): void {
  const v = read<number>(VERSION_KEY) ?? 1;
  if (v >= STORAGE_VERSION) return;
  if (v < 2) {
    const progress = read<Record<string, LevelProgress>>(PROGRESS_KEY) ?? {};
    for (const p of Object.values(progress)) p.history ??= [];
    write(PROGRESS_KEY, progress);
  }
  for (const level of levels) {
    const s = read<{ version?: unknown }>(SOLUTION_KEY(level.id));
    if (s?.version !== 1) continue;
    const up = upgradeSolution(level, s);
    if (up) write(SOLUTION_KEY(level.id), up);
  }
  write(VERSION_KEY, STORAGE_VERSION);
}

export function loadSolution(level: Pick<Level, 'id' | 'board'>): Solution {
  return (
    upgradeSolution(level, read<{ version?: unknown }>(SOLUTION_KEY(level.id))) ?? emptySolution()
  );
}

export function saveSolution(levelId: string, s: Solution): void {
  write(SOLUTION_KEY(levelId), s);
}

export function clearSolution(levelId: string): void {
  try {
    localStorage.removeItem(SOLUTION_KEY(levelId));
  } catch {
    /* egal */
  }
}

export function loadProgress(): Record<string, LevelProgress> {
  return read<Record<string, LevelProgress>>(PROGRESS_KEY) ?? {};
}

/** Speichert einen bestandenen Lauf; Bestwerte je Metrik getrennt, Verlauf der letzten Läufe. */
export function recordSolved(levelId: string, m: Metrics): Record<string, LevelProgress> {
  const all = loadProgress();
  const prev = all[levelId];
  const best = prev?.best
    ? {
        cost: Math.min(prev.best.cost, m.cost),
        energy: Math.min(prev.best.energy, m.energy),
        size: Math.min(prev.best.size, m.size),
      }
    : { ...m };
  const history = [{ ...m, at: new Date().toISOString() }, ...(prev?.history ?? [])].slice(
    0,
    HISTORY_LENGTH,
  );
  all[levelId] = { solved: true, best, history };
  write(PROGRESS_KEY, all);
  return all;
}
