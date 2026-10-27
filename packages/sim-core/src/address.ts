import type { DataType } from './types';

export type Area = 'I' | 'Q' | 'M';
/** X = Bit, W = Wort (16 bit), D = Doppelwort (32 bit) */
export type AccessSize = 'X' | 'W' | 'D';

export interface Address {
  area: Area;
  size: AccessSize;
  byte: number;
  /** nur bei size 'X' relevant, sonst 0 */
  bit: number;
}

const ADDRESS_RE = /^%([IQM])(?:(\d+)\.([0-7])|([WD])(\d+))$/i;

export class AddressError extends Error {}

/** Liest Absolutadressen wie `%I0.0`, `%QW64`, `%MD10`. */
export function parseAddress(text: string): Address {
  const m = ADDRESS_RE.exec(text.trim());
  if (!m)
    throw new AddressError(`Ungültige Adresse „${text}“ (erwartet z. B. %I0.0, %IW64, %MD10)`);
  const area = m[1]!.toUpperCase() as Area;
  if (m[2] !== undefined) {
    return { area, size: 'X', byte: Number(m[2]), bit: Number(m[3]) };
  }
  return { area, size: m[4]!.toUpperCase() as AccessSize, byte: Number(m[5]), bit: 0 };
}

export function formatAddress(a: Address): string {
  return a.size === 'X' ? `%${a.area}${a.byte}.${a.bit}` : `%${a.area}${a.size}${a.byte}`;
}

export function sizeOfType(t: DataType): AccessSize {
  switch (t) {
    case 'BOOL':
      return 'X';
    case 'INT':
    case 'WORD':
      return 'W';
    case 'DINT':
    case 'REAL':
    case 'TIME':
      return 'D';
  }
}

export function defaultTypeForSize(size: AccessSize): DataType {
  return size === 'X' ? 'BOOL' : size === 'W' ? 'INT' : 'DINT';
}

export function byteLength(size: AccessSize): number {
  return size === 'X' ? 1 : size === 'W' ? 2 : 4;
}
