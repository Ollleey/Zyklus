import { parseAnlageFile, type AnlageMeta, type Layout } from '@zyklus/plant-sim';
import { platform } from '@zyklus/platform';

const CURRENT_KEY = 'zyklus.anlage.aktuell';
const META_KEY = 'zyklus.anlage.angaben';
const ACTIVE_KEY = 'zyklus.anlage.aktiv';
const LIST_KEY = 'zyklus.anlagen';

// Speicher über die Plattformschicht; Fehler nur für diese Sitzung
function read<T>(key: string): T | undefined {
  try {
    const raw = platform.storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === undefined) platform.storage.removeItem(key);
    else platform.storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** zuletzt bearbeitete Anlage des Sandkastens */
export function loadLayout(): Layout | undefined {
  const l = read<Layout>(CURRENT_KEY);
  return l && l.formatVersion === 1 && Array.isArray(l.parts) ? l : undefined;
}

export function saveLayout(l: Layout): void {
  write(CURRENT_KEY, l);
}

export function newMeta(now = new Date()): AnlageMeta {
  const iso = now.toISOString();
  return { name: 'Unbenannte Anlage', description: '', author: '', created: iso, modified: iso };
}

export function loadMeta(): AnlageMeta {
  return { ...newMeta(), ...read<Partial<AnlageMeta>>(META_KEY) };
}

export function saveMeta(m: AnlageMeta): void {
  write(META_KEY, m);
}

export function loadActive(): string | null {
  return read<string>(ACTIVE_KEY) ?? null;
}

export function saveActive(id: string | null): void {
  write(ACTIVE_KEY, id ?? undefined);
}

/** Eintrag in „Meine Anlagen“: die vollständige Anlagendatei und ein Vorschaubild */
export interface StoredAnlage {
  id: string;
  name: string;
  modified: string;
  thumbnail: string;
  file: string;
}

export function listAnlagen(): StoredAnlage[] {
  const l = read<StoredAnlage[]>(LIST_KEY);
  return Array.isArray(l) ? l : [];
}

function saveList(l: StoredAnlage[]): void {
  write(LIST_KEY, l);
}

export function newId(): string {
  return `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Eintrag anlegen oder ersetzen; neueste zuerst */
export function putAnlage(e: StoredAnlage): StoredAnlage[] {
  const list = [e, ...listAnlagen().filter((x) => x.id !== e.id)];
  saveList(list);
  return list;
}

export function removeAnlage(id: string): StoredAnlage[] {
  const list = listAnlagen().filter((x) => x.id !== id);
  saveList(list);
  return list;
}

export function renameAnlage(id: string, name: string): StoredAnlage[] {
  const list = listAnlagen().map((x) => {
    if (x.id !== id) return x;
    const parsed = parseAnlageFile(x.file);
    if (!parsed.ok) return { ...x, name };
    return { ...x, name, file: JSON.stringify({ ...JSON.parse(x.file), name }, null, 2) };
  });
  saveList(list);
  return list;
}

export function duplicateAnlage(id: string): StoredAnlage[] {
  const src = listAnlagen().find((x) => x.id === id);
  if (!src) return listAnlagen();
  const name = `${src.name} (Kopie)`;
  const file = JSON.stringify({ ...JSON.parse(src.file), name }, null, 2);
  return putAnlage({ ...src, id: newId(), name, file, modified: new Date().toISOString() });
}
