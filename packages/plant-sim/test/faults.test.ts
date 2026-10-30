import { describe, expect, it } from 'vitest';
import { SandboxPlant, World, binAccepts, deviceId } from '../src';
import { STEEL, WOOD, layoutOf } from './helpers';

describe('Soll-Regeln der Behälter', () => {
  it('zählt Fehlsortierungen nach Regel', () => {
    expect(binAccepts('metall', STEEL)).toBe(true);
    expect(binAccepts('metall', WOOD)).toBe(false);
    expect(binAccepts('nichtmetall', WOOD)).toBe(true);
    expect(binAccepts('mat:holz', WOOD)).toBe(true);
    expect(binAccepts('farbe:silber', WOOD)).toBe(false);
    expect(binAccepts('alle', WOOD)).toBe(true);

    const lay = layoutOf([
      { type: 'belt', x: 300, y: 200, z: 100 },
      { type: 'bin', x: 690, y: 200, z: 60, params: { rule: 'metall' } },
    ]);
    const w = new World(lay);
    w.addWorkpiece(STEEL, 500, 200, 100);
    w.addWorkpiece(WOOD, 420, 200, 100);
    w.setOutputs({ [deviceId(lay.parts[0]!, '')]: true });
    for (let i = 0; i < 2000; i++) w.step();
    expect(w.st(lay.parts[1]!)).toMatchObject({ total: 2, missorted: 1 });
  });
});

describe('Störungen', () => {
  it('Sensor dauernd 1 bzw. 0, Drahtbruch am Öffner liefert elektrisch 0', () => {
    const lay = layoutOf([
      { type: 'inductive', x: 0, y: 0, z: 115 },
      { type: 'inductive', x: 0, y: 100, z: 115 },
      { type: 'button', x: 0, y: 200, params: { contact: 'NC' } },
    ]);
    lay.parts[0]!.fault = 'dauer1';
    lay.parts[2]!.fault = 'drahtbruch';
    const plant = new SandboxPlant(lay);
    plant.world.addWorkpiece(STEEL, 36, 100, 100);
    lay.parts[1]!.fault = undefined;
    for (let t = 0; t < 6; t++) plant.step(t, {});
    const inp = plant.inputs();
    expect(inp[deviceId(lay.parts[0]!, '')]).toBe(true);
    expect(inp[deviceId(lay.parts[1]!, '')]).toBe(true);
    // Öffner: LevelRun kehrt um – „betätigt“ (true) bedeutet elektrisch 0
    expect(inp[deviceId(lay.parts[2]!, '')]).toBe(true);
  });

  it('Drahtbruch am Analogeingang meldet einen Geberfehler, am Ausgang kommt nichts an', () => {
    const lay = layoutOf([
      { type: 'poti', x: 0, y: 0 },
      { type: 'gauge', x: 0, y: 100 },
    ]);
    lay.parts[0]!.fault = 'drahtbruch';
    lay.parts[1]!.fault = 'drahtbruch';
    const plant = new SandboxPlant(lay);
    expect(plant.fault(deviceId(lay.parts[0]!, ''))).toBe('break');
    plant.step(0, { [deviceId(lay.parts[1]!, '')]: 27648 });
    plant.step(1, { [deviceId(lay.parts[1]!, '')]: 27648 });
    expect(plant.world.st(lay.parts[1]!).value).toBe(0);
    lay.parts[1]!.fault = undefined;
    const ok = new SandboxPlant(lay);
    ok.step(0, { [deviceId(lay.parts[1]!, '')]: 13824 });
    ok.step(1, { [deviceId(lay.parts[1]!, '')]: 13824 });
    expect(ok.world.st(lay.parts[1]!).value).toBeCloseTo(50, 6);
  });
});
