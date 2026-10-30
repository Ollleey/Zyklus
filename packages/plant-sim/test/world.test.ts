import { describe, expect, it } from 'vitest';
import { World, deviceId, devicesOf, massOf, type Layout, type Params } from '../src';
import { STEEL, WOOD, layoutOf } from './helpers';

/** Welt mit festen Ausgängen für `ms` Millisekunden weiterrechnen */
function run(w: World, ms: number, outputs: Record<string, boolean | number> = {}) {
  w.setOutputs(outputs);
  for (let t = 0; t < ms; t += 2) w.step();
}

const belt = (extra: object = {}) => ({ type: 'belt' as const, x: 300, y: 200, z: 100, ...extra });

describe('Werkstoffe', () => {
  it('Masse aus Dichte und Größe', () => {
    expect(massOf(STEEL)).toBe(377); // 7,85 g/cm³ · 40 · 40 · 30 mm
    expect(massOf(WOOD)).toBe(29);
  });
});

describe('Förderband', () => {
  it('nimmt Werkstücke mit Bandgeschwindigkeit mit, steht ohne Ausgang still', () => {
    const lay = layoutOf([belt()]);
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 100, 200, 100);
    run(w, 1000);
    expect(wp.x).toBeCloseTo(100, 6);
    const m = lay.parts[0]!;
    run(w, 1000, { [deviceId(m, '')]: true });
    expect(wp.x).toBeCloseTo(220, 0);
    expect(wp.state).toBe('free');
  });

  it('läuft rückwärts mit dem zweiten Schütz und nach Sollwert am Umrichter', () => {
    const lay = layoutOf([belt({ params: { reversible: true } })]);
    const m = lay.parts[0]!;
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 300, 200, 100);
    run(w, 500, { [deviceId(m, 'rueck')]: true });
    expect(wp.x).toBeCloseTo(240, 0);
    // beide Schütze zugleich: Band steht
    run(w, 500, { [deviceId(m, '')]: true, [deviceId(m, 'rueck')]: true });
    expect(wp.x).toBeCloseTo(240, 0);

    const vfd = layoutOf([belt({ params: { drive: 'vfd', speed: 200 } })]);
    const v = vfd.parts[0]!;
    const w2 = new World(vfd);
    const p2 = w2.addWorkpiece(STEEL, 100, 200, 100);
    run(w2, 1000, { [deviceId(v, 'frei')]: true, [deviceId(v, 'soll')]: 13824 });
    expect(p2.x).toBeCloseTo(200, 0); // 50 % von 200 mm/s
  });

  it('übergibt an ein gleich hohes Band, eine höhere Bandkante wirkt als Wand', () => {
    const lay = layoutOf([
      belt({ x: 300 }),
      belt({ x: 900 }),
      { type: 'belt', x: 1500, y: 200, z: 140 },
    ]);
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 500, 200, 100);
    const on = Object.fromEntries(lay.parts.map((p) => [deviceId(p, ''), true]));
    run(w, 8000, on);
    expect(wp.z).toBe(100);
    // Vorderkante steht an der Kante des höheren Bandes (x = 1200)
    expect(wp.x + wp.s / 2).toBeLessThanOrEqual(1200.5);
    expect(wp.x + wp.s / 2).toBeGreaterThan(1197);
  });
});

describe('Fallen und Behälter', () => {
  it('fällt am Bandende in den Behälter und wird nach Werkstoff und Farbe gezählt', () => {
    const lay = layoutOf([belt(), { type: 'bin', x: 690, y: 200, z: 60 }]);
    const [m, bin] = lay.parts;
    const w = new World(lay);
    w.addWorkpiece(STEEL, 500, 200, 100);
    w.addWorkpiece(WOOD, 420, 200, 100);
    run(w, 4000, { [deviceId(m!, '')]: true });
    const st = w.st(bin!);
    expect(st.total).toBe(2);
    expect(st.counts.stahl).toBe(1);
    expect(st.counts.holz).toBe(1);
    expect(st.counts.natur).toBe(1);
    expect(w.tally()).toEqual({ free: 0, binned: 2, lost: 0 });
  });

  it('ohne Behälter landet es auf dem Boden (verloren)', () => {
    const lay = layoutOf([belt()]);
    const w = new World(lay);
    w.addWorkpiece(STEEL, 550, 200, 100);
    run(w, 3000, { [deviceId(lay.parts[0]!, '')]: true });
    expect(w.tally().lost).toBe(1);
  });

  it('Fallzeit nach der Schwerkraft', () => {
    const w = new World(layoutOf([]));
    const wp = w.addWorkpiece(STEEL, 0, 0, 490.5);
    // s = g t²/2 → 490,5 mm in 0,316 s
    run(w, 300);
    expect(wp.state).toBe('free');
    run(w, 30);
    expect(wp.state).toBe('lost');
  });
});

