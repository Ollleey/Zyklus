import { describe, expect, it } from 'vitest';
import { Cpu, type Block, type CodeBlock, type ObEvent } from '@zyklus/sim-core';
import { compileProject, formatDiagnostic } from '../src';
import { DB, TAGS } from './harness';

function ob(name: string, source: string, event?: ObEvent, number = 1): CodeBlock {
  return {
    kind: 'OB',
    name,
    number,
    lang: 'SCL',
    iface: { Temp: [{ name: 'i', type: 'Int' }] },
    source,
    ...(event ? { event } : {}),
  };
}

function cpu(blocks: Block[], maxOps = 200): Cpu {
  const r = compileProject({ tags: TAGS, blocks });
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs: 10, maxOpsPerCycle: maxOps }, r.program!);
}

const DATA = DB('D', [
  ['A', 'Array[0..3] of Int', '[1, 2, 3, 4]'],
  ['x', 'Int'],
  ['n', 'Int'],
  ['laeufe', 'Int'],
  ['rt', 'LReal'],
  ['mem', 'LReal'],
]);

describe('Programmierfehler mit OB121 und GET_ERR_ID', () => {
  const main = ob('Main', '"D".x := "D".A["Zahl"]; "D".A["Zahl"] := 9; "Motor" := TRUE;');

  it('ohne OB121: STOP', () => {
    const c = cpu([main, DATA]);
    c.setInput('%MW10', 7);
    c.scan(0);
    expect(c.mode).toBe('STOP');
    expect(c.diagnostics[0]!.text).toMatch(/STOP: Programmierfehler/);
  });

  it('mit OB121: weiter in RUN, Zugriff liefert 0 bzw. schreibt nichts', () => {
    const c = cpu([main, DATA, ob('Fehler', '"D".n := "D".n + 1;', { kind: 'programError' }, 121)]);
    c.setInput('%MW10', 7);
    c.scan(0);
    expect(c.mode).toBe('RUN');
    expect(c.read('%Q0.0')).toBe(true);
    expect(c.readSlot('D.x')).toBe(0);
    expect(c.readSlot('D.n')).toBe(1);
    expect(c.diagnostics.map((d) => d.text)).toContain(
      'Programmierfehler: Feldindex außerhalb (0…3) (16#2523)',
    );
  });

  it('lokale Fehlerbehandlung mit GET_ERR_ID', () => {
    const c = cpu([
      ob('Main', '"D".x := "D".A["Zahl"]; IF GET_ERR_ID() <> 0 THEN "Lampe" := TRUE; END_IF;'),
      DATA,
    ]);
    c.setInput('%MW10', 2);
    c.scan(0);
    expect(c.read('%Q0.1')).toBe(false);
    c.setInput('%MW10', 9);
    c.scan(10);
    expect(c.mode).toBe('RUN');
    expect(c.read('%Q0.1')).toBe(true);
  });
});

describe('Zykluszeitfehler OB80', () => {
  // jeder zweite Zyklus läuft in eine Endlosschleife
  const src = `"D".laeufe := "D".laeufe + 1;
IF "D".laeufe MOD 2 = 0 THEN WHILE TRUE DO "D".x := "D".x + 1; END_WHILE; END_IF;
"Motor" := TRUE;`;

  it('wird einmal toleriert und ruft OB80', () => {
    const c = cpu([
      ob('Main', src),
      DATA,
      ob('Zeitfehler', '"D".n := "D".n + 1;', { kind: 'timeError' }, 80),
    ]);
    for (let t = 0; t < 60; t += 10) c.scan(t);
    expect(c.mode).toBe('RUN');
    expect(c.readSlot('D.n')).toBe(3);
  });

  it('zweimal hintereinander: STOP; ohne OB80 sofort STOP', () => {
    const always = ob('Main', 'WHILE TRUE DO "D".x := "D".x + 1; END_WHILE;');
    const c = cpu([always, DATA, ob('Zeitfehler', '', { kind: 'timeError' }, 80)]);
    c.scan(0);
    expect(c.mode).toBe('RUN');
    c.scan(10);
    expect(c.stopInfo?.message).toMatch(/zweimal hintereinander/);
    const d = cpu([always, DATA]);
    d.scan(0);
    expect(d.mode).toBe('STOP');
  });
});

describe('Diagnosealarm OB82, Diagnosepuffer, RUNTIME', () => {
  it('OB82 läuft bei kommender und gehender Diagnose; ohne OB82 bleibt RUN', () => {
    const c = cpu([
      ob('Main', '"Motor" := TRUE;'),
      DATA,
      ob('Diagnose', '"D".n := "D".n + 1;', { kind: 'diagnostic' }, 82),
    ]);
    c.scan(0);
    c.diagnosticEvent(5, 'ai1:0', 'Drahtbruch AI 0', true);
    expect(c.diagActive).toBe(1);
    c.diagnosticEvent(6, 'ai1:0', 'Drahtbruch AI 0', true); // schon gemeldet
    c.diagnosticEvent(7, 'ai1:0', 'Drahtbruch AI 0', false);
    expect(c.readSlot('D.n')).toBe(2);
    expect(c.diagActive).toBe(0);
    expect(c.diagnostics.slice(0, 2).map((d) => d.text)).toEqual([
      'gehend: Drahtbruch AI 0',
      'kommend: Drahtbruch AI 0',
    ]);
    const d = cpu([ob('Main', '"Motor" := TRUE;'), DATA]);
    d.scan(0);
    d.diagnosticEvent(5, 'x', 'Drahtbruch', true);
    expect(d.mode).toBe('RUN');
  });

  it('RUNTIME misst die Zeit zwischen zwei Aufrufen', () => {
    const c = cpu([ob('Main', '"D".rt := RUNTIME(MEM := "D".mem);'), DATA]);
    c.scan(0);
    c.scan(10);
    expect(c.readSlot('D.rt')).toBeCloseTo(0.01, 6);
  });
});
