import type { Area } from './address';
import {
  COUNTER_KINDS,
  INSTANCE_FIELDS,
  TIMER_KINDS,
  TRIG_KINDS,
  type InstanceKind,
  type Instr,
  type IrProgram,
  type Operand,
} from './ir';
import {
  DATA_TYPES,
  isArithmeticType,
  isBitStringType,
  isBitwiseType,
  isRealType,
  type DataType,
} from './types';
import { ByteArea } from './memory';

export class IrValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Ungültiges IR-Programm:\n${errors.join('\n')}`);
  }
}

export interface ValidateOptions {
  areaSizes: Record<Area, number>;
}

/** Typ eines Operanden im Kontext eines Programms (undefined bei ungültiger Referenz). */
export function typeOf(p: IrProgram, o: Operand): DataType | undefined {
  switch (o.k) {
    case 'const':
    case 'io':
      return o.t;
    case 'slot':
      return p.slots[o.i]?.t;
    case 'inst': {
      const decl = p.instances[o.i];
      return decl ? INSTANCE_FIELDS[decl.kind][o.f] : undefined;
    }
    case 'islot':
      return p.slots[o.base + o.off]?.t;
  }
}

/** Prüft ein IR-Programm statisch. Gibt alle Fehler zurück (leer = gültig). */
export function validateProgram(p: IrProgram, opts: ValidateOptions): string[] {
  const errors: string[] = [];
  const probes: Record<Area, ByteArea> = {
    I: new ByteArea('I', opts.areaSizes.I),
    Q: new ByteArea('Q', opts.areaSizes.Q),
    M: new ByteArea('M', opts.areaSizes.M),
  };

  const names = new Set<string>();
  p.slots.forEach((s) => {
    const key = s.name.toLowerCase();
    if (names.has(key)) errors.push(`Variable „${s.name}“ ist doppelt deklariert`);
    names.add(key);
  });

  p.code.forEach((ins, pc) => {
    const err = (msg: string) => errors.push(`Befehl ${pc} (${ins.op}): ${msg}`);

    const operand = (o: Operand | undefined, what: string, expect?: DataType | DataType[]) => {
      if (!o) {
        err(`${what} fehlt`);
        return undefined;
      }
      const t = typeOf(p, o);
      if (!t) {
        err(`${what}: ungültige Referenz`);
        return undefined;
      }
      if (o.k === 'io' && !probes[o.area].fits(o.t, o.byte)) {
        err(`${what}: Adresse außerhalb des Bereichs ${o.area}`);
      }
      if (o.k === 'io' && (o.bit < 0 || o.bit > 7)) err(`${what}: Bitnummer ${o.bit} ungültig`);
      if (o.k === 'islot') {
        const last = o.base + o.off + (o.len - 1) * o.stride;
        if (o.len < 1 || o.stride < 1 || last >= p.slots.length)
          err(`${what}: Feld außerhalb der Variablen`);
        // dazwischen können andere Elemente liegen, wenn der Compiler mehrere Indizes
        // zusammenfasst (Feld in Struktur in Feld); erstes und letztes Element gehören sicher dazu
        if (p.slots[o.base + o.off]?.t !== t || p.slots[last]?.t !== t) {
          err(`${what}: Feldelemente haben unterschiedliche Typen`);
        }
        operand(o.idx, `${what}: Index`, ['INT', 'DINT']);
      }
      if (expect) {
        const list = Array.isArray(expect) ? expect : [expect];
        if (!list.includes(t)) err(`${what} hat Typ ${t}, erwartet ${list.join('/')}`);
      }
      return t;
    };

    const target = (o: Operand, what: string, expect?: DataType | DataType[]) => {
      if (o.k === 'const' || o.k === 'inst') err(`${what} ist nicht beschreibbar`);
      return operand(o, what, expect);
    };

    const instance = (i: number, kinds: readonly InstanceKind[]): InstanceKind | undefined => {
      const decl = p.instances[i];
      if (!decl) {
        err(`Instanz ${i} existiert nicht`);
        return undefined;
      }
      if (!kinds.includes(decl.kind)) err(`Instanz „${decl.name}“ (${decl.kind}) passt nicht`);
      return decl.kind;
    };

    const jump = (to: number) => {
      if (!Number.isInteger(to) || to < 0 || to > p.code.length) err(`Sprungziel ${to} ungültig`);
    };

    switch (ins.op) {
      case 'mov': {
        const s = operand(ins.src, 'Quelle');
        if (s) target(ins.dst, 'Ziel', s);
        break;
      }
      case 'conv':
        operand(ins.src, 'Quelle');
        target(ins.dst, 'Ziel');
        break;
      case 'un':
        if (ins.fn === 'not' && !isBitwiseType(ins.t)) err(`NOT nicht auf ${ins.t}`);
        if (ins.fn !== 'not' && !isArithmeticType(ins.t)) err(`${ins.fn} nicht auf ${ins.t}`);
        operand(ins.a, 'Operand', ins.t);
        target(ins.dst, 'Ziel', ins.t);
        break;
      case 'bin':
        switch (ins.fn) {
          case 'and':
          case 'or':
          case 'xor':
            if (!isBitwiseType(ins.t)) err(`${ins.fn} nicht auf ${ins.t}`);
            break;
          case 'shl':
          case 'shr':
            if (!isBitStringType(ins.t)) err(`${ins.fn} nur auf BYTE/WORD/DWORD/LWORD`);
            break;
          case 'mod':
            if (!isArithmeticType(ins.t) || isRealType(ins.t)) err(`MOD nicht auf ${ins.t}`);
            break;
          default:
            if (!isArithmeticType(ins.t)) err(`${ins.fn} nicht auf ${ins.t}`);
        }
        operand(ins.a, 'Operand A', ins.t);
        operand(ins.b, 'Operand B', ins.fn === 'shl' || ins.fn === 'shr' ? 'INT' : ins.t);
        target(ins.dst, 'Ziel', ins.t);
        break;
      case 'cmp':
        if (ins.t === 'BOOL' && ins.fn !== 'eq' && ins.fn !== 'ne') err(`${ins.fn} nicht auf BOOL`);
        operand(ins.a, 'Operand A', ins.t);
        operand(ins.b, 'Operand B', ins.t);
        target(ins.dst, 'Ziel', 'BOOL');
        break;
      case 'fn':
        validateCall(ins, operand, target, err);
        break;
      case 'mux':
        operand(ins.k, 'K', 'INT');
        if (ins.ins.length < 2) err('MUX braucht mindestens 2 Eingänge');
        ins.ins.forEach((o, n) => operand(o, `IN${n}`, ins.t));
        if (ins.alt) operand(ins.alt, 'ELSE', ins.t);
        target(ins.dst, 'Ziel', ins.t);
        break;
      case 'set':
      case 'reset':
        operand(ins.cond, 'Bedingung', 'BOOL');
        target(ins.dst, 'Ziel', 'BOOL');
        break;
      case 'sr':
        operand(ins.s, 'S', 'BOOL');
        operand(ins.r, 'R', 'BOOL');
        target(ins.q, 'Speicher', 'BOOL');
        if (ins.out) target(ins.out, 'Q', 'BOOL');
        break;
      case 'edge':
        operand(ins.clk, 'CLK', 'BOOL');
        target(ins.mem, 'Flankenmerker', 'BOOL');
        target(ins.out, 'Q', 'BOOL');
        break;
      case 'trig':
        instance(ins.i, TRIG_KINDS);
        operand(ins.clk, 'CLK', 'BOOL');
        break;
      case 'tmr': {
        const kind = instance(ins.i, TIMER_KINDS);
        operand(ins.in, 'IN', 'BOOL');
        operand(ins.pt, 'PT', 'TIME');
        if (ins.r && kind !== 'TONR') err('R gibt es nur bei TONR');
        if (ins.r) operand(ins.r, 'R', 'BOOL');
        break;
      }
      case 'ctr': {
        const kind = instance(ins.i, COUNTER_KINDS);
        operand(ins.pv, 'PV', 'INT');
        const needs = {
          CTU: ['cu'],
          CTD: ['cd'],
          CTUD: ['cu', 'cd'],
        } as const;
        const allowed = {
          CTU: ['cu', 'r'],
          CTD: ['cd', 'ld'],
          CTUD: ['cu', 'cd', 'r', 'ld'],
        } as const;
        if (kind === 'CTU' || kind === 'CTD' || kind === 'CTUD') {
          for (const pin of needs[kind]) if (!ins[pin]) err(`${pin.toUpperCase()} fehlt`);
          for (const pin of ['cu', 'cd', 'r', 'ld'] as const) {
            if (!ins[pin]) continue;
            if (!(allowed[kind] as readonly string[]).includes(pin)) {
              err(`${pin.toUpperCase()} gibt es nicht bei ${kind}`);
            }
            operand(ins[pin], pin.toUpperCase(), 'BOOL');
          }
        }
        break;
      }
      case 'jmp':
        jump(ins.to);
        break;
      case 'clock': {
        const dtl: DataType[] = [
          'UINT',
          'USINT',
          'USINT',
          'USINT',
          'USINT',
          'USINT',
          'USINT',
          'UDINT',
        ];
        if (ins.dst.length !== 8) err('RD_SYS_T braucht 8 Ziele (DTL)');
        ins.dst.forEach((d, n) => target(d, `DTL-Element ${n + 1}`, dtl[n]));
        break;
      }
      case 'chk':
        operand(ins.a, 'Index', ['INT', 'DINT']);
        target(ins.dst, 'Ziel', 'DINT');
        if (!(ins.lo <= ins.hi)) err(`Indexbereich ${ins.lo}..${ins.hi} ungültig`);
        break;
      case 'jz':
      case 'jnz':
        operand(ins.cond, 'Bedingung', 'BOOL');
        jump(ins.to);
        break;
      default: {
        const never: never = ins;
        err(`Unbekannter Befehl ${(never as Instr).op}`);
      }
    }
  });
  const n = p.code.length;
  if (p.mainEnd !== undefined && !(p.mainEnd >= 0 && p.mainEnd <= n))
    errors.push('mainEnd ungültig');
  for (const t of p.tasks ?? []) {
    if (!(t.start >= 0 && t.start <= t.end && t.end <= n))
      errors.push(`Alarm-OB ${t.name}: Codebereich ungültig`);
    if (t.kind === 'cyclic' && !(t.intervalMs! >= 1))
      errors.push(`Weckalarm ${t.name}: Takt fehlt`);
    if (t.kind === 'process' && (!t.input || !probes.I.fits('BOOL', t.input.byte))) {
      errors.push(`Prozessalarm ${t.name}: Eingang ungültig`);
    }
  }
  return errors;
}

function validateCall(
  ins: Extract<Instr, { op: 'fn' }>,
  operand: (
    o: Operand | undefined,
    what: string,
    expect?: DataType | DataType[],
  ) => DataType | undefined,
  target: (o: Operand, what: string, expect?: DataType | DataType[]) => DataType | undefined,
  err: (msg: string) => void,
): void {
  const { args, t } = ins;
  const count = (n: number) => {
    if (args.length !== n) err(`${ins.fn.toUpperCase()} braucht ${n} Argumente`);
  };
  const numeric: DataType[] = DATA_TYPES.filter((x) => x !== 'BOOL' && x !== 'STRING');
  const ints: DataType[] = ['INT', 'DINT', 'SINT', 'USINT', 'UINT', 'UDINT', 'LINT', 'ULINT'];
  switch (ins.fn) {
    case 'len':
      count(1);
      operand(args[0], 'IN', 'STRING');
      target(ins.dst, 'Ziel', 'INT');
      break;
    case 'concat':
      if (args.length < 2) err('CONCAT braucht mindestens 2 Argumente');
      args.forEach((a, n) => operand(a, `IN${n + 1}`, 'STRING'));
      target(ins.dst, 'Ziel', 'STRING');
      break;
    case 'left':
    case 'right':
    case 'mid':
    case 'delete':
      count(ins.fn === 'left' || ins.fn === 'right' ? 2 : 3);
      operand(args[0], 'IN', 'STRING');
      args.slice(1).forEach((a, n) => operand(a, n === 0 ? 'L' : 'P', ints));
      target(ins.dst, 'Ziel', 'STRING');
      break;
    case 'find':
      count(2);
      operand(args[0], 'IN1', 'STRING');
      operand(args[1], 'IN2', 'STRING');
      target(ins.dst, 'Ziel', 'INT');
      break;
    case 'insert':
      count(3);
      operand(args[0], 'IN1', 'STRING');
      operand(args[1], 'IN2', 'STRING');
      operand(args[2], 'P', ints);
      target(ins.dst, 'Ziel', 'STRING');
      break;
    case 'replace':
      count(4);
      operand(args[0], 'IN1', 'STRING');
      operand(args[1], 'IN2', 'STRING');
      operand(args[2], 'L', ints);
      operand(args[3], 'P', ints);
      target(ins.dst, 'Ziel', 'STRING');
      break;
    case 'swap':
      count(1);
      if (!isBitStringType(t) || t === 'BYTE') err(`SWAP nicht auf ${t}`);
      operand(args[0], 'IN', t);
      target(ins.dst, 'Ziel', t);
      break;
    case 'limit':
    case 'in_range':
    case 'out_range':
      count(3);
      if (!numeric.includes(t)) err(`${ins.fn.toUpperCase()} nicht auf ${t}`);
      args.forEach((a, n) => operand(a, `Argument ${n + 1}`, t));
      target(ins.dst, 'Ziel', ins.fn === 'limit' ? t : 'BOOL');
      break;
    case 'min':
    case 'max':
      if (args.length < 2) err(`${ins.fn.toUpperCase()} braucht mindestens 2 Argumente`);
      if (!numeric.includes(t)) err(`${ins.fn.toUpperCase()} nicht auf ${t}`);
      args.forEach((a, n) => operand(a, `IN${n + 1}`, t));
      target(ins.dst, 'Ziel', t);
      break;
    case 'sel':
      count(3);
      operand(args[0], 'G', 'BOOL');
      operand(args[1], 'IN0', t);
      operand(args[2], 'IN1', t);
      target(ins.dst, 'Ziel', t);
      break;
    case 'norm_x':
      count(3);
      if (!isArithmeticType(t)) err(`NORM_X nicht auf ${t}`);
      args.forEach((a, n) => operand(a, `Argument ${n + 1}`, t));
      target(ins.dst, 'Ziel', 'REAL');
      break;
    case 'scale_x':
      count(3);
      if (!isArithmeticType(t)) err(`SCALE_X nicht auf ${t}`);
      operand(args[0], 'MIN', t);
      operand(args[1], 'VALUE', 'REAL');
      operand(args[2], 'MAX', t);
      target(ins.dst, 'Ziel', t);
      break;
  }
}