describe('Anschlag und Stau', () => {
  it('hält Werkstücke an, die folgenden stauen sich ohne Überlappung, Öffnen gibt frei', () => {
    const lay = layoutOf([belt(), { type: 'stopper', x: 400, y: 200, z: 100 }]);
    const [m, stop] = lay.parts;
    const w = new World(lay);
    const a = w.addWorkpiece(STEEL, 300, 200, 100);
    const b = w.addWorkpiece(WOOD, 200, 200, 100);
    const c = w.addWorkpiece(WOOD, 100, 200, 100);
    run(w, 4000, { [deviceId(m!, '')]: true });
    // Anschlag 394…406: Vorderkante von a bei 394
    expect(a.x + a.s / 2).toBeCloseTo(394, 0);
    expect(a.x - b.x).toBeGreaterThanOrEqual(40 - 0.01);
    expect(b.x - c.x).toBeGreaterThanOrEqual(40 - 0.01);
    expect(a.x - b.x).toBeLessThan(42);
    run(w, 1000, { [deviceId(m!, '')]: true, [deviceId(stop!, '')]: true });
    expect(a.x).toBeGreaterThan(450);
  });
});

describe('Zylinder', () => {
  it('3/2-Ventil: fährt in der Hubzeit aus und mit Federkraft zurück', () => {
    const lay = layoutOf([
      { type: 'cylinder', x: 0, y: 0, params: { extendMs: 400, retractMs: 200 } },
    ]);
    const cyl = lay.parts[0]!;
    const w = new World(lay);
    run(w, 200, { [deviceId(cyl, 'aus')]: true });
    expect(w.st(cyl).pos).toBeCloseTo(0.5, 2);
    run(w, 200, { [deviceId(cyl, 'aus')]: true });
    expect(w.st(cyl).pos).toBe(1);
    run(w, 100);
    expect(w.st(cyl).pos).toBeCloseTo(0.5, 2);
  });

  it('5/2 bistabil: bleibt nach einem Impuls in der Stellung', () => {
    const lay = layoutOf([{ type: 'cylinder', x: 0, y: 0, params: { valve: '5/2-bi' } }]);
    const cyl = lay.parts[0]!;
    expect(devicesOf(lay).map((d) => d.id)).toEqual([deviceId(cyl, 'aus'), deviceId(cyl, 'ein')]);
    const w = new World(lay);
    run(w, 20, { [deviceId(cyl, 'aus')]: true });
    run(w, 600);
    expect(w.st(cyl).pos).toBe(1);
    run(w, 20, { [deviceId(cyl, 'ein')]: true });
    run(w, 600);
    expect(w.st(cyl).pos).toBe(0);
  });

  it('schiebt ein Werkstück quer vom Band in den Behälter', () => {
    // Zylinder unterhalb des Bandes, schiebt nach oben (270°) über das Band
    const lay = layoutOf([
      belt(),
      { type: 'cylinder', x: 300, y: 290, z: 100, rot: 270, params: { stroke: 120 } },
      { type: 'bin', x: 300, y: 70, z: 60 },
    ]);
    const [, cyl, bin] = lay.parts;
    const w = new World(lay);
    w.addWorkpiece(STEEL, 300, 200, 100);
    run(w, 800, { [deviceId(cyl!, 'aus')]: true });
    run(w, 1000);
    expect(w.st(bin!).total).toBe(1);
  });

  it('klemmender Zylinder bewegt sich nicht', () => {
    const lay = layoutOf([{ type: 'cylinder', x: 0, y: 0 }]);
    lay.parts[0]!.fault = 'klemmt';
    const w = new World(lay);
    run(w, 600, { [deviceId(lay.parts[0]!, 'aus')]: true });
    expect(w.st(lay.parts[0]!).pos).toBe(0);
  });
});

