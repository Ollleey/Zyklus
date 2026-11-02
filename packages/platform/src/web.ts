import type { FileFilter, OpenedFile, Platform, SyncStore } from './types';

/** `localStorage` mit Rückfall auf einen flüchtigen Speicher (private Fenster, gesperrter Speicher) */
export function webStore(ls: Storage | undefined = globalThis.localStorage): SyncStore {
  const memory = new Map<string, string>();
  const safe = <T>(f: () => T, fallback: () => T): T => {
    try {
      return ls ? f() : fallback();
    } catch {
      return fallback();
    }
  };
  return {
    getItem: (k) =>
      safe(
        () => ls!.getItem(k),
        () => memory.get(k) ?? null,
      ),
    setItem: (k, v) =>
      safe(
        () => ls!.setItem(k, v),
        () => void memory.set(k, v),
      ),
    removeItem: (k) =>
      safe(
        () => ls!.removeItem(k),
        () => void memory.delete(k),
      ),
    keys: () =>
      safe(
        () => {
          const out: string[] = [];
          for (let i = 0; i < ls!.length; i++) out.push(ls!.key(i)!);
          return out;
        },
        () => [...memory.keys()],
      ),
  };
}

/** Datei herunterladen */
function download(name: string, text: string): void {
  const type = name.endsWith('.scl') ? 'text/plain' : 'application/json';
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Dateiauswahl des Browsers; `accept` aus den Endungen */
function pick(filters: FileFilter[]): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    const ext = filters.flatMap((f) => f.extensions.map((e) => `.${e.split('.').pop()}`));
    input.accept = [...new Set(ext)].join(',');
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.text().then((text) => resolve({ name: f.name, text }));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function webPlatform(): Platform {
  return {
    kind: 'web',
    storage: webStore(),
    files: {
      save: async (name, text) => {
        download(name, text);
        return name;
      },
      open: pick,
    },
    onFileDrop(fn) {
      const over = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
      };
      const drop = (e: DragEvent) => {
        const f = e.dataTransfer?.files[0];
        if (!f) return;
        e.preventDefault();
        void f.text().then((text) => fn({ name: f.name, text }));
      };
      window.addEventListener('dragover', over);
      window.addEventListener('drop', drop);
      return () => {
        window.removeEventListener('dragover', over);
        window.removeEventListener('drop', drop);
      };
    },
    init: async () => {},
    flush: async () => {},
  };
}
