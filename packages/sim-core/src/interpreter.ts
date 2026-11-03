import type { Area } from './address';
import { evalCounter, evalTimer, evalTrig, type InstanceState } from './instances';
import { COMM_STATUS, ERR_READ, ERR_WRITE, type Instr, type IrProgram, type Operand } from './ir';
import type { ByteArea } from './memory';
import { energyOf } from './metrics/weights';
import {
  LONG_MAX,
  STRING_DEFAULT_LEN,
  bitWidth,
  defaultValue,
  isIntegerType,
  isRealType,
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
  /** Werte der Messpunkte (`IrProgram.probes`) */
  probes?: Value[];
  /**
   * Programmierfehler nicht abbrechen (OB121 vorhanden oder lokale Fehlerbehandlung): Fehler
   * melden, Lesen liefert 0, Schreiben entfällt
   */
  onError?: (id: number, message: string) => void;
  /** Rechenzeit je Befehl in ms (für RUNTIME) */
  opTimeMs?: number;
  /** Kommunikation mit anderen CPUs (TSEND_C/TRCV_C); ohne: keine Verbindung */
  comm?: CommPort;
  /** Program_Alarm: Meldung kommt (`coming`) bzw. geht */
  alarm?: (inst: number, text: string, coming: boolean) => void;
}

/** Sende- und Empfangsfächer einer CPU, bedient von der Umgebung */
export interface CommPort {
  /** Auftrag einstellen; false: keine Verbindung mit dieser ID */
  send(inst: number, id: number, values: Value[], types: DataType[]): boolean;
  /** Stand eines Sendeauftrags; error: Partner nicht erreichbar */
  sendState(inst: number): 'busy' | 'done' | 'error' | undefined;
  /** angekommene Nachricht für diese Verbindung abholen */
  receive(id: number): { values: Value[]; types: DataType[] } | undefined;
  /** PUT/GET: Auftrag an die Partner-CPU; false: keine Verbindung */
  request(
    inst: number,
    id: number,
    mode: 'put' | 'get',
    remote: { area: 'M'; byte: number; bit: number; t: DataType },
    values: Value[],
  ): boolean;
  /** Stand eines PUT/GET-Auftrags; bei GET mit dem gelesenen Wert */
  result(inst: number): 'busy' | 'error' | { values: Value[] } | undefined;
}

export type ExecResult =
  | { ok: true; ops: number; energy: number }
  | { ok: false; ops: number; energy: number; reason: 'CYCLE_OVERRUN' }
  /** Programmierfehler, z. B. Feldindex außerhalb der Grenzen (wie OB121 fehlt → STOP) */
  | { ok: false; ops: number; energy: number; reason: 'PROGRAM_ERROR'; message: string };