describe('Weiche', () => {
  it('lenkt Werkstücke seitlich in den Behälter, ausgeschaltet laufen sie durch', () => {
    const lay = layoutOf([
      belt(),
      { type: 'diverter', x: 400, y: 200, z: 100 },
      { type: 'bin', x: 400, y: 70, z: 60 },
      { type: 'bin', x: 690, y: 200, z: 60 },
    ]);
    const [m, div, side, end] = lay.parts;
    const w = new World(lay);
    w.addWorkpiece(STEEL, 300, 200, 100);
    run(w, 2000, { [deviceId(m!, '')]: true, [deviceId(div!, '')]: true });
    w.addWorkpiece(WOOD, 300, 200, 100);
    run(w, 4000, { [deviceId(m!, '')]: true });
    expect(w.st(side!).counts.stahl).toBe(1);
    expect(w.st(end!).counts.holz).toBe(1);
  });
});

describe('Magazin', () => {
  const mag = (params: Params): Layout =>
    layoutOf([
      { type: 'magazine', x: -45, y: 200, z: 100, params },
      belt(),
      { type: 'bin', x: 690, y: 200, z: 60 },
    ]);

  it('gibt eine feste Liste der Reihe nach aus und meldet leer', () => {
    const lay = mag({ random: false, list: [STEEL, WOOD, STEEL] });
    const [g, m, bin] = lay.parts;
    const w = new World(lay);
    const on = { [deviceId(m!, '')]: true };
    for (let i = 0; i < 4; i++) {
      run(w, 10, { ...on, [deviceId(g!, 'aus')]: true });
      run(w, 1000, on);
    }
    expect(w.workpieces.map((k) => k.spec.material)).toEqual(['stahl', 'holz', 'stahl']);
    expect(w.remaining(g!)).toBe(0);
    run(w, 6000, on);
    expect(w.st(bin!).total).toBe(3);
  });

  it('schiebt nicht aus, solange die Öffnung belegt ist', () => {
    const lay = mag({ random: false, list: [STEEL, STEEL] });
    const g = lay.parts[0]!;
    const w = new World(lay);
    run(w, 10, { [deviceId(g, 'aus')]: true });
    run(w, 10);
    run(w, 10, { [deviceId(g, 'aus')]: true });
    expect(w.workpieces).toHaveLength(1);
  });

  it('Zufallsmix ist durch den Seed bestimmt', () => {
    const lay = mag({ mode: 'auto', intervalMs: 500, capacity: 12 });
    const specs = (seed: number) => {
      const w = new World(lay, seed);
      run(w, 10000, { [deviceId(lay.parts[1]!, '')]: true });
      return w.workpieces.map((k) => `${k.spec.material}/${k.spec.color}`);
    };
    expect(specs(7)).toHaveLength(12);
    expect(specs(7)).toEqual(specs(7));
    expect(specs(7)).not.toEqual(specs(8));
    expect(new Set(specs(7)).size).toBeGreaterThan(1);
  });
});

