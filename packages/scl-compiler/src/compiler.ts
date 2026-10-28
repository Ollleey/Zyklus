import {
  AddressError,
  ByteArea,
  INSTANCE_FIELDS,
  ProgramBuilder,
  c as constOf,
  integerRange,
  io,
  isArithmeticType,
  normalize,
  parseAddress,
  validateProgram,
  type Area,
  type CallFn,
  type DataType,
  type InstanceKind,
  type Instr,
  type IrProgram,
  type Operand,
  type TagTable,
  type Value,
} from '@zyklus/sim-core';
import type { Arg, BinaryOp, Decl, Expr, FbArg, LiteralType, Ref, Stmt } from './ast';
import { SclError, type Diagnostic, type Span } from './diagnostics';
import { parse } from './parser';

export interface GlobalDb {
  name: string;
  vars: { name: string; t: DataType; init?: Value }[];
}

export interface CompileOptions {
  /** PLC-Variablentabelle der CPU */
  tags?: TagTable;
  /** globaler Datenbaustein der CPU, ansprechbar als "Name".variable */
  globalDb?: GlobalDb;
  /** Größe der Speicherbereiche (Standard wie Cpu: 128/128/256 Byte) */
  areaSizes?: Record<Area, number>;
}

export interface CompileResult {
  ok: boolean;
  program?: IrProgram;
  diagnostics: Diagnostic[];
  /** Programmgröße: Anzahl Anweisungen (nicht Zeilen) */
  statementCount: number;
}

const DEFAULT_AREAS: Record<Area, number> = { I: 128, Q: 128, M: 256 };
const ELEMENTARY: Record<string, DataType> = {
  BOOL: 'BOOL',
  INT: 'INT',
  DINT: 'DINT',
  REAL: 'REAL',
  WORD: 'WORD',
  TIME: 'TIME',
};

type FbKind = InstanceKind | 'SR' | 'RS';

const FB_TYPES: Record<string, FbKind> = {
  TP: 'TP',
  TON: 'TON',
  TOF: 'TOF',
  TONR: 'TONR',
  TP_TIME: 'TP',
  TON_TIME: 'TON',
  TOF_TIME: 'TOF',
  TONR_TIME: 'TONR',
  CTU: 'CTU',
  CTD: 'CTD',
  CTUD: 'CTUD',
  CTU_INT: 'CTU',
  CTD_INT: 'CTD',
  CTUD_INT: 'CTUD',
  R_TRIG: 'R_TRIG',
  F_TRIG: 'F_TRIG',
  SR: 'SR',
  RS: 'RS',
};

