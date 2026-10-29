import { describe, expect, it } from 'vitest';
import {
  formatDiagnostic,
  toMonacoMarkers,
  MARKER_SEVERITY,
  sclMonarch,
  compileProject,
} from '../src';
import { DB, IDB, compile, firstError } from './harness';

describe('Typ- und Namensfehler', () => {
  it.each([
    ['#x := 1;', /Lokale Variable #x ist nicht deklariert/],
    ['"Gibts" := TRUE;', /PLC-Variable „Gibts“ ist nicht definiert/],
    ['"Gibts".x := TRUE;', /Datenbaustein „Gibts“ ist nicht definiert/],
    ['foo := TRUE;', /„foo“ ist weder lokal deklariert noch eine PLC-Variable/],
    ['"Motor" := 2;', /BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt/],
    ['"Motor" := "Zahl";', /Int kann nicht in Bool umgewandelt werden/],
    ['"Zahl" := TRUE;', /Bool kann nicht in Int umgewandelt werden – verwende BOOL_TO_INT/],
    ['"Zahl" := "Gross";', /DInt kann nicht in Int umgewandelt werden – verwende DINT_TO_INT/],
    ['"Zahl" := "Wert";', /Real kann nicht in Int.*REAL_TO_INT/],
    ['"Zahl" := 1.5;', /Gleitkomma-Konstante kann nicht in Int/],
    ['"Dauer" := 500;', /Zeitangaben schreibt man z\. B\. T#500ms/],
    ['"Zahl" := 40000;', /Wert 40000 liegt außerhalb von Int/],
    ['%MB0 := 300;', /Wert 300 liegt außerhalb von Byte/],
    ['"Motor" := "Start" + "Stopp";', /Operator \+ ist nicht auf Bool anwendbar/],
    ['"Motor" := "Start" < "Stopp";', /Operator < ist auf Bool nicht anwendbar/],
    ['"Motor" := "Zahl" AND "Start";', /Operator AND ist nicht auf Int und Bool anwendbar/],
    ['"Zahl" := "Zahl" AND "Gross";', /AND ist nur auf Bool und Bitfolgen/],
    ['"Wert" := "Wert" MOD 2.0;', /MOD ist nur auf Int und DInt/],
    ['"Dauer" := "Dauer" * "Dauer";', /Time \* Time/],
    ['"Motor" := NOT "Zahl";', /NOT ist auf Int nicht anwendbar/],
    ['"Zahl" := -"Start";', /Vorzeichen/],
    ['%Q200.0 := TRUE;', /außerhalb des Bereichs/],
  ])('%s', (src, re) => {
    const d = firstError(src);
    expect(d, src).toBeDefined();
    expect(d!.message).toMatch(re);
  });
});

describe('Bausteinschnittstelle (TIA-Regeln)', () => {
  it('OB hat nur Temp und Constant', () => {
    const r = compileProject({
      tags: [],
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'SCL',
          iface: { Static: [{ name: 'x', type: 'Int' }] },
          source: '',
        },
      ],
    });
    const d = r.diagnostics.find((x) => x.severity === 'error')!;
    expect(d.message).toMatch(/Im OB gibt es nur Temp und Constant/);
    expect(d.location).toEqual({ block: 'Main', part: 'interface', section: 'Static', row: 0 });
  });

  it.each([
    [{ temp: [['x', 'Float']] }, /Unbekannter Datentyp „Float“/],
    [
      {
        temp: [
          ['x', 'Int'],
          ['X', 'Bool'],
        ],
      },
      /#X ist bereits deklariert/,
    ],
    [{ temp: [['t', 'TON_TIME']] }, /gehören in einen Instanz-DB/],
    [{ temp: [['x', 'Int', '1.5']] }, /Gleitkomma-Konstante kann nicht in Int/],
    [{ temp: [['x', 'Int', '"Zahl"']] }, /Startwert muss eine Konstante sein/],
    [{ temp: [['x', 'Int', '1 +']] }, /Startwert von x/],
    [{ constants: [['K', 'Int', '1']] }, /K ist eine Konstante/, 'K := 2;'],
  ] as const)('%#: %s', (extra, re, body?: string) => {
    const d = firstError(body ?? '', extra as never);
    expect(d!.message).toMatch(re);
  });

  it('Fehler in der Schnittstelle zeigen auf Bereich und Zeile', () => {
    const d = firstError('', {
      temp: [
        ['a', 'Int'],
        ['b', 'Flt'],
      ],
    });
    expect(d!.location).toMatchObject({ part: 'interface', section: 'Temp', row: 1 });
  });

  it('Variablentabelle: Fehler mit Zeile, Namenskonflikt mit Baustein', () => {
    const r = compileProject({
      tags: [
        { name: 'A', address: '%I0.0', t: 'BOOL' },
        { name: 'A', address: '%I0.1', t: 'BOOL' },
      ],
      blocks: [
        { kind: 'OB', name: 'Main', number: 1, lang: 'SCL', iface: {}, source: '' },
        DB('Main2', []),
      ],
    });
    expect(r.diagnostics[0]).toMatchObject({ location: { part: 'tags', row: 1 } });
    expect(r.diagnostics[0]!.message).toMatch(/bereits vergeben/);
  });

  it('Datenbausteine', () => {
    expect(
      firstError('', {
        blocks: [
          DB('D', [
            ['x', 'Int'],
            ['X', 'Int'],
          ]),
        ],
      })!.message,
    ).toMatch(/doppelt/);
    expect(firstError('', { blocks: [IDB('I', 'GIBTS')] })!.message).toMatch(
      /unbekannter Typ „GIBTS“/,
    );
    expect(firstError('"D" := 1;', { blocks: [DB('D', [['x', 'Int']])] })!.message).toMatch(
      /braucht ein Element/,
    );
    expect(firstError('"D".y := 1;', { blocks: [DB('D', [['x', 'Int']])] })!.message).toMatch(
      /hat kein Element y/,
    );
  });

  it('fehlender OB, eigene FB (später)', () => {
    const r = compileProject({ tags: [], blocks: [] });
    expect(r.diagnostics[0]!.message).toMatch(/Kein Organisationsbaustein/);
  });
});

