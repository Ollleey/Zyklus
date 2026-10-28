import { describe, expect, it } from 'vitest';
import {
  ByteArea,
  TagTable,
  formatAddress,
  normalize,
  parseAddress,
  roundHalfEven,
  convert,
  io,
  tiaTypeForSize,
} from '../src';

describe('Datentypen', () => {
  it('INT läuft im Zweierkomplement über', () => {
    expect(normalize('INT', 32768)).toBe(-32768);
    expect(normalize('INT', -32769)).toBe(32767);
    expect(normalize('INT', 70000)).toBe(4464);
  });
  it('DINT/TIME laufen bei 32 bit über', () => {
    expect(normalize('DINT', 2147483648)).toBe(-2147483648);
    expect(normalize('TIME', -2147483649)).toBe(2147483647);
  });
  it('WORD ist vorzeichenlos 16 bit', () => {
    expect(normalize('WORD', -1)).toBe(0xffff);
    expect(normalize('WORD', 0x12345)).toBe(0x2345);
  });
  it('REAL wird auf 32 bit gerundet', () => {
    expect(normalize('REAL', 0.1)).toBe(Math.fround(0.1));
    expect(normalize('REAL', 0.1)).not.toBe(0.1);
  });
  it('BOOL aus Zahl', () => {
    expect(normalize('BOOL', 0)).toBe(false);
    expect(normalize('BOOL', 5)).toBe(true);
  });
  it('Ganzzahl schneidet Nachkommastellen ab, NaN wird 0', () => {
    expect(normalize('INT', 3.9)).toBe(3);
    expect(normalize('INT', -3.9)).toBe(-3);
    expect(normalize('DINT', NaN)).toBe(0);
  });
  it('roundHalfEven', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 2.4, 2.6].map(roundHalfEven)).toEqual([
      0, 2, 2, -0, -2, -2, 2, 3,
    ]);
  });
});

describe('Konvertierung', () => {
  it('REAL → INT rundet half-even und sättigt', () => {
    expect(convert(2.5, 'REAL', 'INT')).toBe(2);
    expect(convert(3.5, 'REAL', 'INT')).toBe(4);
    expect(convert(2.7, 'REAL', 'INT', 'trunc')).toBe(2);
    expect(convert(1e9, 'REAL', 'INT')).toBe(32767);
    expect(convert(-1e9, 'REAL', 'INT')).toBe(-32768);
    expect(convert(NaN, 'REAL', 'DINT')).toBe(0);
  });
  it('INT ↔ WORD und DINT ↔ DWORD übernehmen das Bitmuster', () => {
    expect(convert(-1, 'INT', 'WORD')).toBe(0xffff);
    expect(convert(0x8000, 'WORD', 'INT')).toBe(-32768);
    expect(convert(-1, 'DINT', 'DWORD')).toBe(0xffffffff);
    expect(convert(0x80000000, 'DWORD', 'DINT')).toBe(-2147483648);
  });
  it('BYTE/DWORD-Normalisierung und Sättigung', () => {
    expect(normalize('BYTE', 0x1ff)).toBe(0xff);
    expect(normalize('DWORD', -1)).toBe(0xffffffff);
    expect(convert(300, 'INT', 'BYTE')).toBe(255);
    expect(convert(-5, 'INT', 'BYTE')).toBe(0);
  });
  it('DINT → INT sättigt', () => {
    expect(convert(100000, 'DINT', 'INT')).toBe(32767);
    expect(convert(-100000, 'DINT', 'INT')).toBe(-32768);
    expect(convert(1234, 'DINT', 'INT')).toBe(1234);
  });
  it('BOOL ↔ Zahl', () => {
    expect(convert(true, 'BOOL', 'INT')).toBe(1);
    expect(convert(0, 'INT', 'BOOL')).toBe(false);
    expect(convert(7, 'INT', 'REAL')).toBe(7);
  });
});

