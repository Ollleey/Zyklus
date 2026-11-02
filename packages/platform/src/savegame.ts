import { z } from 'zod';
import type { SyncStore } from './types';

/**
 * Gesamter Spielstand in einer Datei (`spielstand-export.json`): Fortschritt, Lösungen,
 * Einstellungen, eigene Aufträge, Sandkasten und alle Anlagen. Damit zieht ein Spielstand vom
 * Browser in die Desktop-Anwendung um (deren WebView hat einen eigenen Speicher).
 */
export const SAVEGAME_FORMAT = 'zyklus-spielstand';
export const SAVEGAME_VERSION = 1;

/** Schlüssel, die nur für ein Gerät gelten und nicht mitwandern */
const LOCAL_ONLY = /^zyklus\.desktop\./;

const SavegameSchema = z.object({
  format: z.literal(SAVEGAME_FORMAT),
  formatVersion: z.number().int().min(1),
  exported: z.string().default(''),
  source: z.enum(['web', 'desktop']).default('web'),
  entries: z.record(
    z.string().regex(/^zyklus\./, 'Schlüssel muss mit „zyklus.“ beginnen'),
    z.string(),
  ),
});

export interface Savegame {
  format: typeof SAVEGAME_FORMAT;
  formatVersion: number;
  exported: string;
  source: 'web' | 'desktop';
  entries: Record<string, string>;
}

export function exportSavegame(
  store: SyncStore,
  source: 'web' | 'desktop',
  now = new Date(),
): string {
  const entries: Record<string, string> = {};
  for (const k of store.keys().sort()) {
    if (!k.startsWith('zyklus.') || LOCAL_ONLY.test(k)) continue;
    const v = store.getItem(k);
    if (v !== null) entries[k] = v;
  }
  const file: Savegame = {
    format: SAVEGAME_FORMAT,
    formatVersion: SAVEGAME_VERSION,
    exported: now.toISOString(),
    source,
    entries,
  };
  return JSON.stringify(file, null, 2);
}

export type ParsedSavegame = { ok: true; savegame: Savegame } | { ok: false; error: string };

export function parseSavegame(text: string): ParsedSavegame {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if ((data as { format?: unknown })?.format !== SAVEGAME_FORMAT) {
    return { ok: false, error: 'Das ist kein ZYKLUS-Spielstand (spielstand-export.json).' };
  }
  const v = (data as { formatVersion?: unknown }).formatVersion;
  if (typeof v === 'number' && v > SAVEGAME_VERSION) {
    return { ok: false, error: 'Der Spielstand stammt aus einer neueren Version des Spiels.' };
  }
  const r = SavegameSchema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0]!;
    const where = i.path.length ? `„${i.path.join('.')}“: ` : '';
    return { ok: false, error: `Der Spielstand ist fehlerhaft: ${where}${i.message}` };
  }
  // jeder Eintrag ist gespeichertes JSON bzw. ein einfacher Wert; kaputte Einträge abweisen
  for (const [k, val] of Object.entries(r.data.entries)) {
    if (/^\s*[[{]/.test(val)) {
      try {
        JSON.parse(val);
      } catch {
        return {
          ok: false,
          error: `Der Spielstand ist fehlerhaft: Eintrag „${k}“ ist beschädigt.`,
        };
      }
    }
  }
  return { ok: true, savegame: { ...r.data, format: SAVEGAME_FORMAT } };
}

/**
 * Spielstand übernehmen: ersetzt alle mitwandernden Einträge. Gerätebezogene Einstellungen
 * (`zyklus.desktop.*`) bleiben. Liefert die Zahl der übernommenen Einträge.
 */
export function applySavegame(store: SyncStore, s: Savegame): number {
  for (const k of store.keys())
    if (k.startsWith('zyklus.') && !LOCAL_ONLY.test(k)) store.removeItem(k);
  let n = 0;
  for (const [k, v] of Object.entries(s.entries)) {
    if (LOCAL_ONLY.test(k)) continue;
    store.setItem(k, v);
    n++;
  }
  return n;
}
