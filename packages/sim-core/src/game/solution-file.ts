import type { Solution } from './board';
import type { Level } from './level';
import { SOLUTION_VERSION, upgradeSolution } from './migrate';

/**
 * Austauschformat für Lösungen (Export/Import als JSON-Datei).
 * Versioniert, damit spätere Spielstände alte Dateien weiter lesen können.
 */
export const SOLUTION_FORMAT = 'zyklus-loesung';
/** Version 2: Positionen im 15-mm-Raster (Version 1 wird beim Lesen umgerechnet) */
export const SOLUTION_FILE_VERSION = 2;

export interface SolutionFile {
  format: typeof SOLUTION_FORMAT;
  version: number;
  level: string;
  savedAt: string;
  solution: Solution;
}

export function toSolutionFile(level: string, solution: Solution, now = new Date()): string {
  const file: SolutionFile = {
    format: SOLUTION_FORMAT,
    version: SOLUTION_FILE_VERSION,
    level,
    savedAt: now.toISOString(),
    solution,
  };
  return JSON.stringify(file, null, 2);
}

export type ParsedSolutionFile =
  { ok: true; level: string; solution: Solution; savedAt?: string } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Prüft die Grobstruktur einer Lösung (Details meldet später die Schaltschrankprüfung). */
function checkSolution(s: unknown): string | undefined {
  if (!isObj(s)) return 'Lösung fehlt';
  if (s.version !== 1 && s.version !== SOLUTION_VERSION) {
    return `Unbekannte Lösungsversion ${String(s.version)}`;
  }
  if (!Array.isArray(s.modules)) return 'Baugruppenliste fehlt';
  for (const m of s.modules) {
    if (
      !isObj(m) ||
      typeof m.id !== 'string' ||
      typeof m.type !== 'string' ||
      typeof m.x !== 'number'
    ) {
      return 'Ungültige Baugruppe in der Datei';
    }
  }
  if (!Array.isArray(s.wires)) return 'Verdrahtung fehlt';
  for (const w of s.wires) {
    if (
      !isObj(w) ||
      typeof w.device !== 'string' ||
      typeof w.module !== 'string' ||
      typeof w.channel !== 'number'
    ) {
      return 'Ungültige Leitung in der Datei';
    }
  }
  if (!isObj(s.projects)) return 'Programme fehlen';
  for (const [cpu, p] of Object.entries(s.projects)) {
    if (!isObj(p) || !Array.isArray(p.tags) || !Array.isArray(p.blocks))
      return `Programm von ${cpu} ist unvollständig`;
  }
  return undefined;
}

/**
 * Liest eine Lösungsdatei; bei `expectedLevel` muss sie zu diesem Auftrag gehören.
 * Ältere Lösungen werden mit dem Auftrag aus `levelOf` auf das aktuelle Raster umgerechnet.
 */
export function parseSolutionFile(
  text: string,
  expectedLevel?: string,
  levelOf?: (id: string) => Pick<Level, 'id' | 'board'> | undefined,
): ParsedSolutionFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON' };
  }
  if (!isObj(data) || data.format !== SOLUTION_FORMAT) {
    return { ok: false, error: 'Das ist keine ZYKLUS-Lösungsdatei' };
  }
  if (typeof data.version !== 'number' || data.version > SOLUTION_FILE_VERSION) {
    return {
      ok: false,
      error: `Dateiversion ${String(data.version)} wird nicht unterstützt – Spiel aktualisieren`,
    };
  }
  if (typeof data.level !== 'string') return { ok: false, error: 'Auftrag fehlt in der Datei' };
  if (expectedLevel && data.level !== expectedLevel) {
    return { ok: false, error: `Die Datei gehört zu Auftrag „${data.level}“` };
  }
  const problem = checkSolution(data.solution);
  if (problem) return { ok: false, error: problem };
  const level = levelOf?.(data.level) ?? { id: data.level, board: { width: 0, ductCapacity: 0 } };
  const solution = upgradeSolution(level, data.solution as { version: number });
  if (!solution) return { ok: false, error: 'Lösung konnte nicht umgerechnet werden' };
  return {
    ok: true,
    level: data.level,
    solution,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : undefined,
  };
}