describe('Aufrufe von Systembausteinen', () => {
  const T = {
    blocks: [
      IDB('T', 'IEC_TIMER'),
      IDB('Ton', 'TON_TIME'),
      IDB('Z', 'IEC_COUNTER'),
      DB('D', [['b', 'Bool']]),
    ],
  };
  it.each([
    ['"T".TON(IN := TRUE);', /Eingang PT von TON fehlt/],
    [
      '"T".TON(IN := TRUE, PT := T#1s, CU := TRUE);',
      /TON hat keinen Eingang CU \(Eingänge: IN, PT\)/,
    ],
    ['"T".TON(IN := TRUE, PT := 100);', /Zeitangaben/],
    ['"T".TON(IN := TRUE, IN := TRUE, PT := T#1s);', /doppelt/],
    ['"T".TON(IN := TRUE, PT := T#1s, CV => "Zahl");', /keinen Ausgang CV/],
    ['"T"(IN := TRUE, PT := T#1s);', /vom Typ IEC_TIMER – rufe "T"\.TON\(…\) auf/],
    ['"T".CTU(CU := TRUE, PV := 1);', /IEC_TIMER – CTU passt nicht/],
    [
      '"T".TON(IN := TRUE, PT := T#1s); "T".TOF(IN := TRUE, PT := T#1s);',
      /bereits als TON verwendet/,
    ],
    ['"Ton".TON(IN := TRUE, PT := T#1s);', /wird direkt aufgerufen: "Ton"\(…\)/],
    ['"Motor" := "Ton".CV;', /TON_TIME hat kein Element CV \(verfügbar: Q, ET\)/],
    ['"Motor" := "Z".Q;', /IEC_COUNTER \(CTU\) hat kein Element Q \(verfügbar: QU, QD, CV\)/],
    ['"Motor" := "Ton";', /meinst du "Ton"\.Q/],
    ['"Ton".Q := TRUE;', /kann nur gelesen werden/],
    ['"D"(IN := TRUE);', /braucht ein Element/],
    ['"D".b(IN := TRUE);', /ist keine Instanz/],
    ['#x(IN := TRUE);', /Multiinstanzen/],
    ['LIMIT(MN := 0, IN := 5, MX := 10);', /Funktion und liefert einen Wert/],
    ['ABS(5);', /Ergebnis von ABS wird nicht verwendet/],
  ])('%s', (src, re) => {
    expect(firstError(src, T)!.message).toMatch(re);
  });
});

