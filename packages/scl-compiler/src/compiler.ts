import {
  AddressError,
  ByteArea,
  ProgramBuilder,
  TagTable,
  integerRange,
  io,
  isArithmeticType,
  isBitStringType,
  normalize,
  parseAddress,
  tiaTypeForSize,
  validateProgram,
  type Area,
  type Block,
  type CallFn,
  type DataType,
  type IfaceSection,
  type InstanceKind,
  type Instr,
  type IrProgram,
  type Operand,
  type PlcProject,
  type Tag,
  type Value,
  type VarDecl,
} from '@zyklus/sim-core';
import type { BinaryOp, Decl, Expr, FbArg, LiteralType, Ref, Stmt } from './ast';
import { SclError, type Diagnostic, type Span } from './diagnostics';
import { parseBody, parseExpression, parseSource } from './parser';
import {
  FB_INPUTS,
  FB_OUTPUTS,
  instanceMembers,
  instanceType,
  methodFamily,
  type InstanceType,
} from './systemblocks';
import {
  ELEMENTARY,
  acceptsIntLiteral,
  arithmeticOf,
  concrete,
  implicitOk,
  isLiteralType,
  typeName,
  unify,
} from './typerules';

/** Wo eine Meldung hingehört: Codeteil, Schnittstellenzeile, Variablentabelle oder Projekt. */
export interface Location {
  block?: string;
  part: 'code' | 'interface' | 'tags' | 'project';
  section?: IfaceSection;
  row?: number;
  /** FUP: Netzwerk (0-basiert), Box und Pin */
  network?: number;
  box?: string;
  pin?: string;
}

export interface ProjectDiagnostic extends Diagnostic {
  location: Location;
}

export interface CompileOptions {
  /** Größe der Speicherbereiche (Standard wie Cpu: 128/128/256 Byte) */
  areaSizes?: Record<Area, number>;
}

export interface CompileResult {
  ok: boolean;
  program?: IrProgram;
  diagnostics: ProjectDiagnostic[];
  /** Programmgröße: Anzahl Anweisungen (nicht Zeilen) */
  statementCount: number;
}

const DEFAULT_AREAS: Record<Area, number> = { I: 128, Q: 128, M: 256 };
const NO_SPAN: Span = { start: { line: 1, col: 1 }, end: { line: 1, col: 1 } };

/** Einheitliche Sicht auf einen Baustein – egal ob aus dem Projektmodell oder aus einer Quelle. */
interface Unit {
  kind: 'OB' | 'FB' | 'FC' | 'DB' | 'IDB';
  name: string;
  decls: (Decl & { row?: number })[];
  instanceOf?: string;
  body: Stmt[];
  /** Herkunft der Schnittstelle: Tabelle (Projekt) oder Text (Quelle) */
  origin: 'project' | 'source';
  errors: ProjectDiagnostic[];
  /** aus FUP erzeugt: FUP-Funktionen erlaubt */
  intrinsics?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Einstiegspunkte
// ---------------------------------------------------------------------------------------------

/** Übersetzt das Projekt einer CPU (Variablentabelle + Bausteine) in ein IR-Programm. */
export function compileProject(project: PlcProject, opts: CompileOptions = {}): CompileResult {
  return compileUnits(project.blocks.map(unitFromBlock), project.tags, opts);
}

/** Übersetzt eine externe SCL-Quelle (ORGANIZATION_BLOCK / DATA_BLOCK …). */
export function compileSource(
  src: string,
  opts: CompileOptions & { tags?: Tag[] } = {},
): CompileResult {
  const parsed = parseSource(src);
  if (parsed.diagnostics.length) {
    return {
      ok: false,
      diagnostics: parsed.diagnostics.map((d) => ({ ...d, location: { part: 'code' } })),
      statementCount: 0,
    };
  }
  const units: Unit[] = parsed.blocks.map((b) => ({
    kind: b.kind === 'DB' && b.instanceOf ? 'IDB' : b.kind,
    name: b.name,
    decls: b.decls,
    instanceOf: b.instanceOf,
    body: b.body,
    origin: 'source',
    errors: [],
  }));
  return compileUnits(units, opts.tags ?? [], opts);
}

/**
 * Bequemer Einstieg für einen OB1-Anweisungsteil: Variablentabelle, weitere Bausteine
 * (DBs) und Schnittstelle des OB können mitgegeben werden.
 */
export function compileScl(
  body: string,
  opts: CompileOptions & {
    tags?: Tag[] | TagTable;
    blocks?: Block[];
    temp?: VarDecl[];
    constants?: VarDecl[];
  } = {},
): CompileResult {
  const tags = opts.tags instanceof TagTable ? opts.tags.list() : (opts.tags ?? []);
  return compileProject(
    {
      tags,
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'SCL',
          iface: { Temp: opts.temp ?? [], Constant: opts.constants ?? [] },
          source: body,
        },
        ...(opts.blocks ?? []),
      ],
    },
    opts,
  );
}

