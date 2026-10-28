import { describe, expect, it } from 'vitest';
import { c, io, type BinaryFn, type DataType, type Operand, type Value } from '../src';
import { makeCpu } from './harness';

/** Berechnet a <fn> b in Typ t über Merker (MD0, MD4 → MD8). */
function bin(fn: BinaryFn, t: DataType, a: Value, b: Value, bType: DataType = t): Value {
  const at = (byte: number, type: DataType): Operand =>
    type === 'INT' || type === 'WORD' ? io(`%MW${byte}`, type) : io(`%MD${byte}`, type);
  const cpu = makeCpu((p) =>
    p.emit({ op: 'bin', fn, t, dst: at(8, t), a: at(0, t), b: at(4, bType) }),
  );
  cpu.setInput(t === 'INT' || t === 'WORD' ? '%MW0' : '%MD0', a, t);
  cpu.setInput(bType === 'INT' || bType === 'WORD' ? '%MW4' : '%MD4', b, bType);
  cpu.scan(0);
  return cpu.read(t === 'INT' || t === 'WORD' ? '%MW8' : '%MD8', t);
}

describe('Arithmetik INT', () => {
  it('+ - * / MOD', () => {
    expect(bin('add', 'INT', 7, 5)).toBe(12);
    expect(bin('sub', 'INT', 7, 9)).toBe(-2);
    expect(bin('mul', 'INT', -7, 6)).toBe(-42);
    expect(bin('div', 'INT', 7, 2)).toBe(3);
    expect(bin('div', 'INT', -7, 2)).toBe(-3); // Richtung 0
    expect(bin('mod', 'INT', 7, 3)).toBe(1);
    expect(bin('mod', 'INT', -7, 3)).toBe(-1); // Vorzeichen des Dividenden
  });
  it('Überlauf wrappt', () => {
    expect(bin('add', 'INT', 32767, 1)).toBe(-32768);
    expect(bin('mul', 'INT', 300, 300)).toBe(90000 - 65536);
    expect(bin('sub', 'INT', -32768, 1)).toBe(32767);
  });
  it('Division durch 0 liefert 0', () => {
    expect(bin('div', 'INT', 5, 0)).toBe(0);
    expect(bin('mod', 'INT', 5, 0)).toBe(0);
  });
});

describe('Arithmetik DINT / TIME / REAL', () => {
  it('DINT-Multiplikation wrappt exakt bei 32 bit', () => {
    expect(bin('mul', 'DINT', 65536, 65536)).toBe(0);
    expect(bin('mul', 'DINT', 2147483647, 2)).toBe(-2);
    expect(bin('div', 'DINT', -2147483648, -1)).toBe(-2147483648);
  });
  it('TIME rechnet in ms', () => {
    expect(bin('add', 'TIME', 1500, 250)).toBe(1750);
    expect(bin('sub', 'TIME', 100, 250)).toBe(-150);
  });
  it('REAL rechnet in 32-bit-Gleitkomma', () => {
    expect(bin('add', 'REAL', 0.1, 0.2)).toBe(Math.fround(Math.fround(0.1) + Math.fround(0.2)));
    expect(bin('div', 'REAL', 1, 4)).toBe(0.25);
    expect(bin('div', 'REAL', 1, 0)).toBe(Infinity);
  });
});

describe('Unär: NEG / ABS', () => {
  it('ABS und NEG auf INT inkl. Randfall', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'un', fn: 'abs', t: 'INT', dst: io('%MW2'), a: io('%MW0') });
      b.emit({ op: 'un', fn: 'neg', t: 'INT', dst: io('%MW4'), a: io('%MW0') });
    });
    for (const [v, abs, neg] of [
      [-5, 5, 5],
      [7, 7, -7],
      [-32768, -32768, -32768],
    ]) {
      cpu.setInput('%MW0', v!);
      cpu.scan(0);
      expect(cpu.read('%MW2')).toBe(abs);
      expect(cpu.read('%MW4')).toBe(neg);
    }
  });
  it('ABS auf REAL', () => {
    const cpu = makeCpu((b) =>
      b.emit({ op: 'un', fn: 'abs', t: 'REAL', dst: io('%MD4', 'REAL'), a: c.real(-2.5) }),
    );
    cpu.scan(0);
    expect(cpu.read('%MD4', 'REAL')).toBe(2.5);
  });
});

