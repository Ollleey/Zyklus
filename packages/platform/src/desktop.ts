import type { FileFilter, OpenedFile, Platform, SyncStore } from './types';

/**
 * Desktop-Implementierung: Spielstände als JSON-Dateien im App-Datenordner, „Meine Anlagen“ als
 * einzelne `.anlage`-Dateien in `Dokumente/ZYKLUS/Anlagen`. Gelesen wird synchron aus einem
 * Speicher-Cache, der beim Start gefüllt wird; Änderungen werden gebündelt und atomar geschrieben
 * (erst `.tmp`, alte Datei als `.bak`, dann umbenennen).
 *
 * Alle Zugriffe auf Dateisystem, Dialoge und Fenster laufen über `DesktopDeps`, damit sich die
 * Logik ohne Tauri testen lässt.
 */
export interface DesktopFs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  /** Dateinamen (ohne Ordner) */
  list(dir: string): Promise<string[]>;
}

export interface DesktopDeps {
  fs: DesktopFs;
  /** App-Datenordner (Einstellungen, Fortschritt, Autosave) */
  appData: string;
  /** Standardordner für „Meine Anlagen“ */
  documents: string;
  sep: string;
  saveDialog(name: string, filters: FileFilter[]): Promise<string | null>;
  openDialog(filters: FileFilter[]): Promise<string | null>;
  /** Dateien ins Fenster gezogen (Pfade) */
  onDrop(fn: (paths: string[]) => void): () => void;
  /** Ordner im Explorer zeigen */
  reveal?(path: string): Promise<void>;
  /** Ordner wählen (Dialog) */
  pickFolder?(): Promise<string | null>;
  /** Verzögerung für gebündeltes Schreiben (ms) */
  debounceMs?: number;
  /** Fenster und Menü (fehlen im Test) */
  setTitle?(title: string): void;
  onMenu?(fn: (id: string) => void): () => void;
  /** Dateizuordnung: beim Start übergebene und per Doppelklick nachgereichte Dateien */
  takeLaunchFiles?(): Promise<OpenedFile[]>;
  onOpen?(fn: (f: OpenedFile) => void): () => void;
  /** Schließen: Handler entscheidet; danach schreibt die Plattform und schließt das Fenster */
  onCloseRequested?(fn: () => Promise<boolean>): () => void;
  setRecentMenu?(paths: string[]): Promise<void>;
  /** Datei lesen, auch außerhalb der freigegebenen Ordner (zuletzt geöffnet) */
  readOpened?(path: string): Promise<OpenedFile>;
}

/** Datei, in der ein Schlüssel liegt (Gruppen) bzw. eigene Datei je Lösung */
export function fileOfKey(key: string): string {
  if (key.startsWith('zyklus.loesung.'))
    return `loesungen/${safeName(key.slice('zyklus.loesung.'.length))}.json`;
  if (key === 'zyklus.fortschritt' || key === 'zyklus.patience') return 'fortschritt.json';
  if (key.startsWith('zyklus.anlage.')) return 'sandkasten.json';
  if (key === 'zyklus.eigeneAuftraege') return 'auftraege.json';
  return 'einstellungen.json';
}

/** Schlüssel der Anlagenliste: liegt als einzelne Dateien im Anlagen-Ordner */
export const PLANTS_KEY = 'zyklus.anlagen';
/** Einstellung: Ordner für „Meine Anlagen“ */
export const PLANTS_DIR_KEY = 'zyklus.desktop.anlagenOrdner';
/** Einstellung: zuletzt geöffnete Dateien (Pfade, neueste zuerst) */
export const RECENT_KEY = 'zyklus.desktop.zuletzt';
const RECENT_MAX = 10;
const PLANTS_INDEX = 'anlagen-index.json';

const safeName = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80) || 'ohne-name';

/** Eintrag von „Meine Anlagen“ (wie im Spiel gespeichert) */
interface PlantEntry {
  id: string;
  name: string;
  modified: string;
  thumbnail: string;
  file: string;
}

/** Index der Anlagen: id → Dateiname, Vorschaubild (die Anlage selbst steht in der Datei) */
type PlantIndex = Record<
  string,
  { fileName: string; name: string; modified: string; thumbnail: string }
>;

/** gruppierter Inhalt einer Datei: Schlüssel → gespeicherter Text */
type Group = Record<string, string>;

