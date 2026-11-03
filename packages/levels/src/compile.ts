import {
  SOLUTION_VERSION,
  analyzeBoard,
  dataBytes,
  emptyProject,
  moduleType,
  syncDeviceTags,
  type BoardAnalysis,
  type IrProgram,
  type Level,
  type PlcProject,
  type Solution,
} from '@zyklus/sim-core';
import {
  projectToSource,
  sourceToProject,
  type CallRef,
  type ProjectDiagnostic,
  type XRef,
} from '@zyklus/scl-compiler';
import { compilePlcProject } from '@zyklus/fup-model';

export interface CpuCompileResult {
  ok: boolean;
  program?: IrProgram;
  /** Programmgröße: SCL-Anweisungen bzw. FUP-Boxen */
  size: number;
  lang: 'SCL' | 'FUP' | 'KOP';
  /** Grenze der CPU: Anweisungen (SCL) bzw. Netzwerke (FUP) */
  limit: number;
  /** Ausnutzung der Grenze: Anweisungen bzw. Netzwerke */
  used: number;
  /** Daten im Arbeitsspeicher in Byte und Grenze der CPU */
  dataBytes: number;
  dataLimit: number;
  /** Querverweise und Aufrufe des Projekts */
  xref: XRef[];
  calls: CallRef[];
  diagnostics: ProjectDiagnostic[];
}

export interface SolutionCompileResult {
  ok: boolean;
  analysis: BoardAnalysis;
  programs: Map<string, IrProgram>;
  cpus: Map<string, CpuCompileResult>;
  /** Programmgröße über alle CPUs */
  size: number;
  /** Bestandsanlage: geänderte Zeilen gegenüber dem gelieferten Programm */
  changes?: number;
}

/** Gelieferter Stand eines Auftrags (Bestandsanlage, Erweiterung) als Lösung */
export function givenSolution(level: Level): Solution | undefined {
  const g = level.given;
  if (!g) return undefined;
  const base: Solution = {
    version: SOLUTION_VERSION,
    modules: g.modules.map((m) => ({ ...m })),
    wires: g.wires.map((w) => ({ ...w })),
    projects: {},
    ...(g.config ? { config: structuredClone(g.config) as Solution['config'] } : {}),
  };
  const analysis = analyzeBoard(level, base);
  const projects: Record<string, PlcProject> = {};
  for (const [cpu, src] of Object.entries(g.sources)) {
    const p = sourceToProject(src).project ?? emptyProject();
    projects[cpu] = syncDeviceTags(level, analysis, cpu, p);
  }
  return { ...base, projects };
}

/** Zeilen einer Quelle für den Vergleich: ohne Leerzeilen und reine Kommentarzeilen */
function codeLines(src: string): string[] {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !l.startsWith('//'));
}

/** Anzahl hinzugefügter plus entfernter Zeilen (längste gemeinsame Teilfolge) */
export function lineChanges(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  return n + m - 2 * prev[m]!;
}

/** Änderungsumfang einer Lösung gegenüber dem gelieferten Programm (alle CPUs) */
export function solutionChanges(level: Level, solution: Solution): number | undefined {
  const g = level.given;
  if (!g || level.kind !== 'bestand') return undefined;
  let total = 0;
  const cpus = new Set([...Object.keys(g.sources), ...Object.keys(solution.projects)]);
  for (const cpu of cpus) {
    const before = g.sources[cpu];
    const given = before ? sourceToProject(before).project : undefined;
    const a = given ? codeLines(projectToSource(given)) : [];
    const p = solution.projects[cpu];
    const b = p ? codeLines(projectToSource(p)) : [];
    total += lineChanges(a, b);
  }
  return total;
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
    const r = compilePlcProject(solution.projects[m.id] ?? emptyProject(), { probes: true });
    const fup = r.lang !== 'SCL';
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
    const data = r.program ? dataBytes(r.program) : 0;
    const dataLimit = t.cpu!.workMemory;
    if (data > dataLimit) {
      diagnostics.unshift({
        severity: 'error',
        message: `Arbeitsspeicher zu klein für ${t.name.de}: Daten ${data} von ${dataLimit} Byte`,
        start: { line: 1, col: 1 },
        end: { line: 1, col: 1 },
        location: { part: 'project' },
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
    const ok = r.ok && used <= limit && data <= dataLimit && hw.length === 0;
    cpus.set(m.id, {
      ok,
      program: r.program,
      size: r.size,
      lang: r.lang,
      limit,
      used,
      dataBytes: data,
      dataLimit,
      xref: r.xref ?? [],
      calls: r.calls ?? [],
      diagnostics,
    });
    if (ok && r.program) programs.set(m.id, r.program);
    size += r.size;
  }
  const ok = analysis.ok && cpus.size > 0 && [...cpus.values()].every((c) => c.ok);
  const changes = solutionChanges(level, solution);
  return { ok, analysis, programs, cpus, size, ...(changes !== undefined ? { changes } : {}) };
}