/** Ein- und Ausgänge der FBs: [Name, Typ, Pflicht] */
const FB_INPUTS: Record<FbKind, [string, DataType, boolean][]> = {
  TP: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TON: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TOF: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TONR: [
    ['IN', 'BOOL', true],
    ['R', 'BOOL', false],
    ['PT', 'TIME', true],
  ],
  CTU: [
    ['CU', 'BOOL', true],
    ['R', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  CTD: [
    ['CD', 'BOOL', true],
    ['LD', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  CTUD: [
    ['CU', 'BOOL', true],
    ['CD', 'BOOL', true],
    ['R', 'BOOL', false],
    ['LD', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  R_TRIG: [['CLK', 'BOOL', true]],
  F_TRIG: [['CLK', 'BOOL', true]],
  SR: [
    ['S1', 'BOOL', true],
    ['R', 'BOOL', true],
  ],
  RS: [
    ['S', 'BOOL', true],
    ['R1', 'BOOL', true],
  ],
};

function fbOutputs(kind: FbKind): Record<string, DataType> {
  if (kind === 'SR' || kind === 'RS') return { Q1: 'BOOL' };
  return INSTANCE_FIELDS[kind] as Record<string, DataType>;
}

const FUNCTIONS: Record<string, { params: string[]; variadic?: boolean }> = {
  ABS: { params: ['IN'] },
  LIMIT: { params: ['MN', 'IN', 'MX'] },
  MIN: { params: ['IN1', 'IN2'], variadic: true },
  MAX: { params: ['IN1', 'IN2'], variadic: true },
  SEL: { params: ['G', 'IN0', 'IN1'] },
  MUX: { params: ['K', 'IN0', 'IN1'], variadic: true },
  NORM_X: { params: ['MIN', 'VALUE', 'MAX'] },
  SCALE_X: { params: ['MIN', 'VALUE', 'MAX'] },
  IN_RANGE: { params: ['MIN', 'VAL', 'MAX'] },
  OUT_RANGE: { params: ['MIN', 'VAL', 'MAX'] },
  SHL: { params: ['IN', 'N'] },
  SHR: { params: ['IN', 'N'] },
  ROUND: { params: ['IN'] },
  TRUNC: { params: ['IN'] },
};

const CONV_RE = /^(BOOL|INT|DINT|REAL|WORD|TIME)_TO_(BOOL|INT|DINT|REAL|WORD|TIME)$/;

export function isBuiltinFunction(name: string): boolean {
  const n = name.toUpperCase();
  return n in FUNCTIONS || CONV_RE.test(n);
}

/** Implizit erlaubte Erweiterungen (verlustfrei bzw. wie TIA ohne IEC-Prüfung). */
function implicitOk(from: DataType, to: DataType): boolean {
  return (
    from === to ||
    (from === 'INT' && (to === 'DINT' || to === 'REAL')) ||
    (from === 'DINT' && to === 'REAL')
  );
}

function isLiteralType(t: LiteralType): t is 'ANY_INT' | 'ANY_REAL' {
  return t === 'ANY_INT' || t === 'ANY_REAL';
}

/** Gemeinsamer Typ zweier Operanden oder undefined, wenn unverträglich. */
function unify(a: LiteralType, b: LiteralType): LiteralType | undefined {
  if (a === b) return a;
  if (a === 'ANY_INT' || b === 'ANY_INT') {
    const o = a === 'ANY_INT' ? b : a;
    if (o === 'ANY_REAL') return 'ANY_REAL';
    return o === 'INT' || o === 'DINT' || o === 'REAL' || o === 'WORD' ? o : undefined;
  }
  if (a === 'ANY_REAL' || b === 'ANY_REAL') {
    const o = a === 'ANY_REAL' ? b : a;
    return o === 'REAL' || o === 'INT' || o === 'DINT' ? 'REAL' : undefined;
  }
  if (implicitOk(a, b)) return b;
  if (implicitOk(b, a)) return a;
  return undefined;
}

function concrete(t: LiteralType): DataType {
  return t === 'ANY_INT' ? 'INT' : t === 'ANY_REAL' ? 'REAL' : t;
}

function typeName(t: LiteralType): string {
  return t === 'ANY_INT' ? 'Ganzzahl-Konstante' : t === 'ANY_REAL' ? 'Gleitkomma-Konstante' : t;
}

type Sym =
  | { k: 'var'; name: string; t: DataType; op: Operand; temp: boolean; decl?: Decl; used: boolean }
  | { k: 'const'; name: string; t: DataType; v: Value; decl: Decl; used: boolean }
  | { k: 'fb'; name: string; kind: FbKind; i: number; q1?: Operand; decl: Decl; used: boolean };

type Resolved =
  | { k: 'value'; op: Operand; t: DataType; writable: boolean; input?: boolean; isConst?: boolean }
  | { k: 'fb'; sym: Extract<Sym, { k: 'fb' }> };

interface Val {
  o: Operand;
  t: DataType;
}

interface Loop {
  exits: Extract<Instr, { op: 'jmp' }>[];
  continues: Extract<Instr, { op: 'jmp' }>[];
}

/** Übersetzt SCL-Quelltext in ein IR-Programm (OB1). */
export function compileScl(source: string, opts: CompileOptions = {}): CompileResult {
  const parsed = parse(source);
  const statementCount = countStatements(parsed.unit.body);
  if (parsed.diagnostics.length) {
    return { ok: false, diagnostics: parsed.diagnostics, statementCount };
  }
  const gen = new CodeGen(opts);
  const program = gen.run(parsed.unit.decls, parsed.unit.body);
  const diagnostics = gen.diagnostics.sort(
    (a, b) => a.start.line - b.start.line || a.start.col - b.start.col,
  );
  const ok = !diagnostics.some((d) => d.severity === 'error');
  return { ok, program: ok ? program : undefined, diagnostics, statementCount };
}

/** Programmgröße nach Spielregel: jede Anweisung zählt 1, verschachtelte zusätzlich. */
export function countStatements(body: Stmt[]): number {
  let n = 0;
  for (const s of body) {
    n++;
    switch (s.k) {
      case 'if':
        for (const b of s.branches) n += countStatements(b.body);
        if (s.else) n += countStatements(s.else);
        break;
      case 'case':
        for (const it of s.items) n += countStatements(it.body);
        if (s.else) n += countStatements(s.else);
        break;
      case 'for':
      case 'while':
      case 'repeat':
        n += countStatements(s.body);
        break;
    }
  }
  return n;
}

class CodeGen {
  readonly diagnostics: Diagnostic[] = [];
  private readonly b = new ProgramBuilder();
  private readonly locals = new Map<string, Sym>();
  private readonly db = new Map<string, Extract<Sym, { k: 'var' }>>();
  private readonly areas: Record<Area, ByteArea>;
  private readonly temps = new Map<DataType, Operand[]>();
  private tempUse = new Map<DataType, number>();
  private readonly loops: Loop[] = [];
  private readonly returns: Extract<Instr, { op: 'jmp' }>[] = [];
  /** Typ je Slot-Index (spiegelt die Deklarationen im ProgramBuilder) */
  private readonly slotTypes: DataType[] = [];

  constructor(private readonly opts: CompileOptions) {
    const sizes = opts.areaSizes ?? DEFAULT_AREAS;
    this.areas = {
      I: new ByteArea('I', sizes.I),
      Q: new ByteArea('Q', sizes.Q),
      M: new ByteArea('M', sizes.M),
    };
  }

  private newSlot(name: string, t: DataType, init?: Value, temp = false): Operand {
    this.slotTypes.push(t);
    return temp ? this.b.temp(name, t, init) : this.b.slot(name, t, init);
  }

  run(decls: Decl[], body: Stmt[]): IrProgram {
    for (const v of this.opts.globalDb?.vars ?? []) {
      const op = this.newSlot(`${this.opts.globalDb!.name}.${v.name}`, v.t, v.init);
      this.db.set(v.name.toLowerCase(), {
        k: 'var',
        name: v.name,
        t: v.t,
        op,
        temp: false,
        used: true,
      });
    }
    for (const d of decls) this.guard(() => this.declare(d));
    this.stmts(body);
    for (const r of this.returns) r.to = this.b.pc;

    for (const s of this.locals.values()) {
      if (!s.used && s.decl) {
        this.warn(`Variable #${s.name} wird nicht verwendet`, s.decl.span);
      }
    }
    const program = this.b.build();
    if (!this.diagnostics.some((d) => d.severity === 'error')) {
      const errors = validateProgram(program, {
        areaSizes: this.opts.areaSizes ?? DEFAULT_AREAS,
      });
      if (errors.length) throw new Error(`Interner Compilerfehler:\n${errors.join('\n')}`);
    }
    return program;
  }

  // ---------- Diagnose ----------

  private fail(msg: string, span: Span): never {
    throw new SclError(msg, span);
  }

  private warn(msg: string, span: Span): void {
    this.diagnostics.push({ severity: 'warning', message: msg, start: span.start, end: span.end });
  }

  /** Führt f aus und wandelt SclError in eine Diagnose um (Fehler bricht nur die Anweisung ab). */
  private guard(f: () => void): void {
    try {
      f();
    } catch (e) {
      if (!(e instanceof SclError)) throw e;
      this.diagnostics.push({ severity: 'error', message: e.message, ...e.span });
    }
  }

  // ---------- Deklarationen ----------

  private declare(d: Decl): void {
    const key = d.name.toLowerCase();
    if (this.locals.has(key)) this.fail(`#${d.name} ist bereits deklariert`, d.span);
    const upper = d.typeName.toUpperCase();
    const fb = FB_TYPES[upper];
    if (fb) {
      if (d.section !== 'VAR') {
        this.fail(`FB-Instanzen (${upper}) nur im Abschnitt VAR erlaubt`, d.typeSpan);
      }
      if (d.init) this.fail('FB-Instanzen haben keinen Startwert', d.init.span);
      if (fb === 'SR' || fb === 'RS') {
        const q1 = this.newSlot(`${d.name}.Q1`, 'BOOL');
        this.locals.set(key, { k: 'fb', name: d.name, kind: fb, i: -1, q1, decl: d, used: false });
      } else {
        const inst = this.b.instance(d.name, fb);
        this.locals.set(key, { k: 'fb', name: d.name, kind: fb, i: inst.i, decl: d, used: false });
      }
      return;
    }
    const t = ELEMENTARY[upper];
    if (!t) this.fail(`Unbekannter Datentyp „${d.typeName}“`, d.typeSpan);
    const init = d.init ? this.constantValue(d.init, t) : undefined;
    if (d.section === 'CONST') {
      this.locals.set(key, { k: 'const', name: d.name, t, v: init!, decl: d, used: false });
      return;
    }
    const op = this.newSlot(d.name, t, init, d.section === 'VAR_TEMP');
    this.locals.set(key, {
      k: 'var',
      name: d.name,
      t,
      op,
      temp: d.section === 'VAR_TEMP',
      decl: d,
      used: false,
    });
  }

  /** Wert eines konstanten Ausdrucks (nur Literale bzw. Konstanten). */
  private constantValue(e: Expr, t: DataType): Value {
    if (e.k === 'ref' && e.scope !== 'addr' && !e.member) {
      const s = this.locals.get(e.name.toLowerCase());
      if (s?.k === 'const' && e.scope !== 'tag') {
        s.used = true;
        if (!implicitOk(s.t, t)) this.fail(`Konstante vom Typ ${s.t} passt nicht zu ${t}`, e.span);
        return normalize(t, s.v);
      }
    }
    if (e.k !== 'lit') this.fail('Startwert muss eine Konstante sein', e.span);
    const lit = this.literal(e, t);
    if (!implicitOk(lit.t, t)) this.typeMismatch(e.t, t, e.span);
    return normalize(t, lit.v);
  }

  // ---------- Anweisungen ----------

  private stmts(list: Stmt[]): void {
    for (const s of list) {
      const mark = new Map(this.tempUse);
      this.guard(() => this.stmt(s));
      this.tempUse = mark;
    }
  }

  private stmt(s: Stmt): void {
    switch (s.k) {
      case 'assign':
        return this.assign(s.target, s.e);
      case 'if':
        return this.ifStmt(s);
      case 'case':
        return this.caseStmt(s);
      case 'for':
        return this.forStmt(s);
      case 'while': {
        const loop: Loop = { exits: [], continues: [] };
        const top = this.b.pc;
        const cond = this.genAs(s.cond, 'BOOL');
        const jz = this.b.emit({ op: 'jz', cond, to: -1 });
        this.loopBody(loop, s.body);
        this.b.emit({ op: 'jmp', to: top });
        jz.to = this.b.pc;
        this.closeLoop(loop, top, this.b.pc);
        return;
      }
      case 'repeat': {
        const loop: Loop = { exits: [], continues: [] };
        const top = this.b.pc;
        this.loopBody(loop, s.body);
        const cont = this.b.pc;
        const cond = this.genAs(s.cond, 'BOOL');
        this.b.emit({ op: 'jz', cond, to: top });
        this.closeLoop(loop, cont, this.b.pc);
        return;
      }
      case 'exit':
      case 'continue': {
        const loop = this.loops[this.loops.length - 1];
        if (!loop)
          this.fail(`${s.k.toUpperCase()} ist nur innerhalb einer Schleife erlaubt`, s.span);
        const j = this.b.emit({ op: 'jmp', to: -1 });
        (s.k === 'exit' ? loop.exits : loop.continues).push(j);
        return;
      }
      case 'return':
        this.returns.push(this.b.emit({ op: 'jmp', to: -1 }));
        return;
      case 'fbcall':
        return this.fbCall(s.inst, s.args, s.span);
      case 'exprstmt': {
        const name = s.e.k === 'call' ? s.e.name : 'des Ausdrucks';
        if (s.e.k === 'call' && this.locals.get(name.toLowerCase())?.k === 'fb') {
          this.fail('FB-Aufrufe brauchen benannte Parameter, z. B. IN := …, PT := …', s.span);
        }
        this.fail(
          `Das Ergebnis von ${name} wird nicht verwendet – Zuweisung fehlt (z. B. #x := ${name}(…);)`,
          s.span,
        );
      }
    }
  }

  private loopBody(loop: Loop, body: Stmt[]): void {
    this.loops.push(loop);
    this.stmts(body);
    this.loops.pop();
  }

  private closeLoop(loop: Loop, cont: number, exit: number): void {
    for (const j of loop.continues) j.to = cont;
    for (const j of loop.exits) j.to = exit;
  }

  private assign(target: Ref, e: Expr): void {
    const dst = this.writable(target);
    if (e.k === 'lit' || e.k === 'ref') {
      this.store(this.gen(e, dst.t), dst, e.span, e);
      return;
    }
    const v = this.gen(e, dst.t, dst.o);
    if (v.o !== dst.o) this.store(v, dst, e.span);
  }

  /** Schreibt einen Wert in ein Ziel, ggf. mit impliziter Konvertierung. */
  private store(v: Val, dst: Val, span: Span, src?: Expr): void {
    if (v.t === dst.t) {
      this.b.emit({ op: 'mov', dst: dst.o, src: v.o });
    } else if (implicitOk(v.t, dst.t)) {
      this.b.emit({ op: 'conv', dst: dst.o, src: v.o, mode: 'round' });
    } else {
      this.typeMismatch(literalOrigin(src, v.t), dst.t, span);
    }
  }

  private typeMismatch(from: LiteralType, to: DataType, span: Span): never {
    const f = concrete(from);
    const hint =
      to === 'TIME' && isLiteralType(from)
        ? ' – Zeitangaben schreibt man z. B. T#500ms'
        : f !== to && ELEMENTARY[f]
          ? ` – verwende ${f}_TO_${to}`
          : '';
    this.fail(`Typkonflikt: ${typeName(from)} kann nicht in ${to} umgewandelt werden${hint}`, span);
  }

  private writable(r: Ref): Val {
    const res = this.resolve(r);
    if (res.k === 'fb') this.fail(`Instanz ${r.name} kann nicht zugewiesen werden`, r.span);
    if (res.isConst) this.fail(`${r.name} ist eine Konstante`, r.span);
    if (!res.writable) this.fail(`${refText(r)} kann nur gelesen werden`, r.span);
    if (res.input)
      this.warn(
        `Schreibzugriff auf Eingang ${refText(r)} – wird im nächsten Zyklus überschrieben`,
        r.span,
      );
    return { o: res.op, t: res.t };
  }

  private ifStmt(s: Extract<Stmt, { k: 'if' }>): void {
    const ends: Extract<Instr, { op: 'jmp' }>[] = [];
    s.branches.forEach((br, n) => {
      const mark = new Map(this.tempUse);
      const cond = this.genAs(br.cond, 'BOOL');
      this.tempUse = mark;
      const jz = this.b.emit({ op: 'jz', cond, to: -1 });
      this.stmts(br.body);
      const last = n === s.branches.length - 1 && !s.else;
      if (!last) ends.push(this.b.emit({ op: 'jmp', to: -1 }));
      jz.to = this.b.pc;
    });
    if (s.else) this.stmts(s.else);
    for (const j of ends) j.to = this.b.pc;
  }

  private caseStmt(s: Extract<Stmt, { k: 'case' }>): void {
    const natural = this.infer(s.sel);
    const t =
      natural === 'DINT' ? 'DINT' : natural === 'INT' || natural === 'ANY_INT' ? 'INT' : undefined;
    if (!t)
      this.fail(
        `CASE-Ausdruck muss INT oder DINT sein, ist ${typeName(natural ?? 'BOOL')}`,
        s.sel.span,
      );
    const sel = this.genAs(s.sel, t);
    const hit = this.temp('BOOL');
    const [lo, hi] = integerRange(t);
    const seen: [number, number, Span][] = [];
    const jumps: Extract<Instr, { op: 'jnz' }>[][] = [];

    for (const item of s.items) {
      const js: Extract<Instr, { op: 'jnz' }>[] = [];
      for (const l of item.labels) {
        const a = l.lo;
        const z = l.hi ?? l.lo;
        if (a < lo || z > hi) this.fail(`CASE-Marke liegt außerhalb von ${t}`, l.span);
        if (a > z) this.fail('Bereich ist leer: Untergrenze größer als Obergrenze', l.span);
        const clash = seen.find(([x, y]) => a <= y && x <= z);
        if (clash) this.fail('CASE-Marke kommt mehrfach vor', l.span);
        seen.push([a, z, l.span]);
        if (l.hi === undefined) {
          this.b.emit({ op: 'cmp', fn: 'eq', t, dst: hit, a: sel, b: this.constant(t, a) });
        } else {
          this.b.emit({
            op: 'fn',
            fn: 'in_range',
            t,
            dst: hit,
            args: [this.constant(t, a), sel, this.constant(t, z)],
          });
        }
        js.push(this.b.emit({ op: 'jnz', cond: hit, to: -1 }));
      }
      jumps.push(js);
    }
    const toElse = this.b.emit({ op: 'jmp', to: -1 });
    const ends: Extract<Instr, { op: 'jmp' }>[] = [];
    s.items.forEach((item, n) => {
      for (const j of jumps[n]!) j.to = this.b.pc;
      this.stmts(item.body);
      // nach dem letzten Zweig ohne ELSE liegt das Ende direkt dahinter
      if (n < s.items.length - 1 || s.else) ends.push(this.b.emit({ op: 'jmp', to: -1 }));
    });
    toElse.to = this.b.pc;
    if (s.else) this.stmts(s.else);
    for (const j of ends) j.to = this.b.pc;
  }

  private forStmt(s: Extract<Stmt, { k: 'for' }>): void {
    const v = this.writable(s.v);
    if (v.t !== 'INT' && v.t !== 'DINT')
      this.fail('Laufvariable muss INT oder DINT sein', s.v.span);
    this.store(this.gen(s.from, v.t), v, s.from.span);

    // Endwert wird einmal vor der Schleife ausgewertet
    let end = this.gen(s.to, v.t);
    if (end.t !== v.t) {
      if (!implicitOk(end.t, v.t)) this.typeMismatch(end.t, v.t, s.to.span);
      const tmp = this.temp(v.t);
      this.b.emit({ op: 'conv', dst: tmp, src: end.o, mode: 'round' });
      end = { o: tmp, t: v.t };
    } else if (s.to.k === 'ref' && end.o.k !== 'const') {
      const tmp = this.temp(v.t);
      this.b.emit({ op: 'mov', dst: tmp, src: end.o });
      end = { o: tmp, t: v.t };
    }

    let step = 1;
    if (s.by) {
      const by = this.gen(s.by, v.t);
      if (by.o.k !== 'const') this.fail('Schrittweite (BY) muss eine Konstante sein', s.by.span);
      step = by.o.v as number;
      if (step === 0) this.fail('Schrittweite 0 ergibt eine Endlosschleife', s.by.span);
    }

    const loop: Loop = { exits: [], continues: [] };
    const cond = this.temp('BOOL');
    const top = this.b.pc;
    this.b.emit({ op: 'cmp', fn: step > 0 ? 'le' : 'ge', t: v.t, dst: cond, a: v.o, b: end.o });
    const jz = this.b.emit({ op: 'jz', cond, to: -1 });
    this.loopBody(loop, s.body);
    const cont = this.b.pc;
    this.b.emit({ op: 'bin', fn: 'add', t: v.t, dst: v.o, a: v.o, b: this.constant(v.t, step) });
    this.b.emit({ op: 'jmp', to: top });
    jz.to = this.b.pc;
    this.closeLoop(loop, cont, this.b.pc);
  }

  private fbCall(instRef: Ref, args: FbArg[], span: Span): void {
    if (
      instRef.scope === 'auto' &&
      isBuiltinFunction(instRef.name) &&
      !this.locals.has(instRef.name.toLowerCase())
    ) {
      this.fail(
        `${instRef.name.toUpperCase()} ist eine Funktion und liefert einen Wert – verwende sie in einer Zuweisung`,
        span,
      );
    }
    const res = this.resolve(instRef);
    if (res.k !== 'fb') this.fail(`${refText(instRef)} ist keine FB-Instanz`, instRef.span);
    const { sym } = res;
    const params = FB_INPUTS[sym.kind];
    const outputs = fbOutputs(sym.kind);
    const given = new Map<string, FbArg>();
    for (const a of args) {
      if (given.has(a.name)) this.fail(`Parameter ${a.name} ist doppelt angegeben`, a.span);
      given.set(a.name, a);
      if (a.e && !params.some(([n]) => n === a.name)) {
        this.fail(
          `${sym.kind} hat keinen Eingang ${a.name} (Eingänge: ${params.map(([n]) => n).join(', ')})`,
          a.span,
        );
      }
      if (a.out && !outputs[a.name]) {
        this.fail(
          `${sym.kind} hat keinen Ausgang ${a.name} (Ausgänge: ${Object.keys(outputs).join(', ')})`,
          a.span,
        );
      }
    }
    const inputs: Record<string, Operand | undefined> = {};
    for (const [name, t, required] of params) {
      const a = given.get(name);
      if (!a?.e) {
        if (required) this.fail(`Eingang ${name} von ${sym.kind} fehlt`, span);
        continue;
      }
      inputs[name] = this.genAs(a.e, t);
    }

    switch (sym.kind) {
      case 'TP':
      case 'TON':
      case 'TOF':
      case 'TONR':
        this.b.emit({ op: 'tmr', i: sym.i, in: inputs.IN!, pt: inputs.PT!, r: inputs.R });
        break;
      case 'CTU':
      case 'CTD':
      case 'CTUD':
        this.b.emit({
          op: 'ctr',
          i: sym.i,
          cu: inputs.CU,
          cd: inputs.CD,
          r: inputs.R,
          ld: inputs.LD,
          pv: inputs.PV!,
        });
        break;
      case 'R_TRIG':
      case 'F_TRIG':
        this.b.emit({ op: 'trig', i: sym.i, clk: inputs.CLK! });
        break;
      case 'SR':
        this.b.emit({ op: 'sr', kind: 'SR', s: inputs.S1!, r: inputs.R!, q: sym.q1! });
        break;
      case 'RS':
        this.b.emit({ op: 'sr', kind: 'RS', s: inputs.S!, r: inputs.R1!, q: sym.q1! });
        break;
    }

    for (const a of args) {
      if (!a.out) continue;
      const dst = this.writable(a.out);
      const src = this.fbField(sym, a.name, a.span);
      this.store(src, dst, a.span);
    }
  }

  private fbField(sym: Extract<Sym, { k: 'fb' }>, field: string, span: Span): Val {
    const f = field.toUpperCase();
    const outputs = fbOutputs(sym.kind);
    const t = outputs[f];
    if (!t) {
      this.fail(
        `${sym.kind} hat kein Element ${field} (verfügbar: ${Object.keys(outputs).join(', ')})`,
        span,
      );
    }
    if (sym.kind === 'SR' || sym.kind === 'RS') return { o: sym.q1!, t };
    return { o: { k: 'inst', i: sym.i, f: f as 'Q' }, t };
  }

  // ---------- Namensauflösung ----------

  private resolve(r: Ref, quiet = false): Resolved {
    switch (r.scope) {
      case 'addr':
        return this.address(r);
      case 'local': {
        const s = this.locals.get(r.name.toLowerCase());
        if (!s) this.fail(`Lokale Variable #${r.name} ist nicht deklariert`, r.span);
        return this.fromSym(s, r, quiet);
      }
      case 'tag':
        return this.tag(r);
      case 'auto': {
        const s = this.locals.get(r.name.toLowerCase());
        if (s) return this.fromSym(s, r, quiet);
        if (this.opts.tags?.get(r.name) || this.isDb(r.name)) return this.tag(r);
        this.fail(`„${r.name}“ ist weder lokal deklariert noch eine PLC-Variable`, r.span);
      }
    }
  }

  private isDb(name: string): boolean {
    return !!this.opts.globalDb && this.opts.globalDb.name.toLowerCase() === name.toLowerCase();
  }

  private fromSym(s: Sym, r: Ref, quiet: boolean): Resolved {
    if (!quiet) s.used = true;
    if (s.k === 'fb') {
      if (!r.member) return { k: 'fb', sym: s };
      const f = this.fbField(s, r.member, r.span);
      return { k: 'value', op: f.o, t: f.t, writable: false };
    }
    if (r.member) this.fail(`#${s.name} hat keine Elemente`, r.span);
    if (s.k === 'const')
      return { k: 'value', op: this.constant(s.t, s.v), t: s.t, writable: false, isConst: true };
    return { k: 'value', op: s.op, t: s.t, writable: true };
  }

  private tag(r: Ref): Resolved {
    if (this.isDb(r.name)) {
      if (!r.member)
        this.fail(`Datenbaustein „${r.name}“ braucht ein Element, z. B. "${r.name}".Wert`, r.span);
      const v = this.db.get(r.member.toLowerCase());
      if (!v) this.fail(`„${r.name}“ hat kein Element ${r.member}`, r.span);
      return { k: 'value', op: v.op, t: v.t, writable: true };
    }
    const op = this.opts.tags?.resolve(r.name);
    if (!op || op.k !== 'io') this.fail(`PLC-Variable „${r.name}“ ist nicht definiert`, r.span);
    if (r.member) this.fail(`„${r.name}“ hat keine Elemente`, r.span);
    if (!this.areas[op.area].fits(op.t, op.byte)) {
      this.fail(`PLC-Variable „${r.name}“ liegt außerhalb des Adressbereichs`, r.span);
    }
    return { k: 'value', op, t: op.t, writable: true, input: op.area === 'I' };
  }

  private address(r: Ref): Resolved {
    let op: Operand;
    try {
      parseAddress(r.name);
      op = io(r.name);
    } catch (e) {
      if (e instanceof AddressError) this.fail(e.message, r.span);
      throw e;
    }
    if (op.k !== 'io') throw new Error('unreachable');
    if (!this.areas[op.area].fits(op.t, op.byte)) {
      this.fail(
        `Adresse ${r.name} liegt außerhalb des Bereichs (${this.areas[op.area].size} Byte)`,
        r.span,
      );
    }
    return { k: 'value', op, t: op.t, writable: true, input: op.area === 'I' };
  }

  // ---------- Typableitung (ohne Code zu erzeugen) ----------

  private infer(e: Expr): LiteralType | undefined {
    try {
      switch (e.k) {
        case 'lit':
          return e.t;
        case 'ref': {
          const r = this.resolve(e, true);
          return r.k === 'value' ? r.t : undefined;
        }
        case 'unary': {
          const t = this.infer(e.e);
          if (e.op === 'NOT' && t === 'ANY_INT') return 'WORD';
          return t;
        }
        case 'binary':
          return this.binaryType(e.op, this.infer(e.a), this.infer(e.b));
        case 'call':
          return this.callType(e);
      }
    } catch (err) {
      if (err instanceof SclError) return undefined;
      throw err;
    }
  }

  private binaryType(op: BinaryOp, a?: LiteralType, b?: LiteralType): LiteralType | undefined {
    if (!a || !b) return undefined;
    if (['=', '<>', '<', '<=', '>', '>='].includes(op)) return 'BOOL';
    if ((op === '*' || op === '/') && a === 'TIME' && isIntish(b)) return 'TIME';
    if (op === '*' && b === 'TIME' && isIntish(a)) return 'TIME';
    if (op === 'AND' || op === 'OR' || op === 'XOR') {
      const u = unify(a, b);
      return u === 'ANY_INT' ? 'WORD' : u;
    }
    return unify(a, b);
  }

  private callType(e: Extract<Expr, { k: 'call' }>): LiteralType | undefined {
    const conv = CONV_RE.exec(e.name);
    if (conv) return conv[2] as DataType;
    switch (e.name) {
      case 'NORM_X':
        return 'REAL';
      case 'IN_RANGE':
      case 'OUT_RANGE':
        return 'BOOL';
      case 'SHL':
      case 'SHR':
        return 'WORD';
      case 'ROUND':
      case 'TRUNC':
        return 'DINT';
      case 'SCALE_X': {
        const args = this.callArgs(e);
        return this.unifyAll([args[0]!, args[2]!]);
      }
      case 'SEL': {
        const args = this.callArgs(e);
        return this.unifyAll(args.slice(1));
      }
      case 'MUX': {
        const args = this.callArgs(e);
        return this.unifyAll(args.slice(1));
      }
      default:
        if (e.name in FUNCTIONS) return this.unifyAll(this.callArgs(e));
        return undefined;
    }
  }

  private unifyAll(es: Expr[]): LiteralType | undefined {
    let t: LiteralType | undefined;
    for (const e of es) {
      const x = this.infer(e);
      if (!x) return undefined;
      t = t === undefined ? x : unify(t, x);
      if (!t) return undefined;
    }
    return t;
  }

  // ---------- Codeerzeugung für Ausdrücke ----------

  private temp(t: DataType): Operand {
    const pool = this.temps.get(t) ?? [];
    this.temps.set(t, pool);
    const used = this.tempUse.get(t) ?? 0;
    this.tempUse.set(t, used + 1);
    if (used < pool.length) return pool[used]!;
    const op = this.newSlot(`$${t}${pool.length}`, t, undefined, true);
    pool.push(op);
    return op;
  }

  /** Ergebnisoperand: bevorzugt das Zuweisungsziel, wenn der Typ passt. */
  private result(t: DataType, dst?: Operand): Operand {
    if (dst && this.typeOfOp(dst) === t) return dst;
    return this.temp(t);
  }

  private typeOfOp(o: Operand): DataType | undefined {
    if (o.k === 'slot') return this.slotTypes[o.i];
    if (o.k === 'io' || o.k === 'const') return o.t;
    return undefined;
  }

  private constant(t: DataType, v: Value): Operand {
    switch (t) {
      case 'BOOL':
        return constOf.bool(!!v);
      case 'INT':
        return constOf.int(v as number);
      case 'DINT':
        return constOf.dint(v as number);
      case 'REAL':
        return constOf.real(v as number);
      case 'WORD':
        return constOf.word(v as number);
      case 'TIME':
        return constOf.time(v as number);
    }
  }

  /** Literal im gewünschten Typ (mit Bereichsprüfung). */
  private literal(e: Extract<Expr, { k: 'lit' }>, want?: DataType): { v: Value; t: DataType } {
    let t: DataType;
    if (e.t === 'ANY_INT') {
      if (want && (want === 'INT' || want === 'DINT' || want === 'REAL' || want === 'WORD'))
        t = want;
      else t = (e.v as number) >= -32768 && (e.v as number) <= 32767 ? 'INT' : 'DINT';
    } else if (e.t === 'ANY_REAL') {
      t = 'REAL';
    } else {
      t = e.t;
    }
    if (t !== 'BOOL' && t !== 'REAL') {
      const [lo, hi] = integerRange(t);
      const n = e.v as number;
      if (!Number.isInteger(n) || n < lo || n > hi) {
        this.fail(`Wert ${n} liegt außerhalb von ${t} (${lo} … ${hi})`, e.span);
      }
    }
    return { v: normalize(t, e.v), t };
  }

  /** Erzeugt Code und liefert den Wert in genau Typ t (implizite Erweiterung erlaubt). */
  private genAs(e: Expr, t: DataType): Operand {
    const v = this.gen(e, t);
    if (v.t === t) return v.o;
    if (!implicitOk(v.t, t)) this.typeMismatch(literalOrigin(e, v.t), t, e.span);
    if (v.o.k === 'const') return this.constant(t, v.o.v);
    const tmp = this.temp(t);
    this.b.emit({ op: 'conv', dst: tmp, src: v.o, mode: 'round' });
    return tmp;
  }

  /**
   * Erzeugt Code für e. `hint` ist der erwartete Typ (für untypisierte Literale),
   * `dst` ein mögliches Ziel, in das der letzte Befehl direkt schreiben darf.
   */
  private gen(e: Expr, hint?: DataType, dst?: Operand): Val {
    switch (e.k) {
      case 'lit': {
        const { v, t } = this.literal(e, hint);
        return { o: this.constant(t, v), t };
      }
      case 'ref': {
        const r = this.resolve(e);
        if (r.k === 'fb')
          this.fail(
            `Instanz ${e.name} kann nicht als Wert verwendet werden – meinst du ${e.name}.Q?`,
            e.span,
          );
        return { o: r.op, t: r.t };
      }
      case 'unary':
        return this.unary(e, hint, dst);
      case 'binary':
        return this.binary(e, hint, dst);
      case 'call':
        return this.call(e, hint, dst);
    }
  }

  /** Teilausdruck ohne gültigen Typ: Codeerzeugung meldet den eigentlichen Fehler. */
  private invalid(e: Expr): never {
    this.gen(e);
    this.fail('Ausdruck hat keinen gültigen Typ', e.span);
  }

  /** Arbeitstyp für Operanden, deren gemeinsamer Typ u ist (Literale passen sich dem hint an). */
  private workType(u: LiteralType, hint: DataType | undefined, allowed: DataType[]): DataType {
    if (isLiteralType(u)) {
      if (hint && allowed.includes(hint) && (u === 'ANY_INT' || hint === 'REAL')) return hint;
      return concrete(u);
    }
    return u;
  }

  private unary(e: Extract<Expr, { k: 'unary' }>, hint?: DataType, dst?: Operand): Val {
    const nat = this.infer(e.e) ?? this.invalid(e.e);
    if (e.op === 'NOT') {
      const t = nat === 'ANY_INT' ? 'WORD' : concrete(nat);
      if (t !== 'BOOL' && t !== 'WORD')
        this.fail(`NOT ist auf ${typeName(nat)} nicht anwendbar`, e.span);
      const a = this.genAs(e.e, t);
      const o = this.result(t, dst);
      this.b.emit({ op: 'un', fn: 'not', t, dst: o, a });
      return { o, t };
    }
    const t = this.workType(nat, hint, ['INT', 'DINT', 'REAL', 'TIME']);
    if (!isArithmeticType(t))
      this.fail(`Vorzeichen „-“ ist auf ${typeName(nat)} nicht anwendbar`, e.span);
    const a = this.genAs(e.e, t);
    const o = this.result(t, dst);
    this.b.emit({ op: 'un', fn: 'neg', t, dst: o, a });
    return { o, t };
  }

  private binary(e: Extract<Expr, { k: 'binary' }>, hint?: DataType, dst?: Operand): Val {
    const ta = this.infer(e.a) ?? this.invalid(e.a);
    const tb = this.infer(e.b) ?? this.invalid(e.b);
    const op = e.op;

    // TIME * Zahl, TIME / Zahl, Zahl * TIME
    if (
      (op === '*' || op === '/') &&
      ((ta === 'TIME' && isIntish(tb)) || (op === '*' && tb === 'TIME' && isIntish(ta)))
    ) {
      const a = this.timeOperand(e.a, ta);
      const b = this.timeOperand(e.b, tb);
      const o = this.result('TIME', dst);
      this.b.emit({ op: 'bin', fn: op === '*' ? 'mul' : 'div', t: 'TIME', dst: o, a, b });
      return { o, t: 'TIME' };
    }

    const u = unify(ta, tb);
    if (!u)
      this.fail(
        `Operator ${op} ist nicht auf ${typeName(ta)} und ${typeName(tb)} anwendbar`,
        e.span,
      );

    if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
      const t = concrete(u);
      if (t === 'BOOL' && op !== '=' && op !== '<>')
        this.fail(`Operator ${op} ist auf BOOL nicht anwendbar`, e.span);
      const a = this.genAs(e.a, t);
      const b = this.genAs(e.b, t);
      const o = this.result('BOOL', dst);
      this.b.emit({ op: 'cmp', fn: CMP[op]!, t, dst: o, a, b });
      return { o, t: 'BOOL' };
    }

    if (op === 'AND' || op === 'OR' || op === 'XOR') {
      const t = u === 'ANY_INT' ? 'WORD' : concrete(u);
      if (t !== 'BOOL' && t !== 'WORD')
        this.fail(`${op} ist nur auf BOOL und WORD anwendbar, nicht auf ${typeName(u)}`, e.span);
      const a = this.genAs(e.a, t);
      const b = this.genAs(e.b, t);
      const o = this.result(t, dst);
      this.b.emit({ op: 'bin', fn: op.toLowerCase() as 'and', t, dst: o, a, b });
      return { o, t };
    }

    const t = this.workType(u, hint, ['INT', 'DINT', 'REAL']);
    if (!isArithmeticType(t))
      this.fail(`Operator ${op} ist nicht auf ${typeName(u)} anwendbar`, e.span);
    if (op === 'MOD' && t !== 'INT' && t !== 'DINT')
      this.fail('MOD ist nur auf INT und DINT anwendbar', e.span);
    if (t === 'TIME' && (op === '*' || op === '/' || op === 'MOD')) {
      this.fail(`TIME ${op} TIME ist nicht sinnvoll – multipliziere mit einer Zahl`, e.span);
    }
    const a = this.genAs(e.a, t);
    const b = this.genAs(e.b, t);
    const o = this.result(t, dst);
    this.b.emit({ op: 'bin', fn: ARITH[op]!, t, dst: o, a, b });
    return { o, t };
  }

  /** Operand für TIME-Arithmetik: Zahlen werden nach TIME (ms) konvertiert. */
  private timeOperand(e: Expr, t: LiteralType): Operand {
    if (t === 'TIME') return this.genAs(e, 'TIME');
    if (e.k === 'lit') {
      const { v } = this.literal(e, 'DINT');
      return this.constant('TIME', v);
    }
    const v = this.gen(e);
    const tmp = this.temp('TIME');
    this.b.emit({ op: 'conv', dst: tmp, src: v.o, mode: 'round' });
    return tmp;
  }

  private callArgs(e: Extract<Expr, { k: 'call' }>): Expr[] {
    const conv = CONV_RE.test(e.name);
    const spec = conv ? { params: ['IN'] } : FUNCTIONS[e.name];
    if (!spec) this.fail(`Unbekannte Funktion ${e.name}`, e.span);
    const named = e.args.filter((a) => a.name);
    if (named.length && named.length !== e.args.length) {
      this.fail('Parameter entweder alle benannt oder alle ohne Namen angeben', e.span);
    }
    if (!named.length) {
      const min = spec.params.length;
      if (e.args.length < min || (!spec.variadic && e.args.length > min)) {
        this.fail(
          `${e.name} erwartet ${spec.variadic ? `mindestens ${min}` : min} Argument(e), erhalten ${e.args.length}`,
          e.span,
        );
      }
      return e.args.map((a) => a.e);
    }
    return this.namedArgs(e, spec.params, !!spec.variadic, e.args);
  }

  private namedArgs(
    e: Extract<Expr, { k: 'call' }>,
    params: string[],
    variadic: boolean,
    args: Arg[],
  ): Expr[] {
    const byName = new Map<string, Arg>();
    for (const a of args) {
      if (byName.has(a.name!)) this.fail(`Parameter ${a.name} ist doppelt angegeben`, a.span);
      byName.set(a.name!, a);
    }
    const out: Expr[] = [];
    // variadische Funktionen: IN1, IN2, … bzw. IN0, IN1, … fortlaufend
    const names = [...params];
    if (variadic) {
      const prefix = params[params.length - 1]!.replace(/\d+$/, '');
      let n = Number(params[params.length - 1]!.match(/\d+$/)![0]) + 1;
      while (byName.has(`${prefix}${n}`)) names.push(`${prefix}${n++}`);
    }
    for (const n of names) {
      const a = byName.get(n);
      if (!a) this.fail(`${e.name}: Parameter ${n} fehlt`, e.span);
      out.push(a.e);
      byName.delete(n);
    }
    if (e.name === 'MUX' && byName.has('ELSE')) byName.delete('ELSE');
    for (const a of byName.values()) {
      this.fail(`${e.name} hat keinen Parameter ${a.name} (erwartet: ${names.join(', ')})`, a.span);
    }
    return out;
  }

  private call(e: Extract<Expr, { k: 'call' }>, hint?: DataType, dst?: Operand): Val {
    if (!isBuiltinFunction(e.name)) {
      const local = this.locals.get(e.name.toLowerCase());
      if (local?.k === 'fb')
        this.fail(
          `FB-Aufruf ${e.name}(…) ist eine Anweisung und liefert keinen Wert – lies danach ${e.name}.Q`,
          e.span,
        );
      this.fail(`Unbekannte Funktion ${e.name}`, e.span);
    }
    const args = this.callArgs(e);
    const conv = CONV_RE.exec(e.name);
    if (conv) {
      const from = conv[1] as DataType;
      const to = conv[2] as DataType;
      const v = this.gen(args[0]!, from);
      if (v.t !== from) this.fail(`${e.name} erwartet ${from}, erhalten ${v.t}`, args[0]!.span);
      const o = this.result(to, dst);
      this.b.emit({ op: 'conv', dst: o, src: v.o, mode: 'round' });
      return { o, t: to };
    }

    const numeric: DataType[] = ['INT', 'DINT', 'REAL', 'TIME', 'WORD'];
    const common = (es: Expr[], allowed: DataType[], what: string): DataType => {
      const u = this.unifyAll(es);
      if (!u) {
        for (const x of es) this.gen(x); // meldet Fehler in Argumenten
        this.fail(`${e.name}: Argumente haben unverträgliche Typen`, e.span);
      }
      const t = this.workType(u, hint, allowed);
      if (!allowed.includes(t))
        this.fail(`${e.name} ist nicht auf ${typeName(u)} anwendbar (${what})`, e.span);
      return t;
    };
    const emitFn = (fn: CallFn, t: DataType, resT: DataType, ops: Operand[]): Val => {
      const o = this.result(resT, dst);
      this.b.emit({ op: 'fn', fn, t, dst: o, args: ops });
      return { o, t: resT };
    };

    switch (e.name) {
      case 'ABS': {
        const t = common(args, ['INT', 'DINT', 'REAL', 'TIME'], 'Zahl erwartet');
        const a = this.genAs(args[0]!, t);
        const o = this.result(t, dst);
        this.b.emit({ op: 'un', fn: 'abs', t, dst: o, a });
        return { o, t };
      }
      case 'LIMIT':
      case 'MIN':
      case 'MAX': {
        const t = common(args, numeric, 'Zahl erwartet');
        return emitFn(
          e.name.toLowerCase() as CallFn,
          t,
          t,
          args.map((a) => this.genAs(a, t)),
        );
      }
      case 'IN_RANGE':
      case 'OUT_RANGE': {
        const t = common(args, numeric, 'Zahl erwartet');
        return emitFn(
          e.name.toLowerCase() as CallFn,
          t,
          'BOOL',
          args.map((a) => this.genAs(a, t)),
        );
      }
      case 'SEL': {
        const g = this.genAs(args[0]!, 'BOOL');
        const t = common(args.slice(1), ['BOOL', ...numeric], 'gleicher Typ für IN0 und IN1');
        return emitFn('sel', t, t, [g, this.genAs(args[1]!, t), this.genAs(args[2]!, t)]);
      }
      case 'MUX': {
        const k = this.genAs(args[0]!, 'INT');
        const elseArg = e.args.find((a) => a.name === 'ELSE')?.e;
        const valueArgs = elseArg ? [...args.slice(1), elseArg] : args.slice(1);
        const t = common(valueArgs, ['BOOL', ...numeric], 'gleicher Typ für alle Eingänge');
        const ins = args.slice(1).map((a) => this.genAs(a, t));
        const alt = elseArg ? this.genAs(elseArg, t) : undefined;
        const o = this.result(t, dst);
        this.b.emit({ op: 'mux', t, dst: o, k, ins, alt });
        return { o, t };
      }
      case 'NORM_X': {
        const u = this.unifyAll(args);
        const t = u ? (isLiteralType(u) ? concrete(u) : u) : undefined;
        if (!t || !isArithmeticType(t))
          this.fail('NORM_X erwartet Zahlen für MIN, VALUE und MAX', e.span);
        return emitFn(
          'norm_x',
          t,
          'REAL',
          args.map((a) => this.genAs(a, t)),
        );
      }
      case 'SCALE_X': {
        const value = this.genAs(args[1]!, 'REAL');
        const u = this.unifyAll([args[0]!, args[2]!]);
        if (!u) this.fail('SCALE_X: MIN und MAX haben unverträgliche Typen', e.span);
        let t: DataType;
        if (isLiteralType(u)) t = hint && isArithmeticType(hint) && hint !== 'TIME' ? hint : 'REAL';
        else t = u;
        if (!isArithmeticType(t)) this.fail(`SCALE_X ist nicht auf ${t} anwendbar`, e.span);
        return emitFn('scale_x', t, t, [this.genAs(args[0]!, t), value, this.genAs(args[2]!, t)]);
      }
      case 'SHL':
      case 'SHR': {
        const a = this.genAs(args[0]!, 'WORD');
        const n = this.genAs(args[1]!, 'INT');
        const o = this.result('WORD', dst);
        this.b.emit({ op: 'bin', fn: e.name.toLowerCase() as 'shl', t: 'WORD', dst: o, a, b: n });
        return { o, t: 'WORD' };
      }
      case 'ROUND':
      case 'TRUNC': {
        const a = this.genAs(args[0]!, 'REAL');
        const o = this.result('DINT', dst);
        this.b.emit({ op: 'conv', dst: o, src: a, mode: e.name === 'ROUND' ? 'round' : 'trunc' });
        return { o, t: 'DINT' };
      }
    }
    this.fail(`Unbekannte Funktion ${e.name}`, e.span);
  }
}

const CMP: Partial<Record<BinaryOp, 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'>> = {
  '=': 'eq',
  '<>': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
};

const ARITH: Partial<Record<BinaryOp, 'add' | 'sub' | 'mul' | 'div' | 'mod'>> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  MOD: 'mod',
};

/** Für Fehlermeldungen: untypisierte Literale als „Konstante“ benennen. */
function literalOrigin(e: Expr | undefined, t: DataType): LiteralType {
  return e?.k === 'lit' && isLiteralType(e.t) ? e.t : t;
}

function isIntish(t: LiteralType): boolean {
  return t === 'INT' || t === 'DINT' || t === 'ANY_INT';
}

function refText(r: Ref): string {
  const base = r.scope === 'local' ? `#${r.name}` : r.scope === 'tag' ? `"${r.name}"` : r.name;
  return r.member ? `${base}.${r.member}` : base;
}
