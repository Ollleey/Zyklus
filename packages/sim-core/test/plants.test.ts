import { describe, expect, it } from 'vitest';
import { createPlant, evaluateCheck, type Edge, type Level } from '../src';

const level = (type: string, params: Record<string, unknown>, devices: Level['devices'] = []) =>
  ({ plant: { type, params }, devices }) as unknown as Level;

describe('Anlagenmodelle', () => {
  it('Bohrstation: Ablauf mit Verweilzeit ergibt eine Bohrung, ohne Spannen einen Schaden', () => {
    const ids = {
      up: 'B1',
      down: 'B2',
      clamped: 'B3',
      clamp: 'Y1',
      motor: 'M1',
      lower: 'Y2',
      raise: 'Y3',
    };
    const p = createPlant(level('drill', ids))!;
    let t = 0;
    const run = (ms: number, out: Record<string, boolean>) => {
      for (let i = 0; i < ms; i++) p.step(t++, out);
    };
    run(200, { Y1: true });
    expect(p.inputs().B3).toBe(true);
    run(1000, { Y1: true, M1: true, Y2: true });
    expect(p.inputs().B2).toBe(true);
    run(250, { Y1: true, M1: true });
    run(600, { Y1: true, M1: true, Y3: true });
    expect(p.inputs().B1).toBe(true);
    expect(p.state()).toMatchObject({ holes: 1, bad: 0, damage: 0 });

    const loose = createPlant(level('drill', ids))!;
    for (let i = 0; i < 800; i++) loose.step(i, { M1: true, Y2: true });
    expect(loose.state().damage).toBe(1);
  });

  it('Sortierstrecke wertet die Weichenstellung am Ende der Lichtschranke aus', () => {
    const p = createPlant(
      level('sorter', {
        measure: 'B1',
        height: 'H',
        gate: 'B2',
        diverter: 'Y1',
        packages: [
          [0, 160],
          [300, 80],
        ],
        travelMs: 900,
        lengthMs: 250,
      }),
    )!;
    expect(p.inputs()).toEqual({ B1: true, H: 160, B2: false });
    for (let t = 0; t < 1500; t++) p.step(t, { Y1: t < 1200 });
    expect(p.state()).toEqual({ sorted: 2, wrong: 0 });
  });

  it('Wärmestrecke nähert sich dem Endwert mit der Zeitkonstante', () => {
    const p = createPlant(
      level('thermal', { sensor: 'T', heater: 'H', tau: 1000, gain: 100, ambient: 20 }, [
        {
          id: 'H',
          tag: 'H',
          name: { de: 'H' },
          kind: 'AO',
          side: 'right',
          role: 'actuator',
          analog: { unit: '%', min: 0, max: 100 },
        },
      ]),
    )!;
    for (let t = 0; t < 1000; t++) p.step(t, { H: 13824 }); // 50 %
    // nach τ: 63 % des Sprungs von 20 auf 70 °C
    expect(p.state().temp).toBeCloseTo(20 + 50 * 0.632, 0);
  });
});

describe('Kriterium Tastverhältnis', () => {
  const pwm = (duty: number, period: number, until: number): Edge[] => {
    const e: Edge[] = [];
    for (let t = 0; t < until; t += period) {
      e.push([t, true]);
      e.push([t + (period * duty) / 100, false]);
    }
    return e;
  };
  const check = {
    kind: 'duty' as const,
    name: { de: 'PWM' },
    signal: 'Y',
    periodMs: 1000,
    duty: [[0, 30]] as Edge[],
    tolerance: 2,
    from: 0,
  };

  it('akzeptiert das Soll-Tastverhältnis, auch phasenverschoben', () => {
    const shifted = pwm(30, 1000, 5000).map(([t, v]) => [t + 370, v] as Edge);
    expect(evaluateCheck(check, { Y: shifted }, 5000).ok).toBe(true);
  });

  it('meldet falsches Tastverhältnis', () => {
    const r = evaluateCheck(check, { Y: pwm(40, 1000, 5000) }, 5000);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/40 % statt 30 %/);
  });
});
