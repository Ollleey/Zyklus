import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
import type { FileFilter, OpenedFile, Platform } from './types';

/** Abmeldung für Tauri-Listener, die erst asynchron zustande kommen */
function later(p: Promise<() => void>): () => void {
  let stop: (() => void) | undefined;
  let done = false;
  void p.then((u) => (done ? u() : (stop = u)));
  return () => {
    done = true;
    stop?.();
  };
}

/**
 * Einstieg für die Desktop-Anwendung: verbindet die Desktop-Implementierung mit Tauri
 * (Dateisystem, Dialoge, Ziehen ins Fenster, Explorer). Nur im Desktop-Build geladen.
 */
const dialogFilters = (filters: FileFilter[]) =>
  filters.map((f) => ({ name: f.name, extensions: [...f.extensions] }));

export async function createDesktopPlatform(): Promise<Platform> {
  const win = getCurrentWindow();
  const guards = new Set<() => Promise<boolean>>();
  // Testordner (ZYKLUS_DATA_DIR / ZYKLUS_DOCS_DIR), sonst die Standardordner
  const dirs = await invoke<{ data: string | null; documents: string | null }>('dirs');
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
    appData: dirs.data ?? (await appDataDir()),
    documents: dirs.documents ?? (await documentDir()),
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
    setTitle: (t) => {
      document.title = t;
      void win.setTitle(t);
    },
    onMenu: (fn) => later(listen<string>('menu', (e) => fn(e.payload))),
    takeLaunchFiles: () => invoke<OpenedFile[]>('take_launch_files'),
    onOpen: (fn) => later(listen<OpenedFile>('open-file', (e) => fn(e.payload))),
    onCloseRequested(fn) {
      guards.add(fn);
      return () => guards.delete(fn);
    },
    setRecentMenu: (paths) => invoke('set_recent', { paths }),
    readOpened: (path) => invoke<OpenedFile>('read_opened', { path }),
  };
  const p = desktopPlatform(deps);
  // Schließen: erst die Oberfläche fragen (ungespeicherte Änderungen), dann Spielstände
  // schreiben und das Fenster schließen
  let closing = false;
  void win.onCloseRequested(async (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    try {
      for (const g of guards) if (!(await g())) return;
      await p.flush();
      await win.destroy();
    } finally {
      closing = false;
    }
  });
  return p;
}
