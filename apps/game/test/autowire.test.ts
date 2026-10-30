import { describe, expect, it } from 'vitest';
import { analyzeBoard, emptySolution, type Solution } from '@zyklus/sim-core';
import {
  createPart,
  emptyLayout,
  levelFromLayout,
  type Layout,
  type PartType,
} from '@zyklus/plant-sim';
import { autoWire } from '../src/state/edit';

function layout(types: PartType[]): Layout {
  const l = emptyLayout();
  for (const type of types) l.parts.push(createPart(type, l.parts, { x: 0, y: 0 }));
  return l;
}

describe('Automatisch verdrahten', () => {
  it('belegt passende Kanäle, Motoren auf Relais, Analog mit passendem Messbereich', () => {
    const level = levelFromLayout(
      layout(['button', 'inductive', 'belt', 'lamp', 'ultrasonic', 'cylinder']),
    );
    const s: Solution = {
      ...emptySolution(),
      modules: [
        { id: 'cpu1', type: 'cpu-klein', x: 0 },
        { id: 'dio1', type: 'dio8', x: 6 },
        { id: 'rel1', type: 'rel4', x: 8 },
        { id: 'ai1', type: 'ai2', x: 10 },
      ],
    };
    const r = autoWire(level, s);
    expect(r.missing).toEqual({});
    expect(r.wired).toBe(level.devices.length);
    const a = analyzeBoard(level, r.solution);
    expect(a.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const belt = level.devices.find((d) => d.power)!;
    expect(r.solution.wires.find((w) => w.device === belt.id)!.module).toBe('rel1');
    const lamp = level.devices.find((d) => d.role === 'lamp')!;
    expect(r.solution.wires.find((w) => w.device === lamp.id)!.module).toBe('dio1');
    const us = level.devices.find((d) => d.kind === 'AI')!;
    expect(a.bindings.get(us.id)!.range).toBe('4-20mA');
    // Variablen mit den vorgeschlagenen Namen angelegt
    expect(r.solution.projects.cpu1!.tags.map((t) => t.name)).toContain('S1_Taster');
  });

  it('meldet fehlende Kanäle', () => {
    const level = levelFromLayout(layout(['belt', 'belt', 'switch']));
    const s: Solution = {
      ...emptySolution(),
      modules: [
        { id: 'cpu1', type: 'cpu-klein', x: 0 },
        { id: 'di1', type: 'di8', x: 6 },
      ],
    };
    const r = autoWire(level, s);
    expect(r.wired).toBe(1);
    expect(r.missing).toEqual({ REL: 2 });
  });
});