/** Programmierfehler während der Ausführung (bricht den Baustein ab) */
class ProgramError extends Error {}

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
      case 'islot': {
        const i = elementSlot(o, ERR_READ);
        return i < 0 ? defaultValue(program.slots[o.base + o.off]!.t) : slots[i]!;
      }
    }
  };
  /** letzter Programmierfehler in diesem Durchlauf (GET_ERR_ID) */
  let errorId = 0;
  const fault = (id: number, message: string): void => {
    if (!ctx.onError) throw new ProgramError(message);
    errorId = id;
    ctx.onError(id, message);
  };
  /** Slot eines Feldelements mit variablem Index; -1 bei Fehler mit Fehlerbehandlung */
  const elementSlot = (o: Extract<Operand, { k: 'islot' }>, id: number): number => {
    const i = read(o.idx) as number;
    if (i < 0 || i >= o.len) {
      fault(id, `Feldindex außerhalb (0…${o.len - 1})`);
      return -1;
    }
    return o.base + o.off + i * o.stride;
  };
  const num = (o: Operand) => read(o) as number;
  const bool = (o: Operand) => read(o) as boolean;

  const store = (i: number, v: Value): void => {
    const d = program.slots[i]!;
    const n = normalize(d.t, v);
    slots[i] = d.t === 'STRING' ? (n as string).slice(0, d.len ?? STRING_DEFAULT_LEN) : n;
  };
  const write = (o: Operand, v: Value): void => {
    if (o.k === 'io') areas[o.area].write(o.t, o.byte, o.bit, v);
    else if (o.k === 'slot') store(o.i, v);
    else if (o.k === 'islot') {
      const i = elementSlot(o, ERR_WRITE);
      if (i >= 0) store(i, v);
    } else throw new Error('Operand nicht beschreibbar');
  };

  try {
    while (pc < end) {
      if (ops >= ctx.budget) return { ok: false, ops, energy, reason: 'CYCLE_OVERRUN' };
      const ins = code[pc]!;
      if (ins.op === 'probe') {
        // Messpunkt: außerhalb von Befehlszähler und Energie
        pc++;
        if (ctx.probes) {
          ctx.probes[ins.i] = ins.src ? read(ins.src) : ((ctx.probes[ins.i] as number) ?? 0) + 1;
        }
        continue;
      }
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
        case 'clock':
          dtl(ctx.now).forEach((v, n) => write(ins.dst[n]!, v));
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
        case 'alarm': {
          const s = instances[ins.i]!;
          const sig = bool(ins.sig);
          if (sig !== s.m1) {
            ctx.alarm?.(ins.i, String(read(ins.text)), sig);
            // kommende Meldung muss quittiert werden
            if (sig) s.Ack_State = false;
          }
          s.m1 = sig;
          break;
        }
        case 'comm': {
          const s = instances[ins.i]!;
          const en = bool(ins.en);
          const id = num(ins.id);
          if (ins.kind === 'put' || ins.kind === 'get') {
            if (ins.kind === 'put') s.DONE = false;
            else s.NDR = false;
            if (s.BUSY) {
              const r = ctx.comm?.result(ins.i);
              if (r === 'error') {
                s.BUSY = false;
                s.ERROR = true;
                s.STATUS = COMM_STATUS.TIMEOUT;
              } else if (r !== 'busy') {
                s.BUSY = false;
                s.STATUS = COMM_STATUS.DONE;
                if (ins.kind === 'put') s.DONE = true;
                else {
                  if (r) write(ins.data[0]!, r.values[0]!);
                  s.NDR = true;
                }
              }
            } else if (en && !s.m1) {
              const values = ins.kind === 'put' ? [read(ins.data[0]!)] : [];
              if (ctx.comm?.request(ins.i, id, ins.kind, ins.remote!, values)) {
                s.BUSY = true;
                s.ERROR = false;
                s.STATUS = COMM_STATUS.SENDING;
              } else {
                s.ERROR = true;
                s.STATUS = COMM_STATUS.NO_PARTNER;
              }
            } else if (!s.ERROR) {
              s.STATUS = COMM_STATUS.IDLE;
            }
            s.m1 = en;
          } else if (ins.kind === 'send') {
            s.DONE = false;
            if (s.BUSY) {
              const st = ctx.comm?.sendState(ins.i);
              if (st === 'error') {
                s.BUSY = false;
                s.ERROR = true;
                s.STATUS = COMM_STATUS.TIMEOUT;
              } else if (st !== 'busy') {
                s.BUSY = false;
                s.DONE = true;
                s.STATUS = COMM_STATUS.DONE;
              }
            } else if (en && !s.m1) {
              const values = ins.data.map(read);
              if (ctx.comm?.send(ins.i, id, values, ins.types)) {
                s.BUSY = true;
                s.ERROR = false;
                s.STATUS = COMM_STATUS.SENDING;
              } else {
                s.ERROR = true;
                s.STATUS = COMM_STATUS.NO_PARTNER;
              }
            } else if (!s.ERROR) {
              s.STATUS = COMM_STATUS.IDLE;
            }
            s.m1 = en;
          } else {
            s.NDR = false;
            if (!en) {
              s.BUSY = false;
              s.STATUS = COMM_STATUS.IDLE;
            } else {
              const msg = ctx.comm?.receive(id);
              s.BUSY = true;
              if (!msg) {
                if (!s.ERROR) s.STATUS = COMM_STATUS.WAITING;
              } else if (
                msg.types.length !== ins.types.length ||
                msg.types.some((t, n) => t !== ins.types[n])
              ) {
                s.ERROR = true;
                s.STATUS = COMM_STATUS.LENGTH;
              } else {
                msg.values.forEach((v, n) => write(ins.data[n]!, v));
                s.NDR = true;
                s.ERROR = false;
                s.STATUS = COMM_STATUS.DONE;
              }
            }
          }
          break;
        }
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
        case 'chk': {
          const a = num(ins.a);
          if (a < ins.lo || a > ins.hi) {
            const message = `${ins.msg}: Index ${a} außerhalb ${ins.lo}…${ins.hi}`;
            if (!ctx.onError) throw new ProgramError(message);
            // mit Fehlerbehandlung: ungültiger Index, der folgende Zugriff meldet den Fehler
            write(ins.dst, -100_000);
            break;
          }
          write(ins.dst, a - ins.lo);
          break;
        }
        case 'errid':
          write(ins.dst, errorId);
          break;
        case 'runtime': {
          const t = ctx.now + ops * (ctx.opTimeMs ?? 0);
          const last = num(ins.mem);
          write(ins.dst, last ? (t - last) / 1000 : 0);
          write(ins.mem, t || 1e-9);
          break;
        }
      }
    }
  } catch (e) {
    if (e instanceof ProgramError)
      return { ok: false, ops, energy, reason: 'PROGRAM_ERROR', message: e.message };
    throw e;
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
  if (to === 'STRING') return toText(v, from);
  if (to === 'CHAR') {
    if (typeof v === 'string') return v.charAt(0) || ' ';
    return String.fromCharCode(saturate('BYTE', typeof v === 'boolean' ? +v : v));
  }
  if (typeof v === 'string') {
    // Zeichen → Code, Zeichenkette → Zahl (ungültig: 0)
    if (from === 'CHAR') return convert(v.charCodeAt(0), 'USINT', to, mode);
    const parsed = Number(v.trim().replace(',', '.'));
    if (to === 'BOOL') return v.trim().toUpperCase() === 'TRUE' || parsed === 1;
    return convert(Number.isFinite(parsed) ? parsed : 0, 'LREAL', to, mode);
  }
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  if (to === 'BOOL') return n !== 0;
  if (to === 'REAL') return Math.fround(n);
  if (to === 'LREAL') return n;
  if (isRealType(from)) {
    if (!Number.isFinite(n)) return 0;
    const i = mode === 'trunc' ? Math.trunc(n) : roundHalfEven(n);
    return saturate(to, i);
  }
  if (sameBitPattern(from, to)) return normalize(to, n);
  return saturate(to, n);
}

