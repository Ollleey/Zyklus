import { boxSpec, inputPins, outputPins } from '@zyklus/fup-model';
import type { FupNetwork, LadNetwork, LadNode } from '@zyklus/fup-model';

/**
 * Beobachten in FUP und KOP wie im TIA-Portal: Signalfluss aus den Operandenwerten der laufenden
 * Simulation. Dreiwertig – `undefined`, wenn ein Wert nicht lesbar ist (z. B. Flankenmerker in
 * Ausdrücken); dann bleibt die Leitung neutral statt falsch eingefärbt.
 */

export type LiveValue = boolean | number | string | undefined;
export type LiveFn = (operand: string) => LiveValue;

const and3 = (a: boolean | undefined, b: boolean | undefined) =>
  a === false || b === false ? false : a === true && b === true ? true : undefined;
const or3 = (list: (boolean | undefined)[]) =>
  list.some((x) => x === true) ? true : list.every((x) => x === false) ? false : undefined;
const not3 = (a: boolean | undefined) => (a === undefined ? undefined : !a);
const asBool = (v: LiveValue) => (typeof v === 'boolean' ? v : undefined);

/** Konstante im Operandenfeld (TRUE/FALSE, Zahl) oder Wert aus der Simulation */
export function operandValue(live: LiveFn, operand: string | undefined): LiveValue {
  const op = operand?.trim();
  if (!op) return undefined;
  if (/^true$/i.test(op)) return true;
  if (/^false$/i.test(op)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(op)) return Number(op);
  return live(op);
}

/** Vergleicher (CMP_xx, IN_RANGE, OUT_RANGE) aus den Werten seiner Eingänge */
function compareBox(type: string, get: (pin: string) => LiveValue): boolean | undefined {
  if (type === 'IN_RANGE' || type === 'OUT_RANGE') {
    const [lo, v, hi] = [get('MIN'), get('VAL'), get('MAX')];
    if (typeof lo !== 'number' || typeof v !== 'number' || typeof hi !== 'number') return undefined;
    const inside = v >= lo && v <= hi;
    return type === 'IN_RANGE' ? inside : !inside;
  }
  return compare(type, get('IN1'), get('IN2'));
}

function compare(type: string, a: LiveValue, b: LiveValue): boolean | undefined {
  if (typeof a !== 'number' || typeof b !== 'number') return undefined;
  switch (type.replace(/^CMP_/, '')) {
    case 'EQ':
      return a === b;
    case 'NE':
      return a !== b;
    case 'GT':
      return a > b;
    case 'GE':
      return a >= b;
    case 'LT':
      return a < b;
    case 'LE':
      return a <= b;
  }
  return undefined;
}

/** Wert eines Instanz-Ausgangs, z. B. `"T1".Q` bzw. `"T1".ET` */
const memberOf = (live: LiveFn, operand: string | undefined, pin: string) =>
  operand?.trim() ? live(`${operand.trim()}.${pin}`) : undefined;

// ---------------------------------------------------------------------------------------------
// KOP: Stromfluss von der linken Schiene
// ---------------------------------------------------------------------------------------------

/**
 * Stromfluss hinter jedem Element (id → an/aus/unbekannt), hinter jedem Parallelzweig
 * (`id:k`) und am Ende des Strompfads (`end`).
 */
export function ladFlow(nw: LadNetwork, live: LiveFn): Map<string, boolean | undefined> {
  const out = new Map<string, boolean | undefined>();
  const series = (items: LadNode[], flow: boolean | undefined): boolean | undefined => {
    let f = flow;
    for (const n of items) {
      f = node(n, f);
      out.set(n.id, f);
    }
    return f;
  };
  const node = (n: LadNode, flow: boolean | undefined): boolean | undefined => {
    switch (n.k) {
      case 'contact': {
        const v = asBool(operandValue(live, n.operand));
        return and3(flow, n.neg ? not3(v) : v);
      }
      case 'edge':
        // Flanke ist nur einen Zyklus lang 1: ohne Strom sicher aus, sonst unbekannt
        return flow === false ? false : undefined;
      case 'parallel': {
        const ends = n.branches.map((b, k) => {
          const e = series(b, flow);
          out.set(`${n.id}:${k}`, e);
          return e;
        });
        return or3(ends);
      }
      case 'box': {
        const spec = boxSpec(n.type);
        if (spec.kind === 'compare')
          return and3(
            flow,
            compareBox(n.type, (pin) => operandValue(live, n.inputs[pin])),
          );
        const q = outputPins(n.type).find((p) => p.kind === 'bool' && p.name !== 'ENO');
        if (q && n.operand) return asBool(memberOf(live, n.operand, q.name));
        // Funktionen (MOVE, ADD …): EN → ENO
        return flow;
      }
    }
  };
  out.set('end', series(nw.items, true));
  return out;
}