export function desktopPlatform(deps: DesktopDeps): Platform & {
  plantsFolder: NonNullable<Platform['plantsFolder']>;
  /** Ordner für „Meine Anlagen“ direkt setzen (ohne Dialog) */
  setPlantsDir(path: string): Promise<void>;
} {
  const { fs, sep } = deps;
  const join = (...p: string[]) => p.join(sep).replace(/[\\/]+/g, sep);
  const cache = new Map<string, string>();
  const dirtyFiles = new Set<string>();
  let plantsDirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  let plantIndex: PlantIndex = {};

  const plantsDir = () => cache.get(PLANTS_DIR_KEY) ?? join(deps.documents, 'ZYKLUS', 'Anlagen');

  /** Datei lesen; bei Fehler oder kaputtem Inhalt die Sicherung */
  async function readJson<T>(path: string): Promise<T | undefined> {
    for (const p of [path, `${path}.bak`, `${path}.tmp`]) {
      try {
        if (!(await fs.exists(p))) continue;
        return JSON.parse(await fs.readText(p)) as T;
      } catch {
        // nächste Quelle versuchen
      }
    }
    return undefined;
  }

  /** atomar schreiben: .tmp schreiben, alte Datei → .bak, .tmp → Ziel */
  async function writeAtomic(path: string, text: string): Promise<void> {
    const tmp = `${path}.tmp`;
    await fs.writeText(tmp, text);
    if (await fs.exists(path)) {
      if (await fs.exists(`${path}.bak`)) await fs.remove(`${path}.bak`);
      await fs.rename(path, `${path}.bak`);
    }
    await fs.rename(tmp, path);
  }

  async function ensureDir(path: string): Promise<void> {
    if (!(await fs.exists(path))) await fs.mkdir(path);
  }

  function groupContent(file: string): Group {
    const out: Group = {};
    for (const [k, v] of cache) if (k !== PLANTS_KEY && fileOfKey(k) === file) out[k] = v;
    return out;
  }

  async function writePlants(): Promise<void> {
    const raw = cache.get(PLANTS_KEY);
    const list: PlantEntry[] = raw ? (JSON.parse(raw) as PlantEntry[]) : [];
    const dir = plantsDir();
    await ensureDir(dir);
    const next: PlantIndex = {};
    for (const e of list) {
      const old = plantIndex[e.id];
      const fileName = old?.fileName ?? `${safeName(e.name)}-${e.id}.anlage`;
      next[e.id] = { fileName, name: e.name, modified: e.modified, thumbnail: e.thumbnail };
      if (
        !old ||
        old.modified !== e.modified ||
        old.name !== e.name ||
        !(await fs.exists(join(dir, fileName)))
      )
        await writeAtomic(join(dir, fileName), e.file);
    }
    // gelöschte Anlagen: Datei entfernen (die .bak bleibt als Sicherung)
    for (const [id, old] of Object.entries(plantIndex)) {
      if (next[id]) continue;
      const p = join(dir, old.fileName);
      if (await fs.exists(p)) await fs.rename(p, `${p}.bak`);
    }
    plantIndex = next;
    await writeAtomic(join(deps.appData, PLANTS_INDEX), JSON.stringify(next, null, 2));
  }

  async function readPlants(): Promise<void> {
    const dir = plantsDir();
    plantIndex = (await readJson<PlantIndex>(join(deps.appData, PLANTS_INDEX))) ?? {};
    const known = new Map(Object.entries(plantIndex).map(([id, e]) => [e.fileName, id]));
    const list: PlantEntry[] = [];
    let names: string[] = [];
    try {
      names = (await fs.exists(dir)) ? await fs.list(dir) : [];
    } catch {
      names = [];
    }
    for (const fileName of names.filter((n) => /\.anlage(\.json)?$/i.test(n))) {
      let text: string;
      try {
        text = await fs.readText(join(dir, fileName));
        JSON.parse(text);
      } catch {
        continue;
      }
      const id = known.get(fileName) ?? `datei-${safeName(fileName)}`;
      const meta = plantIndex[id];
      const file = JSON.parse(text) as { name?: string; modified?: string };
      // von außen in den Ordner gelegte Dateien erscheinen ohne Vorschaubild
      if (!meta)
        plantIndex[id] = {
          fileName,
          name: file.name ?? fileName,
          modified: file.modified ?? '',
          thumbnail: '',
        };
      const m = plantIndex[id]!;
      list.push({ id, name: m.name, modified: m.modified, thumbnail: m.thumbnail, file: text });
    }
    list.sort((a, b) => b.modified.localeCompare(a.modified));
    if (list.length) cache.set(PLANTS_KEY, JSON.stringify(list));
  }

  /** neuer Anlagen-Ordner: alle Anlagen werden dorthin geschrieben */
  async function setDir(path: string): Promise<void> {
    cache.set(PLANTS_DIR_KEY, path);
    dirtyFiles.add(fileOfKey(PLANTS_DIR_KEY));
    plantIndex = {};
    plantsDirty = true;
    await flushNow();
  }

  async function flushNow(): Promise<void> {
    const files = [...dirtyFiles];
    dirtyFiles.clear();
    const plants = plantsDirty;
    plantsDirty = false;
    writing = writing.then(async () => {
      for (const f of files) {
        const path = join(deps.appData, f);
        await ensureDir(path.slice(0, path.lastIndexOf(sep)));
        const content = f.startsWith('loesungen/')
          ? (Object.values(groupContent(f))[0] ?? null)
          : JSON.stringify(groupContent(f), null, 2);
        if (content === null) {
          if (await fs.exists(path)) await fs.rename(path, `${path}.bak`);
        } else await writeAtomic(path, content);
      }
      if (plants) await writePlants();
    });
    return writing;
  }

  function schedule(key: string): void {
    if (key === PLANTS_KEY) plantsDirty = true;
    else dirtyFiles.add(fileOfKey(key));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushNow(), deps.debounceMs ?? 300);
  }

  const storage: SyncStore = {
    getItem: (k) => cache.get(k) ?? null,
    setItem: (k, v) => {
      if (cache.get(k) === v) return;
      cache.set(k, v);
      schedule(k);
    },
    removeItem: (k) => {
      if (!cache.has(k)) return;
      cache.delete(k);
      schedule(k);
    },
    keys: () => [...cache.keys()],
  };

  async function readFile(path: string): Promise<OpenedFile> {
    return { name: path.split(/[\\/]/).pop() ?? path, text: await fs.readText(path), path };
  }

  const recentList = (): string[] => {
    try {
      const l = JSON.parse(cache.get(RECENT_KEY) ?? '[]') as unknown;
      return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  function remember(path: string | undefined): void {
    if (!path) return;
    const next = [path, ...recentList().filter((p) => p !== path)].slice(0, RECENT_MAX);
    storage.setItem(RECENT_KEY, JSON.stringify(next));
    void deps.setRecentMenu?.(next);
  }
  let pendingLaunch: OpenedFile[] = [];
  const openListeners = new Set<(f: OpenedFile) => void>();

  return {
    kind: 'desktop',
    storage,
    files: {
      async save(name, text, filters) {
        const path = await deps.saveDialog(name, filters);
        if (!path) return null;
        await fs.writeText(path, text);
        remember(path);
        return path.split(/[\\/]/).pop() ?? path;
      },
      async open(filters) {
        const path = await deps.openDialog(filters);
        if (!path) return null;
        const f = await readFile(path);
        remember(path);
        return f;
      },
    },
    onFileDrop(fn) {
      return deps.onDrop((paths) => {
        if (paths[0]) void readFile(paths[0]).then(fn);
      });
    },
    setTitle: (t) => deps.setTitle?.(t),
    onCommand: (fn) => deps.onMenu?.((id) => fn(id as Parameters<typeof fn>[0])) ?? (() => {}),
    onOpenFile(fn) {
      openListeners.add(fn);
      // beim Start übergebene Dateien an den ersten Interessenten
      for (const f of pendingLaunch.splice(0)) fn(f);
      return () => openListeners.delete(fn);
    },
    guardClose(dirty, ask) {
      return deps.onCloseRequested?.(async () => !dirty() || (await ask())) ?? (() => {});
    },
    recent: {
      list: recentList,
      async open(i) {
        const path = recentList()[i];
        if (!path) return null;
        try {
          const f = deps.readOpened ? await deps.readOpened(path) : await readFile(path);
          remember(path);
          return f;
        } catch {
          // Datei verschoben oder gelöscht: aus der Liste nehmen
          storage.setItem(RECENT_KEY, JSON.stringify(recentList().filter((p) => p !== path)));
          void deps.setRecentMenu?.(recentList());
          return null;
        }
      },
    },
    async init() {
      await ensureDir(deps.appData);
      for (const f of [
        'einstellungen.json',
        'fortschritt.json',
        'sandkasten.json',
        'auftraege.json',
      ]) {
        const g = await readJson<Group>(join(deps.appData, f));
        if (g) for (const [k, v] of Object.entries(g)) if (typeof v === 'string') cache.set(k, v);
      }
      const solDir = join(deps.appData, 'loesungen');
      if (await fs.exists(solDir)) {
        for (const n of await fs.list(solDir)) {
          const m = /^(.+)\.json$/.exec(n);
          if (!m) continue;
          try {
            const text = await fs.readText(join(solDir, n));
            JSON.parse(text);
            cache.set(`zyklus.loesung.${m[1]}`, text);
          } catch {
            const bak = await readJson<unknown>(join(solDir, n));
            if (bak !== undefined) cache.set(`zyklus.loesung.${m[1]}`, JSON.stringify(bak));
          }
        }
      }
      await readPlants();
      void deps.setRecentMenu?.(recentList());
      pendingLaunch = (await deps.takeLaunchFiles?.()) ?? [];
      for (const f of pendingLaunch) remember(f.path);
      deps.onOpen?.((f) => {
        remember(f.path);
        if (openListeners.size) for (const l of openListeners) l(f);
        else pendingLaunch.push(f);
      });
    },
    async flush() {
      if (timer) clearTimeout(timer);
      await flushNow();
    },
    async setPlantsDir(path) {
      await setDir(path);
    },
    plantsFolder: {
      path: plantsDir,
      async choose() {
        const path = await deps.pickFolder?.();
        if (!path) return false;
        await setDir(path);
        return true;
      },
      async reveal() {
        await ensureDir(plantsDir());
        await deps.reveal?.(plantsDir());
      },
    },
  };
}
