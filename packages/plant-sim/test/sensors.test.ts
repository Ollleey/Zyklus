import { describe, expect, it } from 'vitest';
import {
  SandboxPlant,
  World,
  deviceId,
  detect,
  type MaterialId,
  type ColorId,
  type Params,
  type PartType,
  type WorkpieceSpec,
} from '../src';
import { STEEL, layoutOf } from './helpers';

/**
 * Sensor bei (0, 0) in Höhe 115 mit Blick nach +x; die aktive Fläche liegt bei x = 12.
 * Das Werkstück (40 × 40 × 30) steht mit seiner Vorderkante `d` mm vor der Fläche.
 */
function scene(type: PartType, params: Params, spec: WorkpieceSpec | null, d: number) {
  const lay = layoutOf([{ type, x: 0, y: 0, z: 115, params }]);
  const w = new World(lay);
  if (spec) w.addWorkpiece(spec, 12 + d + 20, 0, 100);
  return { w, sensor: lay.parts[0]! };
}

const piece = (material: MaterialId, color: ColorId = 'natur'): WorkpieceSpec => ({
  material,
  color,
  size: 'mittel',
});

const sees = (
  type: PartType,
  params: Params,
  spec: WorkpieceSpec | null,
  d: number,
  prev = false,
) => {
  const { w, sensor } = scene(type, params, spec, d);
  return detect(sensor, w, prev);
};

describe('Induktiver Sensor', () => {
  const ind = { range: 8, hysteresis: 1 };

  it('erkennt Stahl, aber kein Holz, keinen Kunststoff und kein Glas', () => {
    expect(sees('inductive', ind, piece('stahl', 'silber'), 4)).toBe(true);
    for (const m of ['holz', 'kunststoff', 'glas'] as const) {
      expect(sees('inductive', ind, piece(m), 0)).toBe(false);
    }
  });

  it('erkennt Aluminium nur innerhalb des reduzierten Schaltabstands (Faktor 0,4)', () => {
    const alu = piece('aluminium', 'silber');
    expect(sees('inductive', ind, alu, 3)).toBe(true); // 8 · 0,4 = 3,2 mm
    expect(sees('inductive', ind, alu, 4)).toBe(false);
    expect(sees('inductive', ind, piece('stahl', 'silber'), 7.5)).toBe(true);
    expect(sees('inductive', ind, piece('messing', 'silber'), 4)).toBe(true); // 8 · 0,5
    expect(sees('inductive', ind, piece('messing', 'silber'), 4.5)).toBe(false);
  });

  it('Schalthysterese: schaltet bei 8 mm ein und erst über 9 mm wieder aus', () => {
    const st = piece('stahl', 'silber');
    expect(sees('inductive', ind, st, 8.5, false)).toBe(false);
    expect(sees('inductive', ind, st, 8.5, true)).toBe(true);
    expect(sees('inductive', ind, st, 9.5, true)).toBe(false);
  });

  it('erkennt nur Teile auf Höhe der Achse und vor der Fläche', () => {
    const lay = layoutOf([{ type: 'inductive', x: 0, y: 0, z: 200 }]);
    const w = new World(lay);
    w.addWorkpiece(STEEL, 34, 0, 100);
    expect(detect(lay.parts[0]!, w)).toBe(false);
    const lay2 = layoutOf([{ type: 'inductive', x: 0, y: 0, z: 115, rot: 180 }]);
    const w2 = new World(lay2);
    w2.addWorkpiece(STEEL, 34, 0, 100);
    expect(detect(lay2.parts[0]!, w2)).toBe(false);
  });
});

describe('Kapazitiver Sensor', () => {
  const cap = { range: 15, hysteresis: 2 };

  it('erkennt Holz und Metall, Metall auf größere Entfernung', () => {
    expect(sees('capacitive', cap, piece('holz'), 5)).toBe(true);
    expect(sees('capacitive', cap, piece('stahl', 'silber'), 5)).toBe(true);
    expect(sees('capacitive', cap, piece('stahl', 'silber'), 14)).toBe(true);
    expect(sees('capacitive', cap, piece('holz'), 14)).toBe(false);
    expect(sees('capacitive', cap, piece('kunststoff', 'blau'), 5)).toBe(true);
    expect(sees('capacitive', cap, null, 0)).toBe(false);
  });

  it('erkennt Flüssigkeit durch die Tankwand bis zur Sensorhöhe', () => {
    const lay = layoutOf([
      { type: 'tank', x: 0, y: 0, z: 0, params: { diameter: 200, height: 300, level0: 50 } },
      { type: 'capacitive', x: -112, y: 0, z: 100 },
      { type: 'capacitive', x: -112, y: 0, z: 200 },
    ]);
    const w = new World(lay);
    expect(detect(lay.parts[1]!, w)).toBe(true);
    expect(detect(lay.parts[2]!, w)).toBe(false);
  });
});

