import type { Area } from './address';
import type { DataType, Value } from './types';

/**
 * Zwischenrepräsentation (IR): eine lineare, typisierte Befehlsliste pro Baustein.
 * FUP und SCL werden beide hierher übersetzt; simuliert wird ausschließlich die IR.
 */

export type Operand =
  | { k: 'const'; t: DataType; v: Value }
  /** Prozessabbild bzw. Merker. Bei BOOL ist `bit` relevant. */
  | { k: 'io'; area: Area; t: DataType; byte: number; bit: number }
  /** Variable aus Global-DB, Instanz-DB (statisch) oder TEMP. */
  | { k: 'slot'; i: number }
  /** Ausgang einer FB-Instanz (z. B. TON.Q, CTU.CV); nur lesbar. */
  | { k: 'inst'; i: number; f: InstanceField };

export type InstanceKind =
  'TP' | 'TON' | 'TOF' | 'TONR' | 'CTU' | 'CTD' | 'CTUD' | 'R_TRIG' | 'F_TRIG';

export type InstanceField = 'Q' | 'ET' | 'CV' | 'QU' | 'QD';

export const TIMER_KINDS: readonly InstanceKind[] = ['TP', 'TON', 'TOF', 'TONR'];
export const COUNTER_KINDS: readonly InstanceKind[] = ['CTU', 'CTD', 'CTUD'];
export const TRIG_KINDS: readonly InstanceKind[] = ['R_TRIG', 'F_TRIG'];

export const INSTANCE_FIELDS: Record<InstanceKind, Partial<Record<InstanceField, DataType>>> = {
  TP: { Q: 'BOOL', ET: 'TIME' },
  TON: { Q: 'BOOL', ET: 'TIME' },
  TOF: { Q: 'BOOL', ET: 'TIME' },
  TONR: { Q: 'BOOL', ET: 'TIME' },
  // QU/QD auch bei CTU/CTD lesbar (IEC_COUNTER-Instanz-DB), das jeweils andere bleibt FALSE
  CTU: { Q: 'BOOL', QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  CTD: { Q: 'BOOL', QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  CTUD: { QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  R_TRIG: { Q: 'BOOL' },
  F_TRIG: { Q: 'BOOL' },
};

export type UnaryFn = 'not' | 'neg' | 'abs';
export type BinaryFn = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'and' | 'or' | 'xor' | 'shl' | 'shr';
export type CompareFn = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';
export type CallFn =
  'limit' | 'min' | 'max' | 'sel' | 'in_range' | 'out_range' | 'norm_x' | 'scale_x';

export type Instr =
  | { op: 'mov'; dst: Operand; src: Operand }
  /** Typkonvertierung von typeOf(src) nach typeOf(dst). `mode` gilt für REAL → Ganzzahl. */
  | { op: 'conv'; dst: Operand; src: Operand; mode: 'round' | 'trunc' }
  | { op: 'un'; fn: UnaryFn; t: DataType; dst: Operand; a: Operand }
  | { op: 'bin'; fn: BinaryFn; t: DataType; dst: Operand; a: Operand; b: Operand }
  | { op: 'cmp'; fn: CompareFn; t: DataType; dst: Operand; a: Operand; b: Operand }
  /**
   * Funktionen. `t` ist der Typ der Werteingänge:
   * limit [MN, IN, MX], min/max [IN1, IN2, ...], sel [G, IN0, IN1],
   * in_range/out_range [MIN, VAL, MAX], norm_x [MIN, VALUE, MAX] → REAL,
   * scale_x [MIN, VALUE:REAL, MAX] → t.
   */
  | { op: 'fn'; fn: CallFn; t: DataType; dst: Operand; args: Operand[] }
  /** MUX: K wählt einen Eingang; ohne `alt` bleibt dst bei ungültigem K unverändert. */
  | { op: 'mux'; t: DataType; dst: Operand; k: Operand; ins: Operand[]; alt?: Operand }
  | { op: 'set'; dst: Operand; cond: Operand }
  | { op: 'reset'; dst: Operand; cond: Operand }
  /** Speicherbox mit Merker `q`. SR: Rücksetzen dominant, RS: Setzen dominant. */
  | { op: 'sr'; kind: 'SR' | 'RS'; s: Operand; r: Operand; q: Operand; out?: Operand }
  /** P_TRIG / N_TRIG mit Flankenmerker `mem`. */
  | { op: 'edge'; kind: 'P' | 'N'; clk: Operand; mem: Operand; out: Operand }
  | { op: 'trig'; i: number; clk: Operand }
  | { op: 'tmr'; i: number; in: Operand; pt: Operand; r?: Operand }
  | {
      op: 'ctr';
      i: number;
      cu?: Operand;
      cd?: Operand;
      r?: Operand;
      ld?: Operand;
      pv: Operand;
    }
  | { op: 'jmp'; to: number }
  /** Springe, wenn cond FALSE ist. */
  | { op: 'jz'; cond: Operand; to: number }
  /** Springe, wenn cond TRUE ist. */
  | { op: 'jnz'; cond: Operand; to: number };

export type OpCode = Instr['op'];

export interface SlotDecl {
  name: string;
  t: DataType;
  init: Value;
  /** TEMP-Variablen werden zu Beginn jedes OB-Durchlaufs auf `init` gesetzt. */
  temp?: boolean;
}

export interface InstanceDecl {
  name: string;
  kind: InstanceKind;
}

export interface IrProgram {
  slots: SlotDecl[];
  instances: InstanceDecl[];
  code: Instr[];
}
