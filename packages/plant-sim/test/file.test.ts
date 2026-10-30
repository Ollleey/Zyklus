import { describe, expect, it } from 'vitest';
import { emptyProject, type Solution } from '@zyklus/sim-core';
import { anlageFileName, deviceId, parseAnlageFile, thumbnailSvg, toAnlageFile } from '../src';
import { STEEL, layoutOf } from './helpers';

const layout = layoutOf([
  { type: 'magazine', x: -45, y: 200, z: 100, params: { mode: 'auto' } },
  { type: 'belt', x: 300, y: 200, z: 100 },
  { type: 'inductive', x: 300, y: 236, z: 115, rot: 270 },
  { type: 'bin', x: 690, y: 200, z: 60 },
]);
layout.workpieces = [{ ...STEEL, x: 100, y: 200, z: 100 }];
const solution: Solution = {
  version: 2,
  modules: [
    { id: 'cpu1', type: 'cpu-klein', x: 0 },
    { id: 'di1', type: 'di8', x: 6 },
  ],
  wires: [{ device: deviceId(layout.parts[2]!, ''), module: 'di1', channel: 0 }],
  projects: { cpu1: emptyProject() },
};
const data = {
  name: 'Sortierstation',
  description: 'Metall und Holz trennen',
  author: 'Test',
  created: '2026-10-30T08:00:00.000Z',
  modified: '2026-10-30T09:00:00.000Z',
  layout,
  solution,
  sim: { speed: 10, signals: ['p3'] },
};

describe('Anlagendatei', () => {
  it('Export → Import ergibt exakt denselben Zustand', () => {
    const text = toAnlageFile(data);
    const r = parseAnlageFile(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file).toEqual({ format: 'zyklus-anlage', formatVersion: 1, ...data });
    expect(toAnlageFile(r.file)).toBe(text);
  });

  it('ignoriert unbekannte Felder und füllt fehlende Parameter auf', () => {
    const raw = JSON.parse(toAnlageFile(data));
    raw.extra = 'egal';
    raw.layout.parts[1].params = { speed: 200, unbekannt: 1 };
    raw.layout.parts[1].wackel = true;
    const r = parseAnlageFile(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('extra' in r.file).toBe(false);
    expect('wackel' in r.file.layout.parts[1]!).toBe(false);
    expect(r.file.layout.parts[1]!.params.speed).toBe(200);
    expect(r.file.layout.parts[1]!.params.length).toBe(600);
  });

  it('meldet Fehler auf Deutsch mit Fundstelle', () => {
    const raw = JSON.parse(toAnlageFile(data));
    raw.layout.parts[0].type = 'teleporter';
    raw.layout.parts[1].x = 'links';
    delete raw.layout.parts[2].tag;
    const r = parseAnlageFile(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/„layout\.parts\.0\.type“: unzulässiger Wert "teleporter"/);
    expect(r.error).toMatch(/„layout\.parts\.1\.x“: Zahl erwartet/);
    expect(r.error).toMatch(/„layout\.parts\.2\.tag“ fehlt/);
    expect(parseAnlageFile('{').ok).toBe(false);
    expect(parseAnlageFile('{"format":"etwas"}')).toEqual({
      ok: false,
      error: 'Das ist keine ZYKLUS-Anlagendatei (*.anlage.json).',
    });
    expect(parseAnlageFile(JSON.stringify({ ...raw, formatVersion: 9 })).ok).toBe(false);
  });

  it('migriert eine nackte Anlage (Version 0) mit leerem Schaltschrank', () => {
    const r = parseAnlageFile(JSON.stringify(layout));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.layout).toEqual(layout);
    expect(r.file.solution.modules).toEqual([]);
    expect(r.file.name).toBe('Unbenannte Anlage');
  });

  it('Dateiname und Vorschaubild', () => {
    expect(anlageFileName('Sortierstation Metall/Holz')).toBe(
      'sortierstation-metall-holz.anlage.json',
    );
    expect(anlageFileName('  ')).toBe('anlage.anlage.json');
    const svg = thumbnailSvg(layout);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<rect/g)!.length).toBe(5);
  });
});
