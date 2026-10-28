import {
  analyzeBoard,
  emptyProject,
  moduleType,
  type BoardAnalysis,
  type IrProgram,
  type Level,
  type Solution,
} from '@zyklus/sim-core';
import { compileProject, type ProjectDiagnostic } from '@zyklus/scl-compiler';

export interface CpuCompileResult {
  ok: boolean;
  program?: IrProgram;
  size: number;
  limit: number;
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

/** Übersetzt alle CPU-Projekte einer Lösung und prüft die Speichergrenzen der CPUs. */
export function compileSolution(level: Level, solution: Solution): SolutionCompileResult {
  const analysis = analyzeBoard(level, solution);
  const programs = new Map<string, IrProgram>();
  const cpus = new Map<string, CpuCompileResult>();
  let size = 0;
  for (const m of solution.modules) {
    const t = moduleType(m.type);
    if (t.kind !== 'cpu') continue;
    const r = compileProject(solution.projects[m.id] ?? emptyProject());
    const limit = t.cpu!.maxStatements;
    const diagnostics = [...r.diagnostics];
    if (r.statementCount > limit) {
      diagnostics.unshift({
        severity: 'error',
        message: `Programm zu groß für ${t.name.de}: ${r.statementCount} von ${limit} Anweisungen`,
        start: { line: 1, col: 1 },
        end: { line: 1, col: 1 },
        location: { block: 'Main', part: 'project' },
      });
    }
    const ok = r.ok && r.statementCount <= limit;
    cpus.set(m.id, { ok, program: r.program, size: r.statementCount, limit, diagnostics });
    if (ok && r.program) programs.set(m.id, r.program);
    size += r.statementCount;
  }
  const ok = analysis.ok && cpus.size > 0 && [...cpus.values()].every((c) => c.ok);
  return { ok, analysis, programs, cpus, size };
}
