import { describe, expect, it } from 'vitest';
import {
  countStatements,
  looksLikeSource,
  parseBody,
  parseExpression,
  parseSource,
  type Expr,
  type Stmt,
} from '../src';

/** Ausdruck als vollständig geklammerter Text */
function show(e: Expr): string {
  switch (e.k) {
    case 'lit':
      return String(e.v);
    case 'ref':
      return [e.name, ...e.path].join('.');
    case 'unary':
      return `(${e.op} ${show(e.e)})`;
    case 'binary':
      return `(${show(e.a)} ${e.op} ${show(e.b)})`;
    case 'call':
      return `${e.name}(${e.args.map((a) => (a.name ? `${a.name}:=` : '') + show(a.e)).join(', ')})`;
    case 'list':
      return `[${e.items.map((i) => (i.n > 1 ? `${i.n}(${show(i.e)})` : show(i.e))).join(', ')}]`;
  }
}

function expr(src: string): string {
  const r = parseExpression(src);
  expect(r.diagnostics).toEqual([]);
  return show(r.expr!);
}

describe('Ausdrücke – Präzedenz nach IEC 61131-3', () => {
  it.each([
    ['a OR b AND c', '(a OR (b AND c))'],
    ['a XOR b OR c', '((a XOR b) OR c)'],
    ['a AND b XOR c', '((a AND b) XOR c)'],
    ['NOT a AND b', '((NOT a) AND b)'],
    ['a = b AND c', '((a = b) AND c)'],
    ['a < b = c', '((a < b) = c)'],
    ['a + b * c', '(a + (b * c))'],
    ['a - b - c', '((a - b) - c)'],
    ['a * b MOD c', '((a * b) MOD c)'],
    ['(a + b) * c', '((a + b) * c)'],
    ['-a * b', '((- a) * b)'],
    ['a & b', '(a AND b)'],
    ['-5 + 3', '(-5 + 3)'],
    ['a > 10 OR b <= -2', '((a > 10) OR (b <= -2))'],
  ])('%s', (src, expected) => {
    expect(expr(src)).toBe(expected);
  });

  it('Funktionsaufrufe mit Positions- und benannten Parametern', () => {
    expect(expr('LIMIT(0, a, 100)')).toBe('LIMIT(0, a, 100)');
    expect(expr('limit(MN := 0, IN := a, MX := 100)')).toBe('LIMIT(MN:=0, IN:=a, MX:=100)');
  });

  it('Elementzugriffe mit Pfad', () => {
    expect(expr('#a.b AND "Daten".T1.Q')).toBe('(a.b AND Daten.T1.Q)');
  });

  it('Ausdruck mit Rest wird abgewiesen', () => {
    expect(parseExpression('1 2').diagnostics[0]!.message).toMatch(/Unerwartet/);
  });
});

describe('Anweisungsteil', () => {
  const body = (src: string) => {
    const r = parseBody(src);
    expect(r.diagnostics).toEqual([]);
    return r.body;
  };

  it('IF / ELSIF / ELSE', () => {
    const [s] = body('IF a THEN x := 1; ELSIF b THEN x := 2; ELSE x := 3; END_IF;');
    expect(s).toMatchObject({ k: 'if', branches: [{ body: [{}] }, { body: [{}] }], else: [{}] });
  });

  it('CASE mit Listen, Bereichen und ELSE', () => {
    const [s] = body(`
      CASE #schritt OF
        0: x := 1;
        1, 3: x := 2; y := 3;
        5..9, -1: ;
      ELSE
        x := 0;
      END_CASE;`);
    const c = s as Extract<Stmt, { k: 'case' }>;
    expect(c.items.map((i) => i.labels.map((l) => [l.lo, l.hi]))).toEqual([
      [[0, undefined]],
      [
        [1, undefined],
        [3, undefined],
      ],
      [
        [5, 9],
        [-1, undefined],
      ],
    ]);
    expect(c.items[1]!.body).toHaveLength(2);
    expect(c.else).toHaveLength(1);
  });

  it('FOR / WHILE / REPEAT / EXIT / CONTINUE / RETURN / REGION', () => {
    const s = body(`
      FOR #i := 1 TO 10 BY 2 DO EXIT; END_FOR;
      WHILE a DO CONTINUE; END_WHILE;
      REPEAT x := x + 1; UNTIL x > 5 END_REPEAT;
      REGION Ansteuerung – Förderband (Teil 1)
        x := 1;
      END_REGION
      RETURN;`);
    expect(s.map((x) => x.k)).toEqual(['for', 'while', 'repeat', 'region', 'return']);
    expect(s[3]).toMatchObject({ name: 'Ansteuerung – Förderband (Teil 1)' });
  });

  it('Aufrufe von Instanzen', () => {
    const [a, b] = body(`
      "IEC_Timer_0_DB".TON(IN := "Start", PT := T#2s, Q => #fertig, ET => #zeit);
      "R_TRIG_DB"(CLK := "Taster");`);
    expect(a).toMatchObject({
      k: 'fbcall',
      inst: { scope: 'tag', name: 'IEC_Timer_0_DB', path: ['TON'] },
      args: [
        { name: 'IN' },
        { name: 'PT' },
        { name: 'Q', out: { name: 'fertig' } },
        { name: 'ET' },
      ],
    });
    expect(b).toMatchObject({ k: 'fbcall', inst: { name: 'R_TRIG_DB', path: [] } });
  });

  it('Anweisungen zählen (nicht Zeilen, REGION nicht)', () => {
    const r = parseBody(`
      IF a THEN
        x := 1; y := 2;
      ELSE
        z := 3;
      END_IF;
      REGION r
        "T".TON(IN := a, PT := T#1s); ;;
      END_REGION
      FOR #i := 1 TO 3 DO x := x + 1; END_FOR;`);
    expect(countStatements(r.body)).toBe(7);
  });
});

