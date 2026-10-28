import { isArithmeticType, isBitStringType, type DataType } from '@zyklus/sim-core';
import type { LiteralType } from './ast';

/** Elementare Datentypen (Schreibweise in TIA egal: Int, INT, int). */
export const ELEMENTARY: Record<string, DataType> = {
  BOOL: 'BOOL',
  BYTE: 'BYTE',
  WORD: 'WORD',
  DWORD: 'DWORD',
  INT: 'INT',
  DINT: 'DINT',
  REAL: 'REAL',
  TIME: 'TIME',
};

/**
 * Implizite Konvertierungen, angelehnt an S7-1500 mit deaktivierter IEC-Prüfung.
 * Verengungen (DINT → INT, REAL → INT …) brauchen bewusst eine Konvertierungsfunktion.
 */
const IMPLICIT: Record<DataType, readonly DataType[]> = {
  BOOL: [],
  BYTE: ['WORD', 'DWORD', 'INT', 'DINT'],
  WORD: ['DWORD', 'INT', 'DINT'],
  DWORD: ['DINT'],
  INT: ['DINT', 'REAL', 'WORD'],
  DINT: ['REAL', 'DWORD', 'TIME'],
  REAL: [],
  TIME: ['DINT'],
};

export function implicitOk(from: DataType, to: DataType): boolean {
  return from === to || IMPLICIT[from].includes(to);
}

export function isLiteralType(t: LiteralType): t is 'ANY_INT' | 'ANY_REAL' {
  return t === 'ANY_INT' || t === 'ANY_REAL';
}

/** Typen, in die sich eine Ganzzahl-Konstante ohne Präfix einsetzen lässt. */
const INT_LITERAL_TARGETS: readonly DataType[] = ['INT', 'DINT', 'REAL', 'BYTE', 'WORD', 'DWORD'];

export function acceptsIntLiteral(t: DataType): boolean {
  return INT_LITERAL_TARGETS.includes(t);
}

/**
 * Gemeinsamer Typ zweier Operanden oder undefined, wenn unverträglich.
 * `prefer` entscheidet, wenn beide Richtungen implizit gehen (z. B. INT/WORD):
 * für Arithmetik/Vergleich der Zahlentyp, für Bitlogik die Bitfolge.
 */
export function unify(
  a: LiteralType,
  b: LiteralType,
  prefer: 'arith' | 'bits' = 'arith',
): LiteralType | undefined {
  if (a === b) return a;
  if (a === 'ANY_INT' || b === 'ANY_INT') {
    const o = a === 'ANY_INT' ? b : a;
    if (o === 'ANY_REAL') return 'ANY_REAL';
    if (o === 'ANY_INT') return o;
    return acceptsIntLiteral(o) ? o : undefined;
  }
  if (a === 'ANY_REAL' || b === 'ANY_REAL') {
    const o = a === 'ANY_REAL' ? b : a;
    return o === 'REAL' || o === 'INT' || o === 'DINT' ? 'REAL' : undefined;
  }
  if (a === 'TIME' || b === 'TIME') {
    const o = a === 'TIME' ? b : a;
    return o === 'DINT' ? 'TIME' : undefined;
  }
  const ab = implicitOk(a, b);
  const ba = implicitOk(b, a);
  if (ab && ba) {
    const pick = (x: DataType) => (prefer === 'arith' ? isArithmeticType(x) : isBitStringType(x));
    return pick(a) ? a : b;
  }
  if (ab) return b;
  if (ba) return a;
  return undefined;
}

export function concrete(t: LiteralType): DataType {
  return t === 'ANY_INT' ? 'INT' : t === 'ANY_REAL' ? 'REAL' : t;
}

/** Zahlentyp, in dem eine Bitfolge für Arithmetik verwendet wird (WORD → INT, DWORD → DINT). */
export function arithmeticOf(t: DataType): DataType {
  if (t === 'BYTE' || t === 'WORD') return 'INT';
  if (t === 'DWORD') return 'DINT';
  return t;
}

/** Schreibweise wie in TIA */
export const TIA_NAMES: Record<DataType, string> = {
  BOOL: 'Bool',
  BYTE: 'Byte',
  WORD: 'Word',
  DWORD: 'DWord',
  INT: 'Int',
  DINT: 'DInt',
  REAL: 'Real',
  TIME: 'Time',
};

/** Typname für Meldungen (TIA-Schreibweise). */
export function typeName(t: LiteralType): string {
  if (t === 'ANY_INT') return 'Ganzzahl-Konstante';
  if (t === 'ANY_REAL') return 'Gleitkomma-Konstante';
  return TIA_NAMES[t];
}
