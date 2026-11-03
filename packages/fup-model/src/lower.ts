import type { Block, CodeBlock, PlcProject, VarDecl } from '@zyklus/sim-core';
import { instanceType, parseExpression, type ProjectDiagnostic } from '@zyklus/scl-compiler';
import { boxSpec, inputPins, outputPins, type BoxSpec } from './catalog';
import { isFupBody, type FupBody, type FupBox, type FupNetwork } from './model';

/** Herkunft einer erzeugten SCL-Zeile. */
export interface LineOrigin {
  network: number;
  box?: string;
}

export interface Lowered {
  block: CodeBlock;
  /** Herkunft je Zeile des erzeugten Anweisungsteils (Index = Zeile − 1) */
  lines: (LineOrigin | undefined)[];
  diagnostics: ProjectDiagnostic[];
}

const TEMP_PREFIX = '__fup';

const CMP_OP: Record<string, string> = {
  CMP_EQ: '=',
  CMP_NE: '<>',
  CMP_GT: '>',
  CMP_GE: '>=',
  CMP_LT: '<',
  CMP_LE: '<=',
};

class LoweringError extends Error {
  constructor(
    message: string,
    readonly pin?: string,
  ) {
    super(message);
  }
}

/** Klammert einen Ausdruck, wenn er nicht atomar ist. */
function paren(e: string): string {
  return /^[#"%\w.]+$/.test(e) || wrapped(e) ? e : `(${e})`;
}

/** true, wenn eine Klammer den ganzen Ausdruck umschließt („(a) OR (b)“ zählt nicht) */
function wrapped(e: string): boolean {
  if (!e.startsWith('(') || !e.endsWith(')')) return false;
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < e.length; i++) {
    const ch = e[i];
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0 && i < e.length - 1) return false;
  }
  return depth === 0;
}

/**
 * Übersetzt einen FUP-Baustein in einen gleichwertigen SCL-Baustein. Der SCL-Compiler erzeugt
 * daraus die IR – FUP und SCL haben damit garantiert dieselbe Semantik.
 *
 * Auswertungsreihenfolge: Netzwerke von oben nach unten; innerhalb eines Netzwerks topologisch
 * entlang der Verbindungen, bei Gleichstand nach Lage (oben vor unten, links vor rechts).
 */
