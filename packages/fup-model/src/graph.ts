import type { CodeBlock, VarDecl } from '@zyklus/sim-core';
import { parseExpression, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import type { LineOrigin, Lowered } from './lower';

/**
 * GRAPH: Schrittkette als eigene Sprache für Funktionsbausteine, angelehnt an S7-GRAPH.
 * Schritte mit Aktionen (N, S, R, D), Verriegelung und Überwachung; Transitionen mit einer
 * SCL-Bedingung, auch als Simultanverzweigung (mehrere Ziele) und Synchronisation (mehrere
 * Vorgänger); Betriebsarten Automatik, Tippen und Hand; dauernde Anweisungen vor und nach der Kette.
 * Abgesenkt auf SCL mit einem Aktiv-Bit und einer Schrittzeit je Schritt.
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
  /** Verriegelung (SCL): nur wenn erfüllt, wirken die Aktionen; sonst Störung */
  interlock?: string;
  /** Überwachung (SCL): wird sie wahr, meldet der Schritt eine Störung und die Kette steht */
  supervision?: string;
}

export interface GraphTransition {
  id: string;
  /** Vorgängerschritt(e); mehrere = Synchronisation (alle müssen aktiv sein) */
  from: number | number[];
  /** Folgeschritt(e); mehrere = Simultanverzweigung (alle werden aktiv) */
  to: number | number[];
  /** Bedingung in SCL; `Schrittzeit` ist die Zeit seit Aktivierung des (ersten) Vorgängers */
  cond: string;
}

