import type { DataType } from './types';

export type Area = 'I' | 'Q' | 'M';
/** X = Bit, B = Byte, W = Wort (16 bit), D = Doppelwort (32 bit) */
export type AccessSize = 'X' | 'B' | 'W' | 'D';

export interface Address {
  area: Area;
  size: AccessSize;
  byte: number;
  /** nur bei size 'X' relevant, sonst 0 */
  bit: number;
}

const ADDRESS_RE = /^%([IQM])(?:(\d+)\.([0-7])|([BWD])(\d+))$/i;

export class AddressError extends Error {}

/** Liest Absolutadressen wie `%I0.0`, `%QW64`, `%MD10`. */
export function parseAddress(text: string): Address {
  const m = ADDRESS_RE.exec(text.trim());
  if (!m)
    throw new AddressError(
      `Ungültige Adresse „${text}“ (erwartet z. B. %I0.0, %IB0, %IW64, %MD10)`,
    );
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
    case 'SINT':
    case 'USINT':
    case 'CHAR':
      return 'B';
    case 'UINT':
    case 'DATE':
      return 'W';
    case 'UDINT':
    case 'TOD':
      return 'D';
    case 'STRING':
      throw new AddressError(
        'String ist nur in Datenbausteinen und lokal möglich, nicht im E/A- oder Merkerbereich',
      );
    case 'LWORD':
    case 'LINT':
    case 'ULINT':
    case 'LREAL':
      // Spielvereinfachung: 64-bit-Werte gibt es nur in Datenbausteinen und Temp
      throw new AddressError(
        `${t} ist nur in Datenbausteinen und lokal möglich, nicht im E/A- oder Merkerbereich`,
      );
    case 'BOOL':
      return 'X';
    case 'BYTE':
      return 'B';
    case 'INT':
    case 'WORD':
      return 'W';
    case 'DINT':
    case 'DWORD':
    case 'REAL':
    case 'TIME':
      return 'D';
  }
}

/**
 * Standardtyp einer Absolutadresse für Engine-Hilfsfunktionen (Tests, Peripherie):
 * Wörter als INT, Doppelwörter als DINT. Der SCL-Compiler verwendet stattdessen
 * die TIA-Typen (siehe `tiaTypeForSize`).
 */
export function defaultTypeForSize(size: AccessSize): DataType {
  return size === 'X' ? 'BOOL' : size === 'B' ? 'BYTE' : size === 'W' ? 'INT' : 'DINT';
}

/** Typ einer Absolutadresse wie in TIA: %IB → BYTE, %IW → WORD, %ID → DWORD. */
export function tiaTypeForSize(size: AccessSize): DataType {
  return size === 'X' ? 'BOOL' : size === 'B' ? 'BYTE' : size === 'W' ? 'WORD' : 'DWORD';
}

export function byteLength(size: AccessSize): number {
  return size === 'X' || size === 'B' ? 1 : size === 'W' ? 2 : 4;
}