describe('Wortlogik und Schieben', () => {
  it('AND / OR / XOR / NOT auf WORD', () => {
    expect(bin('and', 'WORD', 0xff0f, 0x0ff0)).toBe(0x0f00);
    expect(bin('or', 'WORD', 0xf000, 0x000f)).toBe(0xf00f);
    expect(bin('xor', 'WORD', 0xffff, 0x0f0f)).toBe(0xf0f0);
    const cpu = makeCpu((b) =>
      b.emit({ op: 'un', fn: 'not', t: 'WORD', dst: io('%MW0', 'WORD'), a: c.word(0x00ff) }),
    );
    cpu.scan(0);
    expect(cpu.read('%MW0', 'WORD')).toBe(0xff00);
  });
  it('SHL / SHR schieben Nullen nach, herausgeschobene Bits gehen verloren', () => {
    expect(bin('shl', 'WORD', 0x8001, 1, 'INT')).toBe(0x0002);
    expect(bin('shl', 'WORD', 0x0001, 15, 'INT')).toBe(0x8000);
    expect(bin('shr', 'WORD', 0x8001, 1, 'INT')).toBe(0x4000);
    expect(bin('shr', 'WORD', 0x8000, 15, 'INT')).toBe(1);
  });
  it('BYTE und DWORD: Logik, NOT und Schieben in eigener Breite', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'un', fn: 'not', t: 'BYTE', dst: io('%MB0', 'BYTE'), a: io('%MB1', 'BYTE') });
      b.emit({
        op: 'bin',
        fn: 'shl',
        t: 'BYTE',
        dst: io('%MB2', 'BYTE'),
        a: io('%MB1', 'BYTE'),
        b: c.int(4),
      });
      b.emit({
        op: 'bin',
        fn: 'shl',
        t: 'DWORD',
        dst: io('%MD4', 'DWORD'),
        a: io('%MD8', 'DWORD'),
        b: c.int(31),
      });
      b.emit({
        op: 'bin',
        fn: 'shr',
        t: 'DWORD',
        dst: io('%MD12', 'DWORD'),
        a: io('%MD4', 'DWORD'),
        b: c.int(1),
      });
      b.emit({
        op: 'un',
        fn: 'not',
        t: 'DWORD',
        dst: io('%MD16', 'DWORD'),
        a: io('%MD12', 'DWORD'),
      });
    });
    cpu.setInput('%MB1', 0x3c, 'BYTE');
    cpu.setInput('%MD8', 3, 'DWORD');
    cpu.scan(0);
    expect(cpu.read('%MB0', 'BYTE')).toBe(0xc3);
    expect(cpu.read('%MB2', 'BYTE')).toBe(0xc0);
    expect(cpu.read('%MD4', 'DWORD')).toBe(0x80000000);
    expect(cpu.read('%MD12', 'DWORD')).toBe(0x40000000);
    expect(cpu.read('%MD16', 'DWORD')).toBe(0xbfffffff);
  });

  it('Schiebeweite ≥ 16 → 0, ≤ 0 → unverändert', () => {
    expect(bin('shl', 'WORD', 0xffff, 16, 'INT')).toBe(0);
    expect(bin('shr', 'WORD', 0xffff, 40, 'INT')).toBe(0);
    expect(bin('shl', 'WORD', 0x1234, 0, 'INT')).toBe(0x1234);
    expect(bin('shr', 'WORD', 0x1234, -3, 'INT')).toBe(0x1234);
  });
});

describe('MOVE / CONV', () => {
  it('MOVE kopiert Werte gleichen Typs', () => {
    const cpu = makeCpu((b) => {
      b.emit({ op: 'mov', dst: io('%QW2'), src: io('%IW64') });
      b.emit({ op: 'mov', dst: io('%MD0', 'REAL'), src: c.real(1.25) });
    });
    cpu.setInput('%IW64', 13824);
    cpu.scan(0);
    expect(cpu.read('%QW2')).toBe(13824);
    expect(cpu.read('%MD0', 'REAL')).toBe(1.25);
  });
  it('CONV INT → REAL → INT', () => {
    const cpu = makeCpu((b) => {
      const r = b.slot('r', 'REAL');
      b.emit({ op: 'conv', dst: r, src: io('%IW0'), mode: 'round' });
      b.emit({ op: 'bin', fn: 'div', t: 'REAL', dst: r, a: r, b: c.real(2) });
      b.emit({ op: 'conv', dst: io('%QW0'), src: r, mode: 'round' });
      b.emit({ op: 'conv', dst: io('%QW2'), src: r, mode: 'trunc' });
    });
    cpu.setInput('%IW0', 7);
    cpu.scan(0);
    expect(cpu.readSlot('r')).toBe(3.5);
    expect(cpu.read('%QW0')).toBe(4);
    expect(cpu.read('%QW2')).toBe(3);
  });
});