export interface GraphBody {
  graph: {
    steps: GraphStep[];
    transitions: GraphTransition[];
    /** dauernde Anweisungen (SCL) vor bzw. nach der Kette, jeden Zyklus */
    pre?: string;
    post?: string;
  };
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

/** Schrittnummern einer Transitionsseite als Liste */
export const stepList = (x: number | number[]): number[] => (Array.isArray(x) ? x : [x]);

/** Programmgröße: Schritte, Transitionen und Aktionen */
export function countGraphElements(body: GraphBody): number {
  const g = body.graph;
  return g.steps.length + g.transitions.length + g.steps.reduce((n, s) => n + s.actions.length, 0);
}

/** Interne Variablen der Kette (statisch im FB) */
export const GRAPH_STEP = '__Schritt';
export const GRAPH_TIMER = '__Zeit';
/** Aktiv-Bit bzw. Schrittzeit eines Schritts, z. B. `__X3`, `__Z3` */
export const stepFlag = (no: number) => `__X${no}`;
export const stepTimer = (no: number) => `__Z${no}`;
/** Nummer des gestörten Schritts (0 = keine Störung) */
export const GRAPH_FAULT = '__Fehler';

/** Standardparameter des Ketten-FB (wie bei S7-GRAPH), werden ergänzt, falls nicht vorhanden */
const STD_INPUTS: [string, string][] = [
  ['OFF_SQ', 'Bool'],
  ['INIT_SQ', 'Bool'],
  ['ACK_EF', 'Bool'],
  ['SW_AUTO', 'Bool'],
  ['SW_TAP', 'Bool'],
  ['SW_MAN', 'Bool'],
  ['T_PUSH', 'Bool'],
  ['S_SEL', 'Int'],
  ['S_ON', 'Bool'],
];
const STD_OUTPUTS: [string, string][] = [
  ['ERR_FLT', 'Bool'],
  ['S_NO', 'Int'],
  ['AUTO_ON', 'Bool'],
  ['TAP_ON', 'Bool'],
  ['MAN_ON', 'Bool'],
];
const LONG = 'T#100000s';

/** `Schrittzeit` außerhalb von Zeichenketten durch die Zeit des Schritts ersetzen */
function withStepTime(cond: string, no: number): string {
  return cond
    .split(/('(?:[^']|'')*'|"[^"]*")/)
    .map((part, i) => (i % 2 ? part : part.replace(/\bSchrittzeit\b/gi, `#${stepTimer(no)}.ET`)))
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
  /** Bedingung prüfen und mit Schrittzeit einsetzen; leer → `empty` */
  const condition = (
    text: string | undefined,
    no: number,
    empty: string,
    what: string,
    si?: number,
    id?: string,
  ) => {
    const c = (text ?? '').trim();
    if (!c) return empty;
    const expr = withStepTime(c, no);
    const parsed = parseExpression(expr);
    if (parsed.diagnostics.length || !parsed.expr)
      report(`${what} „${c}“: ${parsed.diagnostics[0]?.message ?? 'ungültig'}`, si, id);
    return `(${expr})`;
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
  const X = (no: number) => `#${stepFlag(no)}`;
  const initNo = initial[0]?.no ?? steps[0]?.no ?? 1;
  const nos = steps.map((s) => s.no);

  if (body.graph.pre?.trim()) {
    emit('// dauernde Anweisungen vor der Kette');
    for (const l of body.graph.pre.split(/\r?\n/)) emit(l);
  }

  emit('// Betriebsart: Flanke an SW_AUTO, SW_TAP oder SW_MAN wählt Automatik, Tippen bzw. Hand');
  emit('IF #SW_AUTO AND NOT #__P_AUTO THEN #__Betrieb := 0; END_IF;');
  emit('IF #SW_TAP AND NOT #__P_TAP THEN #__Betrieb := 1; END_IF;');
  emit('IF #SW_MAN AND NOT #__P_MAN THEN #__Betrieb := 2; END_IF;');
  emit('#__Tippen := #T_PUSH AND NOT #__P_PUSH;');
  emit('#__Wahl := #S_ON AND NOT #__P_SON;');
  emit('#__P_AUTO := #SW_AUTO; #__P_TAP := #SW_TAP; #__P_MAN := #SW_MAN;');
  emit('#__P_PUSH := #T_PUSH; #__P_SON := #S_ON;');
  // Quittieren: die Störung des Schritts ist für diese Aktivierung erledigt (__Q)
  for (const s of steps)
    if (s.supervision?.trim())
      emit(`IF #ACK_EF AND #${GRAPH_FAULT} = ${s.no} THEN #__Q${s.no} := TRUE; END_IF;`);
  emit(`IF #ACK_EF THEN #${GRAPH_FAULT} := 0; END_IF;`);

  emit('// Kette aus bzw. in Grundstellung');
  emit(`IF #OFF_SQ OR #INIT_SQ THEN`);
  for (const no of nos)
    emit(`    ${X(no)} := #INIT_SQ AND NOT #OFF_SQ AND ${no === initNo ? 'TRUE' : 'FALSE'};`);
  emit(`    #${GRAPH_FAULT} := 0;`);
  emit('END_IF;');
  emit('// Hand: Flanke an S_ON aktiviert den Schritt S_SEL (alle anderen aus)');
  emit('IF #__Betrieb = 2 AND #__Wahl THEN');
  for (const no of nos) emit(`    ${X(no)} := #S_SEL = ${no};`);
  emit('END_IF;');

  emit('// Schrittzeiten');
  for (const s of steps)
    emit(`#${stepTimer(s.no)}(IN := ${X(s.no)}, PT := ${LONG});`, {
      network: stepIndex.get(s.no)!,
    });

  // Verriegelung und Überwachung je Schritt
  const lock = new Map<number, string>();
  steps.forEach((s, si) => {
    lock.set(s.no, condition(s.interlock, s.no, 'TRUE', 'Verriegelung', si, s.id));
    const sup = condition(s.supervision, s.no, '', 'Überwachung', si, s.id);
    if (sup) {
      emit(`#__Q${s.no} := #__Q${s.no} AND ${X(s.no)};`, { network: si });
      emit(
        `IF ${X(s.no)} AND NOT #__Q${s.no} AND ${sup} AND #${GRAPH_FAULT} = 0 THEN #${GRAPH_FAULT} := ${s.no}; END_IF;`,
        { network: si },
      );
    }
  });

  emit(
    '// Transitionen (Zustand vom Zyklusanfang): Automatik, oder Tippen mit T_PUSH; nicht bei Störung',
  );
  emit(
    `#__Weiter := (#__Betrieb = 0 OR (#__Betrieb = 1 AND #__Tippen)) AND #${GRAPH_FAULT} = 0 AND NOT #OFF_SQ AND NOT #INIT_SQ;`,
  );
  const tVar = (k: number) => `#__T${k + 1}`;
  transitions.forEach((t, k) => {
    const from = stepList(t.from);
    const to = stepList(t.to);
    const si = stepIndex.get(from[0] ?? -1);
    const at = { network: si ?? 0, box: t.id };
    if (!from.length || !to.length) report('Transition braucht Vorgänger und Ziel', si, t.id);
    for (const n of from)
      if (!stepIndex.has(n))
        report(`Transition kommt von Schritt ${n}, den es nicht gibt`, si, t.id);
    for (const n of to)
      if (!stepIndex.has(n))
        report(`Transition führt zu Schritt ${n}, den es nicht gibt`, si, t.id);
    if (!t.cond.trim()) report('Transition ohne Bedingung', si, t.id);
    const cond = condition(t.cond, from[0] ?? 0, 'FALSE', 'Bedingung', si, t.id);
    // Alternativverzweigung: bei gemeinsamem Vorgänger gilt die erste erfüllte Transition
    const earlier = transitions
      .slice(0, k)
      .map((u, j) => [u, j] as const)
      .filter(([u]) => stepList(u.from).some((n) => from.includes(n)))
      .map(([, j]) => ` AND NOT ${tVar(j)}`)
      .join('');
    emit(`${tVar(k)} := #__Weiter AND ${from.map(X).join(' AND ')} AND ${cond}${earlier};`, at);
  });
  transitions.forEach((t, k) => {
    const from = stepList(t.from);
    const to = stepList(t.to);
    const si = stepIndex.get(from[0] ?? -1);
    const at = { network: si ?? 0, box: t.id };
    emit(`IF ${tVar(k)} THEN`, at);
    for (const n of from) emit(`    ${X(n)} := FALSE;`, at);
    for (const n of to) {
      emit(`    ${X(n)} := TRUE;`, at);
      // Schrittzeit des neuen Schritts beginnt mit dem nächsten Zyklus
      emit(`    #${stepTimer(n)}(IN := FALSE, PT := ${LONG});`, at);
    }
    emit('END_IF;', at);
  });

  // Aktionen: N und D je Operand zu einer Zuweisung zusammenfassen, S/R als bedingte Zuweisung
  const level = new Map<string, { op: string; terms: string[]; origin: LineOrigin }>();
  const stored = new Set<string>();
  const key = (op: string) => op.replace(/\s+/g, '').toLowerCase();
  steps.forEach((s, si) => {
    const active = `(${X(s.no)} AND ${lock.get(s.no)})`;
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
      if (a.q === 'N' || a.q === 'D') {
        let term = active;
        if (a.q === 'D') {
          const time = (a.time ?? '').trim();
          if (!/^(T|TIME)#/i.test(time)) {
            report('Aktion D braucht eine Zeit, z. B. T#2s', si, a.id);
            continue;
          }
          term = `(${active} AND #${stepTimer(s.no)}.ET >= ${time})`;
        }
        const k = key(op);
        if (stored.has(k))
          report(`${op} wird mit S/R gespeichert und kann nicht N/D sein`, si, a.id);
        const e = level.get(k) ?? { op, terms: [], origin: at };
        e.terms.push(term);
        level.set(k, e);
      } else {
        const k = key(op);
        if (level.has(k)) report(`${op} ist schon N/D und kann nicht S/R sein`, si, a.id);
        stored.add(k);
        emit(`IF ${active} THEN ${op} := ${a.q === 'S' ? 'TRUE' : 'FALSE'}; END_IF;`, at);
      }
    }
  });
  for (const e of level.values()) emit(`${e.op} := ${e.terms.join(' OR ')};`, e.origin);

  emit('// Zustand nach außen');
  emit('#S_NO := 0;');
  for (const no of [...nos].sort((a, b) => b - a)) emit(`IF ${X(no)} THEN #S_NO := ${no}; END_IF;`);
  emit(`#${GRAPH_STEP} := #S_NO;`);
  const locked = steps
    .filter((s) => s.interlock?.trim())
    .map((s) => `(${X(s.no)} AND NOT ${lock.get(s.no)})`);
  emit(`#ERR_FLT := #${GRAPH_FAULT} <> 0${locked.map((l) => ` OR ${l}`).join('')};`);
  emit('#AUTO_ON := #__Betrieb = 0; #TAP_ON := #__Betrieb = 1; #MAN_ON := #__Betrieb = 2;');

  if (body.graph.post?.trim()) {
    emit('// dauernde Anweisungen nach der Kette');
    for (const l of body.graph.post.split(/\r?\n/)) emit(l);
  }

  // interne Variablen und Standardparameter (eigene gleichnamige Deklarationen haben Vorrang)
  const has = (name: string) =>
    Object.values(block.iface).some((sec) =>
      sec?.some((v) => v.name.toLowerCase() === name.toLowerCase()),
    );
  const statics: VarDecl[] = [
    { name: GRAPH_STEP, type: 'Int', init: String(initNo) },
    { name: GRAPH_FAULT, type: 'Int' },
    { name: '__Betrieb', type: 'Int' },
    { name: '__Weiter', type: 'Bool' },
    { name: '__Tippen', type: 'Bool' },
    { name: '__Wahl', type: 'Bool' },
    ...['AUTO', 'TAP', 'MAN', 'PUSH', 'SON'].map((n) => ({ name: `__P_${n}`, type: 'Bool' })),
    ...steps.flatMap((s): VarDecl[] => [
      { name: stepFlag(s.no), type: 'Bool', init: s.no === initNo ? 'TRUE' : 'FALSE' },
      { name: stepTimer(s.no), type: 'TON_TIME' },
    ]),
    ...transitions.map((_, k) => ({ name: `__T${k + 1}`, type: 'Bool' })),
    ...steps
      .filter((s) => s.supervision?.trim())
      .map((s) => ({ name: `__Q${s.no}`, type: 'Bool' })),
  ];
  const own = (block.iface.Static ?? []).filter((v) => !v.name.startsWith('__'));
  const inputs = [
    ...(block.iface.Input ?? []),
    ...STD_INPUTS.filter(([n]) => !has(n)).map(([name, type]) => ({ name, type })),
  ];
  const outputs = [
    ...(block.iface.Output ?? []),
    ...STD_OUTPUTS.filter(([n]) => !has(n)).map(([name, type]) => ({ name, type })),
  ];
  return {
    block: {
      ...block,
      lang: 'SCL',
      source: out.join('\n'),
      iface: { ...block.iface, Input: inputs, Output: outputs, Static: [...own, ...statics] },
    },
    lines,
    diagnostics,
  };
}
