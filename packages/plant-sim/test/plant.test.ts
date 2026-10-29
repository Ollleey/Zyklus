import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  ProgramBuilder,
  emptyProject,
  io,
  validateLevel,
  type Solution,
} from '@zyklus/sim-core';
import { SandboxPlant, deviceId, devicesOf, levelFromLayout } from '../src';
import { STEEL, layoutOf } from './helpers';

describe('Feldgeräte', () => {
  it('Kennzeichnung, Variablenvorschlag und Seite je Anschluss', () => {
    const lay = layoutOf([
      { type: 'button', x: 0, y: 0, params: { contact: 'NC' } },
      { type: 'cylinder', x: 0, y: 0 },
      { type: 'belt', x: 0, y: 0 },
      { type: 'poti', x: 0, y: 0 },
    ]);
    const d = devicesOf(lay);
    expect(d.map((x) => [x.tag, x.kind, x.side])).toEqual([
      ['S1_Taster', 'DI', 'left'],
      ['Z1A1_Aus', 'DO', 'right'],
      ['M1_Bandmotor', 'DO', 'right'],
      ['R1_Sollwert', 'AI', 'left'],
    ]);
    expect(d[0]!.nc).toBe(true);
    expect(d[2]!.power).toBe(true);
    expect(d[3]!.signal).toBe('0-10V');
  });

  it('das erzeugte Level ist gültig', () => {
    const lay = layoutOf([
      { type: 'belt', x: 0, y: 0 },
      { type: 'switch', x: 0, y: 0 },
    ]);
    expect(() => validateLevel(levelFromLayout(lay))).not.toThrow();
  });
});

describe('Kopplung mit der SPS', () => {
  it('Schalter startet über das Programm das Band, das Werkstück fällt in den Behälter', () => {
    const lay = layoutOf([
      { type: 'switch', x: 0, y: 400 },
      { type: 'belt', x: 300, y: 200, z: 100 },
      { type: 'bin', x: 690, y: 200, z: 60 },
    ]);
    lay.workpieces = [{ ...STEEL, x: 100, y: 200, z: 100 }];
    const [sw, belt, bin] = lay.parts;
    const level = levelFromLayout(lay);
    const solution: Solution = {
      version: 2,
      modules: [
        { id: 'cpu', type: 'cpu-klein', x: 0 },
        { id: 'di', type: 'di8', x: 6 },
        { id: 'rel', type: 'rel4', x: 7 },
      ],
      wires: [
        { device: deviceId(sw!, ''), module: 'di', channel: 0 },
        { device: deviceId(belt!, ''), module: 'rel', channel: 0 },
      ],
      projects: { cpu: emptyProject() },
    };
    const b = new ProgramBuilder();
    b.emit({ op: 'mov', t: 'BOOL', dst: io('%Q0.0'), src: io('%I0.0') });
    const run = new LevelRun(level, solution, new Map([['cpu', b.build()]]));
    const plant = run.plant as SandboxPlant;
    expect(plant).toBeInstanceOf(SandboxPlant);
    run.runTo(1000);
    expect(plant.world.workpieces[0]!.x).toBeCloseTo(100, 6);
    plant.setControl(sw!.tag, true);
    run.runTo(7000);
    expect(plant.world.st(bin!).total).toBe(1);
    expect(run.plant!.state()).toMatchObject({ binned: 1, K1: 1 });
  });
});
