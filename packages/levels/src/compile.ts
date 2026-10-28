import {
  analyzeBoard,
  emptyProject,
  moduleType,
  type BoardAnalysis,
  type IrProgram,
  type Level,
  type Solution,
} from '@zyklus/sim-core';
import type { ProjectDiagnostic } from '@zyklus/scl-compiler';
import { compilePlcProject } from '@zyklus/fup-model';

export interface CpuCompileResult {
  ok: boolean;
  program?: IrProgram;
  /** Programmgröße: SCL-Anweisungen bzw. FUP-Boxen */
  size: number;
  lang: 'SCL' | 'FUP';
  /** Grenze der CPU: Anweisungen (SCL) bzw. Netzwerke (FUP) */
  limit: number;
  /** Ausnutzung der Grenze: Anweisungen bzw. Netzwerke */
  used: number;
  diagnostics: ProjectDiagnostic[];
}

export interface SolutionCompileResult {
  ok: boolean;
  analysis: BoardAnalysis;
  programs: Map<string, IrProgram>;
  cpus: Map<string, CpuCompileResult>;
  /** Programmgröße über alle CPUs */
  size: number;
}

/** Übersetzt alle CPU-Projekte einer Lösung (SCL oder FUP) und prüft die Speichergrenzen. */
export function compileSolution(level: Level, solution: Solution): SolutionCompileResult {
  const analysis = analyzeBoard(level, solution);
  const programs = new Map<string, IrProgram>();
  const cpus = new Map<string, CpuCompileResult>();
  let size = 0;
  for (const m of solution.modules) {
    const t = moduleType(m.type);
    if (t.kind !== 'cpu') continue;
    const r = compilePlcProject(solution.projects[m.id] ?? emptyProject());
    const fup = r.lang === 'FUP';
    const limit = fup ? t.cpu!.maxNetworks : t.cpu!.maxStatements;
    const used = fup ? r.networks : r.size;
    const diagnostics = [...r.diagnostics];
    if (used > limit) {
      diagnostics.unshift({
        severity: 'error',
        message: `Programm zu groß für ${t.name.de}: ${used} von ${limit} ${fup ? 'Netzwerken' : 'Anweisungen'}`,
        start: { line: 1, col: 1 },
        end: { line: 1, col: 1 },
        location: { block: 'Main', part: 'project' },
      });
    }
    const ok = r.ok && used <= limit;
    cpus.set(m.id, {
      ok,
      program: r.program,
      size: r.size,
      lang: r.lang,
      limit,
      used,
      diagnostics,
    });
    if (ok && r.program) programs.set(m.id, r.program);
    size += r.size;
  }
  const ok = analysis.ok && cpus.size > 0 && [...cpus.values()].every((c) => c.ok);
  return { ok, analysis, programs, cpus, size };
}