describe('Funktionen und Kontrollstrukturen', () => {
  it.each([
    ['"Zahl" := LIMIT(0, 5);', /LIMIT erwartet 3 Argument/],
    ['"Zahl" := LIMIT(MN := 0, IN := 5);', /Parameter MX fehlt/],
    ['"Zahl" := LIMIT(MN := 0, IN := 5, MX := 9, XX := 1);', /keinen Parameter XX/],
    ['"Zahl" := LIMIT(MN := 0, 5, 9);', /alle benannt/],
    ['"Zahl" := FOO(1);', /Unbekannte Funktion FOO/],
    ['"Motor" := IN_RANGE(MIN := 0, VAL := "Zahl", MAX := 9);', /nur in FUP\/KOP/],
    [
      '"Zahl" := MUX(K := 0, IN0 := 1, IN1 := 2, ELSE := 3);',
      /keinen Parameter ELSE – der Ersatzwert heißt INELSE/,
    ],
    ['"Zahl" := MUX(K := 0, IN0 := 1, IN1 := 2, SONST := 3);', /keinen Parameter SONST.*INELSE/],
    ['"Zahl" := REAL_TO_INT("Zahl");', /REAL_TO_INT erwartet Real, erhalten Int/],
    ['"Zahl" := MAX("Zahl", "Start");', /unverträgliche Typen/],
    ['"Zahl" := SHL(IN := "Zahl", N := 1);', /SHL erwartet eine Bitfolge/],
    ['EXIT;', /EXIT ist nur innerhalb einer Schleife/],
    ['CASE "Wert" OF 1: ; END_CASE;', /CASE-Ausdruck muss Int oder DInt sein/],
    ['CASE "Zahl" OF 1: ; 1: ; END_CASE;', /mehrfach/],
    ['CASE "Zahl" OF 1..5: ; 3: ; END_CASE;', /mehrfach/],
    ['CASE "Zahl" OF 5..1: ; END_CASE;', /Bereich ist leer/],
    ['CASE "Zahl" OF 40000: ; END_CASE;', /außerhalb von Int/],
    ['FOR "Wert" := 1 TO 2 DO ; END_FOR;', /Laufvariable muss Int oder DInt/],
    ['FOR "Zahl" := 1 TO 2 BY "Zahl" DO ; END_FOR;', /Schrittweite \(BY\) muss eine Konstante/],
    ['FOR "Zahl" := 1 TO 2 BY 0 DO ; END_FOR;', /Endlosschleife/],
    ['IF "Zahl" THEN ; END_IF;', /Int kann nicht in Bool/],
  ])('%s', (src, re) => {
    expect(firstError(src)!.message).toMatch(re);
  });

  it('Fehler tragen die genaue Position im Codeteil', () => {
    const d = firstError('"Zahl" := 1;\n"Zahl" := "Zahl" + TRUE;');
    expect(d!.start).toEqual({ line: 2, col: 11 });
    expect(d!.end).toEqual({ line: 2, col: 24 });
    expect(d!.location).toEqual({ block: 'Main', part: 'code' });
    expect(formatDiagnostic(d!)).toMatch(/^Fehler in Zeile 2, Spalte 11: /);
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
    const r = compile('"Start" := TRUE;', { temp: [['unbenutzt', 'Int']] });
    expect(r.ok).toBe(true);
    expect(r.diagnostics.map((d) => [d.severity, d.message])).toEqual([
      ['warning', 'Schreibzugriff auf Eingang "Start" – wird im nächsten Zyklus überschrieben'],
      ['warning', 'Variable #unbenutzt wird nicht verwendet'],
    ]);
    expect(r.diagnostics[1]!.location).toMatchObject({
      part: 'interface',
      section: 'Temp',
      row: 0,
    });
  });
});

describe('Monaco', () => {
  it('Marker übernehmen Position und Schweregrad', () => {
    const r = compile('"Start" := TRUE;\n"Zahl" := TRUE;');
    const m = toMonacoMarkers(r.diagnostics.filter((d) => d.location.part === 'code'));
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

  it('Monarch-Regeln decken Grundtokens ab', () => {
    const firstMatch = (s: string) =>
      sclMonarch.tokenizer.root.find((r) => (r[0] as RegExp).exec(s)?.index === 0)?.[1];
    expect(firstMatch('T#1s500ms')).toBe('number.time');
    expect(firstMatch('16#FF')).toBe('number.hex');
    expect(firstMatch('%IW64')).toBe('variable.address');
    expect(firstMatch('#lokal')).toBe('variable.local');
    expect(firstMatch('#Zähler')).toBe('variable.local');
    expect(firstMatch('"Global"')).toBe('variable.global');
    expect(sclMonarch.keywords).toContain('END_REGION');
    expect(sclMonarch.typeKeywords).toContain('IEC_TIMER');
    expect(sclMonarch.builtins).toContain('DWORD_TO_DINT');
  });
});
