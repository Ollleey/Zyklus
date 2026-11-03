import type { CodeBlock, VarDecl } from '@zyklus/sim-core';
import { parseExpression, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import type { LineOrigin, Lowered } from './lower';

/**
 * GRAPH-light: Schrittkette als eigene Sprache für Funktionsbausteine. Schritte mit Aktionen
 * (N, S, R, D), Transitionen mit einer SCL-Bedingung. Abgesenkt auf SCL mit CASE über die
 * Nummer des aktiven Schritts.
 */

/** N: solange der Schritt aktiv ist · S: setzen · R: rücksetzen · D: verzögert (nach `time`) */
export type ActionQualifier = 'N' | 'S' | 'R' | 'D';

export interface GraphAction {
  id: string;
  q: ActionQualifier;
  operand: string;
  /** nur D: Verzögerung als TIME-Literal, z. B. T#2s */
  time?: string;
}

export interface GraphStep {
  id: string;
  no: number;
  name: string;
  initial?: boolean;
  actions: GraphAction[];
}

export interface GraphTransition {
  id: string;
  from: number;
  to: number;
  /** Bedingung in SCL; `Schrittzeit` ist die Zeit seit Aktivierung des Schritts */
  cond: string;
}

export interface GraphBody {
  graph: { steps: GraphStep[]; transitions: GraphTransition[] };
}

export function isGraphBody(v: unknown): v is GraphBody {
  const g = (v as GraphBody | undefined)?.graph;
  return !!g && Array.isArray(g.steps) && Array.isArray(g.transitions);
}

/** neue Kette: Initialschritt 1 */
export function emptyGraph(): GraphBody {
  return {
    graph: {
      steps: [{ id: 's1', no: 1, name: 'Grundstellung', initial: true, actions: [] }],
      transitions: [],
    },
  };
}

/** Programmgröße: Schritte, Transitionen und Aktionen */
export function countGraphElements(body: GraphBody): number {
  const g = body.graph;
  return g.steps.length + g.transitions.length + g.steps.reduce((n, s) => n + s.actions.length, 0);
}

/** Interne Variablen der Kette (statisch im FB) */
export const GRAPH_STEP = '__Schritt';
export const GRAPH_TIMER = '__Zeit';

/** `Schrittzeit` außerhalb von Zeichenketten durch die Zeit des Schritts ersetzen */
function withStepTime(cond: string): string {
  return cond
    .split(/('(?:[^']|'')*'|"[^"]*")/)
    .map((part, i) => (i % 2 ? part : part.replace(/\bSchrittzeit\b/gi, `#${GRAPH_TIMER}.ET`)))
    .join('');
}

/** Schrittkette eines FB nach SCL absenken (Herkunft je Zeile: Schritt-Index, Element-id) */
export function lowerGraphBlock(block: CodeBlock): Lowered {
  const body = isGraphBody(block.graph) ? block.graph : emptyGraph();
  const { steps, transitions } = body.graph;
  const diagnostics: ProjectDiagnostic[] = [];
  const out: string[] = [];
  const lines: (LineOrigin | undefined)[] = [];
  const stepIndex = new Map(steps.map((s, i) => [s.no, i]));
  const report = (message: string, network?: number, box?: string) =>
    diagnostics.push({
      severity: 'error',
      message,
      start: { line: 1, col: 1 },
      end: { line: 1, col: 1 },
      location: { block: block.name, part: 'code', network, box },
    });
  const emit = (text: string, origin?: LineOrigin) => {
    out.push(text);
    lines.push(origin);
  };

  if (block.kind !== 'FB') report('Schrittketten gibt es nur in Funktionsbausteinen (FB)');
  const initial = steps.filter((s) => s.initial);
  if (initial.length !== 1) report('Die Kette braucht genau einen Initialschritt');
  const seen = new Set<number>();
  steps.forEach((s, i) => {
    if (!Number.isInteger(s.no) || s.no < 1) report(`Schrittnummer ${s.no} ist ungültig`, i, s.id);
    if (seen.has(s.no)) report(`Schrittnummer ${s.no} ist doppelt`, i, s.id);
    seen.add(s.no);
  });

  emit(`// Schrittkette: aktiver Schritt in #${GRAPH_STEP}, Zeit im Schritt in #${GRAPH_TIMER}.ET`);
  emit(`#${GRAPH_TIMER}(IN := TRUE, PT := T#100000s);`);
  emit(`CASE #${GRAPH_STEP} OF`);
  for (const s of steps) {
    const own = transitions.filter((t) => t.from === s.no);
    if (!own.length) continue;
    const si = stepIndex.get(s.no);
    emit(`    ${s.no}: // ${s.name.replace(/[\r\n]/g, ' ')}`, { network: si! });
    own.forEach((t, k) => {
      const at = { network: si!, box: t.id };
      if (!stepIndex.has(t.to)) {
        report(`Transition führt zu Schritt ${t.to}, den es nicht gibt`, si, t.id);
      }
      const cond = t.cond.trim();
      if (!cond) report('Transition ohne Bedingung', si, t.id);
      const expr = withStepTime(cond || 'FALSE');
      const parsed = parseExpression(expr);
      if (cond && (parsed.diagnostics.length || !parsed.expr)) {
        report(`Bedingung „${cond}“: ${parsed.diagnostics[0]?.message ?? 'ungültig'}`, si, t.id);
      }
      emit(`        ${k ? 'ELSIF' : 'IF'} ${expr} THEN`, at);
      emit(`            #${GRAPH_STEP} := ${t.to};`, at);
      // Schrittzeit des neuen Schritts beginnt mit dem nächsten Zyklus
      emit(`            #${GRAPH_TIMER}(IN := FALSE, PT := T#100000s);`, at);
    });
    emit('        END_IF;', { network: si! });
  }
  emit('END_CASE;');

  // Aktionen: N und D je Operand zu einer Zuweisung zusammenfassen, S/R als bedingte Zuweisung
  const level = new Map<string, { terms: string[]; origin: LineOrigin }>();
  const stored = new Set<string>();
  const key = (op: string) => op.replace(/\s+/g, '').toLowerCase();
  steps.forEach((s, si) => {
    for (const a of s.actions) {
      const op = a.operand.trim();
      const at = { network: si, box: a.id };
      if (!op) {
        report('Aktion ohne Operand', si, a.id);
        continue;
      }
      const r = parseExpression(op);
      if (r.diagnostics.length || r.expr?.k !== 'ref') {
        report(`Operand „${op}“ ist keine Variable`, si, a.id);
        continue;
      }
      const active = `#${GRAPH_STEP} = ${s.no}`;
      if (a.q === 'N' || a.q === 'D') {
        let term = active;
        if (a.q === 'D') {
          const time = (a.time ?? '').trim();
          if (!/^(T|TIME)#/i.test(time)) {
            report('Aktion D braucht eine Zeit, z. B. T#2s', si, a.id);
            continue;
          }
          term = `(${active} AND #${GRAPH_TIMER}.ET >= ${time})`;
        }
        const k = key(op);
        if (stored.has(k))
          report(`${op} wird mit S/R gespeichert und kann nicht N/D sein`, si, a.id);
        const e = level.get(k) ?? { terms: [], origin: at };
        e.terms.push(term);
        level.set(k, e);
        (e as { op?: string }).op = op;
      } else {
        const k = key(op);
        if (level.has(k)) report(`${op} ist schon N/D und kann nicht S/R sein`, si, a.id);
        stored.add(k);
        emit(`IF ${active} THEN ${op} := ${a.q === 'S' ? 'TRUE' : 'FALSE'}; END_IF;`, at);
      }
    }
  });
  for (const e of level.values()) {
    emit(`${(e as { op?: string }).op} := ${e.terms.join(' OR ')};`, e.origin);
  }

  const initNo = initial[0]?.no ?? steps[0]?.no ?? 1;
  const statics: VarDecl[] = [
    { name: GRAPH_STEP, type: 'Int', init: String(initNo) },
    { name: GRAPH_TIMER, type: 'TON_TIME' },
  ];
  const own = (block.iface.Static ?? []).filter((v) => ![GRAPH_STEP, GRAPH_TIMER].includes(v.name));
  return {
    block: {
      ...block,
      lang: 'SCL',
      source: out.join('\n'),
      iface: { ...block.iface, Static: [...own, ...statics] },
    },
    lines,
    diagnostics,
  };
}
