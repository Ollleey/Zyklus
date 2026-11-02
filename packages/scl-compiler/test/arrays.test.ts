import { describe, expect, it } from 'vitest';
import { Cpu, type Block, type CodeBlock, type VarDecl } from '@zyklus/sim-core';
import { compileProject, compileSource, formatDiagnostic, parseTypeText } from '../src';
import { DB, TAGS, cpuFor, firstError } from './harness';

type Row = [name: string, type: string, init?: string];
const rows = (r: Row[] = []): VarDecl[] => r.map(([name, type, init]) => ({ name, type, init }));

function fb(
  kind: 'FB' | 'FC',
  name: string,
  source: string,
  iface: Partial<Record<keyof CodeBlock['iface'], Row[]>>,
): CodeBlock {
  return {
    kind,
    name,
    number: 1,
    lang: 'SCL',
    iface: Object.fromEntries(Object.entries(iface).map(([k, v]) => [k, rows(v)])),
    source,
  };
}

function run(blocks: Block[], main: string, temp: Row[] = []): Cpu {
  const r = compileProject({
    tags: TAGS,
    blocks: [
      {
        kind: 'OB',
        name: 'Main',
        number: 1,
        lang: 'SCL',
        iface: { Temp: rows(temp) },
        source: main,
      },
      ...blocks,
    ],
  });
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
}

describe('Datentyp-Text', () => {
  it.each([
    ['Int', 'name'],
    ['Array[0..9] of Int', 'array'],
    ['Array[1..3, 0..1] of Real', 'array'],
    ['Array[-5..5] of Array[0..1] of Bool', 'array'],
    ['Struct a : Int; b : Bool; END_STRUCT', 'struct'],
    ['"Rezept"', 'name'],
  ])('%s', (src, k) => {
    const r = parseTypeText(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.type!.k).toBe(k);
  });

  it('Fehler', () => {
    expect(parseTypeText('Array[0..] of Int').diagnostics[0]!.message).toMatch(/Feldgrenze/);
    expect(parseTypeText('Array[0..9] Int').diagnostics[0]!.message).toMatch(/OF/);
  });
});

