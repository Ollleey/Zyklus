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
import { countLadElements, isLadBody, ladBodyToFup } from './lad';
import { setCallSignatures } from './catalog';
import { countBoxes, isFupBody, type FupBody } from './model';

export interface PlcCompileResult extends CompileResult {
  /** Größe je Codebaustein: SCL-Anweisungen bzw. FUP-Boxen */
  size: number;
  /** Sprache des OB1 */
  lang: 'SCL' | 'FUP' | 'KOP';
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
  let lang: 'SCL' | 'FUP' | 'KOP' = 'SCL';
  const kopBlocks = new Set<string>();
  setCallSignatures(project);

  const blocks = project.blocks.map((b) => {
    if (b.kind !== 'OB' && b.kind !== 'FB' && b.kind !== 'FC') return b;
    const code = b as CodeBlock;
    if (code.name === 'Main') lang = code.lang;
    if (code.lang === 'SCL') {
      size += code.protected ? 0 : countStatements(parseBody(code.source).body);
      return code;
    }
    let body: FupBody;
    if (code.lang === 'KOP') {
      // KOP über das FUP-Modell absenken; Größe = Kontakte, Boxen, Spulen
      const lad = isLadBody(code.kop) ? code.kop : { lad: [] };
      body = ladBodyToFup(lad);
      if (!code.protected) size += countLadElements(lad);
    } else {
      body = isFupBody(code.fup) ? code.fup : { networks: [] };
      if (!code.protected) size += countBoxes(body);
    }
    networks += body.networks.length;
    const lowered = lowerFupBlock({ ...code, fup: body }, project);
    origins.set(code.name, lowered.lines);
    if (code.lang === 'KOP') kopBlocks.add(code.name);
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
  // KOP: Meldungen ohne FUP-Pinnamen (Kontakte und Spulen sind dort Boxen)
  for (const d of diagnostics) {
    if (!d.location.block || !kopBlocks.has(d.location.block)) continue;
    d.message = d.message
      .replace(/^Eingang IN\d+ ist offen$/, 'Operand am Kontakt fehlt')
      .replace(/^Operand über der Box fehlt$/, 'Operand fehlt')
      .replace(/^Eingang CLK ist offen$/, 'Operand am Flankenkontakt fehlt');
    if (d.location.box) d.location = { ...d.location, box: d.location.box.replace(/~.*$/, '') };
  }
  const ok = r.ok && !loweringFailed;
  return { ...r, ok, program: ok ? r.program : undefined, diagnostics, size, lang, networks };
}
