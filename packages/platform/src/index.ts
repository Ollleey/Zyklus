import type { FileFilter, Platform } from './types';
import { webPlatform } from './web';

export type * from './types';
export { webPlatform, webStore } from './web';

/** Endungen der Spieldateien (neue Endung zuerst, ältere werden weiter gelesen) */
export const FILE_TYPES = {
  anlage: { name: 'ZYKLUS-Anlage', extensions: ['anlage', 'anlage.json'] },
  auftrag: { name: 'ZYKLUS-Auftrag', extensions: ['auftrag', 'auftrag.json'] },
  loesung: { name: 'ZYKLUS-Lösung', extensions: ['zyklus.json'] },
  scl: { name: 'SCL-Quelle', extensions: ['scl'] },
  export: { name: 'Spielstand', extensions: ['json'] },
} as const satisfies Record<string, FileFilter>;

/** Dateiname mit Endung der Plattform: Desktop `.anlage`/`.auftrag`, Browser `….json` */
export function platformFileName(name: string): string {
  return current.kind === 'desktop' ? name.replace(/\.(anlage|auftrag)\.json$/, '.$1') : name;
}

let current: Platform = webPlatform();

/** Die aktive Plattform; vor dem Laden der Oberfläche mit `setPlatform` festlegen. */
export const platform: Platform = {
  get kind() {
    return current.kind;
  },
  get storage() {
    return current.storage;
  },
  files: {
    save: (...a) => current.files.save(...a),
    open: (...a) => current.files.open(...a),
  },
  get plantsFolder() {
    return current.plantsFolder;
  },
  onFileDrop: (fn) => current.onFileDrop(fn),
  init: () => current.init(),
  flush: () => current.flush(),
};

export async function setPlatform(p: Platform): Promise<void> {
  current = p;
  await p.init();
}