// ---------------------------------------------------------------------------------------------
// FUP: Werte an Box-Ausgängen und Leitungen
// ---------------------------------------------------------------------------------------------

/** Werte der Box-Ausgänge (`box.pin`, nach einer Negation am Ausgang) */
export function fupValues(nw: FupNetwork, live: LiveFn): Map<string, LiveValue> {
  const memo = new Map<string, LiveValue>();
  const busy = new Set<string>();
  const byId = new Map(nw.boxes.map((b) => [b.id, b]));

  const input = (boxId: string, pin: string): LiveValue => {
    const b = byId.get(boxId)!;
    const w = nw.wires.find((x) => x.to.box === boxId && x.to.pin === pin);
    const v = w ? output(w.from.box, w.from.pin) : operandValue(live, b.inputs[pin]);
    return b.negated.includes(pin) && typeof v === 'boolean' ? !v : v;
  };

  const raw = (boxId: string, pin: string): LiveValue => {
    const b = byId.get(boxId);
    if (!b) return undefined;
    const spec = boxSpec(b.type);
    // Operand am Ausgang: dessen Wert (das hat die SPS geschrieben)
    if (b.outputs[pin]?.trim()) return operandValue(live, b.outputs[pin]);
    switch (spec.kind) {
      case 'logic': {
        const ins = inputPins(b.type, b.count).map((p) => asBool(input(b.id, p.name)));
        if (b.type === 'AND') return ins.reduce<boolean | undefined>((a, x) => and3(a, x), true);
        if (b.type === 'OR') return or3(ins);
        if (b.type === 'XOR')
          return ins.some((x) => x === undefined)
            ? undefined
            : ins.filter(Boolean).length % 2 === 1;
        return undefined;
      }
      case 'compare':
        return compareBox(b.type, (pin) => input(b.id, pin));
      case 'memory':
        return operandValue(live, b.operand);
      case 'instance':
      case 'call':
        return memberOf(live, b.operand, pin);
      case 'function':
        return pin === 'ENO'
          ? b.inputs.EN || wired(b.id, 'EN')
            ? input(b.id, 'EN')
            : true
          : undefined;
      default:
        return undefined;
    }
  };
  const wired = (boxId: string, pin: string) =>
    nw.wires.some((x) => x.to.box === boxId && x.to.pin === pin);

  const output = (boxId: string, pin: string): LiveValue => {
    const key = `${boxId}.${pin}`;
    if (memo.has(key)) return memo.get(key);
    if (busy.has(key)) return undefined;
    busy.add(key);
    let v = raw(boxId, pin);
    if (byId.get(boxId)?.negated.includes(pin) && typeof v === 'boolean') v = !v;
    busy.delete(key);
    memo.set(key, v);
    return v;
  };

  for (const b of nw.boxes) for (const p of outputPins(b.type)) output(b.id, p.name);
  return memo;
}

/** Text und Farbe eines beobachteten Werts (1 grün, 0 blau, Zahlen neutral) */
export function liveText(v: LiveValue): { text: string; cls: 'on' | 'off' | 'num' } | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return { text: v ? '1' : '0', cls: v ? 'on' : 'off' };
  if (typeof v === 'number')
    return { text: Number.isInteger(v) ? String(v) : v.toFixed(2), cls: 'num' };
  return { text: `'${v}'`, cls: 'num' };
}