describe('Optischer Taster', () => {
  const opt = { range: 120, hysteresis: 5 };

  it('erkennt ein schwarzes Teil nur in kurzem Abstand, ein weißes weit', () => {
    const black = piece('kunststoff', 'schwarz');
    const white = piece('kunststoff', 'weiss');
    expect(sees('diffuse', opt, black, 10)).toBe(true);
    expect(sees('diffuse', opt, black, 40)).toBe(false);
    expect(sees('diffuse', opt, white, 40)).toBe(true);
    expect(sees('diffuse', opt, white, 110)).toBe(true);
  });

  it('Glas reflektiert kaum', () => {
    expect(sees('diffuse', opt, piece('glas', 'weiss'), 20)).toBe(false);
  });
});

describe('Lichtschranken', () => {
  it('Einweg-Lichtschranke erkennt Glas nicht, aber undurchsichtige Teile', () => {
    expect(sees('thrubeam', { length: 120 }, piece('glas', 'weiss'), 40)).toBe(false);
    expect(sees('thrubeam', { length: 120 }, piece('holz'), 40)).toBe(true);
    expect(sees('thrubeam', { length: 120 }, piece('kunststoff', 'schwarz'), 40)).toBe(true);
    expect(sees('thrubeam', { length: 120 }, piece('holz'), 130)).toBe(false);
  });

  it('Reflexions-Lichtschranke ohne Polfilter: glänzendes Metall täuscht freien Strahl vor', () => {
    const steel = piece('stahl', 'silber');
    expect(sees('retro', { length: 120, polfilter: true }, steel, 40)).toBe(true);
    expect(sees('retro', { length: 120, polfilter: false }, steel, 40)).toBe(false);
    expect(sees('retro', { length: 120, polfilter: false }, piece('holz'), 40)).toBe(true);
  });
});

describe('Farbsensor', () => {
  it('DI je eingelernter Farbe oder Farbcode, nur auf kurzen Abstand', () => {
    expect(
      sees('color', { range: 20, mode: 'di', target: 'rot' }, piece('kunststoff', 'rot'), 10),
    ).toBe(true);
    expect(
      sees('color', { range: 20, mode: 'di', target: 'rot' }, piece('kunststoff', 'blau'), 10),
    ).toBe(false);
    expect(
      sees('color', { range: 20, mode: 'di', target: 'rot' }, piece('kunststoff', 'rot'), 30),
    ).toBe(false);
    expect(sees('color', { range: 20, mode: 'code' }, piece('kunststoff', 'blau'), 10)).toBe(2);
    expect(sees('color', { range: 20, mode: 'code' }, null, 10)).toBe(0);
  });
});

describe('Ultraschall', () => {
  it('misst waagrecht den Abstand und hat eine Blindzone', () => {
    const us = { range: 400, blind: 30, facing: 'vorn' };
    expect(sees('ultrasonic', us, piece('holz'), 150)).toBeCloseTo(150, 6);
    expect(sees('ultrasonic', us, piece('glas', 'weiss'), 80)).toBeCloseTo(80, 6);
    // in der Blindzone und ohne Objekt: Endwert
    expect(sees('ultrasonic', us, piece('holz'), 10)).toBe(400);
    expect(sees('ultrasonic', us, null, 0)).toBe(400);
  });

  it('misst von oben den Flüssigkeitsspiegel im Tank', () => {
    const lay = layoutOf([
      { type: 'tank', x: 0, y: 0, z: 0, params: { height: 300, level0: 25 } },
      { type: 'ultrasonic', x: 0, y: 0, z: 400 },
    ]);
    const w = new World(lay);
    // Spiegel bei 75 mm → 325 mm Abstand
    expect(detect(lay.parts[1]!, w)).toBeCloseTo(325, 6);
  });
});

