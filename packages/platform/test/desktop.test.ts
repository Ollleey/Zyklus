import { describe, expect, it } from 'vitest';
import { desktopPlatform, fileOfKey, type DesktopDeps, type DesktopFs } from '../src/desktop';

/** Dateisystem im Speicher; `failRenameTo` simuliert einen Absturz vor dem Umbenennen */
function memFs() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  let failRenameTo: string | undefined;
  const fs: DesktopFs = {
    readText: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`fehlt: ${p}`);
      return v;
    },
    writeText: async (p, t) => void files.set(p, t),
    rename: async (a, b) => {
      if (b === failRenameTo) throw new Error('Absturz');
      const v = files.get(a);
      if (v === undefined) throw new Error(`fehlt: ${a}`);
      files.delete(a);
      files.set(b, v);
    },
    remove: async (p) => void files.delete(p),
    exists: async (p) => files.has(p) || dirs.has(p),
    mkdir: async (p) => void dirs.add(p),
    list: async (d) =>
      [...files.keys()]
        .filter((f) => f.startsWith(`${d}/`) && !f.slice(d.length + 1).includes('/'))
        .map((f) => f.slice(d.length + 1)),
  };
  return { fs, files, crashOnRenameTo: (p: string | undefined) => (failRenameTo = p) };
}

function deps(fs: DesktopFs, extra: Partial<DesktopDeps> = {}): DesktopDeps {
  return {
    fs,
    appData: '/app',
    documents: '/docs',
    sep: '/',
    saveDialog: async (name) => `/export/${name}`,
    openDialog: async () => '/export/a.anlage',
    onDrop: () => () => {},
    debounceMs: 0,
    ...extra,
  };
}