describe('Hubtisch, Drehtisch, Tank', () => {
  it('Hubtisch hebt Werkstücke an', () => {
    const lay = layoutOf([
      { type: 'lift', x: 0, y: 0, z: 100, params: { stroke: 80, timeMs: 800 } },
    ]);
    const lift = lay.parts[0]!;
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 0, 0, 100);
    run(w, 400, { [deviceId(lift, 'heben')]: true });
    expect(wp.z).toBeCloseTo(140, 0);
    run(w, 600, { [deviceId(lift, 'heben')]: true });
    expect(wp.z).toBeCloseTo(180, 0);
  });

  it('Drehtisch dreht ein Werkstück um seine Mitte', () => {
    const lay = layoutOf([{ type: 'turntable', x: 0, y: 0, z: 100, params: { diameter: 200 } }]);
    const tt = lay.parts[0]!;
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 50, 0, 100);
    run(w, 1100, { [deviceId(tt, 'dreh')]: true });
    expect(w.st(tt).angle).toBe(90);
    // Uhrzeigersinn in der Draufsicht: von +x nach +y
    expect(wp.x).toBeCloseTo(0, -1);
    expect(wp.y).toBeCloseTo(50, -1);
  });

  it('Pumpe füllt und Ventil leert den Tank', () => {
    const lay = layoutOf([
      { type: 'tank', x: 0, y: 0, params: { volume: 100, level0: 50 } },
      { type: 'pump', x: 200, y: 0, params: { flow: 4 } },
      { type: 'valve', x: 200, y: 100, params: { flow: 2 } },
    ]);
    const [tank, pump, valve] = lay.parts;
    const w = new World(lay);
    run(w, 5000, { [deviceId(pump!, '')]: true });
    expect(w.levelOf(tank!)).toBeCloseTo(70, 1);
    run(w, 5000, { [deviceId(pump!, '')]: true, [deviceId(valve!, '')]: true });
    expect(w.levelOf(tank!)).toBeCloseTo(80, 1);
    run(w, 60000, { [deviceId(valve!, '')]: true });
    expect(w.levelOf(tank!)).toBe(0);
  });
});

describe('Bedienelemente', () => {
  it('Not-Halt rastet ein und wird erst durch Entriegeln frei', () => {
    const lay = layoutOf([{ type: 'estop', x: 0, y: 0 }]);
    const w = new World(lay);
    w.setControl('S1', true);
    w.setControl('S1', false);
    expect(w.st(lay.parts[0]!).control).toBe(1);
    w.releaseEstop('S1');
    expect(w.st(lay.parts[0]!).control).toBe(0);
  });
});

describe('Determinismus', () => {
  it('gleiche Anlage, gleicher Seed und gleiche Ausgänge ergeben denselben Verlauf', () => {
    const lay = layoutOf(
      [
        { type: 'magazine', x: -45, y: 200, z: 100, params: { mode: 'auto', intervalMs: 700 } },
        belt(),
        { type: 'diverter', x: 400, y: 200, z: 100 },
        { type: 'bin', x: 400, y: 70, z: 60 },
        { type: 'bin', x: 690, y: 200, z: 60 },
      ],
      42,
    );
    const once = () => {
      const w = new World(lay);
      for (let t = 0; t < 20000; t += 2) {
        w.setOutputs({
          [deviceId(lay.parts[1]!, '')]: true,
          [deviceId(lay.parts[2]!, '')]: Math.floor(t / 900) % 2 === 0,
        });
        w.step();
      }
      return JSON.stringify(w.workpieces);
    };
    expect(once()).toBe(once());
  });
});

describe('Drehung der Werkstücke', () => {
  it('dreht sich auf dem Drehtisch um 90° mit', () => {
    const lay = layoutOf([{ type: 'turntable', x: 0, y: 0, z: 100, params: { diameter: 200 } }]);
    const tt = lay.parts[0]!;
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, 50, 0, 100);
    run(w, 1100, { [deviceId(tt, 'dreh')]: true });
    expect(wp.angle).toBeCloseTo(90, 0);
  });

  it('folgt in der Kurve der Fahrtrichtung', () => {
    // Kurve R 200: Einlauf bei u = −100 auf der linken Spur (v = 60), Auslauf nach rechts (+y)
    const lay = layoutOf([
      { type: 'curve', x: 0, y: 0, z: 100, params: { radius: 200, width: 80 } },
    ]);
    const w = new World(lay);
    const wp = w.addWorkpiece(STEEL, -95, -60, 100);
    run(w, 4000, { [deviceId(lay.parts[0]!, '')]: true });
    expect(wp.angle).toBeGreaterThan(60);
    expect(wp.angle).toBeLessThan(100);
  });
});
