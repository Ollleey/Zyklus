import { describe, expect, it } from 'vitest';
import { analyzeBoard, emptySolution, syncDeviceTags, type Solution } from '@zyklus/sim-core';
import { compileSolution, levelById } from '@zyklus/levels';
import { sourceToProject } from '@zyklus/scl-compiler';
import { GUIDE_STEPS, type GuideState } from '../src/components/LevelGuide';

const level = levelById('00-einfuehrung')!;
const current = (s: GuideState) => GUIDE_STEPS.findIndex((x) => !x.done(s));
function state(solution: Solution, extra: Partial<GuideState> = {}): GuideState {
  const c = compileSolution(level, solution);
  return {
    briefOpen: false,
    solution,
    analysis: c.analysis,
    compiledOk: c.ok,
    size: c.size,
    tested: false,
    passed: false,
    ...extra,
  };
}

describe('Einführung (Auftrag 0)', () => {
  it('erkennt die Schritte der Reihe nach', () => {
    let s: Solution = emptySolution();
    expect(current(state(s, { briefOpen: true }))).toBe(0);
    expect(current(state(s))).toBe(1);
    s = { ...s, modules: [{ id: 'cpu1', type: 'cpu-kompakt', x: 0 }] };
    expect(current(state(s))).toBe(2);
    s = {
      ...s,
      wires: [
        { device: 'S1', module: 'cpu1', channel: 0 },
        { device: 'H1', module: 'cpu1', channel: 6 },
      ],
    };
    expect(current(state(s))).toBe(3);
    const a = analyzeBoard(level, s);
    const p = sourceToProject(
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"Lampe" := "Taster";\nEND_ORGANIZATION_BLOCK',
    ).project!;
    s = { ...s, projects: { cpu1: syncDeviceTags(level, a, 'cpu1', p) } };
    expect(current(state(s))).toBe(4);
    expect(current(state(s, { tested: true }))).toBe(5);
    expect(current(state(s, { tested: true, passed: true }))).toBe(-1);
  });
});