function unitFromBlock(b: Block): Unit {
  const errors: ProjectDiagnostic[] = [];
  const rowsToDecls = (section: IfaceSection, rows: VarDecl[]) =>
    rows.map((v, row) => {
      let init: Expr | undefined;
      if (v.init !== undefined && v.init.trim() !== '') {
        const r = parseExpression(v.init);
        if (r.diagnostics.length) {
          errors.push({
            ...r.diagnostics[0]!,
            message: `Startwert von ${v.name}: ${r.diagnostics[0]!.message}`,
            ...NO_SPAN,
            location: { block: b.name, part: b.kind === 'DB' ? 'code' : 'interface', section, row },
          });
        }
        init = r.expr;
      }
      return {
        section,
        name: v.name,
        typeName: v.type,
        typeSpan: NO_SPAN,
        init,
        initText: v.init,
        span: NO_SPAN,
        row,
      };
    });

  if (b.kind === 'DB') {
    return {
      kind: 'DB',
      name: b.name,
      decls: rowsToDecls('Static', b.vars),
      body: [],
      origin: 'project',
      errors,
    };
  }
  if (b.kind === 'IDB') {
    return {
      kind: 'IDB',
      name: b.name,
      decls: [],
      instanceOf: b.of,
      body: [],
      origin: 'project',
      errors,
    };
  }
  const decls = Object.entries(b.iface).flatMap(([section, rows]) =>
    rowsToDecls(section as IfaceSection, rows ?? []),
  );
  let body: Stmt[] = [];
  if (b.lang === 'SCL') {
    const parsed = parseBody(b.source);
    body = parsed.body;
    for (const d of parsed.diagnostics)
      errors.push({ ...d, location: { block: b.name, part: 'code' } });
  } else {
    errors.push({
      severity: 'error',
      message: 'FUP-Bausteine werden noch nicht übersetzt',
      ...NO_SPAN,
      location: { block: b.name, part: 'project' },
    });
  }
  return {
    kind: b.kind,
    name: b.name,
    decls,
    body,
    origin: 'project',
    errors,
    intrinsics: b.generatedFrom === 'FUP',
  };
}

