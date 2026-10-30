import { describe, expect, it } from 'vitest';
import { SandboxPlant, deviceId, type PartType } from '../src';
import { layoutOf } from './helpers';

/**
 * Leistung: 30 Bauteile und 50 Werkstücke im Stau. Schutz gegen Rückschritte: die Anlage allein
 * rechnet mindestens 50-mal schneller als Echtzeit (unter Vitest gemessen, ohne Optimierung des
 * Browsers). Die Bildrate im Spiel misst `scripts/sandbox-shots.mjs` (docs/sandbox/leistung.txt).
 */
describe('Leistung', () => {
  it('50 Werkstücke und 30 Bauteile: 1,67 s Anlagenzeit in unter 33 ms', () => {
    const specs: { type: PartType; x: number; y: number; z?: number; rot?: 0 | 90 | 180 | 270 }[] =
      [];
    // fünf Bänder hintereinander, je mit drei Sensoren und einem Zylinder
    for (let i = 0; i < 5; i++) {
      const x = 300 + i * 600;
      specs.push({ type: 'belt', x, y: 200, z: 100 });
      specs.push({ type: 'inductive', x: x - 150, y: 236, z: 115, rot: 270 });
      specs.push({ type: 'diffuse', x, y: 275, z: 115, rot: 270 });
      specs.push({ type: 'thrubeam', x: x + 150, y: 150, z: 115, rot: 90 });
      specs.push({ type: 'cylinder', x: x + 200, y: 290, z: 100, rot: 270 });
    }
    for (let i = 0; i < 4; i++) specs.push({ type: 'bin', x: 300 + i * 600, y: 70, z: 60 });
    // Anschlag am Ende: die Teile stauen sich (aufwendigster Fall für die Kollision)
    specs.push({ type: 'stopper', x: 2990, y: 200, z: 100 });
    // 30 Bauteile
    expect(specs).toHaveLength(30);
    const lay = layoutOf(specs);
    lay.workpieces = [];
    for (let i = 0; i < 50; i++) {
      lay.workpieces.push({
        material: i % 2 ? 'stahl' : 'holz',
        color: i % 2 ? 'silber' : 'natur',
        size: 'mittel',
        x: 20 + i * 58,
        y: 200,
        z: 100,
      });
    }
    const plant = new SandboxPlant(lay);
    const outputs = Object.fromEntries(
      lay.parts.filter((p) => p.type === 'belt').map((p) => [deviceId(p, ''), true]),
    );
    // Aufwärmen, dann messen
    for (let t = 0; t < 2000; t++) plant.step(t, outputs);
    const frames = 10;
    const t0 = performance.now();
    for (let t = 2000; t < 2000 + frames * 1667; t++) plant.step(t, outputs);
    const perFrame = (performance.now() - t0) / frames;
    expect(plant.world.tally().free).toBe(50);
    expect(perFrame).toBeLessThan(33);
  });
});