export function lowerFupBlock(block: CodeBlock, project: PlcProject): Lowered {
  const body: FupBody = isFupBody(block.fup) ? block.fup : { networks: [] };
  const lines: string[] = [];
  const origins: (LineOrigin | undefined)[] = [];
  const diagnostics: ProjectDiagnostic[] = [];
  const temps: VarDecl[] = [];
  let tempNo = 0;

  const emit = (text: string, origin: LineOrigin) => {
    for (const l of text.split('\n')) {
      lines.push(l);
      origins.push(origin);
    }
  };
  const newTemp = () => {
    const name = `${TEMP_PREFIX}${++tempNo}`;
    temps.push({ name, type: 'Bool' });
    return `#${name}`;
  };
  const report = (
    severity: 'error' | 'warning',
    message: string,
    network: number,
    box?: string,
    pin?: string,
  ) =>
    diagnostics.push({
      severity,
      message,
      start: { line: 1, col: 1 },
      end: { line: 1, col: 1 },
      location: { block: block.name, part: 'code', network, box, pin },
    });

  body.networks.forEach((nw, n) => {
    emit(`// Netzwerk ${n + 1}${nw.title ? `: ${nw.title.replace(/\n/g, ' ')}` : ''}`, {
      network: n,
    });
    lowerNetwork(nw, n);
  });

  function lowerNetwork(nw: FupNetwork, n: number): void {
    const boxes = new Map(nw.boxes.map((b) => [b.id, b]));
    const into = new Map<string, string[]>(); // Eingang → Quellen
    const fanout = new Map<string, number>(); // Ausgang → Anzahl Ziele
    const succ = new Map<string, Set<string>>();
    const indeg = new Map(nw.boxes.map((b) => [b.id, 0]));

    for (const w of nw.wires) {
      const from = boxes.get(w.from.box);
      const to = boxes.get(w.to.box);
      if (!from || !to) {
        report('error', 'Verbindung zu einer gelöschten Box', n);
        continue;
      }
      const out = outputPins(from.type).find((p) => p.name === w.from.pin);
      const inp = inputPins(to.type, to.count).find((p) => p.name === w.to.pin);
      if (!out || !inp) {
        report(
          'error',
          `Verbindung an unbekanntem Pin ${!out ? w.from.pin : w.to.pin}`,
          n,
          !out ? from.id : to.id,
        );
        continue;
      }
      if (out.kind !== 'bool' || inp.kind !== 'bool') {
        report(
          'error',
          'Nur Bool-Signale lassen sich verbinden – Werte laufen über Operanden',
          n,
          to.id,
          w.to.pin,
        );
        continue;
      }
      const key = `${to.id}.${w.to.pin}`;
      into.set(key, [...(into.get(key) ?? []), `${from.id}.${w.from.pin}`]);
      fanout.set(`${from.id}.${w.from.pin}`, (fanout.get(`${from.id}.${w.from.pin}`) ?? 0) + 1);
      if (from.id === to.id) {
        report('error', 'Ausgang ist auf einen Eingang derselben Box zurückgeführt', n, to.id);
        continue;
      }
      if (!succ.has(from.id)) succ.set(from.id, new Set());
      if (!succ.get(from.id)!.has(to.id)) {
        succ.get(from.id)!.add(to.id);
        indeg.set(to.id, indeg.get(to.id)! + 1);
      }
    }

    // topologische Reihenfolge, bei Gleichstand oben vor unten, links vor rechts
    const byPos = (a: FupBox, b: FupBox) => a.y - b.y || a.x - b.x;
    const ready = nw.boxes.filter((b) => indeg.get(b.id) === 0).sort(byPos);
    const order: FupBox[] = [];
    while (ready.length) {
      const b = ready.shift()!;
      order.push(b);
      for (const s of succ.get(b.id) ?? []) {
        indeg.set(s, indeg.get(s)! - 1);
        if (indeg.get(s) === 0) {
          ready.push(boxes.get(s)!);
          ready.sort(byPos);
        }
      }
    }
    if (order.length < nw.boxes.length) {
      for (const b of nw.boxes) {
        if (!order.includes(b))
          report('error', 'Rückkopplung: Verbindungen bilden einen Kreis', n, b.id);
      }
      return;
    }

    const outExpr = new Map<string, string>();

    for (const box of order) {
      try {
        lowerBox(box);
      } catch (e) {
        if (!(e instanceof LoweringError)) throw e;
        report('error', e.message, n, box.id, e.pin);
        // Folgefehler vermeiden: Ausgänge als FALSE weiterreichen
        for (const p of outputPins(box.type)) outExpr.set(`${box.id}.${p.name}`, 'FALSE');
      }
    }

    function operandOf(text: string | undefined, pin: string): string | undefined {
      const t = text?.trim();
      if (!t) return undefined;
      const r = parseExpression(t);
      if (r.diagnostics.length || !r.expr) {
        throw new LoweringError(
          `Operand „${t}“ an ${pin}: ${r.diagnostics[0]?.message ?? 'ungültig'}`,
          pin,
        );
      }
      if (r.expr.k !== 'lit' && r.expr.k !== 'ref') {
        throw new LoweringError(
          `An ${pin} ist nur ein Operand oder eine Konstante erlaubt, kein Ausdruck`,
          pin,
        );
      }
      return t;
    }

    function negate(box: FupBox, pin: string, e: string): string {
      return box.negated.includes(pin) ? `NOT ${paren(e)}` : e;
    }

    /** Ausdruck an einem Bool-Eingang (Verbindung oder Operand, ggf. negiert). */
    function boolIn(box: FupBox, pin: string, optional = false): string | undefined {
      const key = `${box.id}.${pin}`;
      const sources = into.get(key) ?? [];
      const op = box.inputs[pin]?.trim();
      if (sources.length > 1)
        throw new LoweringError(`Eingang ${pin} hat mehrere Verbindungen`, pin);
      if (sources.length && op)
        throw new LoweringError(
          `Eingang ${pin} ist verbunden und hat zusätzlich einen Operanden`,
          pin,
        );
      // Konstanten an Bool-Pins: 0/1/TRUE/FALSE (Schreibweise egal)
      if (!sources.length && op && /^[+-]?\d+$/.test(op)) {
        if (op !== '0' && op !== '1') {
          throw new LoweringError('BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.', pin);
        }
      }
      const constant =
        op && /^(0|1|true|false)$/i.test(op)
          ? op === '1' || op.toLowerCase() === 'true'
            ? 'TRUE'
            : 'FALSE'
          : undefined;
      let e = sources.length ? outExpr.get(sources[0]!) : (constant ?? operandOf(op, pin));
      if (e === undefined) {
        if (optional) return undefined;
        throw new LoweringError(`Eingang ${pin} ist offen`, pin);
      }
      e = negate(box, pin, e);
      return e;
    }

    function valueIn(box: FupBox, pin: string, optional = false): string | undefined {
      const e = operandOf(box.inputs[pin], pin);
      if (e === undefined && !optional)
        throw new LoweringError(`Eingang ${pin} braucht einen Operanden`, pin);
      return e;
    }

    /** Bool-Ausgang bereitstellen: direkt einsetzen oder bei mehreren Zielen in eine Hilfsvariable. */
    function provide(box: FupBox, pin: string, expr: string, sideEffect = false): void {
      const key = `${box.id}.${pin}`;
      const uses = fanout.get(key) ?? 0;
      const target = box.outputs[pin]?.trim();
      let e = expr;
      if (sideEffect || uses > 1 || (uses > 0 && target)) {
        const t = newTemp();
        emit(`${t} := ${expr};`, { network: n, box: box.id });
        e = t;
      }
      const shown = negate(box, pin, e);
      if (target) {
        const op = operandOf(target, pin)!;
        emit(`${op} := ${shown};`, { network: n, box: box.id });
      }
      outExpr.set(key, shown);
    }

    function lowerBox(box: FupBox): void {
      const spec = boxSpec(box.type);
      const at = { network: n, box: box.id };
      const ins = inputPins(box.type, box.count);
      switch (spec.kind) {
        case 'logic': {
          const word = box.type === 'AND' ? 'AND' : box.type === 'OR' ? 'OR' : 'XOR';
          const parts = ins.map((p) => paren(boolIn(box, p.name)!));
          provide(box, 'OUT', parts.join(` ${word} `));
          if (!fanout.get(`${box.id}.OUT`)) {
            report(
              'warning',
              'Ausgang ist nicht verbunden – die Verknüpfung hat keine Wirkung',
              n,
              box.id,
            );
          }
          return;
        }
        case 'compare': {
          if (box.type === 'IN_RANGE' || box.type === 'OUT_RANGE') {
            const [min, val, max] = ['MIN', 'VAL', 'MAX'].map((p) => valueIn(box, p)!);
            provide(box, 'OUT', `${box.type}(MIN := ${min}, VAL := ${val}, MAX := ${max})`);
          } else {
            provide(
              box,
              'OUT',
              `${valueIn(box, 'IN1')} ${CMP_OP[box.type]} ${valueIn(box, 'IN2')}`,
            );
          }
          if (!fanout.get(`${box.id}.OUT`)) {
            report(
              'warning',
              'Ausgang ist nicht verbunden – der Vergleich hat keine Wirkung',
              n,
              box.id,
            );
          }
          return;
        }
        case 'assign': {
          const target = requireOperand(box, spec);
          const e = boolIn(box, 'IN')!;
          if (box.type === 'ASSIGN') emit(`${target} := ${e};`, at);
          else
            emit(`IF ${e} THEN ${target} := ${box.type === 'SET' ? 'TRUE' : 'FALSE'}; END_IF;`, at);
          return;
        }
        case 'memory': {
          const mem = requireOperand(box, spec);
          const [s, r] =
            box.type === 'SR'
              ? [boolIn(box, 'S'), boolIn(box, 'R1')]
              : [boolIn(box, 'S1'), boolIn(box, 'R')];
          provide(box, 'Q', `__${box.type}(S := ${s}, R := ${r}, M := ${mem})`, true);
          return;
        }
        case 'edge': {
          const mem = requireOperand(box, spec);
          const fn = box.type === 'P_TRIG' ? '__PTRIG' : '__NTRIG';
          provide(box, 'Q', `${fn}(CLK := ${boolIn(box, 'CLK')}, M := ${mem})`, true);
          return;
        }
        case 'instance':
          return lowerInstance(box, spec, ins);
        case 'function':
          return lowerFunction(box, ins);
      }
    }

    function requireOperand(box: FupBox, spec: BoxSpec): string {
      const op = operandOf(box.operand, spec.operandLabel ?? 'Operand');
      if (!op) throw new LoweringError(`${spec.operandLabel ?? 'Operand'} über der Box fehlt`);
      return op;
    }

    function lowerInstance(box: FupBox, spec: BoxSpec, ins: ReturnType<typeof inputPins>): void {
      const inst = requireOperand(box, spec);
      const { call, members } = instanceCall(inst, box.type, project);
      const params: string[] = [];
      for (const p of ins) {
        const e =
          p.kind === 'bool' ? boolIn(box, p.name, p.optional) : valueIn(box, p.name, p.optional);
        if (e !== undefined) params.push(`${p.name} := ${e}`);
      }
      emit(`${call}(${params.join(', ')});`, { network: n, box: box.id });
      for (const p of outputPins(box.type)) {
        const member = `${inst}.${members[p.name] ?? p.name}`;
        if (p.kind === 'bool') {
          provide(box, p.name, member);
        } else if (box.outputs[p.name]?.trim()) {
          emit(`${operandOf(box.outputs[p.name], p.name)} := ${member};`, {
            network: n,
            box: box.id,
          });
        }
      }
    }

    function lowerFunction(box: FupBox, ins: ReturnType<typeof inputPins>): void {
      const en = boolIn(box, 'EN', true);
      const v = (pin: string) => valueIn(box, pin)!;
      const list = (prefix: string) =>
        ins.filter((p) => p.name.startsWith(prefix) && /\d+$/.test(p.name)).map((p) => v(p.name));
      const named = (...pins: string[]) => pins.map((p) => `${p} := ${v(p)}`).join(', ');
      let rhs: string;
      switch (box.type) {
        case 'ADD':
          rhs = list('IN').join(' + ');
          break;
        case 'MUL':
          rhs = list('IN').map(paren).join(' * ');
          break;
        case 'SUB':
          rhs = `${v('IN1')} - ${paren(v('IN2'))}`;
          break;
        case 'DIV':
          rhs = `${v('IN1')} / ${paren(v('IN2'))}`;
          break;
        case 'MOD':
          rhs = `${v('IN1')} MOD ${paren(v('IN2'))}`;
          break;
        case 'ABS':
          rhs = `ABS(${v('IN')})`;
          break;
        case 'LIMIT':
          rhs = `LIMIT(${named('MN', 'IN', 'MX')})`;
          break;
        case 'MIN':
        case 'MAX':
          rhs = `${box.type}(${list('IN')
            .map((e, i) => `IN${i + 1} := ${e}`)
            .join(', ')})`;
          break;
        case 'NORM_X':
        case 'SCALE_X':
          rhs = `${box.type}(${named('MIN', 'VALUE', 'MAX')})`;
          break;
        case 'MOVE':
          rhs = v('IN');
          break;
        case 'CONV':
          rhs = `__CONV(IN := ${v('IN')})`;
          break;
        case 'SEL':
          rhs = `SEL(G := ${boolIn(box, 'G')}, IN0 := ${v('IN0')}, IN1 := ${v('IN1')})`;
          break;
        case 'MUX': {
          const inputs = list('IN').map((e, i) => `IN${i} := ${e}`);
          const alt = valueIn(box, 'ELSE', true);
          rhs = `MUX(K := ${v('K')}, ${inputs.join(', ')}${alt ? `, INELSE := ${alt}` : ''})`;
          break;
        }
        case 'SHL':
        case 'SHR':
          rhs = `${box.type}(${named('IN', 'N')})`;
          break;
        default:
          throw new LoweringError(`Box ${box.type} wird nicht unterstützt`);
      }
      const outPin = outputPins(box.type).find((p) => p.kind === 'value')!.name;
      const out = operandOf(box.outputs[outPin], outPin);
      if (!out) throw new LoweringError(`Ausgang ${outPin} braucht einen Operanden`, outPin);
      const stmt = `${out} := ${rhs};`;
      emit(en ? `IF ${en} THEN ${stmt} END_IF;` : stmt, { network: n, box: box.id });
      provide(box, 'ENO', en ?? 'TRUE');
    }
  }

  const temp = [...(block.iface.Temp ?? []), ...temps];
  return {
    block: {
      ...block,
      lang: 'SCL',
      source: lines.join('\n'),
      iface: { ...block.iface, Temp: temp },
      generatedFrom: 'FUP',
    },
    lines: origins,
    diagnostics,
  };
}

