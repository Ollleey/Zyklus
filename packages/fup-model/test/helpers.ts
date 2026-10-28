import { Cpu, type Block, type PlcProject, type Tag } from '@zyklus/sim-core';
import { formatDiagnostic } from '@zyklus/scl-compiler';
import {
  compilePlcProject,
  type FupBody,
  type FupBox,
  type FupNetwork,
  type FupWire,
} from '../src';

export const TAGS: Tag[] = [
  { name: 'Start', address: '%I0.0', t: 'BOOL' },
  { name: 'Stopp', address: '%I0.1', t: 'BOOL' },
  { name: 'Sensor', address: '%I0.2', t: 'BOOL' },
  { name: 'Motor', address: '%Q0.0', t: 'BOOL' },
  { name: 'Lampe', address: '%Q0.1', t: 'BOOL' },
  { name: 'Hupe', address: '%Q0.2', t: 'BOOL' },
  { name: 'Wert', address: '%MW10', t: 'INT' },
  { name: 'Wert2', address: '%MW12', t: 'INT' },
  { name: 'Real', address: '%MD20', t: 'REAL' },
  { name: 'Zeit', address: '%MD30', t: 'TIME' },
  { name: 'Merker', address: '%M40.0', t: 'BOOL' },
  { name: 'Flanke', address: '%M40.1', t: 'BOOL' },
];

let auto = 0;
export function box(type: string, patch: Partial<FupBox> = {}): FupBox {
  auto++;
  return {
    id: patch.id ?? `b${auto}`,
    type,
    x: 0,
    y: auto * 10,
    inputs: {},
    outputs: {},
    negated: [],
    ...patch,
  };
}

/** Verbindung: [vonBox, vonPin, nachBox, nachPin] */
export function net(
  boxes: FupBox[],
  wires: [string, string, string, string][] = [],
  title = '',
): FupNetwork {
  const w: FupWire[] = wires.map(([a, p, b, q]) => ({
    from: { box: a, pin: p },
    to: { box: b, pin: q },
  }));
  return { id: `nw${Math.random()}`, title, boxes, wires: w };
}

export function project(networks: FupNetwork[], blocks: Block[] = []): PlcProject {
  const fup: FupBody = { networks };
  return {
    tags: TAGS,
    blocks: [
      { kind: 'OB', name: 'Main', number: 1, lang: 'FUP', iface: {}, source: '', fup },
      ...blocks,
    ],
  };
}

export function compile(networks: FupNetwork[], blocks: Block[] = []) {
  return compilePlcProject(project(networks, blocks));
}

export function cpuFor(networks: FupNetwork[], blocks: Block[] = []): Cpu {
  const r = compile(networks, blocks);
  if (!r.ok)
    throw new Error(
      r.diagnostics.map((d) => `${formatDiagnostic(d)} @${JSON.stringify(d.location)}`).join('\n'),
    );
  return new Cpu({ name: 't', cycleMs: 1, maxOpsPerCycle: 10_000 }, r.program!);
}

export function scan(cpu: Cpu, t: number, inputs: Record<string, boolean | number> = {}) {
  for (const [a, v] of Object.entries(inputs)) cpu.setInput(a, v);
  cpu.scan(t);
}
