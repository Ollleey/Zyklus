import { byteLength, sizeOfType } from './address';
import { normalize, type DataType, type Value } from './types';

/**
 * Byte-adressierter Speicherbereich (PAE, PAA, Merker, Peripherie).
 * Wörter und Doppelwörter liegen wie bei S7 big-endian im Speicher: %MW0 = MB0 (High) + MB1 (Low).
 */
export class ByteArea {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(
    readonly name: string,
    size: number,
  ) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  get size(): number {
    return this.bytes.length;
  }

  fits(t: DataType, byte: number): boolean {
    return byte >= 0 && byte + byteLength(sizeOfType(t)) <= this.bytes.length;
  }

  private check(t: DataType, byte: number): void {
    if (!this.fits(t, byte)) {
      throw new RangeError(`Zugriff außerhalb von ${this.name}: Byte ${byte} (${t})`);
    }
  }

  read(t: DataType, byte: number, bit = 0): Value {
    this.check(t, byte);
    switch (t) {
      case 'BOOL':
        return (this.bytes[byte]! & (1 << bit)) !== 0;
      case 'INT':
        return this.view.getInt16(byte, false);
      case 'WORD':
        return this.view.getUint16(byte, false);
      case 'DINT':
      case 'TIME':
        return this.view.getInt32(byte, false);
      case 'REAL':
        return this.view.getFloat32(byte, false);
    }
  }

  write(t: DataType, byte: number, bit: number, value: Value): void {
    this.check(t, byte);
    const v = normalize(t, value);
    switch (t) {
      case 'BOOL':
        if (v) this.bytes[byte]! |= 1 << bit;
        else this.bytes[byte]! &= ~(1 << bit);
        return;
      case 'INT':
        this.view.setInt16(byte, v as number, false);
        return;
      case 'WORD':
        this.view.setUint16(byte, v as number, false);
        return;
      case 'DINT':
      case 'TIME':
        this.view.setInt32(byte, v as number, false);
        return;
      case 'REAL':
        this.view.setFloat32(byte, v as number, false);
        return;
    }
  }

  clear(): void {
    this.bytes.fill(0);
  }

  copyFrom(other: ByteArea): void {
    this.bytes.set(other.bytes.subarray(0, this.bytes.length));
  }
}