describe('Endschalter, Zylinderschalter, Wägezelle, Füllstand', () => {
  it('Endschalter wird durch Werkstück oder Zylinder betätigt', () => {
    expect(sees('limit', {}, piece('holz'), 2)).toBe(true);
    expect(sees('limit', {}, piece('holz'), 20)).toBe(false);
    const lay = layoutOf([
      { type: 'cylinder', x: 0, y: 0, z: 100, params: { stroke: 80 } },
      { type: 'limit', x: 132, y: 0, z: 110, rot: 180 },
    ]);
    const w = new World(lay);
    expect(detect(lay.parts[1]!, w)).toBe(false);
    w.setOutputs({ [deviceId(lay.parts[0]!, 'aus')]: true });
    for (let i = 0; i < 250; i++) w.step();
    expect(detect(lay.parts[1]!, w)).toBe(true);
  });

  it('Zylinderschalter meldet die Endlage', () => {
    const lay = layoutOf([
      { type: 'cylinder', x: 0, y: 0, tag: '1A1' },
      { type: 'reed', x: 0, y: 0, params: { cylinder: '1A1', position: 'aus' } },
      { type: 'reed', x: 0, y: 0, params: { cylinder: '1A1', position: 'ein' } },
    ]);
    const w = new World(lay);
    const [, out, inn] = lay.parts;
    expect([detect(out!, w), detect(inn!, w)]).toEqual([false, true]);
    w.setOutputs({ [deviceId(lay.parts[0]!, 'aus')]: true });
    for (let i = 0; i < 250; i++) w.step();
    expect([detect(out!, w), detect(inn!, w)]).toEqual([true, false]);
  });

  it('Wägezelle misst nur Teile, die auf der Wiegefläche liegen', () => {
    const lay = layoutOf([{ type: 'loadcell', x: 0, y: 0, z: 100 }]);
    const w = new World(lay);
    w.addWorkpiece(STEEL, 0, 0, 100);
    const far = w.addWorkpiece(STEEL, 500, 0, 100);
    w.step();
    expect(far.grounded).toBe(false);
    expect(detect(lay.parts[0]!, w)).toBe(377);
  });

  it('Füllstand analog und Grenzwertschalter mit Hysterese', () => {
    const lay = layoutOf([
      { type: 'tank', x: 0, y: 0, params: { level0: 79.5 } },
      { type: 'level', x: 0, y: 0 },
      { type: 'levelswitch', x: 0, y: 0, params: { at: 80 } },
    ]);
    const w = new World(lay);
    const [, lvl, sw] = lay.parts;
    expect(detect(lvl!, w)).toBeCloseTo(79.5, 6);
    expect(detect(sw!, w, false)).toBe(false);
    expect(detect(sw!, w, true)).toBe(true);
  });
});

describe('Schaltausgang im Anlagenmodell', () => {
  it('Ansprechzeit verzögert das Signal', () => {
    const lay = layoutOf([{ type: 'inductive', x: 0, y: 0, z: 115, params: { responseMs: 5 } }]);
    const plant = new SandboxPlant(lay);
    plant.world.addWorkpiece(STEEL, 36, 0, 100);
    const id = deviceId(lay.parts[0]!, '');
    const seen: boolean[] = [];
    for (let t = 0; t < 8; t++) {
      plant.step(t, {});
      seen.push(plant.inputs()[id] as boolean);
    }
    // erfasst im ersten Mechanikschritt (2 ms), Ausgang 5 ms später
    expect(seen.indexOf(true)).toBe(6);
  });

  it('Endschalter prellt deterministisch nach dem Seed', () => {
    const run = (seed: number) => {
      const lay = layoutOf([{ type: 'limit', x: 0, y: 0, z: 115 }], seed);
      const plant = new SandboxPlant(lay);
      plant.world.addWorkpiece(piece('holz'), 34, 0, 100);
      const id = deviceId(lay.parts[0]!, '');
      const trace: boolean[] = [];
      for (let t = 0; t < 30; t++) {
        plant.step(t, {});
        trace.push(plant.inputs()[id] as boolean);
      }
      return trace;
    };
    const a = run(3);
    const changes = a.filter((v, i) => i > 0 && v !== a[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(a.at(-1)).toBe(true);
    expect(run(3)).toEqual(a);
  });
});