/** Programmgröße nach Spielregel: jede Anweisung zählt 1, verschachtelte zusätzlich. */
export function countStatements(body: Stmt[]): number {
  let n = 0;
  for (const s of body) {
    if (s.k === 'region') {
      n += countStatements(s.body);
      continue;
    }
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

// ---------------------------------------------------------------------------------------------
// Übersetzung
// ---------------------------------------------------------------------------------------------

const CONV_RE =
  /^(BOOL|BYTE|WORD|DWORD|INT|DINT|REAL|TIME)_TO_(BOOL|BYTE|WORD|DWORD|INT|DINT|REAL|TIME)$/;

const FUNCTIONS: Record<string, { params: string[]; variadic?: boolean }> = {
  ABS: { params: ['IN'] },
  LIMIT: { params: ['MN', 'IN', 'MX'] },
  MIN: { params: ['IN1', 'IN2'], variadic: true },
  MAX: { params: ['IN1', 'IN2'], variadic: true },
  SEL: { params: ['G', 'IN0', 'IN1'] },
  MUX: { params: ['K', 'IN0', 'IN1'], variadic: true },
  NORM_X: { params: ['MIN', 'VALUE', 'MAX'] },
  SCALE_X: { params: ['MIN', 'VALUE', 'MAX'] },
  SHL: { params: ['IN', 'N'] },
  SHR: { params: ['IN', 'N'] },
  ROUND: { params: ['IN'] },
  TRUNC: { params: ['IN'] },
};

export function isBuiltinFunction(name: string): boolean {
  const n = name.toUpperCase();
  return n in FUNCTIONS || CONV_RE.test(n);
}

function compileUnits(units: Unit[], tags: Tag[], opts: CompileOptions): CompileResult {
  const gen = new CodeGen(opts);
  const program = gen.run(units, tags);
  const diagnostics = gen.diagnostics;
  const ok = !diagnostics.some((d) => d.severity === 'error');
  return { ok, program: ok ? program : undefined, diagnostics, statementCount: gen.statementCount };
}

type Sym =
  | {
      k: 'var';
      name: string;
      t: DataType;
      op: Operand;
      decl: Decl & { row?: number };
      used: boolean;
    }
  | {
      k: 'const';
      name: string;
      t: DataType;
      v: Value;
      decl: Decl & { row?: number };
      used: boolean;
    };

interface InstEntry {
  key: string;
  display: string;
  typeName: string;
  type: InstanceType;
  /** bei generischen Instanzen: Anweisung aus dem ersten Aufruf */
  kind?: InstanceKind;
  irIndex?: number;
}

interface DbEntry {
  name: string;
  vars: Map<string, { t: DataType; op: Operand } | { inst: InstEntry }>;
}

type Resolved =
  | { k: 'value'; op: Operand; t: DataType; writable: boolean; input?: boolean; isConst?: boolean }
  | { k: 'instance'; entry: InstEntry };

interface Val {
  o: Operand;
  t: DataType;
}

interface Loop {
  exits: Extract<Instr, { op: 'jmp' }>[];
  continues: Extract<Instr, { op: 'jmp' }>[];
}

class CodeGen {
  readonly diagnostics: ProjectDiagnostic[] = [];
  statementCount = 0;
  private readonly b = new ProgramBuilder();
  private tags = new TagTable();
  private readonly locals = new Map<string, Sym>();
  private readonly dbs = new Map<string, DbEntry>();
  private readonly idbs = new Map<string, InstEntry>();
  private readonly areas: Record<Area, ByteArea>;
  private readonly temps = new Map<DataType, Operand[]>();
  private tempUse = new Map<DataType, number>();
  private readonly loops: Loop[] = [];
  private readonly returns: Extract<Instr, { op: 'jmp' }>[] = [];
  private readonly slotTypes: DataType[] = [];
  private where: Location = { part: 'project' };
  private origin: Unit['origin'] = 'project';
  /** FUP-Funktionen (__SR, __RS, __PTRIG, __NTRIG, __CONV, IN_RANGE, OUT_RANGE) erlaubt */
  private intrinsics = false;

  constructor(private readonly opts: CompileOptions) {
    const sizes = opts.areaSizes ?? DEFAULT_AREAS;
    this.areas = {
      I: new ByteArea('I', sizes.I),
      Q: new ByteArea('Q', sizes.Q),
      M: new ByteArea('M', sizes.M),
    };
  }

  run(units: Unit[], tags: Tag[]): IrProgram {
    this.loadTags(tags);
    for (const u of units) this.diagnostics.push(...u.errors);

    const names = new Map<string, Unit>();
    for (const u of units) {
      const key = u.name.toLowerCase();
      this.where = { block: u.name, part: 'project' };
      if (names.has(key)) {
        this.guard(() => this.fail(`Bausteinname „${u.name}“ ist doppelt vergeben`, NO_SPAN));
        continue;
      }
      names.set(key, u);
      if (this.tags.get(u.name)) {
        this.guard(() =>
          this.fail(`„${u.name}“ ist sowohl PLC-Variable als auch Baustein`, NO_SPAN),
        );
      }
    }

    for (const u of units) {
      this.origin = u.origin;
      if (u.kind === 'DB') this.globalDb(u);
      if (u.kind === 'IDB') this.instanceDb(u);
    }

    const obs = units.filter((u) => u.kind === 'OB');
    for (const u of units) {
      if (u.kind === 'FB' || u.kind === 'FC') {
        this.where = { block: u.name, part: 'project' };
        this.guard(() =>
          this.fail('Eigene FB/FC werden in einer späteren Version unterstützt', NO_SPAN),
        );
      }
    }
    if (obs.length === 0) {
      this.where = { part: 'project' };
      this.guard(() => this.fail('Kein Organisationsbaustein „Main“ (OB1) vorhanden', NO_SPAN));
    }
    for (const ob of obs) {
      if (ob !== obs[0]) {
        this.where = { block: ob.name, part: 'project' };
        this.guard(() =>
          this.fail(
            'Weitere OBs (Weck-/Prozessalarm) werden in einer späteren Version unterstützt',
            NO_SPAN,
          ),
        );
        continue;
      }
      if (ob.errors.some((e) => e.severity === 'error' && e.location.part === 'code')) continue;
      this.origin = ob.origin;
      this.intrinsics = !!ob.intrinsics;
      this.codeBlock(ob);
    }

    this.diagnostics.sort(
      (a, b) =>
        (a.location.block ?? '').localeCompare(b.location.block ?? '') ||
        a.start.line - b.start.line ||
        a.start.col - b.start.col,
    );
    const program = this.b.build();
    if (!this.diagnostics.some((d) => d.severity === 'error')) {
      const errors = validateProgram(program, { areaSizes: this.opts.areaSizes ?? DEFAULT_AREAS });
      if (errors.length) throw new Error(`Interner Compilerfehler:\n${errors.join('\n')}`);
    }
    return program;
  }

  // ---------- Diagnose ----------

  private fail(msg: string, span: Span): never {
    throw new SclError(msg, span);
  }

  private push(
    severity: 'error' | 'warning',
    message: string,
    span: Span,
    where = this.where,
  ): void {
    this.diagnostics.push({ severity, message, start: span.start, end: span.end, location: where });
  }

  private warn(msg: string, span: Span): void {
    this.push('warning', msg, span);
  }

  /** Führt f aus und wandelt SclError in eine Diagnose um (Fehler bricht nur die Anweisung ab). */
  private guard(f: () => void): void {
    try {
      f();
    } catch (e) {
      if (!(e instanceof SclError)) throw e;
      this.push('error', e.message, e.span);
    }
  }

  /** Ort einer Deklaration: Tabellenzeile (Projekt) oder Textstelle (Quelle). */
  private declWhere(block: string, d: Decl & { row?: number }): Location {
    return this.origin === 'project'
      ? { block, part: 'interface', section: d.section, row: d.row }
      : { block, part: 'code' };
  }

  // ---------- Variablentabelle, Datenbausteine ----------

  private loadTags(tags: Tag[]): void {
    tags.forEach((t, row) => {
      try {
        this.tags.add(t);
      } catch (e) {
        this.push('error', (e as Error).message, NO_SPAN, { part: 'tags', row });
      }
    });
    for (const [a, b] of this.tags.overlaps()) {
      this.push('warning', `PLC-Variablen „${a}“ und „${b}“ überlappen sich`, NO_SPAN, {
        part: 'tags',
      });
    }
  }

  private newSlot(name: string, t: DataType, init?: Value, temp = false): Operand {
    this.slotTypes.push(t);
    return temp ? this.b.temp(name, t, init) : this.b.slot(name, t, init);
  }

  private globalDb(u: Unit): void {
    const db: DbEntry = { name: u.name, vars: new Map() };
    this.dbs.set(u.name.toLowerCase(), db);
    for (const d of u.decls) {
      this.where = this.declWhere(u.name, d);
      this.guard(() => {
        const key = d.name.toLowerCase();
        if (db.vars.has(key)) this.fail(`${d.name} ist im Datenbaustein doppelt vorhanden`, d.span);
        const it = instanceType(d.typeName);
        if (it) {
          if (d.init) this.fail('Instanzen haben keinen Startwert', d.init.span);
          db.vars.set(key, {
            inst: {
              key: `${u.name}.${d.name}`.toLowerCase(),
              display: `${u.name}.${d.name}`,
              typeName: d.typeName,
              type: it,
            },
          });
          return;
        }
        const t = this.elementary(d);
        const init = d.init ? this.constantValue(d.init, t) : undefined;
        db.vars.set(key, { t, op: this.newSlot(`${u.name}.${d.name}`, t, init) });
      });
    }
  }

  private instanceDb(u: Unit): void {
    this.where = { block: u.name, part: 'project' };
    this.guard(() => {
      const it = instanceType(u.instanceOf ?? '');
      if (!it) {
        this.fail(
          `Instanz-DB „${u.name}“: unbekannter Typ „${u.instanceOf}“ (erwartet z. B. IEC_TIMER, IEC_COUNTER, TON_TIME, R_TRIG)`,
          NO_SPAN,
        );
      }
      this.idbs.set(u.name.toLowerCase(), {
        key: u.name.toLowerCase(),
        display: u.name,
        typeName: u.instanceOf!,
        type: it,
      });
    });
  }

  private elementary(d: Decl): DataType {
    const t = ELEMENTARY[d.typeName.toUpperCase()];
    if (!t) this.fail(`Unbekannter Datentyp „${d.typeName}“`, d.typeSpan);
    return t;
  }

  /** IR-Instanz zu einem Eintrag (wird beim ersten Gebrauch angelegt). */
  private instIndex(e: InstEntry): number {
    if (e.irIndex === undefined) {
      const kind = e.type.generic
        ? (e.kind ?? (e.type.family === 'timer' ? 'TON' : 'CTU'))
        : e.type.kind;
      e.kind = kind;
      e.irIndex = this.b.instance(e.display, kind).i;
    }
    return e.irIndex;
  }

  // ---------- Codebausteine ----------

  private codeBlock(u: Unit): void {
    for (const d of u.decls) {
      this.where = this.declWhere(u.name, d);
      this.guard(() => this.declareLocal(u, d));
    }
    this.where = { block: u.name, part: 'code' };
    this.collectMethods(u.body);
    this.statementCount += countStatements(u.body);
    this.stmts(u.body);
    for (const r of this.returns) r.to = this.b.pc;
    for (const s of this.locals.values()) {
      if (!s.used)
        this.push(
          'warning',
          `Variable #${s.name} wird nicht verwendet`,
          s.decl.span,
          this.declWhere(u.name, s.decl),
        );
    }
  }

  private declareLocal(u: Unit, d: Decl): void {
    const allowed: IfaceSection[] = u.kind === 'OB' ? ['Temp', 'Constant'] : [];
    if (!allowed.includes(d.section)) {
      this.fail(
        `Im OB gibt es nur Temp und Constant – statische Daten gehören in einen Datenbaustein`,
        d.span,
      );
    }
    const key = d.name.toLowerCase();
    if (this.locals.has(key)) this.fail(`#${d.name} ist bereits deklariert`, d.span);
    if (instanceType(d.typeName)) {
      this.fail(
        `Instanzen (${d.typeName}) gehören in einen Instanz-DB, z. B. "${d.name}_DB" vom Typ ${d.typeName}`,
        d.typeSpan,
      );
    }
    const t = this.elementary(d);
    const init = d.init ? this.constantValue(d.init, t) : undefined;
    if (d.section === 'Constant') {
      this.locals.set(key, { k: 'const', name: d.name, t, v: init!, decl: d, used: false });
      return;
    }
    const op = this.newSlot(d.name, t, init, true);
    this.locals.set(key, { k: 'var', name: d.name, t, op, decl: d, used: false });
  }

  /** Wert eines konstanten Ausdrucks (nur Literale bzw. lokale Konstanten). */
  private constantValue(e: Expr, t: DataType): Value {
    if (e.k === 'ref' && e.scope !== 'addr' && e.path.length === 0) {
      const s = this.locals.get(e.name.toLowerCase());
      if (s?.k === 'const' && e.scope !== 'tag') {
        s.used = true;
        if (!implicitOk(s.t, t))
          this.fail(`Konstante vom Typ ${typeName(s.t)} passt nicht zu ${typeName(t)}`, e.span);
        return normalize(t, s.v);
      }
    }
    if (e.k !== 'lit') this.fail('Startwert muss eine Konstante sein', e.span);
    const lit = this.literal(e, t);
    if (!implicitOk(lit.t, t)) this.typeMismatch(e.t, t, e.span);
    return normalize(t, lit.v);
  }

  /** Vorab: Welche Anweisung (TON, CTU …) wird auf generischen Instanzen aufgerufen? */
  private collectMethods(body: Stmt[]): void {
    const visit = (list: Stmt[]) => {
      for (const s of list) {
        switch (s.k) {
          case 'fbcall': {
            const last = s.inst.path[s.inst.path.length - 1];
            if (!last || !methodFamily(last)) break;
            const entry = this.lookupInstance({ ...s.inst, path: s.inst.path.slice(0, -1) });
            if (entry?.type.generic && !entry.kind) entry.kind = last.toUpperCase() as InstanceKind;
            break;
          }
          case 'if':
            s.branches.forEach((b) => visit(b.body));
            if (s.else) visit(s.else);
            break;
          case 'case':
            s.items.forEach((i) => visit(i.body));
            if (s.else) visit(s.else);
            break;
          case 'for':
          case 'while':
          case 'repeat':
          case 'region':
            visit(s.body);
            break;
        }
      }
    };
    visit(body);
  }

  /** Instanzeintrag zu einer Referenz ohne Fehlermeldung (für die Vorabanalyse). */
  private lookupInstance(r: Ref): InstEntry | undefined {
    if (r.scope === 'addr' || r.scope === 'local') return undefined;
    const idb = this.idbs.get(r.name.toLowerCase());
    if (idb && r.path.length === 0) return idb;
    const db = this.dbs.get(r.name.toLowerCase());
    if (db && r.path.length === 1) {
      const v = db.vars.get(r.path[0]!.toLowerCase());
      if (v && 'inst' in v) return v.inst;
    }
    return undefined;
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
      case 'region':
        return this.stmts(s.body);
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
        if (s.e.k === 'call' && !isBuiltinFunction(name)) {
          this.fail('Bausteinaufrufe brauchen benannte Parameter, z. B. IN := …, PT := …', s.span);
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
    if (this.intrinsics && e.k === 'call' && e.name === '__CONV') {
      // FUP-Box CONV: beliebige Konvertierung vom Typ des Eingangs in den Typ des Ziels
      if (e.args.length !== 1) this.fail('CONV braucht genau einen Eingang', e.span);
      const src = this.gen(e.args[0]!.e, dst.t);
      this.b.emit({ op: 'conv', dst: dst.o, src: src.o, mode: 'round' });
      return;
    }
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
        : f !== to
          ? ` – verwende ${f}_TO_${to}`
          : '';
    this.fail(
      `Typkonflikt: ${typeName(from)} kann nicht in ${typeName(to)} umgewandelt werden${hint}`,
      span,
    );
  }

  private writable(r: Ref): Val {
    const res = this.resolve(r);
    if (res.k === 'instance')
      this.fail(`Instanz ${refText(r)} kann nicht zugewiesen werden`, r.span);
    if (res.isConst) this.fail(`${r.name} ist eine Konstante`, r.span);
    if (!res.writable) this.fail(`${refText(r)} kann nur gelesen werden`, r.span);
    if (res.input) {
      this.warn(
        `Schreibzugriff auf Eingang ${refText(r)} – wird im nächsten Zyklus überschrieben`,
        r.span,
      );
    }
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
    if (!t) {
      this.fail(
        `CASE-Ausdruck muss Int oder DInt sein, ist ${typeName(natural ?? 'BOOL')}`,
        s.sel.span,
      );
    }
    const sel = this.genAs(s.sel, t);
    const hit = this.temp('BOOL');
    const [lo, hi] = integerRange(t);
    const seen: [number, number][] = [];
    const jumps: Extract<Instr, { op: 'jnz' }>[][] = [];

    for (const item of s.items) {
      const js: Extract<Instr, { op: 'jnz' }>[] = [];
      for (const l of item.labels) {
        const a = l.lo;
        const z = l.hi ?? l.lo;
        if (a < lo || z > hi) this.fail(`CASE-Marke liegt außerhalb von ${typeName(t)}`, l.span);
        if (a > z) this.fail('Bereich ist leer: Untergrenze größer als Obergrenze', l.span);
        if (seen.some(([x, y]) => a <= y && x <= z))
          this.fail('CASE-Marke kommt mehrfach vor', l.span);
        seen.push([a, z]);
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
      this.fail('Laufvariable muss Int oder DInt sein', s.v.span);
    this.store(this.gen(s.from, v.t), v, s.from.span, s.from);

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

  /** Aufruf einer Systembaustein-Instanz: "DB"(…), "DB".TON(…), "Daten".T1.TON(…) */
  private fbCall(instRef: Ref, args: FbArg[], span: Span): void {
    if (instRef.scope === 'auto' && instRef.path.length === 0 && isBuiltinFunction(instRef.name)) {
      this.fail(
        `${instRef.name.toUpperCase()} ist eine Funktion und liefert einen Wert – verwende sie in einer Zuweisung`,
        span,
      );
    }
    if (instRef.scope === 'local') {
      this.fail(
        'Multiinstanzen (#Instanz(…)) gibt es nur in Funktionsbausteinen – lege im OB einen Instanz-DB an',
        instRef.span,
      );
    }

    let entry: InstEntry;
    let kind: InstanceKind;
    const last = instRef.path[instRef.path.length - 1];
    const family = last ? methodFamily(last) : undefined;
    if (family) {
      const prefix: Ref = { ...instRef, path: instRef.path.slice(0, -1) };
      const res = this.resolve(prefix);
      if (res.k !== 'instance') this.fail(`${refText(prefix)} ist keine Instanz`, instRef.span);
      entry = res.entry;
      if (!entry.type.generic || entry.type.family !== family) {
        this.fail(
          entry.type.generic
            ? `${refText(prefix)} ist vom Typ ${entry.typeName} – ${last!.toUpperCase()} passt nicht dazu`
            : `${refText(prefix)} ist vom Typ ${entry.typeName} und wird direkt aufgerufen: ${refText(prefix)}(…)`,
          instRef.span,
        );
      }
      kind = last!.toUpperCase() as InstanceKind;
      this.instIndex(entry);
      if (entry.kind !== kind) {
        this.fail(
          `${refText(prefix)} wird bereits als ${entry.kind} verwendet – lege für ${kind} einen eigenen DB an`,
          instRef.span,
        );
      }
    } else {
      const res = this.resolve(instRef);
      if (res.k !== 'instance') this.fail(`${refText(instRef)} ist keine Instanz`, instRef.span);
      entry = res.entry;
      if (entry.type.generic) {
        const methods =
          entry.type.family === 'timer' ? 'TON, TOF, TP oder TONR' : 'CTU, CTD oder CTUD';
        this.fail(
          `${refText(instRef)} ist vom Typ ${entry.typeName} – rufe ${refText(instRef)}.TON(…) auf (${methods})`,
          instRef.span,
        );
      }
      kind = entry.type.kind;
    }
    const i = this.instIndex(entry);

    const params = FB_INPUTS[kind];
    const outputs = FB_OUTPUTS[kind];
    const given = new Map<string, FbArg>();
    for (const a of args) {
      if (given.has(a.name)) this.fail(`Parameter ${a.name} ist doppelt angegeben`, a.span);
      given.set(a.name, a);
      if (a.e && !params.some(([n]) => n === a.name)) {
        this.fail(
          `${kind} hat keinen Eingang ${a.name} (Eingänge: ${params.map(([n]) => n).join(', ')})`,
          a.span,
        );
      }
      if (a.out && !outputs[a.name]) {
        this.fail(
          `${kind} hat keinen Ausgang ${a.name} (Ausgänge: ${Object.keys(outputs).join(', ')})`,
          a.span,
        );
      }
    }
    const inputs: Record<string, Operand | undefined> = {};
    for (const [name, t, required] of params) {
      const a = given.get(name);
      if (!a?.e) {
        if (required) this.fail(`Eingang ${name} von ${kind} fehlt`, span);
        continue;
      }
      inputs[name] = this.genAs(a.e, t);
    }

    switch (kind) {
      case 'TP':
      case 'TON':
      case 'TOF':
      case 'TONR':
        this.b.emit({ op: 'tmr', i, in: inputs.IN!, pt: inputs.PT!, r: inputs.R });
        break;
      case 'CTU':
      case 'CTD':
      case 'CTUD':
        this.b.emit({
          op: 'ctr',
          i,
          cu: inputs.CU,
          cd: inputs.CD,
          r: inputs.R,
          ld: inputs.LD,
          pv: inputs.PV!,
        });
        break;
      case 'R_TRIG':
      case 'F_TRIG':
        this.b.emit({ op: 'trig', i, clk: inputs.CLK! });
        break;
    }

    for (const a of args) {
      if (!a.out) continue;
      const dst = this.writable(a.out);
      const t = outputs[a.name]!;
      this.store({ o: { k: 'inst', i, f: a.name as 'Q' }, t }, dst, a.span);
    }
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
        return this.global(r);
      case 'auto': {
        const s = this.locals.get(r.name.toLowerCase());
        if (s) return this.fromSym(s, r, quiet);
        const known =
          this.tags.get(r.name) ||
          this.dbs.has(r.name.toLowerCase()) ||
          this.idbs.has(r.name.toLowerCase());
        if (known) return this.global(r);
        this.fail(
          `„${r.name}“ ist weder lokal deklariert noch eine PLC-Variable oder ein Datenbaustein`,
          r.span,
        );
      }
    }
  }

  private fromSym(s: Sym, r: Ref, quiet: boolean): Resolved {
    if (!quiet) s.used = true;
    if (r.path.length) this.fail(`#${s.name} hat keine Elemente`, r.span);
    if (s.k === 'const') {
      return { k: 'value', op: this.constant(s.t, s.v), t: s.t, writable: false, isConst: true };
    }
    return { k: 'value', op: s.op, t: s.t, writable: true };
  }

  /** "Tag", "DB".Variable, "DB".Instanz.Element, "IDB".Element */
  private global(r: Ref): Resolved {
    const key = r.name.toLowerCase();
    const idb = this.idbs.get(key);
    if (idb) {
      if (r.path.length === 0) return { k: 'instance', entry: idb };
      if (r.path.length > 1) this.fail(`${refText(r)}: zu viele Elemente`, r.span);
      return this.member(idb, r.path[0]!, r);
    }
    const db = this.dbs.get(key);
    if (db) {
      if (r.path.length === 0) {
        this.fail(`Datenbaustein „${r.name}“ braucht ein Element, z. B. "${r.name}".Wert`, r.span);
      }
      const v = db.vars.get(r.path[0]!.toLowerCase());
      if (!v) this.fail(`„${r.name}“ hat kein Element ${r.path[0]}`, r.span);
      if ('inst' in v) {
        if (r.path.length === 1) return { k: 'instance', entry: v.inst };
        if (r.path.length > 2) this.fail(`${refText(r)}: zu viele Elemente`, r.span);
        return this.member(v.inst, r.path[1]!, r);
      }
      if (r.path.length > 1) this.fail(`„${r.name}".${r.path[0]} hat keine Elemente`, r.span);
      return { k: 'value', op: v.op, t: v.t, writable: true };
    }
    const op = this.tags.resolve(r.name);
    if (!op || op.k !== 'io') {
      this.fail(
        r.path.length
          ? `Datenbaustein „${r.name}“ ist nicht definiert`
          : `PLC-Variable „${r.name}“ ist nicht definiert`,
        r.span,
      );
    }
    if (r.path.length) this.fail(`PLC-Variable „${r.name}“ hat keine Elemente`, r.span);
    if (!this.areas[op.area].fits(op.t, op.byte)) {
      this.fail(`PLC-Variable „${r.name}“ liegt außerhalb des Adressbereichs`, r.span);
    }
    return { k: 'value', op, t: op.t, writable: true, input: op.area === 'I' };
  }

  private member(e: InstEntry, name: string, r: Ref): Resolved {
    const i = this.instIndex(e);
    const members = instanceMembers(e.type, e.kind!);
    const m = members[name.toUpperCase()];
    if (!m) {
      this.fail(
        `${e.typeName}${e.type.generic ? ` (${e.kind})` : ''} hat kein Element ${name} (verfügbar: ${Object.keys(members).join(', ')})`,
        r.span,
      );
    }
    return { k: 'value', op: { k: 'inst', i, f: m[0] }, t: m[1], writable: false };
  }

  private address(r: Ref): Resolved {
    let op: Operand;
    try {
      const a = parseAddress(r.name);
      op = io(r.name, tiaTypeForSize(a.size));
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
          if (!t) return undefined;
          if (e.op === 'NOT') return t === 'ANY_INT' ? 'WORD' : t;
          return isLiteralType(t) ? t : arithmeticOf(t);
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
      const u = unify(a, b, 'bits');
      return u === 'ANY_INT' ? 'WORD' : u;
    }
    const u = unify(a, b);
    return u && !isLiteralType(u) ? arithmeticOf(u) : u;
  }

  private callType(e: Extract<Expr, { k: 'call' }>): LiteralType | undefined {
    const conv = CONV_RE.exec(e.name);
    if (conv) return conv[2] as DataType;
    if (
      this.intrinsics &&
      ['__SR', '__RS', '__PTRIG', '__NTRIG', 'IN_RANGE', 'OUT_RANGE'].includes(e.name)
    ) {
      return 'BOOL';
    }
    switch (e.name) {
      case 'NORM_X':
        return 'REAL';
      case 'SHL':
      case 'SHR': {
        const t = this.infer(this.callArgs(e)[0]!);
        return t === 'ANY_INT' ? 'WORD' : t;
      }
      case 'ROUND':
      case 'TRUNC':
        return 'DINT';
      case 'SCALE_X': {
        const args = this.callArgs(e);
        return this.unifyAll([args[0]!, args[2]!]);
      }
      case 'SEL':
      case 'MUX':
        return this.unifyAll(this.callArgs(e).slice(1));
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
    return { k: 'const', t, v: normalize(t, v) } as Operand;
  }

  /** Literal im gewünschten Typ (mit Bereichsprüfung). */
  private literal(e: Extract<Expr, { k: 'lit' }>, want?: DataType): { v: Value; t: DataType } {
    let t: DataType;
    if (e.t === 'ANY_INT') {
      if (want && acceptsIntLiteral(want)) t = want;
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
        this.fail(`Wert ${n} liegt außerhalb von ${typeName(t)} (${lo} … ${hi})`, e.span);
      }
    }
    return { v: normalize(t, e.v), t };
  }

  /** Erzeugt Code und liefert den Wert in genau Typ t (implizite Konvertierung erlaubt). */
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
        if (r.k === 'instance') {
          this.fail(
            `Instanz ${refText(e)} kann nicht als Wert verwendet werden – meinst du ${refText(e)}.Q?`,
            e.span,
          );
        }
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
      if (t !== 'BOOL' && !isBitStringType(t))
        this.fail(`NOT ist auf ${typeName(nat)} nicht anwendbar`, e.span);
      const a = this.genAs(e.e, t);
      const o = this.result(t, dst);
      this.b.emit({ op: 'un', fn: 'not', t, dst: o, a });
      return { o, t };
    }
    const t = arithmeticOf(this.workType(nat, hint, ['INT', 'DINT', 'REAL', 'TIME']));
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

    if (op === 'AND' || op === 'OR' || op === 'XOR') {
      const u = unify(ta, tb, 'bits');
      if (!u)
        this.fail(
          `Operator ${op} ist nicht auf ${typeName(ta)} und ${typeName(tb)} anwendbar`,
          e.span,
        );
      const t = u === 'ANY_INT' ? 'WORD' : concrete(u);
      if (t !== 'BOOL' && !isBitStringType(t)) {
        this.fail(
          `${op} ist nur auf Bool und Bitfolgen (Byte, Word, DWord) anwendbar, nicht auf ${typeName(u)}`,
          e.span,
        );
      }
      const a = this.genAs(e.a, t);
      const b = this.genAs(e.b, t);
      const o = this.result(t, dst);
      this.b.emit({ op: 'bin', fn: op.toLowerCase() as 'and', t, dst: o, a, b });
      return { o, t };
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
        this.fail(`Operator ${op} ist auf Bool nicht anwendbar`, e.span);
      const a = this.genAs(e.a, t);
      const b = this.genAs(e.b, t);
      const o = this.result('BOOL', dst);
      this.b.emit({ op: 'cmp', fn: CMP[op]!, t, dst: o, a, b });
      return { o, t: 'BOOL' };
    }

    const t = arithmeticOf(this.workType(u, hint, ['INT', 'DINT', 'REAL']));
    if (!isArithmeticType(t))
      this.fail(`Operator ${op} ist nicht auf ${typeName(u)} anwendbar`, e.span);
    if (op === 'MOD' && t !== 'INT' && t !== 'DINT')
      this.fail('MOD ist nur auf Int und DInt anwendbar', e.span);
    if (t === 'TIME' && (op === '*' || op === '/' || op === 'MOD')) {
      this.fail(`Time ${op} Time ist nicht sinnvoll – multipliziere mit einer Zahl`, e.span);
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
    const byName = new Map(named.map((a) => [a.name!, a]));
    if (byName.size !== named.length) this.fail('Ein Parameter ist doppelt angegeben', e.span);
    const names = [...spec.params];
    if (spec.variadic) {
      // IN1, IN2, … bzw. IN0, IN1, … fortlaufend
      const lastParam = spec.params[spec.params.length - 1]!;
      const prefix = lastParam.replace(/\d+$/, '');
      let n = Number(lastParam.match(/\d+$/)![0]) + 1;
      while (byName.has(`${prefix}${n}`)) names.push(`${prefix}${n++}`);
    }
    const out: Expr[] = [];
    for (const n of names) {
      const a = byName.get(n);
      if (!a) this.fail(`${e.name}: Parameter ${n} fehlt`, e.span);
      out.push(a.e);
      byName.delete(n);
    }
    if (e.name === 'MUX') byName.delete('INELSE');
    for (const a of byName.values()) {
      this.fail(
        `${e.name} hat keinen Parameter ${a.name} (erwartet: ${names.join(', ')}${e.name === 'MUX' ? ', INELSE' : ''})`,
        a.span,
      );
    }
    return out;
  }

  /** Benannte Argumente einer FUP-Funktion in fester Reihenfolge. */
  private intrinsicArgs(e: Extract<Expr, { k: 'call' }>, names: string[]): Expr[] {
    return names.map((n) => {
      const a = e.args.find((x) => x.name === n);
      if (!a) this.fail(`${e.name}: Eingang ${n} fehlt`, e.span);
      return a.e;
    });
  }

  /** FUP-Boxen ohne SCL-Gegenstück: SR, RS, P_TRIG, N_TRIG, IN_RANGE, OUT_RANGE. */
  private intrinsic(e: Extract<Expr, { k: 'call' }>, dst?: Operand): Val | undefined {
    switch (e.name) {
      case '__SR':
      case '__RS': {
        const [s, r, m] = this.intrinsicArgs(e, ['S', 'R', 'M']);
        const sv = this.genAs(s!, 'BOOL');
        const rv = this.genAs(r!, 'BOOL');
        const mem = this.writable(m as Ref);
        if (m!.k !== 'ref' || mem.t !== 'BOOL')
          this.fail('Speicheroperand muss ein Bool sein', m!.span);
        const o = this.result('BOOL', dst);
        this.b.emit({
          op: 'sr',
          kind: e.name === '__SR' ? 'SR' : 'RS',
          s: sv,
          r: rv,
          q: mem.o,
          out: o,
        });
        return { o, t: 'BOOL' };
      }
      case '__PTRIG':
      case '__NTRIG': {
        const [clk, m] = this.intrinsicArgs(e, ['CLK', 'M']);
        const c = this.genAs(clk!, 'BOOL');
        if (m!.k !== 'ref') this.fail('Flankenmerker muss ein Operand sein', m!.span);
        const mem = this.writable(m as Ref);
        if (mem.t !== 'BOOL') this.fail('Flankenmerker muss ein Bool sein', m!.span);
        const o = this.result('BOOL', dst);
        this.b.emit({
          op: 'edge',
          kind: e.name === '__PTRIG' ? 'P' : 'N',
          clk: c,
          mem: mem.o,
          out: o,
        });
        return { o, t: 'BOOL' };
      }
      case 'IN_RANGE':
      case 'OUT_RANGE': {
        const args = this.intrinsicArgs(e, ['MIN', 'VAL', 'MAX']);
        const u = this.unifyAll(args);
        if (!u) this.fail(`${e.name}: Eingänge haben unverträgliche Typen`, e.span);
        const t = arithmeticOf(concrete(u));
        if (!isArithmeticType(t)) this.fail(`${e.name} erwartet Zahlen`, e.span);
        const o = this.result('BOOL', dst);
        this.b.emit({
          op: 'fn',
          fn: e.name === 'IN_RANGE' ? 'in_range' : 'out_range',
          t,
          dst: o,
          args: args.map((a) => this.genAs(a, t)),
        });
        return { o, t: 'BOOL' };
      }
    }
    return undefined;
  }

  private call(e: Extract<Expr, { k: 'call' }>, hint?: DataType, dst?: Operand): Val {
    if (this.intrinsics) {
      const v = this.intrinsic(e, dst);
      if (v) return v;
    }
    if (!isBuiltinFunction(e.name)) {
      if (e.name === 'IN_RANGE' || e.name === 'OUT_RANGE') {
        this.fail(
          `${e.name} gibt es nur in FUP/KOP – in SCL mit Vergleichen formulieren, z. B. (#x >= 10) AND (#x <= 20)`,
          e.span,
        );
      }
      this.fail(`Unbekannte Funktion ${e.name}`, e.span);
    }
    const args = this.callArgs(e);
    const conv = CONV_RE.exec(e.name);
    if (conv) {
      const from = conv[1] as DataType;
      const to = conv[2] as DataType;
      const v = this.gen(args[0]!, from);
      if (v.t !== from)
        this.fail(`${e.name} erwartet ${typeName(from)}, erhalten ${typeName(v.t)}`, args[0]!.span);
      const o = this.result(to, dst);
      this.b.emit({ op: 'conv', dst: o, src: v.o, mode: 'round' });
      return { o, t: to };
    }

    const numeric: DataType[] = ['INT', 'DINT', 'REAL', 'TIME'];
    const common = (es: Expr[], allowed: DataType[], what: string): DataType => {
      const u = this.unifyAll(es);
      if (!u) {
        for (const x of es) this.gen(x); // meldet Fehler in Argumenten
        this.fail(`${e.name}: Argumente haben unverträgliche Typen`, e.span);
      }
      let t = this.workType(u, hint, allowed);
      if (!allowed.includes(t) && allowed.includes(arithmeticOf(t))) t = arithmeticOf(t);
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
        const t = common(args, numeric, 'Zahl erwartet');
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
      case 'SEL': {
        const g = this.genAs(args[0]!, 'BOOL');
        const t = common(
          args.slice(1),
          ['BOOL', 'BYTE', 'WORD', 'DWORD', ...numeric],
          'gleicher Typ für IN0 und IN1',
        );
        return emitFn('sel', t, t, [g, this.genAs(args[1]!, t), this.genAs(args[2]!, t)]);
      }
      case 'MUX': {
        const k = this.genAs(args[0]!, 'INT');
        const elseArg = e.args.find((a) => a.name === 'INELSE')?.e;
        const valueArgs = elseArg ? [...args.slice(1), elseArg] : args.slice(1);
        const t = common(
          valueArgs,
          ['BOOL', 'BYTE', 'WORD', 'DWORD', ...numeric],
          'gleicher Typ für alle Eingänge',
        );
        const ins = args.slice(1).map((a) => this.genAs(a, t));
        const alt = elseArg ? this.genAs(elseArg, t) : undefined;
        const o = this.result(t, dst);
        this.b.emit({ op: 'mux', t, dst: o, k, ins, alt });
        return { o, t };
      }
      case 'NORM_X': {
        const u = this.unifyAll(args);
        const t = u ? arithmeticOf(concrete(u)) : undefined;
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
        if (isLiteralType(u)) {
          t =
            hint && isArithmeticType(arithmeticOf(hint)) && hint !== 'TIME'
              ? arithmeticOf(hint)
              : 'REAL';
        } else {
          t = arithmeticOf(u);
        }
        if (!isArithmeticType(t))
          this.fail(`SCALE_X ist nicht auf ${typeName(t)} anwendbar`, e.span);
        return emitFn('scale_x', t, t, [this.genAs(args[0]!, t), value, this.genAs(args[2]!, t)]);
      }
      case 'SHL':
      case 'SHR': {
        const nat = this.infer(args[0]!) ?? this.invalid(args[0]!);
        const t = nat === 'ANY_INT' ? 'WORD' : concrete(nat);
        if (!isBitStringType(t))
          this.fail(
            `${e.name} erwartet eine Bitfolge (Byte, Word, DWord), erhalten ${typeName(nat)}`,
            args[0]!.span,
          );
        const a = this.genAs(args[0]!, t);
        const n = this.genAs(args[1]!, 'INT');
        const o = this.result(t, dst);
        this.b.emit({ op: 'bin', fn: e.name.toLowerCase() as 'shl', t, dst: o, a, b: n });
        return { o, t };
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

export function refText(r: Ref): string {
  const base = r.scope === 'local' ? `#${r.name}` : r.scope === 'tag' ? `"${r.name}"` : r.name;
  return [base, ...r.path].join('.');
}
