import { describe, expect, it } from 'vitest';
import { CPU_TYPES, ProgramBuilder, byteSize, dataBytes } from '../src';

describe('Arbeitsspeicher', () => {
  it('Bytes je Typ und Programm (ohne Temp)', () => {
    expect(byteSize('BOOL')).toBe(1);
    expect(byteSize('INT')).toBe(2);
    expect(byteSize('LREAL')).toBe(8);
    expect(byteSize('STRING', 20)).toBe(22);
    expect(byteSize('STRING')).toBe(256);
    const b = new ProgramBuilder();
    b.slot('a', 'DINT');
    b.slot('s', 'STRING', '', false, 10);
    b.temp('t', 'LREAL');
    b.instance('T1', 'TON');
    expect(dataBytes(b.build())).toBe(4 + 12 + 16);
  });

  it('jede CPU hat eine Grenze', () => {
    for (const c of Object.values(CPU_TYPES)) expect(c.workMemory).toBeGreaterThan(0);
  });
});
