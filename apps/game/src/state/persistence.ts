import { emptySolution, type Solution } from '@zyklus/sim-core';

const SOLUTION_KEY = (levelId: string) => `zyklus.loesung.${levelId}`;
const PROGRESS_KEY = 'zyklus.fortschritt';

export interface Best {
  cost: number;
  energy: number;
  size: number;
}

export interface LevelProgress {
  solved: boolean;
  best?: Best;
}

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

export function loadSolution(levelId: string): Solution {
  const s = read<Solution>(SOLUTION_KEY(levelId));
  return s?.version === 1 ? s : emptySolution();
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

/** Speichert einen bestandenen Lauf; Bestwerte je Metrik getrennt. */
export function recordSolved(levelId: string, m: Best): Record<string, LevelProgress> {
  const all = loadProgress();
  const prev = all[levelId]?.best;
  all[levelId] = {
    solved: true,
    best: prev
      ? {
          cost: Math.min(prev.cost, m.cost),
          energy: Math.min(prev.energy, m.energy),
          size: Math.min(prev.size, m.size),
        }
      : m,
  };
  write(PROGRESS_KEY, all);
  return all;
}
