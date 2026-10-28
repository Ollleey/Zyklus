import {
  Cpu,
  type Block,
  type GlobalDb,
  type InstanceDb,
  type Tag,
  type VarDecl,
} from '@zyklus/sim-core';
import { compileScl, formatDiagnostic, type CompileResult } from '../src';

export const TAGS: Tag[] = [
  { name: 'Start', address: '%I0.0', t: 'BOOL' },
  { name: 'Stopp', address: '%I0.1', t: 'BOOL' },
  { name: 'Sensor', address: '%I0.2', t: 'BOOL' },
  { name: 'Motor', address: '%Q0.0', t: 'BOOL' },
  { name: 'Lampe', address: '%Q0.1', t: 'BOOL' },
  { name: 'Rohwert', address: '%IW64', t: 'INT' },
  { name: 'Sollwert', address: '%QW64', t: 'INT' },
  { name: 'Zahl', address: '%MW10', t: 'INT' },
  { name: 'Gross', address: '%MD20', t: 'DINT' },
  { name: 'Wert', address: '%MD24', t: 'REAL' },
  { name: 'Muster', address: '%MW30', t: 'WORD' },
  { name: 'Dauer', address: '%MD40', t: 'TIME' },
];

type Row = [name: string, type: string, init?: string];
const rows = (r: Row[] = []): VarDecl[] => r.map(([name, type, init]) => ({ name, type, init }));

export const DB = (name: string, vars: Row[]): GlobalDb => ({
  kind: 'DB',
  name,
  number: 1,
  vars: rows(vars),
});

export const IDB = (name: string, of: string): InstanceDb => ({ kind: 'IDB', name, number: 2, of });

export interface Extra {
  blocks?: Block[];
  temp?: Row[];
  constants?: Row[];
}

export function compile(body: string, extra: Extra = {}): CompileResult {
  return compileScl(body, {
    tags: TAGS,
    blocks: extra.blocks,
    temp: rows(extra.temp),
    constants: rows(extra.constants),
  });
}

/** Kompiliert fehlerfrei oder wirft mit lesbarer Meldung. */
export function cpuFor(body: string, extra: Extra = {}, cycleMs = 1): Cpu {
  const r = compile(body, extra);
  if (!r.ok) {
    throw new Error(`Kompilierfehler:\n${r.diagnostics.map(formatDiagnostic).join('\n')}`);
  }
  return new Cpu({ name: 'Test', cycleMs, maxOpsPerCycle: 10_000 }, r.program!);
}

/** Erste Fehlermeldung oder undefined. */
export function firstError(body: string, extra: Extra = {}) {
  return compile(body, extra).diagnostics.find((d) => d.severity === 'error');
}
