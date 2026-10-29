import {
  IFACE_SECTIONS,
  type Block,
  type CodeBlock,
  type IfaceSection,
  type ObEvent,
  type PlcProject,
  type Tag,
  type VarDecl,
} from '@zyklus/sim-core';
import type { Diagnostic } from './diagnostics';
import { compileProject, type BoolLiteral } from './compiler';
import { parseSource } from './parser';

/**
 * Austausch mit dem TIA-Format „externe Quelle“ (.scl): Bausteine werden so geschrieben,
 * dass sie sich über „Externe Quellen → Bausteine aus Quelle generieren“ importieren lassen.
 * Die Variablentabelle ist in TIA nicht Teil der .scl-Quelle und wird separat übergeben.
 */

const SECTION_HEADER: Record<IfaceSection, string> = {
  Input: 'VAR_INPUT',
  Output: 'VAR_OUTPUT',
  InOut: 'VAR_IN_OUT',
  Static: 'VAR',
  Temp: 'VAR_TEMP',
  Constant: 'VAR CONSTANT',
};

const BLOCK_HEADER: Record<CodeBlock['kind'], [string, string]> = {
  OB: ['ORGANIZATION_BLOCK', 'END_ORGANIZATION_BLOCK'],
  FB: ['FUNCTION_BLOCK', 'END_FUNCTION_BLOCK'],
  FC: ['FUNCTION', 'END_FUNCTION'],
};

function eventText(e: ObEvent): string {
  return e.kind === 'cyclic'
    ? `Weckalarm, Takt ${e.intervalMs} ms, Phase ${e.phaseMs ?? 0} ms`
    : `Prozessalarm, ${e.edge === 'rising' ? 'steigende' : 'fallende'} Flanke an ${e.input}`;
}

/** Liest die Ereignis-Zeile, die `projectToSource` in den Bausteinkopf schreibt. */
function parseEvent(header: string[]): ObEvent | undefined {
  for (const l of header) {
    const c = /\/\/\s*Ereignis:\s*Weckalarm, Takt (\d+) ms(?:, Phase (\d+) ms)?/.exec(l);
    if (c) return { kind: 'cyclic', intervalMs: Number(c[1]), phaseMs: Number(c[2] ?? 0) };
    const p = /\/\/\s*Ereignis:\s*Prozessalarm, (steigende|fallende) Flanke an (.+?)\s*$/.exec(l);
    if (p)
      return { kind: 'process', edge: p[1] === 'steigende' ? 'rising' : 'falling', input: p[2]! };
  }
  return undefined;
}

/** Startwert für die Quelle: 0/1 an Bool als FALSE/TRUE (TIA erwartet Bool-Literale) */
function initText(v: VarDecl): string | undefined {
  if (v.init === undefined || v.init.trim() === '') return undefined;
  const t = v.init.trim();
  if (v.type.trim().toLowerCase() === 'bool' && (t === '0' || t === '1')) {
    return t === '1' ? 'TRUE' : 'FALSE';
  }
  return v.init;
}

