import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySolution } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import {
  SandboxPlant,
  deviceId,
  levelFromLayout,
  parseAnlageFile,
  parseScenarioFile,
  publishLevel,
  resolveEvents,
  toAnlageFile,
  toScenarioFile,
  type AnlageFile,
  type Scenario,
  type ScenarioEvent,
} from '../src';
import { STEEL, layoutOf } from './helpers';

const load = (name: string): AnlageFile => {
  const r = parseAnlageFile(readFileSync(join(__dirname, '..', 'vorlagen', name), 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.file;
};

describe('Zeitleiste eines Szenarios', () => {
  const events: ScenarioEvent[] = [
    { kind: 'fault', at: 1000, jitter: 500, ref: 'B1', fault: 'dauer1', until: 2000 },
    { kind: 'control', at: 0, ref: 'S1', value: true },
    { kind: 'power', at: 3000, until: 3500 },
  ];

  it('legt Zufallsversätze je Seed reproduzierbar fest, Störungsende wandert mit', () => {
    const a = resolveEvents(events, 7);
    expect(resolveEvents(events, 7)).toEqual(a);
    expect(a.map((e) => e.kind)).toEqual(['control', 'fault', 'fault']);
    const [, on, off] = a as [unknown, { at: number }, { at: number; fault: string }];
    expect(on.at).toBeGreaterThanOrEqual(1000);
    expect(on.at).toBeLessThanOrEqual(1500);
    expect(off.at - on.at).toBe(1000);
    expect(off.fault).toBe('');
    // verschiedene Seeds streuen
    const ats = new Set([1, 2, 3, 4, 5, 6, 8, 9].map((s) => resolveEvents(events, s)[1]!.at));
    expect(ats.size).toBeGreaterThan(1);
  });

  it('Störung, Füllstand und eingelegtes Teil wirken im Lauf, die Anlage bleibt unverändert', () => {
    const lay = layoutOf([
      { type: 'inductive', x: 0, y: 0, z: 115, tag: 'B1' },
      { type: 'tank', x: 400, y: 0, tag: 'T1' },
      { type: 'belt', x: 300, y: 300, z: 100, tag: 'M1' },
    ]);
    const plant = new SandboxPlant(lay, 1, [], [
      { kind: 'fault', at: 10, ref: 'B1', fault: 'dauer1', until: 30 },
      { kind: 'tank', at: 0, ref: 'T1', level: 75 },
      { kind: 'workpiece', at: 20, ref: 'M1', spec: STEEL },
    ]);
    const b1 = deviceId(lay.parts[0]!, '');
    expect(plant.state().T1).toBe(75);
    const seen: boolean[] = [];
    for (let t = 1; t <= 40; t++) {
      plant.step(t, {});
      seen.push(plant.inputs()[b1] === true);
    }
    expect(seen[5]).toBe(false);
    expect(seen.slice(15, 25).every(Boolean)).toBe(true);
    expect(seen[39]).toBe(false);
    expect(plant.world.workpieces).toHaveLength(1);
    expect(plant.state().spawned).toBe(1);
    expect(lay.parts[0]!.fault).toBeUndefined();
  });
});

describe('Szenarien im Sandkasten und beim Veröffentlichen', () => {
  const scenario: Scenario = {
    id: 'a1',
    name: 'Band blockiert',
    durationMs: 30_000,
    seeds: [7],
    events: [
      { kind: 'control', at: 100, ref: 'S1', value: true },
      { kind: 'fault', at: 2000, ref: 'M1', fault: 'blockiert' },
      { kind: 'power', at: 25_000, until: 26_000 },
    ],
    rules: [{ kind: 'minIn', bin: 'K2', n: 3 }, { kind: 'neverOn', output: 'X9' }],
  };

  it('werden zu Testfällen; Stromausfall geht an die Steuerung, unbrauchbare Regeln entfallen', () => {
    const file = load('sortierstation.anlage.json');
    const level = levelFromLayout({ ...file.layout, scenarios: [scenario] });
    expect(level.tests.map((t) => t.id)).toEqual(['frei', 'sz-a1']);
    const tc = level.tests[1]!;
    expect(tc.power).toEqual([[25_000, 26_000]]);
    expect(tc.checks).toHaveLength(1);
    expect((tc.plant!.events as ScenarioEvent[]).map((e) => e.kind)).toEqual(['control', 'fault']);
  });

  it('Bedienfolge als Ereignis besteht wie bisher, ein blockiertes Band fällt durch', () => {
    const file = load('sortierstation.anlage.json');
    const meta = { title: 'Szenario', customer: 'Test', mail: '', notes: '' };
    const rules: Scenario['rules'] = [{ kind: 'sorted' }, { kind: 'minIn', bin: 'K2', n: 5 }];
    const normal = publishLevel(file.layout, meta, [
      {
        name: 'Normal',
        durationMs: 40_000,
        seeds: [7],
        events: [{ kind: 'control', at: 100, ref: 'S1', value: true }],
        rules,
      },
    ]);
    const c = compileSolution(normal, file.solution);
    expect(verifySolution(normal, file.solution, c.programs, c.size).passed).toBe(true);

    const blocked = publishLevel(file.layout, meta, [
      { ...scenario, durationMs: 40_000, events: scenario.events.slice(0, 2), rules },
    ]);
    expect(blocked.datasheet.de).toMatch(/Störung M1 – blockiert/);
    expect(verifySolution(blocked, file.solution, c.programs, c.size).passed).toBe(false);
  }, 60_000);

  it('bleiben in der Anlagendatei erhalten und lassen sich als eigene Datei weitergeben', () => {
    const file = load('sortierstation.anlage.json');
    const text = toAnlageFile({ ...file, layout: { ...file.layout, scenarios: [scenario] } });
    const back = parseAnlageFile(text);
    expect(back.ok && back.file.layout.scenarios).toEqual([scenario]);

    const s = parseScenarioFile(toScenarioFile(scenario));
    expect(s.ok && s.scenario).toEqual(scenario);
    expect(parseScenarioFile('{"format":"x"}').ok).toBe(false);
    const bad = parseScenarioFile(
      toScenarioFile({ ...scenario, events: [{ kind: 'tank', at: 0, ref: 'T1', level: 150 }] }),
    );
    expect(bad.ok).toBe(false);
  });
});
