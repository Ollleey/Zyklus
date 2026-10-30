import { describe, expect, it } from 'vitest';
import { LevelRun } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { SandboxPlant, levelFromLayout, parseAnlageFile } from '@zyklus/plant-sim';
import sortierstation from '../../../packages/plant-sim/vorlagen/sortierstation.anlage.json?raw';
import { SimHost } from '../src/sim/host';
import type { Command, Reply } from '../src/sim/protocol';
import { RemoteRun, type Channel } from '../src/sim/remote';

/** Kanal ohne Worker: Nachrichten werden wie beim postMessage kopiert und sofort zugestellt */
function directChannel(): Channel {
  const handlers: ((r: Reply) => void)[] = [];
  const host = new SimHost((r) => {
    const copy = structuredClone(r);
    for (const h of handlers) h(copy);
  });
  return {
    send: (cmd: Command) => host.handle(structuredClone(cmd)),
    onReply: (fn) => handlers.push(fn),
  };
}

function setup() {
  const r = parseAnlageFile(sortierstation);
  if (!r.ok) throw new Error(r.error);
  const level = levelFromLayout(r.file.layout);
  const c = compileSolution(level, r.file.solution);
  return { level, solution: r.file.solution, programs: c.programs, seed: r.file.layout.seed };
}

describe('Simulation im Web Worker', () => {
  it('Spiegel und direkter Lauf liefern denselben Verlauf', () => {
    const { level, solution, programs, seed } = setup();
    const ch = directChannel();
    const remote = new RemoteRun(ch, level, solution, programs, { seed });
    ch.onReply((r) => remote.receive(r));
    // erster Schnappschuss kam vor der Anmeldung: neu anfordern
    remote.command({ type: 'snapshot' });
    remote.plant!.setControl('S1', true);
    for (let t = 1000; t <= 20000; t += 1000) remote.advance(t, 1e9);

    const direct = new LevelRun(level, solution, programs, { seed });
    const plant = direct.plant as SandboxPlant;
    plant.setControl('S1', true);
    direct.runTo(20000);

    expect(remote.time).toBe(direct.time);
    expect(remote.traces).toEqual(direct.traces);
    const pos = (ws: readonly { id: number; x: number; y: number }[]) =>
      ws.map((w) => [w.id, w.x, w.y]);
    expect(pos(remote.plant!.world.workpieces)).toEqual(
      pos(plant.world.workpieces.filter((w) => w.state === 'free')),
    );
    expect(remote.plant!.world.tally()).toEqual(plant.world.tally());
    const k1 = remote.plant!.world.find('K1')!;
    expect(remote.plant!.world.st(k1).total).toBe(plant.world.st(plant.world.find('K1')!).total);
  });

  it('beantwortet Lesewünsche und übernimmt Forcewerte', () => {
    const { level, solution, programs, seed } = setup();
    const ch = directChannel();
    const remote = new RemoteRun(ch, level, solution, programs, { seed });
    ch.onReply((r) => remote.receive(r));
    const cpu = remote.cpus.get('cpu1')!;
    // erster Lesewunsch liefert noch nichts, nach dem nächsten Block den Wert
    expect(cpu.readImage('%Q0.0')).toBeUndefined();
    const lamp = level.devices.find((d) => d.label === 'H1')!;
    remote.force(lamp.id, true);
    remote.advance(100, 1e9);
    expect(remote.forced(lamp.id)).toBe(true);
    expect(remote.traces.get(lamp.id)!.at(-1)![1]).toBe(true);
    expect(typeof cpu.readImage('%Q0.0')).toBe('boolean');
    expect(() => cpu.readSlot('gibtsnicht')).not.toThrow();
    remote.advance(200, 1e9);
    expect(() => cpu.readSlot('gibtsnicht')).toThrow(/unbekannt/);
  });
});
