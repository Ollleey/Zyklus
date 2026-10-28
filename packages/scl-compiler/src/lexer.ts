import type { DataType } from '@zyklus/sim-core';
import { SclError, type Pos, type Span } from './diagnostics';

export type TokenKind =
  | 'ident' // Bezeichner (value = Originaltext)
  | 'keyword' // value = Schlüsselwort in Großbuchstaben
  | 'local' // #name
  | 'quoted' // "name"
  | 'address' // %I0.0
  | 'int' // ganze Zahl ohne Typpräfix
  | 'real' // Gleitkommazahl ohne Typpräfix
  | 'typed' // Literal mit Typpräfix (INT#5, T#1s, WORD#16#FF); 16#FF allein ist 'int'
  | 'string' // 'text' (nur in Attributen der Quelle)
  | 'op' // Operator / Satzzeichen
  | 'eof';

export interface Token extends Span {
  kind: TokenKind;
  value: string;
  /** bei int/real/typed: Zahlenwert (TIME in ms) */
  num?: number;
  /** bei typed: Datentyp */
  type?: DataType;
  /** bei REGION und TITLE: Rest der Zeile */
  text?: string;
  /** Zeichenoffsets im Quelltext (für Import/Export) */
  from: number;
  to: number;
}

export const KEYWORDS = [
  'IF',
  'THEN',
  'ELSIF',
  'ELSE',
  'END_IF',
  'CASE',
  'OF',
  'END_CASE',
  'FOR',
  'TO',
  'BY',
  'DO',
  'END_FOR',
  'WHILE',
  'END_WHILE',
  'REPEAT',
  'UNTIL',
  'END_REPEAT',
  'EXIT',
  'CONTINUE',
  'RETURN',
  'REGION',
  'END_REGION',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'MOD',
  'TRUE',
  'FALSE',
  'VAR',
  'VAR_INPUT',
  'VAR_OUTPUT',
  'VAR_IN_OUT',
  'VAR_TEMP',
  'END_VAR',
  'CONSTANT',
  'BEGIN',
  'ORGANIZATION_BLOCK',
  'END_ORGANIZATION_BLOCK',
  'FUNCTION_BLOCK',
  'END_FUNCTION_BLOCK',
  'FUNCTION',
  'END_FUNCTION',
  'DATA_BLOCK',
  'END_DATA_BLOCK',
  'STRUCT',
  'END_STRUCT',
] as const;

const KEYWORD_SET = new Set<string>(KEYWORDS);

/** Längste Operatoren zuerst. */
const OPERATORS = [
  ':=',
  '=>',
  '<=',
  '>=',
  '<>',
  '..',
  '**',
  '(',
  ')',
  ',',
  ';',
  ':',
  '=',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '.',
  '&',
  '[',
  ']',
  '{',
  '}',
];

const TYPE_PREFIXES: Record<string, DataType> = {
  BOOL: 'BOOL',
  BYTE: 'BYTE',
  WORD: 'WORD',
  DWORD: 'DWORD',
  INT: 'INT',
  DINT: 'DINT',
  REAL: 'REAL',
  TIME: 'TIME',
  T: 'TIME',
  B: 'BYTE',
  W: 'WORD',
  DW: 'DWORD',
};

