import { describe, expect, it } from 'vitest';
import { Cpu, type PlcType, type VarDecl } from '@zyklus/sim-core';
import {
  compileProject,
  compileScl,
  compileSource,
  formatDiagnostic,
  projectToSource,
  sourceToProject,
  type CompileResult,
} from '../src';
import { DB, TAGS } from './harness';

type Row = [name: string, type: string, init?: string];
const rows = (r: Row[]): VarDecl[] => r.map(([name, type, init]) => ({ name, type, init }));

const REZEPT: PlcType = {
  name: 'Rezept',
  fields: rows([
    ['Nummer', 'Int'],
    ['Menge', 'Real', '1.5'],
    ['Zeit', 'Time', 'T#2s'],
    ['Aktiv', 'Bool'],
  ]),
};

function compile(body: string, types: PlcType[], dbRows: Row[]): CompileResult {
  return compileScl(body, { tags: TAGS, types, blocks: [DB('Daten', dbRows)] });
}

function cpu(r: CompileResult): Cpu {
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
}

describe('PLC-Datentypen (UDT)', () => {
  it('Startwerte aus dem Datentyp, Zugriff auf Elemente', () => {
    const c = cpu(
      compile(
        '"Daten".R.Nummer := 7; "Wert" := "Daten".R.Menge * 2.0;',
        [REZEPT],
        [['R', '"Rezept"']],
      ),
    );
    c.scan(0);
    expect(c.read('%MD24', 'REAL')).toBe(3);
    expect(c.readSlot('Daten.R.Zeit')).toBe(2000);
    expect(c.readSlot('Daten.R.Nummer')).toBe(7);
  });

  it('Array of UDT mit Rezeptwahl über variablen Index', () => {
    const c = cpu(
      compile(
        `"Daten".Liste[2].Menge := 4.0;
"Daten".Aktuell := "Daten".Liste["Zahl"];
"Wert" := "Daten".Aktuell.Menge;`,
        [REZEPT],
        [
          ['Liste', 'Array[1..3] of "Rezept"'],
          ['Aktuell', '"Rezept"'],
        ],
      ),
    );
    c.setInput('%MW10', 2);
    c.scan(0);
    expect(c.read('%MD24', 'REAL')).toBe(4);
    c.setInput('%MW10', 3);
    c.scan(1);
    expect(c.read('%MD24', 'REAL')).toBe(1.5);
    c.setInput('%MW10', 0);
    c.scan(2);
    expect(c.stopInfo?.reason).toBe('PROGRAM_ERROR');
  });

  it('UDT in UDT, ohne Anführungszeichen geschrieben', () => {
    const achse: PlcType = {
      name: 'Achse',
      fields: rows([
        ['Pos', 'DInt'],
        ['Ziel', 'DInt'],
      ]),
    };
    const portal: PlcType = {
      name: 'Portal',
      fields: rows([
        ['X', '"Achse"'],
        ['Y', 'Achse'],
      ]),
    };
    const c = cpu(
      compile(
        '"Daten".P.Y.Ziel := 42; "Gross" := "Daten".P.Y.Ziel;',
        [achse, portal],
        [['P', '"Portal"']],
      ),
    );
    c.scan(0);
    expect(c.read('%MD20')).toBe(42);
  });

  it('UDT als Durchgangsparameter einer FC', () => {
    const r = compileProject({
      tags: TAGS,
      types: [REZEPT],
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'SCL',
          iface: {},
          source: '"Pruefen"(R := "Daten".R);',
        },
        {
          kind: 'FC',
          name: 'Pruefen',
          number: 1,
          lang: 'SCL',
          iface: { InOut: rows([['R', '"Rezept"']]) },
          source: '#R.Aktiv := #R.Menge > 1.0;',
        },
        DB('Daten', [['R', '"Rezept"']]),
      ],
    });
    const c = cpu(r);
    c.scan(0);
    expect(c.readSlot('Daten.R.Aktiv')).toBe(true);
  });

  it.each([
    [[{ name: 'A', fields: rows([['x', '"A"']]) }], /enthält sich selbst/],
    [[{ name: 'A', fields: [] }], /keine Elemente/],
    [
      [
        {
          name: 'A',
          fields: rows([
            ['x', 'Int'],
            ['X', 'Bool'],
          ]),
        },
      ],
      /doppelt/,
    ],
    [[{ name: 'A', fields: rows([['x', 'Gibtsnicht']]) }], /Unbekannter Datentyp/],
    [[{ name: 'A', fields: rows([['t', 'TON_TIME']]) }], /Instanzen/],
    [[{ name: 'Daten', fields: rows([['x', 'Int']]) }], /doppelt vergeben/],
  ] as [PlcType[], RegExp][])('Fehler im Datentyp: %#', (types, re) => {
    const r = compile('"Zahl" := 1;', types, [['x', 'Int']]);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.find((d) => d.severity === 'error')?.message).toMatch(re);
  });

  it('Elementzugriff mit falschem Namen', () => {
    const r = compile('"Zahl" := "Daten".R.Nummr;', [REZEPT], [['R', '"Rezept"']]);
    expect(r.diagnostics[0]!.message).toMatch(
      /kein Element Nummr \(verfügbar: Nummer, Menge, Zeit, Aktiv\)/,
    );
  });

  it('ganze UDT-Variablen: nur gleicher Datentyp', () => {
    const anders: PlcType = { name: 'Anders', fields: REZEPT.fields };
    const r = compile(
      '"Daten".A := "Daten".R;',
      [REZEPT, anders],
      [
        ['R', '"Rezept"'],
        ['A', '"Anders"'],
      ],
    );
    expect(r.diagnostics[0]!.message).toMatch(/Typkonflikt: "Rezept" passt nicht zu "Anders"/);
  });

  it('Quelle: TYPE … END_TYPE, Hin- und Rückweg', () => {
    const src = `TYPE "Rezept"
VERSION : 0.1
   STRUCT
      Nummer : Int;
      Menge : Real := 1.5;
   END_STRUCT;

END_TYPE

DATA_BLOCK "Daten"
VAR
  Liste : Array[1..3] of "Rezept";
END_VAR
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
BEGIN
  "Daten".Liste[3].Nummer := 3;
END_ORGANIZATION_BLOCK`;
    const r = compileSource(src);
    const c = cpu(r);
    c.scan(0);
    expect(c.readSlot('Daten.Liste[3].Nummer')).toBe(3);
    expect(c.readSlot('Daten.Liste[1].Menge')).toBe(1.5);

    const p = sourceToProject(src);
    expect(p.diagnostics).toEqual([]);
    expect(p.project!.types).toEqual([
      {
        name: 'Rezept',
        fields: [
          { name: 'Nummer', type: 'Int', init: undefined },
          { name: 'Menge', type: 'Real', init: '1.5' },
        ],
      },
    ]);
    const again = sourceToProject(projectToSource(p.project!));
    expect(again.project).toEqual(p.project);
    expect(compileProject(again.project!).ok).toBe(true);
  });
});