/**
 * Aufrufform einer Instanz wie in TIA: generische DBs (IEC_TIMER, IEC_COUNTER) über "DB".TON(…),
 * typisierte DBs (TON_TIME, CTU_INT, R_TRIG) direkt über "DB"(…). Bei IEC_COUNTER heißen die
 * Bool-Ausgänge im DB QU/QD.
 */
function instanceCall(
  inst: string,
  type: string,
  project: PlcProject,
): { call: string; members: Record<string, string> } {
  const r = parseExpression(inst);
  let typeName: string | undefined;
  if (r.expr?.k === 'ref') {
    const { name, path } = r.expr;
    const found = project.blocks.find((b: Block) => b.name.toLowerCase() === name.toLowerCase());
    if (found?.kind === 'IDB' && path.length === 0) typeName = found.of;
    if (found?.kind === 'DB' && path.length === 1) {
      typeName = found.vars.find((v) => v.name.toLowerCase() === path[0]!.toLowerCase())?.type;
    }
  }
  const it = typeName ? instanceType(typeName) : undefined;
  const generic = !it || it.generic;
  const counterDb = it?.generic === true && it.family === 'counter';
  const members: Record<string, string> =
    counterDb && type === 'CTU' ? { Q: 'QU' } : counterDb && type === 'CTD' ? { Q: 'QD' } : {};
  return { call: generic ? `${inst}.${type}` : inst, members };
}
