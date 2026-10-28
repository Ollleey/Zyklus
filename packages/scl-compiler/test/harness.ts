import { Cpu, TagTable, type Tag } from '@zyklus/sim-core';
import { compileScl, formatDiagnostic, type CompileOptions, type CompileResult } from '../src';

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

export function compile(src: string, opts: CompileOptions = {}): CompileResult {
  return compileScl(src, { tags: new TagTable(TAGS), ...opts });
}

/** Kompiliert fehlerfrei oder wirft mit lesbarer Meldung. */
export function cpuFor(src: string, opts: CompileOptions = {}, cycleMs = 1): Cpu {
  const r = compile(src, opts);
  const errors = r.diagnostics.filter((d) => d.severity === 'error');
  if (!r.ok || errors.length) {
    throw new Error(`Kompilierfehler:\n${r.diagnostics.map(formatDiagnostic).join('\n')}`);
  }
  return new Cpu({ name: 'Test', cycleMs, maxOpsPerCycle: 10_000 }, r.program!);
}

/** Erste Fehlermeldung (mit Position) oder undefined. */
export function firstError(src: string, opts: CompileOptions = {}) {
  return compile(src, opts).diagnostics.find((d) => d.severity === 'error');
}
