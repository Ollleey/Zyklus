import { describe, expect, it } from 'vitest';
import { formatDiagnostic, toMonacoMarkers, MARKER_SEVERITY, sclMonarch } from '../src';
import { compile, firstError } from './harness';

describe('Semantische Fehler', () => {
  it.each([
    ['#x := 1;', /Lokale Variable #x ist nicht deklariert/],
    ['"Gibts" := TRUE;', /PLC-Variable „Gibts“ ist nicht definiert/],
    ['foo := TRUE;', /„foo“ ist weder lokal deklariert noch eine PLC-Variable/],
    ['"Motor" := 1;', /Ganzzahl-Konstante kann nicht in BOOL/],
    ['"Zahl" := TRUE;', /BOOL kann nicht in INT umgewandelt werden – verwende BOOL_TO_INT/],
    ['"Zahl" := "Gross";', /DINT kann nicht in INT umgewandelt werden – verwende DINT_TO_INT/],
    ['"Zahl" := "Wert";', /REAL kann nicht in INT.*REAL_TO_INT/],
    ['"Zahl" := 1.5;', /Gleitkomma-Konstante kann nicht in INT/],
    ['"Dauer" := 500;', /Zeitangaben schreibt man z\. B\. T#500ms/],
    ['"Muster" := "Zahl";', /INT kann nicht in WORD.*INT_TO_WORD/],
    ['"Zahl" := 40000;', /Wert 40000 liegt außerhalb von INT/],
    ['"Motor" := "Start" + "Stopp";', /Operator \+ ist nicht auf BOOL anwendbar/],
    ['"Motor" := "Start" < "Stopp";', /Operator < ist auf BOOL nicht anwendbar/],
    ['"Motor" := "Zahl" AND "Start";', /Operator AND ist nicht auf INT und BOOL anwendbar/],
    ['"Zahl" := "Zahl" AND 3;', /AND ist nur auf BOOL und WORD anwendbar/],
    ['"Wert" := "Wert" MOD 2.0;', /MOD ist nur auf INT und DINT/],
    ['"Dauer" := "Dauer" * "Dauer";', /TIME \* TIME/],
    ['"Motor" := NOT "Zahl";', /NOT ist auf INT nicht anwendbar/],
    ['"Zahl" := -"Start";', /Vorzeichen/],
    ['%Q200.0 := TRUE;', /außerhalb des Bereichs/],
  ])('%s', (src, re) => {
    const d = firstError(src);
    expect(d, src).toBeDefined();
    expect(d!.message).toMatch(re);
  });

  it.each([
    ['VAR x : FLOAT; END_VAR', /Unbekannter Datentyp „FLOAT“/],
    ['VAR x : INT; x : BOOL; END_VAR', /#x ist bereits deklariert/],
    ['VAR_TEMP t : TON; END_VAR', /nur im Abschnitt VAR/],
    ['VAR t : TON := 1; END_VAR', /keinen Startwert/],
    ['VAR x : INT := 1.5; END_VAR', /Gleitkomma-Konstante kann nicht in INT/],
    ['VAR x : INT := "Zahl"; END_VAR', /Startwert muss eine Konstante sein/],
    ['VAR CONSTANT K : INT := 1; END_VAR K := 2;', /K ist eine Konstante/],
  ])('Deklaration: %s', (src, re) => {
    expect(firstError(src)!.message).toMatch(re);
  });

  it.each([
    ['VAR t : TON; END_VAR #t(IN := TRUE);', /Eingang PT von TON fehlt/],
    [
      'VAR t : TON; END_VAR #t(IN := TRUE, PT := T#1s, CU := TRUE);',
      /TON hat keinen Eingang CU \(Eingänge: IN, PT\)/,
    ],
    ['VAR t : TON; END_VAR #t(IN := TRUE, PT := 100);', /Zeitangaben/],
    ['VAR t : TON; END_VAR #t(IN := TRUE, IN := TRUE, PT := T#1s);', /doppelt/],
    ['VAR t : TON; END_VAR #t(IN := TRUE, PT := T#1s, CV => "Zahl");', /keinen Ausgang CV/],
    ['VAR t : TON; END_VAR "Motor" := #t.CV;', /TON hat kein Element CV \(verfügbar: Q, ET\)/],
    ['VAR t : TON; END_VAR "Motor" := #t;', /meinst du t\.Q/],
    ['VAR t : TON; END_VAR #t.Q := TRUE;', /kann nur gelesen werden/],
    ['VAR t : TON; END_VAR "Motor" := t(IN := TRUE, PT := T#1s);', /Ausdruck erwartet|keinen Wert/],
    ['VAR x : INT; END_VAR #x(IN := TRUE);', /keine FB-Instanz/],
    ['LIMIT(MN := 0, IN := 5, MX := 10);', /Funktion und liefert einen Wert/],
    ['ABS(5);', /Ergebnis von ABS wird nicht verwendet/],
  ])('FB/Funktion: %s', (src, re) => {
    expect(firstError(src)!.message).toMatch(re);
  });

  it.each([
    ['"Zahl" := LIMIT(0, 5);', /LIMIT erwartet 3 Argument/],
    ['"Zahl" := LIMIT(MN := 0, IN := 5);', /Parameter MX fehlt/],
    ['"Zahl" := LIMIT(MN := 0, IN := 5, MX := 9, XX := 1);', /keinen Parameter XX/],
    ['"Zahl" := LIMIT(MN := 0, 5, 9);', /alle benannt/],
    ['"Zahl" := FOO(1);', /Unbekannte Funktion FOO/],
    ['"Zahl" := REAL_TO_INT("Zahl");', /REAL_TO_INT erwartet REAL, erhalten INT/],
    ['"Zahl" := MAX("Zahl", "Start");', /unverträgliche Typen/],
  ])('Funktionsargumente: %s', (src, re) => {
    expect(firstError(src)!.message).toMatch(re);
  });

  it.each([
    ['EXIT;', /EXIT ist nur innerhalb einer Schleife/],
    ['CASE "Wert" OF 1: ; END_CASE;', /CASE-Ausdruck muss INT oder DINT sein/],
    ['CASE "Zahl" OF 1: ; 1: ; END_CASE;', /mehrfach/],
    ['CASE "Zahl" OF 1..5: ; 3: ; END_CASE;', /mehrfach/],
    ['CASE "Zahl" OF 5..1: ; END_CASE;', /Bereich ist leer/],
    ['CASE "Zahl" OF 40000: ; END_CASE;', /außerhalb von INT/],
    [
      'VAR_TEMP r : REAL; END_VAR FOR #r := 1 TO 2 DO ; END_FOR;',
      /Laufvariable muss INT oder DINT/,
    ],
    [
      'VAR_TEMP i : INT; END_VAR FOR #i := 1 TO 2 BY "Zahl" DO ; END_FOR;',
      /Schrittweite \(BY\) muss eine Konstante/,
    ],
    ['VAR_TEMP i : INT; END_VAR FOR #i := 1 TO 2 BY 0 DO ; END_FOR;', /Endlosschleife/],
    ['IF "Zahl" THEN ; END_IF;', /INT kann nicht in BOOL/],
  ])('Kontrollstruktur: %s', (src, re) => {
    expect(firstError(src)!.message).toMatch(re);
  });

  it('Fehler tragen die genaue Position', () => {
    const d = firstError('VAR a : INT; END_VAR\n#a := 1;\n#a := #a + TRUE;');
    expect(d!.start).toEqual({ line: 3, col: 7 });
    expect(d!.end).toEqual({ line: 3, col: 16 });
    expect(formatDiagnostic(d!)).toMatch(/^Fehler in Zeile 3, Spalte 7: /);
  });

  it('mehrere Fehler werden gesammelt und nach Position sortiert', () => {
    const r = compile('"Zahl" := TRUE;\n"Motor" := 5;\n#x := 1;');
    expect(r.ok).toBe(false);
    expect(r.program).toBeUndefined();
    expect(r.diagnostics.map((d) => d.start.line)).toEqual([1, 2, 3]);
  });
});

describe('Warnungen', () => {
  it('unbenutzte Variablen und Schreiben auf Eingänge', () => {
    const r = compile('VAR unbenutzt : INT; END_VAR\n"Start" := TRUE;');
    expect(r.ok).toBe(true);
    expect(r.diagnostics.map((d) => [d.severity, d.message])).toEqual([
      ['warning', 'Variable #unbenutzt wird nicht verwendet'],
      ['warning', 'Schreibzugriff auf Eingang "Start" – wird im nächsten Zyklus überschrieben'],
    ]);
  });
});

describe('Monaco', () => {
  it('Marker übernehmen Position und Schweregrad', () => {
    const r = compile('VAR u : INT; END_VAR\n"Zahl" := TRUE;');
    const m = toMonacoMarkers(r.diagnostics);
    expect(m).toEqual([
      expect.objectContaining({ severity: MARKER_SEVERITY.Warning, startLineNumber: 1 }),
      expect.objectContaining({
        severity: MARKER_SEVERITY.Error,
        startLineNumber: 2,
        startColumn: 11,
        endColumn: 15,
      }),
    ]);
  });

  it('leere Spanne wird mindestens ein Zeichen breit', () => {
    const [m] = toMonacoMarkers([
      { severity: 'error', message: 'x', start: { line: 1, col: 5 }, end: { line: 1, col: 5 } },
    ]);
    expect(m!.endColumn).toBe(6);
  });

  it('Monarch-Regeln sind gültige reguläre Ausdrücke und decken Grundtokens ab', () => {
    const rules = sclMonarch.tokenizer.root.map((r) => r[0] as RegExp);
    const firstMatch = (s: string) =>
      sclMonarch.tokenizer.root.find((r) => (r[0] as RegExp).exec(s)?.index === 0)?.[1];
    expect(rules.every((r) => r instanceof RegExp)).toBe(true);
    expect(firstMatch('T#1s500ms')).toBe('number.time');
    expect(firstMatch('16#FF')).toBe('number.hex');
    expect(firstMatch('%IW64')).toBe('variable.address');
    expect(firstMatch('#lokal')).toBe('variable.local');
    expect(firstMatch('"Global"')).toBe('variable.global');
    expect(sclMonarch.keywords).toContain('END_IF');
    expect(sclMonarch.builtins).toContain('REAL_TO_INT');
  });
});
