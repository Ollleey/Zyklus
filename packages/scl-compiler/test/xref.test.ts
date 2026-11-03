import { describe, expect, it } from 'vitest';
import { compileProject, compileScl } from '../src';
import { DB, IDB, TAGS } from './harness';

describe('Querverweise und Aufrufe', () => {
  it('Lese- und Schreibzugriffe mit Stelle und Adresse', () => {
    const r = compileScl(
      `"Motor" := "Start" AND NOT "Daten".Fehler;
IF "Motor" THEN "Zahl" := "Zahl" + 1; END_IF;
%Q0.1 := #t;`,
      {
        tags: TAGS,
        blocks: [DB('Daten', [['Fehler', 'Bool']])],
        temp: [{ name: 't', type: 'Bool' }],
      },
    );
    const x = r.xref!.map(
      (e) => `${e.symbol}@${e.line}:${e.access}${e.address ? ` ${e.address}` : ''}`,
    );
    expect(x).toEqual([
      '"Motor"@1:w %Q0.0',
      '"Start"@1:r %I0.0',
      '"Daten".Fehler@1:r',
      '"Motor"@2:r %Q0.0',
      '"Zahl"@2:w %MW10',
      '"Zahl"@2:r %MW10',
      '%Q0.1@3:w %Q0.1',
      '#t@3:r',
    ]);
  });

  it('Aufrufe eigener Bausteine und Systembausteine', () => {
    const r = compileProject({
      tags: TAGS,
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'SCL',
          iface: {},
          source: '"FC1"(); "T1"(IN := "Start", PT := T#1s);',
        },
        { kind: 'FC', name: 'FC1', number: 1, lang: 'SCL', iface: {}, source: '"FC2"();' },
        { kind: 'FC', name: 'FC2', number: 2, lang: 'SCL', iface: {}, source: '"Lampe" := TRUE;' },
        IDB('T1', 'TON_TIME'),
      ],
    });
    expect(r.calls).toEqual([
      { from: 'FC1', to: 'FC2', line: 1 },
      { from: 'Main', to: 'FC1', line: 1 },
      { from: 'Main', to: 'TON', instance: 'T1', line: 1 },
    ]);
  });

  it('Warnung bei doppelter unbedingter Zuweisung eines Ausgangs', () => {
    const r = compileScl(
      `"Motor" := "Start";
IF "Stopp" THEN "Motor" := FALSE; END_IF;
"Lampe" := "Start";
"Motor" := "Sensor";`,
      { tags: TAGS },
    );
    const w = r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
    expect(w).toEqual([
      '"Motor" wird schon in Zeile 1 unbedingt zugewiesen – die frühere Zuweisung wirkt nie',
    ]);
    expect(r.diagnostics.find((d) => d.severity === 'warning')!.start.line).toBe(4);
  });
});
