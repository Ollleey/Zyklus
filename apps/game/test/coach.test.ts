import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  analyzeBoard,
  emptyProject,
  emptySolution,
  syncDeviceTags,
  type Solution,
} from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { sourceToProject } from '@zyklus/scl-compiler';
import {
  SandboxPlant,
  createPart,
  emptyLayout,
  levelFromLayout,
  type Layout,
  type PartType,
} from '@zyklus/plant-sim';
import { COACH_STEPS } from '../src/components/plant/Coach';
import type { SlotContext } from '../src/screens/LevelScreen';
import { autoWire } from '../src/state/edit';

function ctx(layout: Layout, solution: Solution, run: LevelRun | null = null): SlotContext {
  const level = levelFromLayout(layout);
  const c = compileSolution(level, solution);
  return {
    run,
    sim: {} as SlotContext['sim'],
    solution,
    setSolution: () => {},
    analysis: c.analysis,
    compiledOk: c.ok,
    size: c.size,
  };
}

/** erster noch nicht erledigter Schritt */
const current = (l: Layout, c: SlotContext) => COACH_STEPS.findIndex((s) => !s.done(l, c));

describe('Geführter Einstieg', () => {
  it('erkennt jeden Schritt, sobald er erledigt ist', () => {
    const layout = emptyLayout();
    const add = (type: PartType, x: number, y: number) =>
      layout.parts.push(createPart(type, layout.parts, { x, y }));
    let solution = emptySolution();
    expect(current(layout, ctx(layout, solution))).toBe(0);
    add('belt', 300, 200);
    expect(current(layout, ctx(layout, solution))).toBe(1);
    add('inductive', 300, 236);
    add('switch', 0, 400);
    expect(current(layout, ctx(layout, solution))).toBe(3);
    solution = { ...solution, modules: [{ id: 'cpu1', type: 'cpu-klein', x: 0 }] };
    expect(current(layout, ctx(layout, solution))).toBe(4);
    solution = {
      ...solution,
      modules: [
        ...solution.modules,
        { id: 'di1', type: 'di8', x: 6 },
        { id: 'rel1', type: 'rel4', x: 7 },
      ],
    };
    expect(current(layout, ctx(layout, solution))).toBe(5);
    const level = levelFromLayout(layout);
    solution = autoWire(level, solution).solution;
    expect(current(layout, ctx(layout, solution))).toBe(6);
    const tags = syncDeviceTags(level, analyzeBoard(level, solution), 'cpu1', emptyProject()).tags;
    const src =
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n"M1_Bandmotor" := "S1_Schalter";\nEND_ORGANIZATION_BLOCK';
    solution = {
      ...solution,
      projects: { cpu1: { tags, blocks: sourceToProject(src, tags).project!.blocks } },
    };
    expect(current(layout, ctx(layout, solution))).toBe(7);
    const c = compileSolution(level, solution);
    const run = new LevelRun(level, solution, c.programs);
    (run.plant as SandboxPlant).setControl('S1', true);
    run.runTo(200);
    expect(current(layout, ctx(layout, solution, run))).toBe(-1);
  });
});
