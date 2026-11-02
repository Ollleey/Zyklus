import { describe, expect, it } from 'vitest';
import { DB, cpuFor, firstError } from './harness';

/** Rechnet in einem DB mit einer Variablen je Typ */
function calc(body: string, rows: [string, string, string?][]) {
  const cpu = cpuFor(body, { blocks: [DB('D', rows)] });
  cpu.scan(0);
  return (n: string) => cpu.readSlot(`D.${n}`);
}

describe('weitere Elementartypen', () => {
  it('SInt/USInt/UInt/UDInt laufen über wie auf der Hardware', () => {
    const r = calc(
      `"D".s := "D".s + 1; "D".u := "D".u + 1; "D".w := "D".w - 1; "D".d := "D".d * 2;`,
      [
        ['s', 'SInt', '127'],
        ['u', 'USInt', '255'],
        ['w', 'UInt', '0'],
        ['d', 'UDInt', '3000000000'],
      ],
    );
    expect(r('s')).toBe(-128);
    expect(r('u')).toBe(0);
    expect(r('w')).toBe(65535);
    expect(r('d')).toBe((3000000000 * 2) % 2 ** 32);
  });

  it('LInt und LReal rechnen genauer als DInt und Real', () => {
    const r = calc(`"D".l := "D".l * 1000; "D".x := "D".x / 3.0; "D".f := "D".f / 3.0;`, [
      ['l', 'LInt', '5000000000'],
      ['x', 'LReal', '1.0'],
      ['f', 'Real', '1.0'],
    ]);
    expect(r('l')).toBe(5e12);
    expect(r('x')).toBe(1 / 3);
    expect(r('f')).toBe(Math.fround(1 / 3));
  });

  it('implizite Erweiterung und Konvertierungsfunktionen', () => {
    const r = calc(
      `"D".l := "D".s; "D".x := "D".f; "D".i := LREAL_TO_INT("D".x * 2.0); "D".b := USINT_TO_BYTE("D".u);
"D".k := DINT_TO_SINT(1000);`,
      [
        ['s', 'SInt', '-5'],
        ['l', 'LInt'],
        ['f', 'Real', '2.5'],
        ['x', 'LReal'],
        ['i', 'Int'],
        ['u', 'USInt', '200'],
        ['b', 'Byte'],
        ['k', 'SInt'],
      ],
    );
    expect(r('l')).toBe(-5);
    expect(r('x')).toBe(2.5);
    expect(r('i')).toBe(5);
    expect(r('b')).toBe(200);
    expect(r('k')).toBe(127);
  });

  it('typisierte Literale, LWord-Bitlogik, Schleife und CASE mit USInt', () => {
    const r = calc(
      `"D".w := LWORD#16#F0F0 AND LWORD#16#FF00;
FOR "D".n := USINT#1 TO 5 DO "D".s := "D".s + "D".n; END_FOR;
CASE "D".n OF 6: "D".ok := TRUE; END_CASE;`,
      [
        ['w', 'LWord'],
        ['n', 'USInt'],
        ['s', 'UInt'],
        ['ok', 'Bool'],
      ],
    );
    expect(r('w')).toBe(0xf000);
    expect(r('s')).toBe(15);
    expect(r('ok')).toBe(true);
  });

  it('Fehler: Verengung, Bereich, 64-bit als PLC-Variable', () => {
    const e = (body: string, rows: [string, string, string?][]) =>
      firstError(body, { blocks: [DB('D', rows)] })?.message;
    expect(
      e('"D".s := "D".i;', [
        ['s', 'SInt'],
        ['i', 'Int'],
      ]),
    ).toMatch(/INT_TO_SINT/);
    expect(e('"D".s := 200;', [['s', 'SInt']])).toMatch(/außerhalb von SInt/);
    expect(
      e('"D".r := "D".x;', [
        ['r', 'Real'],
        ['x', 'LReal'],
      ]),
    ).toMatch(/LREAL_TO_REAL/);
    expect(firstError('"Zahl" := 1;', { blocks: [], temp: [] }) ?? undefined).toBeUndefined();
  });
});

describe('PLC-Variablen mit neuen Typen', () => {
  it('USInt/UInt/UDInt im Merker, 64-bit-Typen nicht', async () => {
    const { compileScl } = await import('../src');
    const ok = compileScl('"A" := "A" + 1;', {
      tags: [{ name: 'A', address: '%MD4', t: 'UDINT' }],
    });
    expect(ok.ok).toBe(true);
    const bad = compileScl('', { tags: [{ name: 'L', address: '%MD8', t: 'LREAL' }] });
    expect(bad.diagnostics[0]?.message).toMatch(/nur in Datenbausteinen/);
  });
});