/** Ersetzt 0/1-Literale, die der Compiler als BOOL gelesen hat, durch FALSE/TRUE. */
function rewriteBoolLiterals(source: string, literals: BoolLiteral[]): string {
  if (!literals.length) return source;
  const lines = source.split('\n');
  const sorted = [...literals].sort(
    (a, b) => b.start.line - a.start.line || b.start.col - a.start.col,
  );
  for (const lit of sorted) {
    const i = lit.start.line - 1;
    const line = lines[i];
    if (line === undefined) continue;
    const at = lit.start.col - 1;
    if (!/^[01](?![0-9_.#])/.test(line.slice(at))) continue;
    lines[i] = `${line.slice(0, at)}${lit.value ? 'TRUE' : 'FALSE'}${line.slice(at + 1)}`;
  }
  return lines.join('\n');
}

function declLines(vars: VarDecl[], indent: string): string[] {
  return vars.map((v) => {
    const shown = initText(v);
    const init = shown !== undefined ? ` := ${shown}` : '';
    const comment = v.comment ? `   // ${v.comment}` : '';
    return `${indent}${v.name} : ${v.type}${init};${comment}`;
  });
}

function indentBody(src: string): string {
  return src
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => (l.trim() ? `\t${l}` : ''))
    .join('\n');
}

/** Erzeugt eine TIA-kompatible externe Quelle aus dem Projekt (Datenbausteine zuerst). */
export function projectToSource(project: PlcProject): string {
  // Wo 0/1 als BOOL gelesen wird, schreibt die Quelle TRUE/FALSE
  const literals = compileProject(project).boolLiterals ?? [];
  const order = (b: Block) => (b.kind === 'DB' || b.kind === 'IDB' ? 0 : b.kind === 'OB' ? 2 : 1);
  const blocks = [...project.blocks].sort((a, b) => order(a) - order(b));
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'IDB') {
      out.push(
        `DATA_BLOCK "${b.name}"`,
        `{ S7_Optimized_Access := 'TRUE' }`,
        'VERSION : 0.1',
        'NON_RETAIN',
        b.of,
        '',
        'BEGIN',
        '',
        'END_DATA_BLOCK',
        '',
      );
    } else if (b.kind === 'DB') {
      out.push(
        `DATA_BLOCK "${b.name}"`,
        `{ S7_Optimized_Access := 'TRUE' }`,
        'VERSION : 0.1',
        'NON_RETAIN',
        '   VAR ',
        ...declLines(b.vars, '      '),
        '   END_VAR',
        '',
        '',
        'BEGIN',
        '',
        'END_DATA_BLOCK',
        '',
      );
    } else {
      const [head, end] = BLOCK_HEADER[b.kind];
      out.push(`${head} "${b.name}"${b.kind === 'FC' ? ' : Void' : ''}`);
      if (b.title) out.push(`TITLE = ${b.title}`);
      out.push(`{ S7_Optimized_Access := 'TRUE' }`, 'VERSION : 0.1');
      // Das Startereignis ist in TIA Teil der Gerätekonfiguration, nicht der Quelle
      if (b.kind === 'OB' && b.event) out.push(`// Ereignis: ${eventText(b.event)}`);
      for (const s of IFACE_SECTIONS) {
        const rows = b.iface[s];
        if (!rows?.length) continue;
        out.push(`   ${SECTION_HEADER[s]} `, ...declLines(rows, '      '), '   END_VAR', '');
      }
      const body = rewriteBoolLiterals(
        b.source,
        literals.filter((l) => l.block === b.name),
      );
      out.push('', 'BEGIN', indentBody(body), end, '');
    }
  }
  return out.join('\n');
}

/** Entfernt die gemeinsame Einrückung eines Anweisungsteils. */
function dedent(src: string): string {
  const lines = src
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '')
    .split('\n');
  const widths = lines.filter((l) => l.trim()).map((l) => /^[\t ]*/.exec(l)![0].length);
  const cut = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/** Liest eine externe Quelle in das Projektmodell ein. */
export function sourceToProject(
  src: string,
  tags: Tag[] = [],
): { project?: PlcProject; diagnostics: Diagnostic[] } {
  const parsed = parseSource(src);
  if (parsed.diagnostics.length) return { diagnostics: parsed.diagnostics };
  const numbers = { OB: 1, FB: 1, FC: 1, DB: 1, cyclic: 30, process: 40 };
  const lines = src.split('\n');
  const blocks: Block[] = parsed.blocks.map((b) => {
    const vars = (section: IfaceSection) =>
      b.decls
        .filter((d) => d.section === section)
        .map((d): VarDecl => ({ name: d.name, type: d.typeName, init: d.initText }));
    if (b.kind === 'DB') {
      const number = numbers.DB++;
      if (b.instanceOf) return { kind: 'IDB', name: b.name, number, of: b.instanceOf };
      return { kind: 'DB', name: b.name, number, vars: vars('Static') };
    }
    const event =
      b.kind === 'OB' ? parseEvent(lines.slice(b.span.start.line - 1, b.bodyLine - 1)) : undefined;
    const number = event ? numbers[event.kind]++ : numbers[b.kind]++;
    const iface: CodeBlock['iface'] = {};
    for (const s of IFACE_SECTIONS) {
      const rows = vars(s);
      if (rows.length) iface[s] = rows;
    }
    return {
      kind: b.kind,
      name: b.name,
      number,
      lang: 'SCL',
      title: b.title,
      iface,
      source: dedent(b.bodyText),
      ...(event ? { event } : {}),
    };
  });
  return { project: { tags, blocks }, diagnostics: [] };
}
