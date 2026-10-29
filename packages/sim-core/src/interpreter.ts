import type { Area } from './address';
import { evalCounter, evalTimer, evalTrig, type InstanceState } from './instances';
import type { Instr, IrProgram, Operand } from './ir';
import type { ByteArea } from './memory';
import { energyOf } from './metrics/weights';
import {
  bitWidth,
  isIntegerType,
  normalize,
  roundHalfEven,
  saturate,
  type DataType,
  type Value,
} from './types';
import { typeOf } from './validate';

export interface ExecContext {
  program: IrProgram;
  /** vorberechnete Energie je Befehl (Index = pc) */
  energy: number[];
  slots: Value[];
  instances: InstanceState[];
  areas: Record<Area, ByteArea>;
  /** Zeitstempel des Zyklusbeginns in ms */
  now: number;
  /** maximale Anzahl ausgeführter Befehle in diesem Durchlauf */
  budget: number;
  /** Codebereich [start, end); Standard ist OB1 */
  start?: number;
  end?: number;
}

export type ExecResult =
  | { ok: true; ops: number; energy: number }
  | { ok: false; ops: number; energy: number; reason: 'CYCLE_OVERRUN' };

export function precomputeEnergy(program: IrProgram): number[] {
  return program.code.map(energyOf);
}

/** Führt einen Baustein (OB) einmal vollständig aus. */
export function execute(ctx: ExecContext): ExecResult {
  const { program, slots, instances, areas } = ctx;
  const code = program.code;
  // Codebereich des auszuführenden OB (Standard: OB1)
  const end = ctx.end ?? program.mainEnd ?? code.length;
  let pc = ctx.start ?? 0;
  let ops = 0;
  let energy = 0;

  const type = (o: Operand): DataType => typeOf(program, o)!;

  const read = (o: Operand): Value => {
    switch (o.k) {
      case 'const':
        return o.v;
      case 'io':
        return areas[o.area].read(o.t, o.byte, o.bit);
      case 'slot':
        return slots[o.i]!;
      case 'inst':
        return instances[o.i]![o.f];
    }
  };
  const num = (o: Operand) => read(o) as number;
  const bool = (o: Operand) => read(o) as boolean;

  const write = (o: Operand, v: Value): void => {
    if (o.k === 'io') areas[o.area].write(o.t, o.byte, o.bit, v);
    else if (o.k === 'slot') slots[o.i] = normalize(program.slots[o.i]!.t, v);
    else throw new Error('Operand nicht beschreibbar');
  };

  while (pc < end) {
    if (ops >= ctx.budget) return { ok: false, ops, energy, reason: 'CYCLE_OVERRUN' };
    const ins = code[pc]!;
    ops++;
    energy += ctx.energy[pc]!;
    pc++;
    switch (ins.op) {
      case 'mov':
        write(ins.dst, read(ins.src));
        break;
      case 'conv':
        write(ins.dst, convert(read(ins.src), type(ins.src), type(ins.dst), ins.mode));
        break;
      case 'un':
        write(ins.dst, unary(ins.fn, ins.t, read(ins.a)));
        break;
      case 'bin':
        write(ins.dst, binary(ins.fn, ins.t, read(ins.a), read(ins.b)));
        break;
      case 'cmp':
        write(ins.dst, compare(ins.fn, read(ins.a), read(ins.b)));
        break;
      case 'fn':
        write(ins.dst, call(ins, ins.args.map(read)));
        break;
      case 'mux': {
        const k = num(ins.k);
        if (k >= 0 && k < ins.ins.length) write(ins.dst, read(ins.ins[k]!));
        else if (ins.alt) write(ins.dst, read(ins.alt));
        break;
      }
      case 'set':
        if (bool(ins.cond)) write(ins.dst, true);
        break;
      case 'reset':
        if (bool(ins.cond)) write(ins.dst, false);
        break;
      case 'sr': {
        const s = bool(ins.s);
        const r = bool(ins.r);
        const q = bool(ins.q);
        const next = ins.kind === 'SR' ? (q || s) && !r : (q && !r) || s;
        write(ins.q, next);
        if (ins.out) write(ins.out, next);
        break;
      }
      case 'edge': {
        const clk = bool(ins.clk);
        const mem = bool(ins.mem);
        write(ins.mem, clk);
        write(ins.out, ins.kind === 'P' ? clk && !mem : !clk && mem);
        break;
      }
      case 'trig':
        evalTrig(instances[ins.i]!, bool(ins.clk));
        break;
      case 'tmr':
        evalTimer(
          instances[ins.i]!,
          bool(ins.in),
          num(ins.pt),
          ctx.now,
          ins.r ? bool(ins.r) : false,
        );
        break;
      case 'ctr':
        evalCounter(instances[ins.i]!, {
          cu: ins.cu ? bool(ins.cu) : false,
          cd: ins.cd ? bool(ins.cd) : false,
          r: ins.r ? bool(ins.r) : false,
          ld: ins.ld ? bool(ins.ld) : false,
          pv: num(ins.pv),
        });
        break;
      case 'jmp':
        pc = ins.to;
        break;
      case 'jz':
        if (!bool(ins.cond)) pc = ins.to;
        break;
      case 'jnz':
        if (bool(ins.cond)) pc = ins.to;
        break;
    }
  }
  return { ok: true, ops, energy };
}

