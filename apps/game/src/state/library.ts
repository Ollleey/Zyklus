import { blockFingerprint, type CodeBlock, type PlcProject, type PlcType } from '@zyklus/sim-core';
import { platform } from '@zyklus/platform';

/**
 * Eigene Bibliothek: FBs, FCs und PLC-Datentypen aus gelösten Aufträgen, je Name mit Versionen.
 * Eingefügte Bausteine tragen Name, Version und Fingerabdruck – unverändert zählen sie nicht zur
 * Programmgröße.
 */
const KEY = 'zyklus.bibliothek';

function nextFreeNumber(used: number[]): number {
  const set = new Set(used);
  let n = 1;
  while (set.has(n)) n++;
  return n;
}

export type LibraryEntry =
  | {
      kind: 'block';
      name: string;
      version: number;
      block: CodeBlock;
      from?: string;
      savedAt: number;
    }
  | { kind: 'type'; name: string; version: number; type: PlcType; from?: string; savedAt: number };

export function listLibrary(): LibraryEntry[] {
  try {
    const raw = platform.storage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LibraryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: LibraryEntry[]): void {
  try {
    platform.storage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** neueste Version je Name */
export function latestEntries(list = listLibrary()): LibraryEntry[] {
  const best = new Map<string, LibraryEntry>();
  for (const e of list) {
    const k = `${e.kind}:${e.name.toLowerCase()}`;
    const cur = best.get(k);
    if (!cur || e.version > cur.version) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const nextVersion = (list: LibraryEntry[], kind: LibraryEntry['kind'], name: string) =>
  list
    .filter((e) => e.kind === kind && e.name.toLowerCase() === name.toLowerCase())
    .reduce((v, e) => Math.max(v, e.version), 0) + 1;

/** Baustein bzw. Datentyp als neue Version ablegen; liefert die Versionsnummer */
export function addToLibrary(item: CodeBlock | PlcType, from?: string): number {
  const list = listLibrary();
  const isBlock = 'kind' in item;
  const version = nextVersion(list, isBlock ? 'block' : 'type', item.name);
  const savedAt = Date.now();
  if (isBlock) {
    const { library: _, ...block } = item;
    list.push({ kind: 'block', name: item.name, version, block, from, savedAt });
  } else {
    list.push({
      kind: 'type',
      name: item.name,
      version,
      type: structuredClone(item),
      from,
      savedAt,
    });
  }
  save(list);
  return version;
}

export function removeFromLibrary(kind: LibraryEntry['kind'], name: string): void {
  save(listLibrary().filter((e) => !(e.kind === kind && e.name === name)));
}

/**
 * Eintrag ins Projekt übernehmen. Gibt es schon einen Baustein bzw. Typ dieses Namens, wird er
 * durch die Bibliotheksversion ersetzt (Aktualisieren).
 */
export function insertFromLibrary(project: PlcProject, e: LibraryEntry): PlcProject {
  if (e.kind === 'type') {
    const types = (project.types ?? []).filter(
      (t) => t.name.toLowerCase() !== e.name.toLowerCase(),
    );
    return { ...project, types: [...types, structuredClone(e.type)] };
  }
  const old = project.blocks.find((b) => b.name.toLowerCase() === e.name.toLowerCase());
  const block: CodeBlock = structuredClone(e.block);
  block.number =
    old && old.kind === block.kind
      ? old.number
      : nextFreeNumber(project.blocks.filter((b) => b.kind === block.kind).map((b) => b.number));
  block.library = { name: e.name, version: e.version, fingerprint: blockFingerprint(block) };
  return {
    ...project,
    blocks: [...project.blocks.filter((b) => b !== old), block],
  };
}
