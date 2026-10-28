/**
 * Elementare Datentypen der Spiel-SPS (Auswahl wie S7-1500).
 * TIME wird als vorzeichenbehaftete Millisekunden (32 bit) geführt.
 * BYTE, WORD, DWORD sind Bitfolgen (vorzeichenlos).
 */
export type DataType = 'BOOL' | 'BYTE' | 'WORD' | 'DWORD' | 'INT' | 'DINT' | 'REAL' | 'TIME';

export type Value = boolean | number;

export const DATA_TYPES: readonly DataType[] = [
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'INT',
  'DINT',
  'REAL',
  'TIME',
];

export const INT_MIN = -32768;
export const INT_MAX = 32767;
export const DINT_MIN = -2147483648;
export const DINT_MAX = 2147483647;
export const BYTE_MAX = 0xff;
export const WORD_MAX = 0xffff;
export const DWORD_MAX = 0xffffffff;

export function isBitStringType(t: DataType): boolean {
  return t === 'BYTE' || t === 'WORD' || t === 'DWORD';
}

export function isIntegerType(t: DataType): boolean {
  return t === 'INT' || t === 'DINT' || t === 'TIME' || isBitStringType(t);
}

/** Typen, auf denen + - * / erlaubt sind. */
export function isArithmeticType(t: DataType): boolean {
  return t === 'INT' || t === 'DINT' || t === 'REAL' || t === 'TIME';
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
      return 8;
    case 'WORD':
    case 'INT':
      return 16;
    default:
      return 32;
  }
}

export function defaultValue(t: DataType): Value {
  return t === 'BOOL' ? false : 0;
}

/** Wertebereich ganzzahliger Typen (für Sättigung bei Konvertierung). */
export function integerRange(t: DataType): [number, number] {
  switch (t) {
    case 'INT':
      return [INT_MIN, INT_MAX];
    case 'BYTE':
      return [0, BYTE_MAX];
    case 'WORD':
      return [0, WORD_MAX];
    case 'DWORD':
      return [0, DWORD_MAX];
    case 'DINT':
    case 'TIME':
      return [DINT_MIN, DINT_MAX];
    default:
      throw new Error(`Kein ganzzahliger Typ: ${t}`);
  }
}

function toNumber(v: Value): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
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
    case 'BYTE':
      return toNumber(v) & BYTE_MAX;
    case 'WORD':
      return toNumber(v) & WORD_MAX;
    case 'DWORD':
      return toNumber(v) >>> 0;
    case 'DINT':
    case 'TIME':
      return toNumber(v) | 0;
    case 'REAL':
      return Math.fround(typeof v === 'boolean' ? (v ? 1 : 0) : v);
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
