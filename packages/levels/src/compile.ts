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

/**
 * Passt das Programm zur Hardware? Weck- und Prozessalarme brauchen eine CPU, die sie
 * unterstützt; Prozessalarme außerdem einen alarmfähigen Eingang (DI 8 HF) an dieser CPU.
 */
function hardwareProblems(
  solution: Solution,
  analysis: BoardAnalysis,
  cpuId: string,
  program: IrProgram | undefined,
): string[] {
  const out: string[] = [];
  const cpuType = moduleType(solution.modules.find((m) => m.id === cpuId)!.type);
  const alarmInputs = new Set<string>();
  for (const m of solution.modules) {
    if (analysis.cpuOf.get(m.id) !== cpuId || !moduleType(m.type).alarms) continue;
    for (let ch = 0; ch < moduleType(m.type).channels; ch++) {
      const a = analysis.channelAddress.get(`${m.id}:${ch}`);
      if (a) alarmInputs.add(a);
    }
  }
  for (const task of program?.tasks ?? []) {
    if (task.kind === 'cyclic' && !cpuType.cpu!.cyclicInterrupt) {
      out.push(`${cpuType.name.de} kennt keine Weckalarme (OB „${task.name}“)`);
    }
    if (task.kind === 'process') {
      if (!cpuType.cpu!.processInterrupt) {
        out.push(`${cpuType.name.de} kennt keine Prozessalarme (OB „${task.name}“)`);
      }
      const addr = `%I${task.input!.byte}.${task.input!.bit}`;
      if (!alarmInputs.has(addr)) {
        out.push(
          `Prozessalarm „${task.name}“: ${addr} liegt nicht auf einem alarmfähigen Eingang (DI 8 HF) dieser CPU`,
        );
      }
    }
  }
  return out;
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
    const hw = hardwareProblems(solution, analysis, m.id, r.program);
    for (const message of hw) {
      diagnostics.unshift({
        severity: 'error',
        message,
        start: { line: 1, col: 1 },
        end: { line: 1, col: 1 },
        location: { part: 'project' },
      });
    }
    const ok = r.ok && used <= limit && hw.length === 0;
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
