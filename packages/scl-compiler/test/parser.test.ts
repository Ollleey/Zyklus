import { describe, expect, it } from 'vitest';
import { countStatements, parse, type Expr, type Stmt } from '../src';

/** Ausdruck als vollständig geklammerter Text */
function show(e: Expr): string {
  switch (e.k) {
    case 'lit':
      return String(e.v);
    case 'ref':
      return e.name + (e.member ? `.${e.member}` : '');
    case 'unary':
      return `(${e.op} ${show(e.e)})`;
    case 'binary':
      return `(${show(e.a)} ${e.op} ${show(e.b)})`;
    case 'call':
      return `${e.name}(${e.args.map((a) => (a.name ? `${a.name}:=` : '') + show(a.e)).join(', ')})`;
  }
}

function expr(src: string): string {
  const r = parse(`#x := ${src};`);
  expect(r.diagnostics).toEqual([]);
  const s = r.unit.body[0] as Extract<Stmt, { k: 'assign' }>;
  return show(s.e);
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

  it('Elementzugriff', () => {
    expect(expr('#T1.Q AND "Daten".Wert')).toBe('(T1.Q AND Daten.Wert)');
  });
});

describe('Anweisungen', () => {
  const body = (src: string) => {
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    return r.unit.body;
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
    expect(s).toMatchObject({ k: 'case' });
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

  it('FOR / WHILE / REPEAT / EXIT / CONTINUE / RETURN', () => {
    const s = body(`
      FOR #i := 1 TO 10 BY 2 DO EXIT; END_FOR;
      WHILE a DO CONTINUE; END_WHILE;
      REPEAT x := x + 1; UNTIL x > 5 END_REPEAT;
      RETURN;`);
    expect(s.map((x) => x.k)).toEqual(['for', 'while', 'repeat', 'return']);
  });

  it('FB-Aufruf mit Ein- und Ausgängen', () => {
    const [s] = body('#T1(IN := "Start", PT := T#2s, Q => #fertig, ET => #zeit);');
    expect(s).toMatchObject({
      k: 'fbcall',
      inst: { scope: 'local', name: 'T1' },
      args: [
        { name: 'IN' },
        { name: 'PT' },
        { name: 'Q', out: { name: 'fertig' } },
        { name: 'ET' },
      ],
    });
  });

  it('Deklarationen', () => {
    const r = parse(`
      VAR
        a, b : INT := 5;
        t1 : TON;
      END_VAR
      VAR_TEMP i : DINT; END_VAR
      VAR CONSTANT MAXIMUM : INT := 100; END_VAR
      a := b;`);
    expect(r.diagnostics).toEqual([]);
    expect(r.unit.decls.map((d) => [d.section, d.name, d.typeName])).toEqual([
      ['VAR', 'a', 'INT'],
      ['VAR', 'b', 'INT'],
      ['VAR', 't1', 'TON'],
      ['VAR_TEMP', 'i', 'DINT'],
      ['CONST', 'MAXIMUM', 'INT'],
    ]);
  });

  it('Anweisungen zählen (nicht Zeilen)', () => {
    const r = parse(`
      IF a THEN
        x := 1; y := 2;
      ELSE
        z := 3;
      END_IF;
      #T1(IN := a, PT := T#1s); ;;
      FOR #i := 1 TO 3 DO x := x + 1; END_FOR;`);
    // IF(1) + 3 Zuweisungen + FB-Aufruf + FOR(1) + 1 Zuweisung; leere Anweisungen zählen nicht
    expect(countStatements(r.unit.body)).toBe(7);
  });
});

describe('Syntaxfehler', () => {
  const errs = (src: string) => parse(src).diagnostics;

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
    ['#T1(TRUE, T#1s);', /benannte Parameter/],
    ['x := 1; VAR a : INT; END_VAR', /Deklarationen müssen vor/],
    ['VAR a INT; END_VAR', /„:“ erwartet/],
    ['VAR CONSTANT A : INT; END_VAR', /Konstante braucht einen Wert/],
    ['x := a[1];', /Arrays/],
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