describe('Syntaxfehler', () => {
  const errs = (src: string) => parseBody(src).diagnostics;

  it('Position (Zeile/Spalte) und verständlicher Text', () => {
    const [d] = errs('x := 1;\ny := 2\nz := 3;');
    expect(d).toMatchObject({ severity: 'error', start: { line: 3, col: 1 } });
    expect(d!.message).toBe('„;“ erwartet am Ende der Anweisung, gefunden „z“');
  });

  it.each([
    ['IF a x := 1; END_IF;', /THEN erwartet nach der IF-Bedingung/],
    ['IF a THEN x := 1;', /END_IF erwartet/],
    ['x = 1;', /Zuweisung mit „:=“/],
    ['x := ;', /Ausdruck erwartet, gefunden „;“/],
    ['x := (1 + 2;', /„\)“ erwartet/],
    ['x := 2 ** 3;', /Potenzieren/],
    ['FOR #i = 1 TO 3 DO END_FOR;', /„:=“ erwartet nach der Laufvariable/],
    ['CASE x OF a := 1; END_CASE;', /CASE-Marke erwartet/],
    ['VAR a : INT; END_VAR', /in der Bausteinschnittstelle deklariert/],
    ['REGION x\n a := 1;', /END_REGION erwartet/],
    ['END_IF;', /Unerwartetes Schlüsselwort END_IF/],
  ])('%s', (src, re) => {
    const d = errs(src);
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]!.message).toMatch(re);
  });

  it('sammelt mehrere Fehler (Recovery nach ;)', () => {
    const d = errs('x := ;\ny := 1;\nz := * 2;\nw := 3;');
    expect(d.map((x) => x.start.line)).toEqual([1, 3]);
  });

  it('Recovery innerhalb von Blöcken', () => {
    const d = errs('IF a THEN\n  x := ;\n  y := 1;\nEND_IF;\nz := ;');
    expect(d.map((x) => x.start.line)).toEqual([2, 5]);
  });

  it('lexikalische Fehler werden als Diagnose gemeldet', () => {
    const d = errs('x := "offen;');
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toMatch(/Anführungszeichen/);
  });
});

describe('Externe Quelle (TIA-Format)', () => {
  const SRC = `
DATA_BLOCK "IEC_Timer_0_DB"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN
IEC_TIMER

BEGIN

END_DATA_BLOCK

DATA_BLOCK "Daten"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN
   VAR
      Anzahl : Int := 5;   // Zähler
      Aktiv { ExternalAccessible := 'False'} : Bool;
   END_VAR

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
TITLE = Main Program Sweep (Cycle)
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
   VAR_TEMP
      tmp : Int;
   END_VAR
   VAR CONSTANT
      GRENZE : Int := 10;
   END_VAR

BEGIN
	"IEC_Timer_0_DB".TON(IN := "Start", PT := T#2S);
	"Motor" := "IEC_Timer_0_DB".Q;
END_ORGANIZATION_BLOCK
`;

  it('erkennt Quellen', () => {
    expect(looksLikeSource(SRC)).toBe(true);
    expect(looksLikeSource('"Motor" := TRUE;')).toBe(false);
  });

  it('liest Bausteine, Schnittstellen und Anweisungsteile', () => {
    const r = parseSource(SRC);
    expect(r.diagnostics).toEqual([]);
    expect(r.blocks.map((b) => [b.kind, b.name, b.instanceOf])).toEqual([
      ['DB', 'IEC_Timer_0_DB', 'IEC_TIMER'],
      ['DB', 'Daten', undefined],
      ['OB', 'Main', undefined],
    ]);
    const [, daten, main] = r.blocks;
    expect(daten!.decls.map((d) => [d.section, d.name, d.typeName, d.initText])).toEqual([
      ['Static', 'Anzahl', 'Int', '5'],
      ['Static', 'Aktiv', 'Bool', undefined],
    ]);
    expect(main!.title).toBe('Main Program Sweep (Cycle)');
    expect(main!.decls.map((d) => [d.section, d.name])).toEqual([
      ['Temp', 'tmp'],
      ['Constant', 'GRENZE'],
    ]);
    expect(main!.body).toHaveLength(2);
    expect(main!.bodyText.trim()).toMatch(/^"IEC_Timer_0_DB"\.TON/);
  });

  it('meldet Fehler in der Quelle mit Position', () => {
    const r = parseSource('ORGANIZATION_BLOCK "Main"\nBEGIN\n  x := ;\nEND_ORGANIZATION_BLOCK');
    expect(r.diagnostics[0]).toMatchObject({ start: { line: 3 } });
    expect(parseSource('FOO "x"').diagnostics[0]!.message).toMatch(/Bausteinanfang erwartet/);
  });
});