describe('Desktop-Speicherung', () => {
  it('ordnet Schlüssel festen Dateien zu', () => {
    expect(fileOfKey('zyklus.loesung.01-foerderband')).toBe('loesungen/01-foerderband.json');
    expect(fileOfKey('zyklus.fortschritt')).toBe('fortschritt.json');
    expect(fileOfKey('zyklus.anlage.aktuell')).toBe('sandkasten.json');
    expect(fileOfKey('zyklus.ui.split.x')).toBe('einstellungen.json');
    expect(fileOfKey('zyklus.dock.auftrag')).toBe('einstellungen.json');
  });

  it('schreibt gebündelt in Dateien und liest sie beim nächsten Start', async () => {
    const m = memFs();
    const a = desktopPlatform(deps(m.fs));
    await a.init();
    a.storage.setItem('zyklus.fortschritt', '{"01":{"solved":true}}');
    a.storage.setItem('zyklus.loesung.01-foerderband', '{"version":2}');
    a.storage.setItem('zyklus.ui.split.x', '0.6');
    await a.flush();
    expect(JSON.parse(m.files.get('/app/fortschritt.json')!)).toEqual({
      'zyklus.fortschritt': '{"01":{"solved":true}}',
    });
    expect(m.files.get('/app/loesungen/01-foerderband.json')).toBe('{"version":2}');

    const b = desktopPlatform(deps(m.fs));
    await b.init();
    expect(b.storage.getItem('zyklus.fortschritt')).toBe('{"01":{"solved":true}}');
    expect(b.storage.getItem('zyklus.loesung.01-foerderband')).toBe('{"version":2}');
    expect(b.storage.getItem('zyklus.ui.split.x')).toBe('0.6');
  });

  it('schreibt atomar und legt eine Sicherung an', async () => {
    const m = memFs();
    const p = desktopPlatform(deps(m.fs));
    await p.init();
    p.storage.setItem('zyklus.fortschritt', 'eins');
    await p.flush();
    p.storage.setItem('zyklus.fortschritt', 'zwei');
    await p.flush();
    expect(JSON.parse(m.files.get('/app/fortschritt.json.bak')!)['zyklus.fortschritt']).toBe(
      'eins',
    );
    expect(JSON.parse(m.files.get('/app/fortschritt.json')!)['zyklus.fortschritt']).toBe('zwei');
    expect(m.files.has('/app/fortschritt.json.tmp')).toBe(false);
  });

  it('Absturz beim Speichern: der letzte gute Stand bleibt lesbar', async () => {
    const m = memFs();
    const p = desktopPlatform(deps(m.fs));
    await p.init();
    p.storage.setItem('zyklus.fortschritt', 'gut');
    await p.flush();
    // Absturz, nachdem die alte Datei zur .bak wurde, aber bevor .tmp umbenannt ist
    m.crashOnRenameTo('/app/fortschritt.json');
    p.storage.setItem('zyklus.fortschritt', 'neu');
    await p.flush().catch(() => {});
    expect(m.files.has('/app/fortschritt.json')).toBe(false);
    const q = desktopPlatform(deps(m.fs));
    await q.init();
    expect(['gut', 'neu']).toContain(q.storage.getItem('zyklus.fortschritt'));
  });

  it('kaputte Datei: Sicherung wird gelesen', async () => {
    const m = memFs();
    m.files.set('/app/fortschritt.json', '{ kaputt');
    m.files.set('/app/fortschritt.json.bak', JSON.stringify({ 'zyklus.fortschritt': 'gesichert' }));
    const p = desktopPlatform(deps(m.fs));
    await p.init();
    expect(p.storage.getItem('zyklus.fortschritt')).toBe('gesichert');
  });

  it('Meine Anlagen: je Anlage eine Datei im Dokumente-Ordner, Index mit Vorschaubild', async () => {
    const m = memFs();
    const p = desktopPlatform(deps(m.fs));
    await p.init();
    const list = [
      {
        id: 'a1',
        name: 'Sortierstation',
        modified: '2026-11-02',
        thumbnail: '<svg/>',
        file: '{"name":"Sortierstation"}',
      },
      {
        id: 'a2',
        name: 'Tank',
        modified: '2026-11-01',
        thumbnail: '<svg/>',
        file: '{"name":"Tank"}',
      },
    ];
    p.storage.setItem('zyklus.anlagen', JSON.stringify(list));
    await p.flush();
    expect(m.files.get('/docs/ZYKLUS/Anlagen/Sortierstation-a1.anlage')).toBe(
      '{"name":"Sortierstation"}',
    );
    expect(m.files.has('/docs/ZYKLUS/Anlagen/Tank-a2.anlage')).toBe(true);
    // von außen in den Ordner gelegt
    m.files.set('/docs/ZYKLUS/Anlagen/neu.anlage', '{"name":"Von Hand","modified":"2026-10-01"}');

    const q = desktopPlatform(deps(m.fs));
    await q.init();
    const read = JSON.parse(q.storage.getItem('zyklus.anlagen')!) as {
      id: string;
      name: string;
      thumbnail: string;
    }[];
    expect(read.map((e) => e.name)).toEqual(['Sortierstation', 'Tank', 'Von Hand']);
    expect(read[0]!.thumbnail).toBe('<svg/>');

    // Löschen: Datei wird zur Sicherung
    q.storage.setItem('zyklus.anlagen', JSON.stringify(read.filter((e) => e.id !== 'a2')));
    await q.flush();
    expect(m.files.has('/docs/ZYKLUS/Anlagen/Tank-a2.anlage')).toBe(false);
    expect(m.files.has('/docs/ZYKLUS/Anlagen/Tank-a2.anlage.bak')).toBe(true);
  });

  it('Anlagen-Ordner lässt sich ändern', async () => {
    const m = memFs();
    const p = desktopPlatform(deps(m.fs));
    await p.init();
    p.storage.setItem(
      'zyklus.anlagen',
      JSON.stringify([{ id: 'a1', name: 'X', modified: '1', thumbnail: '', file: '{}' }]),
    );
    await p.setPlantsDir('/neu');
    expect(p.plantsFolder.path()).toBe('/neu');
    expect(m.files.has('/neu/X-a1.anlage')).toBe(true);
    const q = desktopPlatform(deps(m.fs));
    await q.init();
    expect(q.plantsFolder.path()).toBe('/neu');
  });

  it('Speichern und Öffnen über die Dialoge', async () => {
    const m = memFs();
    m.files.set('/export/a.anlage', '{"x":1}');
    const p = desktopPlatform(deps(m.fs));
    expect(await p.files.save('b.anlage', 'inhalt', [])).toBe('b.anlage');
    expect(m.files.get('/export/b.anlage')).toBe('inhalt');
    expect(await p.files.open([])).toEqual({
      name: 'a.anlage',
      text: '{"x":1}',
      path: '/export/a.anlage',
    });
    const cancel = desktopPlatform(
      deps(m.fs, { saveDialog: async () => null, openDialog: async () => null }),
    );
    expect(await cancel.files.save('c', 'x', [])).toBeNull();
    expect(await cancel.files.open([])).toBeNull();
  });

  it('merkt sich zuletzt geöffnete Dateien und meldet sie dem Menü', async () => {
    const m = memFs();
    m.files.set('/export/a.anlage', '{"x":1}');
    let menu: string[] = [];
    const p = desktopPlatform(deps(m.fs, { setRecentMenu: async (l) => void (menu = l) }));
    await p.init();
    await p.files.save('b.anlage', 'B', []);
    await p.files.open([]);
    expect(p.recent!.list()).toEqual(['/export/a.anlage', '/export/b.anlage']);
    expect(menu).toEqual(['/export/a.anlage', '/export/b.anlage']);
    expect(await p.recent!.open(1)).toMatchObject({ name: 'b.anlage', text: 'B' });
    // verschobene Datei verschwindet aus der Liste
    m.files.delete('/export/a.anlage');
    expect(await p.recent!.open(1)).toBeNull();
    expect(p.recent!.list()).toEqual(['/export/b.anlage']);
  });

  it('übergibt beim Start geöffnete Dateien an die Oberfläche', async () => {
    const m = memFs();
    let pushOpen: ((f: { name: string; text: string; path?: string }) => void) | undefined;
    const p = desktopPlatform(
      deps(m.fs, {
        takeLaunchFiles: async () => [{ name: 'x.anlage', text: '{}', path: 'C:/x.anlage' }],
        onOpen: (fn) => {
          pushOpen = fn;
          return () => {};
        },
      }),
    );
    await p.init();
    const got: string[] = [];
    p.onOpenFile((f) => got.push(f.name));
    pushOpen!({ name: 'y.anlage', text: '{}', path: 'C:/y.anlage' });
    expect(got).toEqual(['x.anlage', 'y.anlage']);
  });

  it('Schließen: Rückfrage nur bei ungespeicherten Änderungen', async () => {
    const m = memFs();
    let handler: (() => Promise<boolean>) | undefined;
    const p = desktopPlatform(deps(m.fs, { onCloseRequested: (fn) => ((handler = fn), () => {}) }));
    let dirty = false;
    let asked = 0;
    p.guardClose(
      () => dirty,
      async () => (asked++, false),
    );
    expect(await handler!()).toBe(true);
    dirty = true;
    expect(await handler!()).toBe(false);
    expect(asked).toBe(1);
  });
});
