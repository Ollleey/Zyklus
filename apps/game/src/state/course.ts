import { platform } from '@zyklus/platform';

/** Grundkurs: erledigte Lektionen und gewählter Einstieg (Einsteiger oder mit Vorkenntnissen) */
const DONE_KEY = 'zyklus.grundkurs';
const START_KEY = 'zyklus.einstieg';

export type Start = 'anfaenger' | 'profi';

export function loadDone(): string[] {
  try {
    const raw = platform.storage.getItem(DONE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveDone(done: string[]): void {
  try {
    platform.storage.setItem(DONE_KEY, JSON.stringify(done));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** gewählter Einstieg; `null` = noch nicht gefragt */
export function loadStart(): Start | null {
  try {
    const v = platform.storage.getItem(START_KEY);
    return v === 'anfaenger' || v === 'profi' ? v : null;
  } catch {
    return null;
  }
}

export function saveStart(s: Start): void {
  try {
    platform.storage.setItem(START_KEY, s);
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** Einsteigermodus: ausführlichere Schrittkarte in der Einführung */
export const isBeginner = () => loadStart() === 'anfaenger';
