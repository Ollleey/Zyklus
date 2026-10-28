import { validateLevel, type Level } from '@zyklus/sim-core';
import level01 from '../data/01-foerderband.json';
import level02 from '../data/02-zweihand.json';
import level03 from '../data/03-stromstoss.json';

export * from './compile';

/** Alle Aufträge der Kampagne, sortiert. Wird beim Laden validiert. */
export const LEVELS: Level[] = [level01, level02, level03]
  .map((l) => validateLevel(l))
  .sort((a, b) => a.order - b.order);

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}
