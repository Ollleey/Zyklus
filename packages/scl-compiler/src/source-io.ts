import {
  IFACE_SECTIONS,
  OB_NUMBERS,
  SIMPLE_EVENTS,
  isSimpleEvent,
  type Block,
  type CodeBlock,
  type IfaceSection,
  type ObEvent,
  type PlcProject,
  type PlcType,
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
  if (isSimpleEvent(e)) return SIMPLE_EVENTS[e.kind];
  const tpa = e.tpa ? `, TPA ${e.tpa}` : '';
  return e.kind === 'cyclic'
    ? `Weckalarm, Takt ${e.intervalMs} ms, Phase ${e.phaseMs ?? 0} ms${tpa}`
    : `Prozessalarm, ${e.edge === 'rising' ? 'steigende' : 'fallende'} Flanke an ${e.input}${tpa}`;
}

/** Liest die Ereignis-Zeile, die `projectToSource` in den Bausteinkopf schreibt. */
function parseEvent(header: string[]): ObEvent | undefined {
  for (const l of header) {
    for (const [kind, label] of Object.entries(SIMPLE_EVENTS)) {
      if (new RegExp(`//\\s*Ereignis:\\s*${label}\\s*$`).test(l)) return { kind } as ObEvent;
    }
    const tm = /, TPA (\d+)\s*$/.exec(l);
    const tpa = tm ? { tpa: Number(tm[1]) } : {};
    const line = tm ? l.slice(0, tm.index) : l;
    const c = /\/\/\s*Ereignis:\s*Weckalarm, Takt (\d+) ms(?:, Phase (\d+) ms)?/.exec(line);
    if (c) return { kind: 'cyclic', intervalMs: Number(c[1]), phaseMs: Number(c[2] ?? 0), ...tpa };
    const p = /\/\/\s*Ereignis:\s*Prozessalarm, (steigende|fallende) Flanke an (.+?)\s*$/.exec(
      line,
    );
    if (p)
      return {
        kind: 'process',
        edge: p[1] === 'steigende' ? 'rising' : 'falling',
        input: p[2]!,
        ...tpa,
      };
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

/** Abschnitt(e) einer Schnittstelle; remanente Variablen in einem eigenen „… RETAIN“-Abschnitt */
function varSections(header: string, vars: VarDecl[]): string[] {
  const plain = vars.filter((v) => !v.retain);
  const kept = vars.filter((v) => v.retain);
  const out: string[] = [];
  if (plain.length || !kept.length)
    out.push(`   ${header} `, ...declLines(plain, '      '), '   END_VAR');
  if (kept.length) out.push(`   ${header} RETAIN`, ...declLines(kept, '      '), '   END_VAR');
  return out;
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
  // PLC-Datentypen zuerst: Bausteine verwenden sie
  for (const t of project.types ?? []) {
    out.push(
      `TYPE "${t.name}"`,
      'VERSION : 0.1',
      '   STRUCT',
      ...declLines(t.fields, '      '),
      '   END_STRUCT;',
      '',
      'END_TYPE',
      '',
    );
  }
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
        ...Object.entries(b.start ?? {}).map(([k, v]) => `   ${k} := ${v};`),
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
        ...varSections('VAR', b.vars),
        '',
        '',
        'BEGIN',
        '',
        'END_DATA_BLOCK',
        '',
      );
    } else {
      const [head, end] = BLOCK_HEADER[b.kind];
      out.push(
        `${head} "${b.name}"${b.kind === 'FC' ? ` : ${b.returnType?.trim() || 'Void'}` : ''}`,
      );
      if (b.title) out.push(`TITLE = ${b.title}`);
      out.push(`{ S7_Optimized_Access := 'TRUE' }`, 'VERSION : 0.1');
      // Das Startereignis ist in TIA Teil der Gerätekonfiguration, nicht der Quelle
      if (b.kind === 'OB' && b.event) out.push(`// Ereignis: ${eventText(b.event)}`);
      if (b.comment) out.push(...b.comment.split('\n').map((l) => `// ${l}`));
      for (const s of IFACE_SECTIONS) {
        const rows = b.iface[s];
        if (!rows?.length) continue;
        out.push(...varSections(SECTION_HEADER[s], rows), '');
      }
      // geschützte Bausteine: nur die Schnittstelle, kein Code
      const body = rewriteBoolLiterals(
        b.protected ? '// Baustein ist geschützt' : b.source,
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
  const types: PlcType[] = parsed.blocks
    .filter((b) => b.kind === 'TYPE')
    .map((b) => ({
      name: b.name,
      fields: b.decls.map((d): VarDecl => ({ name: d.name, type: d.typeName, init: d.initText })),
    }));
  const blocks: Block[] = parsed.blocks.flatMap((b): Block[] => {
    if (b.kind === 'TYPE') return [];
    const vars = (section: IfaceSection) =>
      b.decls
        .filter((d) => d.section === section)
        .map((d): VarDecl => ({
          name: d.name,
          type: d.typeName,
          init: d.initText,
          ...(d.retain ? { retain: true } : {}),
        }));
    if (b.kind === 'DB') {
      const number = numbers.DB++;
      if (b.instanceOf) {
        // Startwerte im Anweisungsteil: Element := Wert;
        const start: Record<string, string> = {};
        for (const m of b.bodyText.matchAll(/^\s*([A-Za-z_]\w*)\s*:=\s*([^;]+?)\s*;/gm))
          start[m[1]!] = m[2]!;
        return [
          {
            kind: 'IDB',
            name: b.name,
            number,
            of: b.instanceOf,
            ...(Object.keys(start).length ? { start } : {}),
          },
        ];
      }
      return [{ kind: 'DB', name: b.name, number, vars: vars('Static') }];
    }
    const event =
      b.kind === 'OB' ? parseEvent(lines.slice(b.span.start.line - 1, b.bodyLine - 1)) : undefined;
    const number = event
      ? isSimpleEvent(event)
        ? OB_NUMBERS[event.kind][0]
        : numbers[event.kind]++
      : numbers[b.kind]++;
    const iface: CodeBlock['iface'] = {};
    for (const s of IFACE_SECTIONS) {
      const rows = vars(s);
      if (rows.length) iface[s] = rows;
    }
    return [
      {
        kind: b.kind,
        name: b.name,
        number,
        lang: 'SCL',
        title: b.title,
        iface,
        source: dedent(b.bodyText),
        ...(event ? { event } : {}),
        ...(b.kind === 'FC' && b.returnType && b.returnType.toUpperCase() !== 'VOID'
          ? { returnType: b.returnType }
          : {}),
      },
    ];
  });
  return {
    project: { tags, blocks, ...(types.length ? { types } : {}) },
    diagnostics: [],
  };
}
