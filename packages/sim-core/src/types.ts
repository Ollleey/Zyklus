/**
 * Elementare Datentypen der Spiel-SPS (Auswahl wie S7-1500).
 * TIME wird als vorzeichenbehaftete Millisekunden (32 bit) geführt.
 * BYTE, WORD, DWORD, LWORD sind Bitfolgen (vorzeichenlos).
 * **Spielvereinfachung:** 64-bit-Typen (LINT, ULINT, LWORD) sind JS-Zahlen und auf ±(2^53 − 1)
 * begrenzt (Sättigung statt Überlauf); LREAL ist 64-bit-Gleitkomma.
 */
export type DataType =
  | 'BOOL'
  | 'BYTE'
  | 'WORD'
  | 'DWORD'
  | 'LWORD'
  | 'SINT'
  | 'USINT'
  | 'INT'
  | 'UINT'
  | 'DINT'
  | 'UDINT'
  | 'LINT'
  | 'ULINT'
  | 'REAL'
  | 'LREAL'
  | 'TIME'
  /** Datum: Tage seit 1990-01-01 */
  | 'DATE'
  /** Uhrzeit: ms seit Mitternacht */
  | 'TOD'
  /** ein Zeichen (JS-String der Länge 1) */
  | 'CHAR'
  /** Zeichenkette, Höchstlänge je Variable (`SlotDecl.len`, Standard 254) */
  | 'STRING';

export type Value = boolean | number | string;

/** Standardlänge von String ohne Angabe */
export const STRING_DEFAULT_LEN = 254;

export const DATA_TYPES: readonly DataType[] = [
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'REAL',
  'LREAL',
  'TIME',
  'DATE',
  'TOD',
  'CHAR',
  'STRING',
];

export const INT_MIN = -32768;
export const INT_MAX = 32767;
export const DINT_MIN = -2147483648;
export const DINT_MAX = 2147483647;
export const BYTE_MAX = 0xff;
export const WORD_MAX = 0xffff;
export const DWORD_MAX = 0xffffffff;
/** Grenze der 64-bit-Typen im Spiel (sicherer Ganzzahlbereich von JS) */
export const LONG_MAX = Number.MAX_SAFE_INTEGER;

export function isBitStringType(t: DataType): boolean {
  return t === 'BYTE' || t === 'WORD' || t === 'DWORD' || t === 'LWORD';
}

/** Ganzzahlen mit Vorzeichen oder ohne (SINT … ULINT), ohne TIME und Bitfolgen */
export function isIntType(t: DataType): boolean {
  return (
    t === 'SINT' ||
    t === 'USINT' ||
    t === 'INT' ||
    t === 'UINT' ||
    t === 'DINT' ||
    t === 'UDINT' ||
    t === 'LINT' ||
    t === 'ULINT'
  );
}

export function isRealType(t: DataType): boolean {
  return t === 'REAL' || t === 'LREAL';
}

export function isIntegerType(t: DataType): boolean {
  return isIntType(t) || t === 'TIME' || isBitStringType(t);
}

/** Typen, auf denen + - * / erlaubt sind. */
export function isArithmeticType(t: DataType): boolean {
  return isIntType(t) || isRealType(t) || t === 'TIME';
}

/** Typen, auf denen AND/OR/XOR/NOT erlaubt sind. */
export function isBitwiseType(t: DataType): boolean {
  return t === 'BOOL' || isBitStringType(t);
}

/** Breite einer Bitfolge in Bit. */
export function bitWidth(t: DataType): number {
  switch (t) {
    case 'BOOL':
      return 1;
    case 'BYTE':
    case 'SINT':
    case 'USINT':
    case 'CHAR':
      return 8;
    case 'WORD':
    case 'INT':
    case 'UINT':
    case 'DATE':
      return 16;
    case 'STRING':
      return 0;
    case 'LWORD':
    case 'LINT':
    case 'ULINT':
    case 'LREAL':
      return 64;
    default:
      return 32;
  }
}

export function defaultValue(t: DataType): Value {
  if (t === 'STRING') return '';
  if (t === 'CHAR') return ' ';
  return t === 'BOOL' ? false : 0;
}

/** Wertebereich ganzzahliger Typen (für Sättigung bei Konvertierung). */
export function integerRange(t: DataType): [number, number] {
  switch (t) {
    case 'INT':
      return [INT_MIN, INT_MAX];
    case 'SINT':
      return [-128, 127];
    case 'USINT':
      return [0, 255];
    case 'UINT':
      return [0, WORD_MAX];
    case 'UDINT':
      return [0, DWORD_MAX];
    case 'LINT':
      return [-LONG_MAX, LONG_MAX];
    case 'ULINT':
    case 'LWORD':
      return [0, LONG_MAX];
    case 'BYTE':
      return [0, BYTE_MAX];
    case 'WORD':
      return [0, WORD_MAX];
    case 'DWORD':
      return [0, DWORD_MAX];
    case 'DINT':
    case 'TIME':
      return [DINT_MIN, DINT_MAX];
    case 'DATE':
      // D#1990-01-01 … D#2168-12-31
      return [0, 65378];
    case 'TOD':
      return [0, 86_399_999];
    default:
      throw new Error(`Kein ganzzahliger Typ: ${t}`);
  }
}

function toNumber(v: Value): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return 0;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Bringt einen Rohwert in die Darstellung des Zieltyps. Ganzzahltypen laufen wie auf
 * echter Hardware über (Zweierkomplement), REAL wird auf 32-bit-Gleitkomma gerundet.
 */
export function normalize(t: DataType, v: Value): Value {
  switch (t) {
    case 'BOOL':
      return typeof v === 'boolean' ? v : v !== 0;
    case 'INT':
      return (toNumber(v) << 16) >> 16;
    case 'SINT':
      return (toNumber(v) << 24) >> 24;
    case 'USINT':
    case 'BYTE':
      return toNumber(v) & BYTE_MAX;
    case 'UINT':
      return toNumber(v) & WORD_MAX;
    case 'UDINT':
      return toNumber(v) >>> 0;
    case 'LINT':
    case 'ULINT':
    case 'LWORD': {
      const [lo, hi] = integerRange(t);
      const n = Math.trunc(toNumber(v));
      return n < lo ? lo : n > hi ? hi : n === 0 ? 0 : n;
    }
    case 'LREAL':
      return typeof v === 'number' ? v : toNumber(v);
    case 'DATE':
    case 'TOD': {
      const [lo, hi] = integerRange(t);
      const n = Math.trunc(toNumber(v));
      return n < lo ? lo : n > hi ? hi : n;
    }
    case 'CHAR':
      return typeof v === 'string' ? v.charAt(0) || ' ' : String.fromCharCode(toNumber(v) & 0xff);
    case 'STRING':
      return typeof v === 'string' ? v : String(v);
    case 'WORD':
      return toNumber(v) & WORD_MAX;
    case 'DWORD':
      return toNumber(v) >>> 0;
    case 'DINT':
    case 'TIME':
      return toNumber(v) | 0;
    case 'REAL':
      return Math.fround(typeof v === 'number' ? v : toNumber(v));
  }
}

/** Kaufmännisch auf gerade Zahl runden (IEC ROUND): 0.5 → 0, 1.5 → 2, -2.5 → -2. */
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) return r - 1;
  return r;
}

export function saturate(t: DataType, x: number): number {
  if (Number.isNaN(x)) return 0;
  const [lo, hi] = integerRange(t);
  return x < lo ? lo : x > hi ? hi : x;
}