/**
 * Text eines Werts (X_TO_STRING). **Spielregel:** Zahlen ohne Vorzeichen-Platzhalter,
 * Gleitkomma mit höchstens 7 (LReal 15) signifikanten Stellen.
 */
function toText(v: Value, from: DataType): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (from === 'REAL' || from === 'LREAL') {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
    return String(Number(v.toPrecision(from === 'REAL' ? 7 : 15)));
  }
  return String(v);
}

/** Spielzeit 0 = Montag, 5. Januar 2026, 06:00:00 */
export const CLOCK_EPOCH = Date.UTC(2026, 0, 5, 6, 0, 0);

/** DTL zu einer Spielzeit in ms: Jahr, Monat, Tag, Wochentag (1 = Sonntag), h, min, s, ns */
export function dtl(now: number): number[] {
  const d = new Date(CLOCK_EPOCH + now);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCDay() + 1,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds() * 1_000_000,
  ];
}

/** Typpaare gleicher Breite, bei denen das Bitmuster übernommen wird. */
function sameBitPattern(a: DataType, b: DataType): boolean {
  const pair = (x: DataType, y: DataType) => (a === x && b === y) || (a === y && b === x);
  return (
    pair('INT', 'WORD') ||
    pair('DINT', 'DWORD') ||
    pair('TIME', 'DWORD') ||
    pair('SINT', 'BYTE') ||
    pair('USINT', 'BYTE') ||
    pair('UINT', 'WORD') ||
    pair('UDINT', 'DWORD')
  );
}

