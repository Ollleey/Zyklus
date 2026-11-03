import { describe, expect, it } from 'vitest';
import { Cpu, type Block, type CodeBlock, type ObEvent } from '@zyklus/sim-core';
import { compileProject, formatDiagnostic, projectToSource, sourceToProject } from '../src';

const ob = (name: string, source: string, event?: ObEvent, number = 1): CodeBlock => ({
  kind: 'OB',
  name,
  number,
  lang: 'SCL',
  iface: {},
  source,
  ...(event ? { event } : {}),
});

/** Weckalarm alle 3 ms kopiert %I1.0 nach %Q1.0, OB1 (10 ms) kopiert %I0.0 nach %Q0.0 */
const blocks: Block[] = [
  ob('Main', '%Q0.0 := %I0.0; %Q0.1 := %I1.0;'),
  ob('Schnell', '%Q1.0 := %I1.0;', { kind: 'cyclic', intervalMs: 3, tpa: 1 }, 30),
];

function cpu(partitions?: ConstructorParameters<typeof Cpu>[0]['partitions']): Cpu {
  const r = compileProject({ tags: [], blocks });
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs: 10, maxOpsPerCycle: 200, partitions }, r.program!);
}

const run = (c: Cpu, from: number, to: number) => {
  for (let t = from; t < to; t++) c.step(t);
};

describe('Teilprozessabbild (TPA)', () => {
  it('ohne TPA: Weckalarm aktualisiert das ganze Prozessabbild (Spielregel)', () => {
    const c = cpu();
    run(c, 0, 1);
    c.setInput('%I0.0', true);
    run(c, 1, 4);
    // der Weckalarm bei 3 ms schreibt das ganze PAA – %Q0.0 bleibt aber Sache von OB1
    expect(c.read('%Q1.0')).toBe(false);
  });

  it('mit TPA: OB30 sieht nur TPA 1, OB1 nur die Bytes ohne TPA', () => {
    const c = cpu({ I: { 1: 1 }, Q: { 1: 1 } });
    run(c, 0, 1);
    c.setInput('%I1.0', true);
    c.setInput('%I0.0', true);
    run(c, 1, 4);
    // nach dem Weckalarm bei 3 ms: Byte 1 aktuell, Byte 0 noch alt
    expect(c.read('%Q1.0')).toBe(true);
    expect(c.read('%Q0.0')).toBe(false);
    run(c, 4, 11);
    expect(c.read('%Q0.0')).toBe(true);
    // %I1.0 gehört zu TPA 1: OB1 aktualisiert es nicht, liest aber den Stand, den OB30 geholt hat
    expect(c.read('%Q0.1')).toBe(true);
  });

  it('TPA steht in der Quelle und wird geprüft', () => {
    const src = projectToSource({ tags: [], blocks });
    expect(src).toContain('// Ereignis: Weckalarm, Takt 3 ms, Phase 0 ms, TPA 1');
    const back = sourceToProject(src).project!;
    expect((back.blocks.find((b) => b.name === 'Schnell') as CodeBlock).event).toEqual({
      kind: 'cyclic',
      intervalMs: 3,
      phaseMs: 0,
      tpa: 1,
    });
    const bad = compileProject({
      tags: [],
      blocks: [blocks[0]!, ob('X', '', { kind: 'cyclic', intervalMs: 3, tpa: 40 }, 31)],
    });
    expect(bad.diagnostics.map((d) => d.message).join()).toMatch(/TPA 1 … 31/);
  });
});
