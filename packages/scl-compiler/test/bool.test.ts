import { describe, expect, it } from 'vitest';
import { projectToSource } from '../src';
import { DB, IDB, compile, cpuFor, firstError, TAGS } from './harness';

describe('BOOL-Literale 0/1', () => {
  it('Zuweisung, Vergleich und Verknüpfung mit 0/1', () => {
    const cpu = cpuFor(
      '"Motor" := 1;\n"Lampe" := 0;\nIF "Start" = 1 AND "Stopp" <> 0 THEN "Lampe" := 1; END_IF;',
    );
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(false);
    cpu.setInput('%I0.0', true);
    cpu.setInput('%I0.1', true);
    cpu.scan(1);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('Parameter eines Zeitglieds', () => {
    const cpu = cpuFor('"T"(IN := 1, PT := T#2ms);\n"Motor" := "T".Q;', {
      blocks: [IDB('T', 'TON_TIME')],
    });
    for (let t = 0; t < 4; t++) cpu.scan(t);
    expect(cpu.read('%Q0.0')).toBe(true);
  });

  it('Startwerte im Datenbaustein und in der Schnittstelle', () => {
    const cpu = cpuFor('"Motor" := "D".ein;\n"Lampe" := #an;', {
      blocks: [DB('D', [['ein', 'Bool', '1']])],
      constants: [['an', 'Bool', '1']],
    });
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('TRUE/FALSE in beliebiger Schreibweise', () => {
    const cpu = cpuFor('"Motor" := true;\n"Lampe" := True AND NOT false;');
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('andere Zahlen sind ein Fehler mit Zeile und Spalte', () => {
    const e = firstError('"Motor" := TRUE;\n"Lampe" := 2;');
    expect(e?.message).toBe('BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.');
    expect(e?.start).toEqual({ line: 2, col: 12 });
    expect(firstError('IF "Start" = 5 THEN "Motor" := TRUE; END_IF;')?.message).toMatch(
      /BOOL erwartet/,
    );
    expect(firstError('"T"(IN := 3, PT := T#1s);', { blocks: [IDB('T', 'TON_TIME')] })?.message).toMatch(
      /BOOL erwartet/,
    );
  });

  it('Int-Variablen werden nicht zu Bool', () => {
    expect(firstError('"Motor" := "Zahl";')?.message).toMatch(/Int kann nicht in Bool/);
    expect(firstError('IF "Zahl" THEN "Motor" := 1; END_IF;')).toBeDefined();
  });

  it('Zahlen bleiben Zahlen, wo keine Bool erwartet wird', () => {
    const r = compile('"Zahl" := 1;\n"Motor" := "Zahl" = 1;');
    expect(r.ok).toBe(true);
    expect(r.boolLiterals).toEqual([]);
  });

  it('Export schreibt TRUE/FALSE, Zahlen an Int bleiben', () => {
    const src = projectToSource({
      tags: TAGS,
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'SCL',
          iface: { Temp: [], Constant: [] },
          source: '"Motor" := 1;\n"Zahl" := 1;\nIF "Start" = 0 THEN\n  "Lampe" := 1;\nEND_IF;',
        },
        DB('D', [
          ['ein', 'Bool', '1'],
          ['n', 'Int', '1'],
        ]),
      ],
    });
    expect(src).toContain('"Motor" := TRUE;');
    expect(src).toContain('"Zahl" := 1;');
    expect(src).toContain('IF "Start" = FALSE THEN');
    expect(src).toContain('"Lampe" := TRUE;');
    expect(src).toContain('ein : Bool := TRUE;');
    expect(src).toContain('n : Int := 1;');
  });
});