describe('Adressen', () => {
  it('parst Bit-, Wort- und Doppelwortadressen', () => {
    expect(parseAddress('%I0.0')).toEqual({ area: 'I', size: 'X', byte: 0, bit: 0 });
    expect(parseAddress('%q12.7')).toEqual({ area: 'Q', size: 'X', byte: 12, bit: 7 });
    expect(parseAddress('%IW64')).toEqual({ area: 'I', size: 'W', byte: 64, bit: 0 });
    expect(parseAddress('%MD10')).toEqual({ area: 'M', size: 'D', byte: 10, bit: 0 });
  });
  it('lehnt Unsinn ab', () => {
    for (const s of ['I0.0', '%I0.8', '%X1', '%IW', '%MX3', '%QL0']) {
      expect(() => parseAddress(s), s).toThrow(/Ungültige Adresse/);
    }
  });
  it('formatAddress ist die Umkehrung', () => {
    for (const s of ['%I0.3', '%IB1', '%QW2', '%MD100']) {
      expect(formatAddress(parseAddress(s))).toBe(s);
    }
  });
  it('TIA-Typen für Absolutadressen', () => {
    expect(['X', 'B', 'W', 'D'].map((s) => tiaTypeForSize(s as 'X'))).toEqual([
      'BOOL',
      'BYTE',
      'WORD',
      'DWORD',
    ]);
  });
  it('io() prüft Typ gegen Adressgröße', () => {
    expect(io('%MD4', 'REAL')).toMatchObject({ t: 'REAL', byte: 4 });
    expect(() => io('%MW4', 'REAL')).toThrow(/passt nicht/);
  });
});

describe('ByteArea', () => {
  it('Wörter sind big-endian (MW0 = MB0 High, MB1 Low)', () => {
    const m = new ByteArea('M', 8);
    m.write('WORD', 0, 0, 0x1234);
    expect([...m.bytes.subarray(0, 2)]).toEqual([0x12, 0x34]);
    expect(m.read('BOOL', 1, 2)).toBe(true); // 0x34 = 0011_0100
    expect(m.read('BOOL', 1, 0)).toBe(false);
  });
  it('INT, DINT, REAL Rundreise', () => {
    const m = new ByteArea('M', 16);
    m.write('INT', 0, 0, -5);
    m.write('DINT', 2, 0, -100000);
    m.write('REAL', 6, 0, 3.25);
    expect(m.read('INT', 0)).toBe(-5);
    expect(m.read('WORD', 0)).toBe(0xfffb);
    expect(m.read('DINT', 2)).toBe(-100000);
    expect(m.read('REAL', 6)).toBe(3.25);
  });
  it('Bits setzen und löschen ohne Nachbarbits zu verändern', () => {
    const m = new ByteArea('M', 1);
    m.write('BOOL', 0, 3, true);
    m.write('BOOL', 0, 5, true);
    m.write('BOOL', 0, 3, false);
    expect(m.bytes[0]).toBe(0b0010_0000);
  });
  it('Zugriffe außerhalb werfen', () => {
    const m = new ByteArea('M', 4);
    expect(() => m.read('DINT', 1)).toThrow(RangeError);
    expect(() => m.write('INT', 3, 0, 1)).toThrow(RangeError);
  });
});

describe('Variablentabelle', () => {
  it('löst Namen ohne Rücksicht auf Groß-/Kleinschreibung auf', () => {
    const t = new TagTable([{ name: 'Start', address: '%I0.0', t: 'BOOL' }]);
    expect(t.resolve('START')).toEqual({ k: 'io', area: 'I', t: 'BOOL', byte: 0, bit: 0 });
    expect(t.resolve('Stopp')).toBeUndefined();
  });
  it('verhindert doppelte Namen und falsche Typen', () => {
    const t = new TagTable([{ name: 'Motor', address: '%Q0.0', t: 'BOOL' }]);
    expect(() => t.add({ name: 'motor', address: '%Q0.1', t: 'BOOL' })).toThrow(/bereits vergeben/);
    expect(() => t.add({ name: 'Wert', address: '%IW64', t: 'REAL' })).toThrow(/passt nicht/);
    expect(() => t.add({ name: '1x', address: '%I0.1', t: 'BOOL' })).toThrow(/Ungültiger Name/);
  });
  it('meldet überlappende Adressen', () => {
    const t = new TagTable([
      { name: 'Wort', address: '%MW10', t: 'INT' },
      { name: 'Bit', address: '%M11.0', t: 'BOOL' },
      { name: 'Anderes', address: '%M12.0', t: 'BOOL' },
      { name: 'Real', address: '%MD8', t: 'REAL' },
    ]);
    expect(t.overlaps()).toEqual([
      ['Wort', 'Bit'],
      ['Wort', 'Real'],
      ['Bit', 'Real'],
    ]);
  });
});
