import { appDataDir, documentDir, sep } from '@tauri-apps/api/path';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { desktopPlatform, type DesktopDeps } from './desktop';
import type { FileFilter, Platform } from './types';

/**
 * Einstieg für die Desktop-Anwendung: verbindet die Desktop-Implementierung mit Tauri
 * (Dateisystem, Dialoge, Ziehen ins Fenster, Explorer). Nur im Desktop-Build geladen.
 */
const dialogFilters = (filters: FileFilter[]) =>
  filters.map((f) => ({ name: f.name, extensions: [...f.extensions] }));

export async function createDesktopPlatform(): Promise<Platform> {
  const deps: DesktopDeps = {
    fs: {
      readText: (p) => readTextFile(p),
      writeText: (p, t) => writeTextFile(p, t),
      rename: (a, b) => rename(a, b),
      remove: (p) => remove(p),
      exists: (p) => exists(p),
      mkdir: (p) => mkdir(p, { recursive: true }),
      list: async (d) => (await readDir(d)).filter((e) => e.isFile).map((e) => e.name),
    },
    appData: await appDataDir(),
    documents: await documentDir(),
    sep: sep(),
    saveDialog: (name, filters) => save({ defaultPath: name, filters: dialogFilters(filters) }),
    openDialog: async (filters) => {
      const r = await open({ multiple: false, directory: false, filters: dialogFilters(filters) });
      return typeof r === 'string' ? r : null;
    },
    pickFolder: async () => {
      const r = await open({ multiple: false, directory: true });
      return typeof r === 'string' ? r : null;
    },
    onDrop(fn) {
      let unlisten: (() => void) | undefined;
      let stopped = false;
      void getCurrentWebview()
        .onDragDropEvent((e) => {
          if (e.payload.type === 'drop') fn(e.payload.paths);
        })
        .then((u) => (stopped ? u() : (unlisten = u)));
      return () => {
        stopped = true;
        unlisten?.();
      };
    },
    reveal: (p) => openPath(p),
  };
  const p = desktopPlatform(deps);
  // beim Schließen ausstehende Spielstände schreiben, dann beenden
  void getCurrentWindow().onCloseRequested(async () => {
    await p.flush();
  });
  return p;
}