function unary(fn: 'not' | 'neg' | 'abs', t: DataType, a: Value): Value {
  switch (fn) {
    case 'not':
      // normalize beim Schreiben schneidet auf die Breite des Typs zu
      if (t === 'BOOL') return !a;
      // LWORD: 53 bit im Spiel
      return bitWidth(t) === 64 ? LONG_MAX - (a as number) : ~(a as number);
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
  const wide = bitWidth(t) === 64;
  const big = (f: (x: bigint, y: bigint) => bigint) => Number(f(BigInt(a), BigInt(b)));
  switch (fn) {
    case 'add':
      return a + b;
    case 'sub':
      return a - b;
    case 'mul':
      // Math.imul liefert exakt die unteren 32 bit (Überlauf wie bei DINT)
      return int && !wide ? Math.imul(a, b) : a * b;
    case 'div':
      if (!int) return a / b;
      return b === 0 ? 0 : Math.trunc(a / b);
    case 'mod':
      return b === 0 ? 0 : a % b;
    case 'and':
      return wide ? big((x, y) => x & y) : a & b;
    case 'or':
      return wide ? big((x, y) => x | y) : a | b;
    case 'xor':
      return wide ? big((x, y) => x ^ y) : a ^ b;
    case 'shl':
      // a · 2^b ist exakt; normalize schneidet auf die Typbreite zu
      return b <= 0 ? a : b >= bitWidth(t) ? 0 : a * 2 ** b;
    case 'shr':
      if (b <= 0) return a;
      if (b >= bitWidth(t)) return 0;
      return wide ? Math.floor(a / 2 ** b) : a >>> b;
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

/** Zeichenposition P (1-basiert) in einen Index umrechnen; außerhalb: undefined */
function pos(p: number, s: string): number | undefined {
  return p >= 1 && p <= s.length ? p - 1 : undefined;
}

function call(ins: Extract<Instr, { op: 'fn' }>, args: Value[]): Value {
  const n = args as number[];
  const s = args as string[];
  const k = (i: number) => Math.max(0, Math.trunc(n[i]!));
  switch (ins.fn) {
    case 'len':
      return s[0]!.length;
    case 'concat':
      return s.join('');
    case 'left':
      return s[0]!.slice(0, k(1));
    case 'right':
      return k(1) === 0 ? '' : s[0]!.slice(-k(1));
    case 'mid': {
      const p = pos(n[2]!, s[0]!);
      return p === undefined ? '' : s[0]!.slice(p, p + k(1));
    }
    case 'find': {
      const i = s[0]!.indexOf(s[1]!);
      return s[1]!.length === 0 ? 0 : i + 1;
    }
    case 'delete': {
      const p = pos(n[2]!, s[0]!);
      return p === undefined ? s[0]! : s[0]!.slice(0, p) + s[0]!.slice(p + k(1));
    }
    case 'insert': {
      const p = Math.min(Math.max(0, Math.trunc(n[2]!)), s[0]!.length);
      return s[0]!.slice(0, p) + s[1]! + s[0]!.slice(p);
    }
    case 'replace': {
      const p = pos(n[3]!, s[0]!);
      return p === undefined ? s[0]! : s[0]!.slice(0, p) + s[1]! + s[0]!.slice(p + k(2));
    }
    case 'swap': {
      const bytes = bitWidth(ins.t) / 8;
      let x = BigInt(n[0]!);
      let out = 0n;
      for (let b = 0; b < bytes; b++) {
        out = (out << 8n) | (x & 0xffn);
        x >>= 8n;
      }
      return Number(out);
    }
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
