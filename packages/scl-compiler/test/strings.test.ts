import { describe, expect, it } from 'vitest';
import { CLOCK_EPOCH } from '@zyklus/sim-core';
import { DB, cpuFor, firstError } from './harness';

type Row = [string, string, string?];

function run(body: string, rows: Row[], temp: Row[] = [], at = 0) {
  const cpu = cpuFor(body, { blocks: [DB('D', rows)], temp });
  cpu.scan(at);
  return { cpu, r: (n: string) => cpu.readSlot(`D.${n}`) };
}

describe('Zeichenketten (String, Char)', () => {
  it('Funktionen LEN, CONCAT, LEFT, RIGHT, MID, FIND, DELETE, INSERT, REPLACE', () => {
    const { r } = run(
      `"D".a := CONCAT("D".s, '-', 'Linie 3');
"D".n := LEN("D".a);
"D".l := LEFT(IN := "D".a, L := 4);
"D".rt := RIGHT("D".a, 1);
"D".m := MID("D".a, 5, 6);
"D".f := FIND("D".a, 'Linie');
"D".d := DELETE("D".a, 6, 1);
"D".i := INSERT("D".s, 'X', 2);
"D".rp := REPLACE("D".s, 'ss', 1, 4);`,
      [
        ['s', 'String[10]', "'Halle'"],
        ['a', 'String'],
        ['n', 'Int'],
        ['l', 'String[4]'],
        ['rt', 'String'],
        ['m', 'String'],
        ['f', 'Int'],
        ['d', 'String'],
        ['i', 'String'],
        ['rp', 'String'],
      ],
    );
    expect(r('a')).toBe('Halle-Linie 3');
    expect(r('n')).toBe(13);
    expect(r('l')).toBe('Hall');
    expect(r('rt')).toBe('3');
    expect(r('m')).toBe('-Lini');
    expect(r('f')).toBe(7);
    expect(r('d')).toBe('Linie 3');
    expect(r('i')).toBe('HaXlle');
    expect(r('rp')).toBe('Halsse');
  });

  it('Höchstlänge schneidet ab, Vergleich, Char, Umwandlungen', () => {
    const { r } = run(
      `"D".k := 'abcdefgh';
"D".gleich := "D".k = 'abcde';
"D".kleiner := 'Apfel' < 'Birne';
"D".c := 'Z';
"D".t := CONCAT("D".k, "D".c);
"D".z := INT_TO_STRING(-42);
"D".x := STRING_TO_INT('123') + 1;
"D".code := CHAR_TO_INT("D".c);
"D".r := REAL_TO_STRING(1.5);`,
      [
        ['k', 'String[5]'],
        ['gleich', 'Bool'],
        ['kleiner', 'Bool'],
        ['c', 'Char'],
        ['t', 'String'],
        ['z', 'String'],
        ['x', 'Int'],
        ['code', 'Int'],
        ['r', 'String'],
      ],
    );
    expect(r('k')).toBe('abcde');
    expect(r('gleich')).toBe(true);
    expect(r('kleiner')).toBe(true);
    expect(r('t')).toBe('abcdeZ');
    expect(r('z')).toBe('-42');
    expect(r('x')).toBe(124);
    expect(r('code')).toBe(90);
    expect(r('r')).toBe('1.5');
  });

  it('Feld von Zeichenketten mit variablem Index, Fluchtzeichen', () => {
    const { r } = run(
      `FOR #i := 0 TO 2 DO "D".log[#i] := CONCAT('Eintrag $'', INT_TO_STRING(#i)); END_FOR;`,
      [['log', 'Array[0..2] of String[12]']],
      [['i', 'Int']],
    );
    expect(r('log[2]')).toBe("Eintrag '2");
  });

  it('Fehler', () => {
    const e = (body: string, rows: Row[]) => firstError(body, { blocks: [DB('D', rows)] })?.message;
    expect(e('"D".c := \'AB\';', [['c', 'Char']])).toMatch(/genau ein Zeichen/);
    expect(e('"D".i := \'5\';', [['i', 'Int']])).toMatch(/STRING_TO_INT/);
    expect(e('"D".s := "D".s + \'x\';', [['s', 'String']])).toMatch(/nicht auf String/);
    expect(e('"D".s := \'\';', [['s', 'String[300]']])).toMatch(/1 … 254/);
    expect(e('"D".s := \'\';', [['s', 'String[3]', "'abcd'"]])).toMatch(/länger als 3/);
  });
});

