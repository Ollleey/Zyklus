import { describe, expect, it } from 'vitest';
import { applySavegame, exportSavegame, parseSavegame, type SyncStore } from '../src';

function memStore(init: Record<string, string> = {}): SyncStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  };
}

const WEB = {
  'zyklus.version': '3',
  'zyklus.fortschritt': '{"01-foerderband":{"solved":true,"history":[]}}',
  'zyklus.loesung.01-foerderband': '{"version":2,"modules":[],"wires":[],"projects":{}}',
  'zyklus.ui.boolFormat': 'text',
  'zyklus.anlagen': '[{"id":"a1","name":"X","modified":"","thumbnail":"","file":"{}"}]',
  'zyklus.eigeneAuftraege': '[]',
  'fremd.schluessel': 'gehört nicht zum Spiel',
};

describe('Spielstand exportieren und importieren', () => {
  it('Round-Trip: Web → Datei → Desktop ergibt dieselben Einträge', () => {
    const web = memStore(WEB);
    const text = exportSavegame(web, 'web', new Date('2026-11-02T10:00:00Z'));
    const r = parseSavegame(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.savegame.source).toBe('web');
    expect(Object.keys(r.savegame.entries)).not.toContain('fremd.schluessel');

    const desktop = memStore({
      'zyklus.desktop.anlagenOrdner': 'D:/Anlagen',
      'zyklus.fortschritt': '{}',
    });
    expect(applySavegame(desktop, r.savegame)).toBe(6);
    for (const [k, v] of Object.entries(WEB))
      if (k.startsWith('zyklus.')) expect(desktop.getItem(k)).toBe(v);
    // gerätebezogene Einstellung bleibt
    expect(desktop.getItem('zyklus.desktop.anlagenOrdner')).toBe('D:/Anlagen');
  });

  it('nimmt gerätebezogene Einstellungen nicht mit', () => {
    const s = memStore({ ...WEB, 'zyklus.desktop.zuletzt': '["C:/a.anlage"]' });
    const r = parseSavegame(exportSavegame(s, 'desktop'));
    expect(r.ok && 'zyklus.desktop.zuletzt' in r.savegame.entries).toBe(false);
  });

  it('meldet falsche und beschädigte Dateien auf Deutsch', () => {
    expect(parseSavegame('{')).toEqual({ ok: false, error: 'Die Datei ist kein gültiges JSON.' });
    expect(parseSavegame('{"format":"zyklus-anlage"}').ok).toBe(false);
    const base = { format: 'zyklus-spielstand', formatVersion: 1, entries: {} };
    expect(parseSavegame(JSON.stringify({ ...base, formatVersion: 9 }))).toMatchObject({
      ok: false,
      error: /neueren Version/,
    });
    expect(parseSavegame(JSON.stringify({ ...base, entries: { 'x.y': '1' } }))).toMatchObject({
      ok: false,
      error: /zyklus/,
    });
    expect(
      parseSavegame(JSON.stringify({ ...base, entries: { 'zyklus.fortschritt': '{kaputt' } })),
    ).toMatchObject({
      ok: false,
      error: /beschädigt/,
    });
    expect(parseSavegame(JSON.stringify({ ...base, unbekannt: 1 })).ok).toBe(true);
  });
});
