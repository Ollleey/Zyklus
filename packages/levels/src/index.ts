import { validateLevel, type Level } from '@zyklus/sim-core';
import level01 from '../data/01-foerderband.json';
import level02 from '../data/02-zweihand.json';
import level03 from '../data/03-stromstoss.json';
import level04 from '../data/04-ampel.json';
import level05 from '../data/05-zaehler.json';
import level06 from '../data/06-stern-dreieck.json';
import level07 from '../data/07-tank.json';
import level08 from '../data/08-drahtbruch.json';
import level09 from '../data/09-mittelwert.json';
import level10 from '../data/10-bohrstation.json';
import level11 from '../data/11-sortierweiche.json';
import level12 from '../data/12-pwm.json';
import level13 from '../data/13-koppel.json';
import level14 from '../data/14-impulse.json';
import level15 from '../data/15-pi-regler.json';
import level16 from '../data/16-zwei-behaelter.json';
import level17 from '../data/17-frequenzumrichter.json';

export * from './compile';

/** Alle Aufträge der Kampagne, sortiert. Wird beim Laden validiert. */
export const LEVELS: Level[] = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
  level11,
  level12,
  level13,
  level14,
  level15,
  level16,
  level17,
]
  .map((l) => validateLevel(l))
  .sort((a, b) => a.order - b.order);

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}