describe('Datum und Uhrzeit (Date, TOD, DTL)', () => {
  it('RD_SYS_T liefert die Spielzeit als DTL', () => {
    const at = ((24 + 2) * 3600 + 30 * 60 + 5) * 1000 + 250; // Dienstag 08:30:05,25
    const { r } = run(
      `#ret := RD_SYS_T(OUT => "D".jetzt);
RD_LOC_T(OUT => "D".log[1]);
"D".stunde := "D".jetzt.HOUR;`,
      [
        ['jetzt', 'DTL'],
        ['log', 'Array[0..1] of DTL'],
        ['stunde', 'USInt'],
      ],
      [['ret', 'Int']],
      at,
    );
    expect(new Date(CLOCK_EPOCH).toISOString()).toBe('2026-01-05T06:00:00.000Z');
    expect(r('jetzt.YEAR')).toBe(2026);
    expect(r('jetzt.MONTH')).toBe(1);
    expect(r('jetzt.DAY')).toBe(6);
    expect(r('jetzt.WEEKDAY')).toBe(3);
    expect(r('stunde')).toBe(8);
    expect(r('jetzt.MINUTE')).toBe(30);
    expect(r('jetzt.SECOND')).toBe(5);
    expect(r('jetzt.NANOSECOND')).toBe(250_000_000);
    expect(r('log[1].DAY')).toBe(6);
    expect(r('log[0].YEAR')).toBe(1970);
  });

  it('Date- und TOD-Literale, Vergleich', () => {
    const { r } = run(
      `"D".spaet := "D".zeit > TOD#06:00:00;
"D".tag := D#1990-01-02;`,
      [
        ['zeit', 'Time_Of_Day', 'TOD#22:15:00.5'],
        ['spaet', 'Bool'],
        ['tag', 'Date'],
      ],
    );
    expect(r('zeit')).toBe((22 * 3600 + 15 * 60) * 1000 + 500);
    expect(r('spaet')).toBe(true);
    expect(r('tag')).toBe(1);
  });

  it('RD_SYS_T ohne DTL ist ein Fehler', () => {
    expect(firstError('RD_SYS_T(OUT => "Zahl");')?.message).toMatch(/DTL/);
  });
});

describe('Blockbefehle und Teilzugriffe', () => {
  it('MOVE_BLK und FILL_BLK', () => {
    const { r } = run(
      `FILL_BLK(IN := 7, COUNT := 3, OUT => "D".b[1]);
MOVE_BLK(IN := "D".a[0], COUNT := 2, OUT => "D".b[3]);`,
      [
        ['a', 'Array[0..2] of Int', '[1, 2, 3]'],
        ['b', 'Array[0..4] of Int'],
      ],
    );
    expect([0, 1, 2, 3, 4].map((i) => r(`b[${i}]`))).toEqual([0, 7, 7, 1, 2]);
  });

  it('MOVE_BLK über das Feldende → Programmierfehler', () => {
    const { cpu } = run('MOVE_BLK(IN := "D".a[0], COUNT := 4, OUT => "D".a[1]);', [
      ['a', 'Array[0..3] of Int'],
    ]);
    expect(cpu.stopInfo?.reason).toBe('PROGRAM_ERROR');
  });

  it('SWAP und Bit-/Bytezugriffe', () => {
    const { r } = run(
      `"D".s := SWAP("D".w);
"D".bit := "D".w.%X1;
"D".hi := "D".w.%B1;
"D".w.%X15 := TRUE;
"D".i.%B0 := 16#FF;`,
      [
        ['w', 'Word', '16#1234'],
        ['s', 'Word'],
        ['bit', 'Bool'],
        ['hi', 'Byte'],
        ['i', 'Int', '256'],
      ],
    );
    expect(r('s')).toBe(0x3412);
    expect(r('bit')).toBe(false);
    expect(r('hi')).toBe(0x12);
    expect(r('w')).toBe(0x9234);
    expect(r('i')).toBe(0x1ff);
  });

  it('Fehler bei Teilzugriffen', () => {
    const e = (body: string) =>
      firstError(body, {
        blocks: [
          DB('D', [
            ['w', 'Word'],
            ['r', 'Real'],
          ]),
        ],
      })?.message;
    expect(e('"D".w.%X16 := TRUE;')).toMatch(/passt nicht in Word/);
    expect(e('"D".w.%W0 := 1;')).toMatch(/passt nicht/);
    expect(e('"D".r.%X0 := TRUE;')).toMatch(/nur auf Bitfolgen/);
  });
});

describe('MOVE_BLK mit PLC-Datentyp', () => {
  it('kopiert ganze Strukturen, auch mit variablem Startindex', async () => {
    const { compileScl, formatDiagnostic } = await import('../src');
    const { Cpu } = await import('@zyklus/sim-core');
    const r = compileScl('MOVE_BLK(IN := "D".a["Zahl"], COUNT := 2, OUT => "D".b[0]);', {
      types: [
        {
          name: 'P',
          fields: [
            { name: 'x', type: 'Int' },
            { name: 's', type: 'String[4]' },
          ],
        },
      ],
      blocks: [
        DB('D', [
          ['a', 'Array[0..3] of "P"'],
          ['b', 'Array[0..1] of "P"'],
        ]),
      ],
      tags: [{ name: 'Zahl', address: '%MW10', t: 'INT' }],
    });
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    const cpu = new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
    cpu.slots[r.program!.slots.findIndex((s) => s.name === 'D.a[2].s')] = 'zwei';
    cpu.setInput('%MW10', 2);
    cpu.scan(0);
    expect(cpu.readSlot('D.b[0].s')).toBe('zwei');
  });
});