const DURATION_UNITS: [string, number][] = [
  ['ms', 1],
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1000],
];

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
// TIA erlaubt Buchstaben inkl. Umlaute in Namen
const isIdentStart = (c: string | undefined) => c !== undefined && /[\p{L}_]/u.test(c);
const isIdentPart = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/** Zerlegt SCL-Quelltext in Tokens. Wirft SclError beim ersten lexikalischen Fehler. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const pos = (): Pos => ({ line, col });
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const fail = (msg: string, start: Pos): never => {
    throw new SclError(msg, { start, end: pos() });
  };
  const restOfLine = (): string => {
    let s = '';
    while (i < src.length && src[i] !== '\n') {
      s += src[i];
      advance();
    }
    return s.trim();
  };

  /** liest Ziffern (mit _ als Trenner) in der gegebenen Basis */
  const readDigits = (base: number): string => {
    let s = '';
    const valid = (c: string | undefined) =>
      c !== undefined && (c === '_' || (parseInt(c, base) >= 0 && parseInt(c, base) < base));
    while (valid(src[i])) {
      if (src[i] !== '_') s += src[i];
      advance();
    }
    return s;
  };

  /** Zahl ab aktueller Position: dezimal, Basis-Literal (16#FF) oder Gleitkomma. */
  const readNumber = (start: Pos): { num: number; isReal: boolean } => {
    const digits = readDigits(10);
    if (src[i] === '#' && ['2', '8', '16'].includes(digits)) {
      advance();
      const base = Number(digits);
      const body = readDigits(base);
      if (!body) fail(`Ziffern nach ${digits}# erwartet`, start);
      return { num: parseInt(body, base), isReal: false };
    }
    let text = digits;
    let isReal = false;
    if (src[i] === '.' && isDigit(src[i + 1])) {
      advance();
      text += '.' + readDigits(10);
      isReal = true;
    }
    if (
      (src[i] === 'e' || src[i] === 'E') &&
      (isDigit(src[i + 1]) || /[+-]/.test(src[i + 1] ?? ''))
    ) {
      text += 'e';
      advance();
      if (src[i] === '+' || src[i] === '-') {
        text += src[i];
        advance();
      }
      const exp = readDigits(10);
      if (!exp) fail('Exponent erwartet', start);
      text += exp;
      isReal = true;
    }
    return { num: Number(text), isReal };
  };

  const readDuration = (start: Pos): number => {
    let negative = false;
    if (src[i] === '-') {
      negative = true;
      advance();
    }
    let total = 0;
    let parts = 0;
    while (isDigit(src[i])) {
      let text = readDigits(10);
      if (src[i] === '.' && isDigit(src[i + 1])) {
        advance();
        text += '.' + readDigits(10);
      }
      const rest = src.slice(i, i + 2).toLowerCase();
      const unit = DURATION_UNITS.find(
        ([u]) => rest.startsWith(u) && !(u === 'm' && rest === 'ms'),
      );
      if (!unit) fail('Zeiteinheit erwartet (d, h, m, s, ms)', start);
      advance(unit![0].length);
      total += Number(text) * unit![1];
      parts++;
      if (src[i] === '_') advance();
    }
    if (!parts) fail('Zeitangabe erwartet, z. B. T#500ms oder T#1s200ms', start);
    if (isIdentPart(src[i])) fail('Ungültige Zeitangabe', start);
    return Math.round(negative ? -total : total);
  };

  while (i < src.length) {
    const c = src[i]!;
    const start = pos();
    const from = i;
    const push = (t: Omit<Token, 'start' | 'end' | 'from' | 'to'>) =>
      tokens.push({ ...t, start, end: pos(), from, to: i });

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance();
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }
    if ((c === '(' && src[i + 1] === '*') || (c === '/' && src[i + 1] === '*')) {
      const close = c === '(' ? '*)' : '*/';
      advance(2);
      while (i < src.length && src.slice(i, i + 2) !== close) advance();
      if (i >= src.length) fail('Kommentar wird nicht geschlossen', start);
      advance(2);
      continue;
    }

    if (c === '#') {
      advance();
      if (!isIdentStart(src[i])) fail('Nach # wird ein Variablenname erwartet', start);
      let name = '';
      while (isIdentPart(src[i])) {
        name += src[i];
        advance();
      }
      push({ kind: 'local', value: name });
      continue;
    }

    if (c === '"') {
      advance();
      let name = '';
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') {
        name += src[i];
        advance();
      }
      if (src[i] !== '"') fail('Anführungszeichen wird nicht geschlossen', start);
      advance();
      if (!name) fail('Leerer Name in Anführungszeichen', start);
      push({ kind: 'quoted', value: name });
      continue;
    }

    if (c === "'") {
      advance();
      let text = '';
      while (i < src.length && src[i] !== "'" && src[i] !== '\n') {
        text += src[i];
        advance();
      }
      if (src[i] !== "'") fail('Hochkomma wird nicht geschlossen', start);
      advance();
      push({ kind: 'string', value: text });
      continue;
    }

    if (c === '%') {
      const m = /^%[IQM](?:\d+\.\d+|[BWD]\d+)/i.exec(src.slice(i));
      if (!m) fail('Ungültige Adresse (z. B. %I0.0, %IB0, %IW64, %MD10)', start);
      advance(m![0].length);
      push({ kind: 'address', value: m![0].toUpperCase() });
      continue;
    }

    if (isDigit(c)) {
      const { num, isReal } = readNumber(start);
      if (isIdentPart(src[i])) fail('Ungültige Zahl', start);
      push({ kind: isReal ? 'real' : 'int', value: String(num), num });
      continue;
    }

    if (isIdentStart(c)) {
      let word = '';
      while (isIdentPart(src[i])) {
        word += src[i];
        advance();
      }
      const upper = word.toUpperCase();
      if (src[i] === '#' && TYPE_PREFIXES[upper]) {
        const type = TYPE_PREFIXES[upper]!;
        advance();
        let num: number;
        if (type === 'TIME') {
          num = readDuration(start);
        } else if (type === 'BOOL') {
          const m = /^(TRUE|FALSE|0|1)\b/i.exec(src.slice(i));
          if (!m) fail('BOOL# erwartet TRUE, FALSE, 0 oder 1', start);
          advance(m![0].length);
          num = /^(TRUE|1)$/i.test(m![0]) ? 1 : 0;
        } else {
          let sign = 1;
          if (src[i] === '-' || src[i] === '+') {
            if (src[i] === '-') sign = -1;
            advance();
          }
          if (!isDigit(src[i])) fail(`Zahl nach ${word}# erwartet`, start);
          const r = readNumber(start);
          if (r.isReal && type !== 'REAL') fail(`${word}# erwartet eine ganze Zahl`, start);
          num = sign * r.num;
          if (isIdentPart(src[i])) fail('Ungültige Zahl', start);
        }
        push({ kind: 'typed', value: word, num, type });
        continue;
      }
      if (upper === 'REGION') {
        // REGION <Name bis Zeilenende>
        push({ kind: 'keyword', value: upper, text: restOfLine() });
        continue;
      }
      if (upper === 'TITLE' && /^\s*=/.test(src.slice(i, i + 40))) {
        while (src[i] !== '=') advance();
        advance();
        push({ kind: 'ident', value: 'TITLE', text: restOfLine() });
        continue;
      }
      if (KEYWORD_SET.has(upper)) push({ kind: 'keyword', value: upper });
      else push({ kind: 'ident', value: word });
      continue;
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      advance(op.length);
      push({ kind: 'op', value: op });
      continue;
    }

    advance();
    fail(`Unerwartetes Zeichen „${c}“`, start);
  }

  tokens.push({ kind: 'eof', value: '', start: pos(), end: pos(), from: i, to: i });
  return tokens;
}
