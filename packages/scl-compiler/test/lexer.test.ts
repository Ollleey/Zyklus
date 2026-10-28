import { describe, expect, it } from 'vitest';
import { SclError, tokenize } from '../src';

const kinds = (src: string) => tokenize(src).map((t) => [t.kind, t.value]);
const nums = (src: string) =>
  tokenize(src)
    .filter((t) => t.num !== undefined)
    .map((t) => t.num);

describe('Lexer', () => {
  it('Bezeichner, Schlüsselwörter (Groß-/Kleinschreibung egal), lokal, global, Adresse', () => {
    expect(kinds('if #a then "Motor" := %q0.0; end_if')).toEqual([
      ['keyword', 'IF'],
      ['local', 'a'],
      ['keyword', 'THEN'],
      ['quoted', 'Motor'],
      ['op', ':='],
      ['address', '%Q0.0'],
      ['op', ';'],
      ['keyword', 'END_IF'],
      ['eof', ''],
    ]);
  });

  it('Zahlenformate', () => {
    expect(nums('42 1_000 16#FF 2#1010 8#17 1.5 2.5e3 1E-2')).toEqual([
      42, 1000, 255, 10, 15, 1.5, 2500, 0.01,
    ]);
    expect(tokenize('1.5')[0]!.kind).toBe('real');
    expect(tokenize('16#FF')[0]!.kind).toBe('int');
  });

  it('Bereich 1..5 wird nicht als Gleitkommazahl gelesen', () => {
    expect(kinds('1..5').slice(0, 3)).toEqual([
      ['int', '1'],
      ['op', '..'],
      ['int', '5'],
    ]);
  });

  it('Zeitangaben in ms', () => {
    expect(
      nums('T#500ms T#1s T#1s200ms T#2m T#1m30s T#1h T#1d T#1.5s TIME#250MS t#-2s T#1s_5ms'),
    ).toEqual([500, 1000, 1200, 120000, 90000, 3600000, 86400000, 1500, 250, -2000, 1005]);
    expect(tokenize('T#1s')[0]!.type).toBe('TIME');
  });

  it('Typisierte Literale', () => {
    const t = tokenize('INT#-5 DINT#100000 WORD#16#F0F0 REAL#1.5 BOOL#TRUE BOOL#0');
    expect(t.slice(0, 6).map((x) => [x.type, x.num])).toEqual([
      ['INT', -5],
      ['DINT', 100000],
      ['WORD', 0xf0f0],
      ['REAL', 1.5],
      ['BOOL', 1],
      ['BOOL', 0],
    ]);
  });

  it('Kommentare aller Art und Positionen', () => {
    const t = tokenize('// Zeile\n(* Block\n mehrzeilig *) /* C */ #x');
    expect(t[0]).toMatchObject({ kind: 'local', value: 'x', start: { line: 3, col: 24 } });
  });

  it('Operatoren mit längster Übereinstimmung', () => {
    expect(kinds('<= >= <> := => .. ** &').map(([, v]) => v)).toEqual([
      '<=',
      '>=',
      '<>',
      ':=',
      '=>',
      '..',
      '**',
      '&',
      '',
    ]);
  });

  it.each([
    ['"offen', /Anführungszeichen/],
    ['(* offen', /Kommentar/],
    ['T#5x', /Zeiteinheit/],
    ['T#', /Zeitangabe erwartet/],
    ['%X0.0', /Ungültige Adresse/],
    ['12abc', /Ungültige Zahl/],
    ['# x', /Variablenname/],
    ['a ? b', /Unerwartetes Zeichen „\?“/],
    ['INT#1.5', /ganze Zahl/],
  ])('Fehler: %s', (src, re) => {
    expect(() => tokenize(src)).toThrow(re);
    try {
      tokenize(src);
    } catch (e) {
      expect(e).toBeInstanceOf(SclError);
      expect((e as SclError).span.start.line).toBe(1);
    }
  });
});
