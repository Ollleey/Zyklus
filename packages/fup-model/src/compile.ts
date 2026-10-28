import type { CodeBlock, PlcProject } from '@zyklus/sim-core';
import {
  compileProject,
  countStatements,
  parseBody,
  type CompileOptions,
  type CompileResult,
  type ProjectDiagnostic,
} from '@zyklus/scl-compiler';
import { lowerFupBlock, type LineOrigin } from './lower';
import { countBoxes, isFupBody } from './model';

export interface PlcCompileResult extends CompileResult {
  /** Größe je Codebaustein: SCL-Anweisungen bzw. FUP-Boxen */
  size: number;
  /** Sprache des OB1 */
  lang: 'SCL' | 'FUP';
  /** Anzahl FUP-Netzwerke (0 bei SCL) */
  networks: number;
}

/**
 * Übersetzt ein CPU-Projekt mit SCL- und FUP-Bausteinen. FUP-Bausteine werden nach SCL
 * abgesenkt; Meldungen aus dem erzeugten Code werden auf Netzwerk und Box zurückgeführt.
 */
export function compilePlcProject(
  project: PlcProject,
  opts: CompileOptions = {},
): PlcCompileResult {
  const origins = new Map<string, (LineOrigin | undefined)[]>();
  const extra: ProjectDiagnostic[] = [];
  let size = 0;
  let networks = 0;
  let lang: 'SCL' | 'FUP' = 'SCL';

  const blocks = project.blocks.map((b) => {
    if (b.kind !== 'OB' && b.kind !== 'FB' && b.kind !== 'FC') return b;
    const code = b as CodeBlock;
    if (code.name === 'Main') lang = code.lang;
    if (code.lang !== 'FUP') {
      size += countStatements(parseBody(code.source).body);
      return code;
    }
    const body = isFupBody(code.fup) ? code.fup : { networks: [] };
    size += countBoxes(body);
    networks += body.networks.length;
    const lowered = lowerFupBlock(code, project);
    origins.set(code.name, lowered.lines);
    extra.push(...lowered.diagnostics);
    return lowered.block;
  });

  const r = compileProject({ ...project, blocks }, opts);
  const diagnostics: ProjectDiagnostic[] = [...extra];
  const loweringFailed = extra.some((d) => d.severity === 'error');
  for (const d of r.diagnostics) {
    const map = d.location.block ? origins.get(d.location.block) : undefined;
    if (!map || d.location.part !== 'code') {
      diagnostics.push(d);
      continue;
    }
    // Folgefehler eines fehlgeschlagenen Absenkens nicht doppelt melden
    if (loweringFailed && d.severity === 'error') continue;
    const o = map[d.start.line - 1];
    diagnostics.push({ ...d, location: { ...d.location, network: o?.network, box: o?.box } });
  }
  const ok = r.ok && !loweringFailed;
  return { ...r, ok, program: ok ? r.program : undefined, diagnostics, size, lang, networks };
}