/**
 * Konvertierung zwischen Typen:
 * - REAL → Ganzzahl: runden (half-even) bzw. abschneiden, dann sättigen
 * - INT ↔ WORD: Bitmuster wird übernommen
 * - TIME ↔ DINT: identisch
 * - sonstige Ganzzahl-Verengungen: sättigen
 * - BOOL → Zahl: 0/1, Zahl → BOOL: ≠ 0
 */
export function convert(
  v: Value,
  from: DataType,
  to: DataType,
  mode: 'round' | 'trunc' = 'round',
): Value {
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  if (to === 'BOOL') return n !== 0;
  if (to === 'REAL') return Math.fround(n);
  if (from === 'REAL') {
    const i = mode === 'trunc' ? Math.trunc(n) : roundHalfEven(n);
    return saturate(to, i);
  }
  if (sameBitPattern(from, to)) return normalize(to, n);
  return saturate(to, n);
}

/** Typpaare gleicher Breite, bei denen das Bitmuster übernommen wird. */
function sameBitPattern(a: DataType, b: DataType): boolean {
  const pair = (x: DataType, y: DataType) => (a === x && b === y) || (a === y && b === x);
  return pair('INT', 'WORD') || pair('DINT', 'DWORD') || pair('TIME', 'DWORD');
}

function unary(fn: 'not' | 'neg' | 'abs', t: DataType, a: Value): Value {
  switch (fn) {
    case 'not':
      // normalize beim Schreiben schneidet auf die Breite des Typs zu
      return t === 'BOOL' ? !a : ~(a as number);
    case 'neg':
      return -(a as number);
    case 'abs':
      return Math.abs(a as number);
  }
}

function binary(fn: Extract<Instr, { op: 'bin' }>['fn'], t: DataType, av: Value, bv: Value): Value {
  if (t === 'BOOL') {
    const a = av as boolean;
    const b = bv as boolean;
    if (fn === 'and') return a && b;
    if (fn === 'or') return a || b;
    return a !== b;
  }
  const a = av as number;
  const b = bv as number;
  const int = isIntegerType(t);
  switch (fn) {
    case 'add':
      return a + b;
    case 'sub':
      return a - b;
    case 'mul':
      // Math.imul liefert exakt die unteren 32 bit (Überlauf wie bei DINT)
      return int ? Math.imul(a, b) : a * b;
    case 'div':
      if (!int) return a / b;
      return b === 0 ? 0 : Math.trunc(a / b);
    case 'mod':
      return b === 0 ? 0 : a % b;
    case 'and':
      return a & b;
    case 'or':
      return a | b;
    case 'xor':
      return a ^ b;
    case 'shl':
      // a · 2^b ist exakt; normalize schneidet auf die Typbreite zu
      return b <= 0 ? a : b >= bitWidth(t) ? 0 : a * 2 ** b;
    case 'shr':
      return b <= 0 ? a : b >= bitWidth(t) ? 0 : a >>> b;
  }
}

function compare(fn: Extract<Instr, { op: 'cmp' }>['fn'], a: Value, b: Value): boolean {
  switch (fn) {
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'lt':
      return a < b;
    case 'le':
      return a <= b;
    case 'gt':
      return a > b;
    case 'ge':
      return a >= b;
  }
}

function call(ins: Extract<Instr, { op: 'fn' }>, args: Value[]): Value {
  const n = args as number[];
  switch (ins.fn) {
    case 'limit':
      return Math.min(Math.max(n[1]!, n[0]!), n[2]!);
    case 'min':
      return Math.min(...n);
    case 'max':
      return Math.max(...n);
    case 'sel':
      return args[0] ? args[2]! : args[1]!;
    case 'in_range':
      return n[0]! <= n[1]! && n[1]! <= n[2]!;
    case 'out_range':
      return n[1]! < n[0]! || n[1]! > n[2]!;
    case 'norm_x': {
      const [min, value, max] = n as [number, number, number];
      if (max === min) return 0;
      return (value - min) / (max - min);
    }
    case 'scale_x': {
      const [min, value, max] = n as [number, number, number];
      const out = value * (max - min) + min;
      return isIntegerType(ins.t) ? saturate(ins.t, roundHalfEven(out)) : out;
    }
  }
}
