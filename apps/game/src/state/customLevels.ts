import { validateLevel, type Level, type Metrics } from '@zyklus/sim-core';

/** Eigene Aufträge aus dem Sandkasten (veröffentlicht oder importiert) */
const KEY = 'zyklus.eigeneAuftraege';
export const AUFTRAG_FORMAT = 'zyklus-auftrag';

export interface CustomLevel {
  level: Level;
  /** Kennzahlen der Lösung des Autors (Richtwerte) */
  par?: Metrics;
  author?: string;
}

export function listCustomLevels(): CustomLevel[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CustomLevel[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: CustomLevel[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** anlegen oder ersetzen (gleiche id) */
export function putCustomLevel(c: CustomLevel): CustomLevel[] {
  const list = [c, ...listCustomLevels().filter((x) => x.level.id !== c.level.id)];
  save(list);
  return list;
}

export function removeCustomLevel(id: string): CustomLevel[] {
  const list = listCustomLevels().filter((x) => x.level.id !== id);
  save(list);
  return list;
}

export function toAuftragFile(c: CustomLevel): string {
  return JSON.stringify({ format: AUFTRAG_FORMAT, formatVersion: 1, ...c }, null, 2);
}

export function parseAuftragFile(
  text: string,
): { ok: true; value: CustomLevel } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  const o = data as { format?: unknown; level?: unknown; par?: Metrics; author?: string };
  if (o?.format !== AUFTRAG_FORMAT)
    return { ok: false, error: 'Das ist keine ZYKLUS-Auftragsdatei (*.auftrag.json).' };
  try {
    const level = validateLevel(o.level);
    if (!level.id.startsWith('eigen-'))
      return { ok: false, error: 'Eigene Aufträge brauchen eine id mit „eigen-“.' };
    return { ok: true, value: { level, par: o.par, author: o.author } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
