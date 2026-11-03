import { describe, expect, it } from 'vitest';
import { Cpu } from '@zyklus/sim-core';
import { compileScl, formatDiagnostic } from '../src';
import { TAGS } from './harness';

function run(src: string, probes = true) {
  const r = compileScl(src, { tags: TAGS, probes });
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return { cpu: new Cpu({ name: 'T', cycleMs: 1, maxOpsPerCycle: 50 }, r.program!), p: r.program! };
}

describe('Messpunkte (Beobachten, Haltepunkte)', () => {
  const SRC = `IF "Start" THEN
  "Motor" := TRUE;
ELSIF "Stopp" THEN
  "Motor" := FALSE;
END_IF;
WHILE "Zahl" < 3 DO
  "Zahl" := "Zahl" + 1;
END_WHILE;`;

  it('Bedingungen und Durchläufe je Zeile', () => {
    const { cpu, p } = run(SRC);
    const at = (line: number, kind: 'cond' | 'line') =>
      cpu.probes[p.probes!.findIndex((d) => d.line === line && d.kind === kind)];
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    expect(at(1, 'cond')).toBe(true);
    expect(at(2, 'line')).toBe(1);
    expect(at(4, 'line')).toBe(0);
    expect(at(6, 'cond')).toBe(false); // letzte Auswertung beendet die Schleife
    expect(at(7, 'line')).toBe(3);
    expect(p.probes!.every((d) => d.block === 'Main')).toBe(true);
  });

  it('kosten keine Befehle und keine Energie', () => {
    const a = run(SRC, true);
    const b = run(SRC, false);
    for (const c of [a.cpu, b.cpu]) {
      c.setInput('%I0.1', true);
      c.scan(0);
    }
    expect(a.cpu.metrics).toEqual(b.cpu.metrics);
    expect(b.p.probes).toBeUndefined();
  });
});