describe('Felder (ARRAY)', () => {
  it('konstanter Index, Startwerte mit Wiederholung', () => {
    const cpu = cpuFor('"Zahl" := "Daten".Werte[0] + "Daten".Werte[3] + "Daten".Werte[4];', {
      blocks: [DB('Daten', [['Werte', 'Array[0..4] of Int', '[1, 2, 3(10)]']])],
    });
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(21);
    expect(cpu.readSlot('Daten.Werte[4]')).toBe(10);
  });

  it('FOR über ein Feld mit variablem Index', () => {
    const cpu = cpuFor(
      `#s := 0;
FOR #i := 1 TO 5 DO
  "Daten".Werte[#i] := #i * #i;
  #s := #s + "Daten".Werte[#i];
END_FOR;
"Zahl" := #s;`,
      {
        temp: [
          ['i', 'Int'],
          ['s', 'Int'],
        ],
        blocks: [DB('Daten', [['Werte', 'Array[1..5] of Int']])],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(55);
    expect(cpu.readSlot('Daten.Werte[3]')).toBe(9);
  });

  it('mehrdimensional, Zeilenreihenfolge', () => {
    const cpu = cpuFor(
      `FOR #i := 0 TO 2 DO
  FOR #j := 1 TO 2 DO
    "Daten".M[#i, #j] := #i * 10 + #j;
  END_FOR;
END_FOR;
"Zahl" := "Daten".M[2, 1] + "Daten".M[#j - 2, 2];`,
      {
        temp: [
          ['i', 'Int'],
          ['j', 'Int'],
        ],
        blocks: [DB('Daten', [['M', 'Array[0..2, 1..2] of Int']])],
      },
    );
    cpu.scan(0);
    // nach der Schleife ist #j = 3 → M[1, 2] = 12
    expect(cpu.read('%MW10')).toBe(21 + 12);
    expect(cpu.readSlot('Daten.M[1,2]')).toBe(12);
  });

  it('Index außerhalb zur Laufzeit → Programmierfehler, CPU in STOP', () => {
    const cpu = cpuFor('"Daten".Werte["Zahl"] := 1;', {
      blocks: [DB('Daten', [['Werte', 'Array[0..3] of Int']])],
    });
    cpu.setInput('%MW10', 3);
    cpu.scan(0);
    expect(cpu.stopInfo).toBeUndefined();
    expect(cpu.readSlot('Daten.Werte[3]')).toBe(1);
    cpu.setInput('%MW10', 4);
    cpu.scan(1);
    expect(cpu.stopInfo?.reason).toBe('PROGRAM_ERROR');
    expect(cpu.stopInfo?.message).toMatch(/Programmierfehler.*"Daten"\.Werte.*4/);
  });

  it('Index außerhalb beim Übersetzen', () => {
    const e = firstError('"Zahl" := "Daten".Werte[5];', {
      blocks: [DB('Daten', [['Werte', 'Array[0..4] of Int']])],
    });
    expect(e?.message).toMatch(/Index 5 liegt außerhalb/);
  });

  it.each([
    ['"Zahl" := "Daten".Werte;', /greife auf ein Element zu/],
    ['"Zahl" := "Daten".Werte[1, 2];', /1 Dimension, angegeben 2 Indexe/],
    ['"Zahl" := "Daten".Werte["Wert"];', /Feldindex muss eine Ganzzahl sein/],
    ['"Zahl" := "Daten".X[1];', /ist kein Feld/],
    ['"Daten".Werte := 1;', /nur eine ganze Variable gleichen Typs/],
  ])('Fehler: %s', (src, re) => {
    const e = firstError(src, {
      blocks: [
        DB('Daten', [
          ['Werte', 'Array[0..4] of Int'],
          ['X', 'Int'],
        ]),
      ],
    });
    expect(e?.message).toMatch(re);
  });

  it('Startwerte prüfen', () => {
    const d = (init: string) =>
      firstError('"Zahl" := "Daten".W[0];', {
        blocks: [DB('Daten', [['W', 'Array[0..2] of Int', init]])],
      });
    expect(d('[1, 2, 3, 4]')?.message).toMatch(/Zu viele Startwerte/);
    expect(d('5')?.message).toMatch(/Liste/);
    expect(d('[1, 2]')).toBeUndefined();
  });

  it('ganzes Feld zuweisen (gleicher Typ)', () => {
    const cpu = cpuFor('"Daten".B := "Daten".A;', {
      blocks: [
        DB('Daten', [
          ['A', 'Array[1..3] of Real', '[1.5, 2.5, 3.5]'],
          ['B', 'Array[1..3] of Real'],
        ]),
      ],
    });
    cpu.scan(0);
    expect(cpu.readSlot('Daten.B[3]')).toBe(3.5);
    expect(
      firstError('"Daten".C := "Daten".A;', {
        blocks: [
          DB('Daten', [
            ['A', 'Array[1..3] of Real'],
            ['C', 'Array[0..2] of Real'],
          ]),
        ],
      })?.message,
    ).toMatch(/Typkonflikt/);
  });

  it('Temp-Feld im OB', () => {
    const cpu = cpuFor(`#a[2] := 7; #a[1] := #a[2] + 1; "Zahl" := #a[1];`, {
      temp: [['a', 'Array[1..2] of Int']],
    });
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(8);
  });

  it('FB mit Feld als Static und als Durchgangsparameter', () => {
    const summe = fb(
      'FC',
      'Summe',
      `#Ergebnis := 0;
FOR #i := 0 TO 3 DO #Ergebnis := #Ergebnis + #Feld[#i]; #Feld[#i] := 0; END_FOR;`,
      {
        InOut: [['Feld', 'Array[0..3] of Int']],
        Output: [['Ergebnis', 'Int']],
        Temp: [['i', 'Int']],
      },
    );
    const puffer = fb(
      'FB',
      'Puffer',
      `#Werte[#Pos] := #Neu;
#Pos := (#Pos + 1) MOD 4;
"Summe"(Feld := #Werte, Ergebnis => #Gesamt);`,
      {
        Input: [['Neu', 'Int']],
        Output: [['Gesamt', 'Int']],
        Static: [
          ['Werte', 'Array[0..3] of Int'],
          ['Pos', 'Int'],
        ],
      },
    );
    const cpu = run(
      [summe, puffer, { kind: 'IDB', name: 'Puffer_DB', number: 2, of: 'Puffer' }],
      `"Puffer_DB"(Neu := "Zahl", Gesamt => "Sollwert");`,
    );
    cpu.setInput('%MW10', 5);
    cpu.scan(0);
    expect(cpu.read('%QW64')).toBe(5);
    expect(cpu.readSlot('Puffer_DB.Werte[0]')).toBe(0);
    expect(cpu.readSlot('Puffer_DB.Pos')).toBe(1);
  });

  it('Feld als Eingang und Ausgang eines FB wird kopiert', () => {
    const umdrehen = fb(
      'FC',
      'Umdrehen',
      `FOR #i := 0 TO 2 DO #Aus[2 - #i] := #Ein[#i]; END_FOR;`,
      {
        Input: [['Ein', 'Array[0..2] of Int']],
        Output: [['Aus', 'Array[0..2] of Int']],
        Temp: [['i', 'Int']],
      },
    );
    const cpu = run(
      [
        umdrehen,
        DB('Daten', [
          ['A', 'Array[0..2] of Int', '[1, 2, 3]'],
          ['B', 'Array[0..2] of Int'],
        ]),
      ],
      `"Umdrehen"(Ein := "Daten".A, Aus => "Daten".B);`,
    );
    cpu.scan(0);
    expect([0, 1, 2].map((i) => cpu.readSlot(`Daten.B[${i}]`))).toEqual([3, 2, 1]);
  });

  it('Quelle mit Feldern und Strukturen', () => {
    const r = compileSource(`DATA_BLOCK "Lager"
VAR
  Faecher : Array[1..3] of Struct
    Teil : Int;
    Voll : Bool;
  END_STRUCT;
  Anzahl : Int := 3;
END_VAR
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
VAR_TEMP
  i : Int;
END_VAR
BEGIN
  FOR #i := 1 TO "Lager".Anzahl DO
    "Lager".Faecher[#i].Teil := #i + 100;
    "Lager".Faecher[#i].Voll := #i > 1;
  END_FOR;
END_ORGANIZATION_BLOCK`);
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    const cpu = new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
    cpu.scan(0);
    expect(cpu.readSlot('Lager.Faecher[2].Teil')).toBe(102);
    expect(cpu.readSlot('Lager.Faecher[1].Voll')).toBe(false);
    expect(cpu.readSlot('Lager.Faecher[3].Voll')).toBe(true);
  });

  it('mehrere variable Indizes auf verschiedenen Ebenen', () => {
    const r = compileSource(`DATA_BLOCK "D"
VAR
  A : Array[0..2] of Struct
    K : Bool;
    B : Array[0..3] of Int;
  END_STRUCT;
END_VAR
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
VAR_TEMP
  i : Int;
  j : Int;
END_VAR
BEGIN
  FOR #i := 0 TO 2 DO
    #j := 3 - #i;
    "D".A[#i].B[#j] := #i * 10 + #j;
    "D".A[#i].K := TRUE;
  END_FOR;
END_ORGANIZATION_BLOCK`);
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    const cpu = new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
    cpu.scan(0);
    expect(cpu.readSlot('D.A[0].B[3]')).toBe(3);
    expect(cpu.readSlot('D.A[1].B[2]')).toBe(12);
    expect(cpu.readSlot('D.A[2].B[1]')).toBe(21);
    expect(cpu.readSlot('D.A[2].K')).toBe(true);
    expect(cpu.readSlot('D.A[2].B[0]')).toBe(0);
  });
});
