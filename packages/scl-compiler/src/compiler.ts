import {
  AddressError,
  ByteArea,
  OB_NUMBERS,
  SIMPLE_EVENTS,
  isSimpleEvent,
  ProgramBuilder,
  SECTIONS_BY_KIND,
  TagTable,
  bitWidth,
  defaultValue,
  integerRange,
  isIntegerType,
  io,
  DATA_TYPES,
  isArithmeticType,
  isBitStringType,
  isIntType,
  isRealType,
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
  type IrTask,
  type ObEvent,
  type Operand,
  type PlcProject,
  type PlcType,
  type Tag,
  type Value,
  type VarDecl,
} from '@zyklus/sim-core';
import type { BinaryOp, Decl, Expr, FbArg, LiteralType, Ref, Stmt, TypeExpr } from './ast';
import {
  elementCount,
  fieldOf,
  leaves,
  sameType,
  sizeOf,
  typeText,
  type Field,
  type VarType,
} from './datatypes';
import { SclError, type Diagnostic, type Span } from './diagnostics';
import { parseBody, parseExpression, parseSource, parseTypeText } from './parser';
import { LIBRARY, libraryBlock, withLibrary } from './library';
import {
  COMM_KINDS,
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
  /** Messpunkte für Beobachten und Haltepunkte erzeugen (kosten zur Laufzeit nichts) */
  probes?: boolean;
}

/** Querverweis: Zugriff auf ein Symbol an einer Stelle im Code */
export interface XRef {
  /** `"Motor"`, `"Daten".Wert`, `#zaehler`, `%Q0.1` (ohne Feldindizes) */
  symbol: string;
  /** Absolutadresse bei PLC-Variablen und Adressen */
  address?: string;
  block: string;
  line: number;
  col: number;
  access: 'r' | 'w';
}

/** Aufruf: Baustein `from` ruft `to` (eigener FB/FC oder Instanz eines Systembausteins) */
export interface CallRef {
  from: string;
  to: string;
  /** Instanz-DB bzw. Multiinstanz, bei FC leer */
  instance?: string;
  line: number;
}

export interface CompileResult {
  ok: boolean;
  program?: IrProgram;
  diagnostics: ProjectDiagnostic[];
  /** Querverweise und Aufrufe (für Querverweisliste, Aufrufstruktur, Zuordnungsliste) */
  xref?: XRef[];
  calls?: CallRef[];
  /** Programmgröße: Anzahl Anweisungen (nicht Zeilen) */
  statementCount: number;
  /** Ganzzahl-Literale 0/1, die als BOOL gelesen wurden (für den Export als TRUE/FALSE) */
  boolLiterals?: BoolLiteral[];
}

export interface BoolLiteral {
  block: string;
  start: Span['start'];
  value: boolean;
}

export const BOOL_LITERAL_ERROR = 'BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.';

const DEFAULT_AREAS: Record<Area, number> = { I: 128, Q: 128, M: 256 };
const NO_SPAN: Span = { start: { line: 1, col: 1 }, end: { line: 1, col: 1 } };

/** Einheitliche Sicht auf einen Baustein – egal ob aus dem Projektmodell oder aus einer Quelle. */
interface Unit {
  /** TYPE: PLC-Datentyp, Elemente in `decls` */
  kind: 'OB' | 'FB' | 'FC' | 'DB' | 'IDB' | 'TYPE';
  name: string;
  decls: (Decl & { row?: number })[];
  instanceOf?: string;
  body: Stmt[];
  /** Herkunft der Schnittstelle: Tabelle (Projekt) oder Text (Quelle) */
  origin: 'project' | 'source';
  errors: ProjectDiagnostic[];
  /** aus FUP erzeugt: FUP-Funktionen erlaubt */
  intrinsics?: boolean;
  /** OB: Startereignis (Alarm-OB) */
  event?: ObEvent;
  number?: number;
  /** FC: Rückgabetyp (Text), undefined = Void */
  returnType?: string;
  /** IDB eines eigenen FB: Startwerte einzelner Elemente */
  start?: Record<string, string>;
  /** Baustein aus dem Projektmodell (für Bibliotheksbausteine) */
  source?: Block;
}

/** Rückgabetyp ohne „Void“ */
function returnTypeOf(t: string | undefined): string | undefined {
  return t && t.trim().toUpperCase() !== 'VOID' ? t.trim() : undefined;
}

// ---------------------------------------------------------------------------------------------
// Einstiegspunkte
// ---------------------------------------------------------------------------------------------

/** Übersetzt das Projekt einer CPU (Variablentabelle + Bausteine) in ein IR-Programm. */
export function compileProject(source: PlcProject, opts: CompileOptions = {}): CompileResult {
  const project = withLibrary(source);
  return compileUnits(
    [...(project.types ?? []).map(unitFromType), ...project.blocks.map(unitFromBlock)],
    project.tags,
    opts,
  );
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
    returnType: returnTypeOf(b.returnType),
    body: b.body,
    origin: 'source',
    errors: [],
  }));
  // Technologie-Bibliothek: verwendete, nicht selbst definierte Bausteine dazunehmen
  const own = new Set(units.map((u) => u.name.toLowerCase()));
  const lib = new Map<string, Unit>();
  for (const b of parsed.blocks) {
    for (const t of [b.instanceOf ?? '', ...b.decls.map((d) => d.typeName)]) {
      const l = libraryBlock(t);
      if (l && !own.has(l.name.toLowerCase())) lib.set(l.name, unitFromBlock(l));
    }
  }
  return compileUnits([...units, ...lib.values()], opts.tags ?? [], opts);
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
    types?: PlcType[];
    temp?: VarDecl[];
    constants?: VarDecl[];
  } = {},
): CompileResult {
  const tags = opts.tags instanceof TagTable ? opts.tags.list() : (opts.tags ?? []);
  return compileProject(
    {
      tags,
      types: opts.types,
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

function unitFromType(t: PlcType): Unit {
  const errors: ProjectDiagnostic[] = [];
  return {
    kind: 'TYPE',
    name: t.name,
    decls: rowsToDecls(t.name, 'interface', 'Static', t.fields, errors),
    body: [],
    origin: 'project',
    errors,
  };
}

/** Tabellenzeilen als Deklarationen (Startwerte werden geparst, Fehler gesammelt). */
function rowsToDecls(
  block: string,
  part: Location['part'],
  section: IfaceSection,
  rows: VarDecl[],
  errors: ProjectDiagnostic[],
): (Decl & { row?: number })[] {
  return rows.map((v, row) => {
    let init: Expr | undefined;
    if (v.init !== undefined && v.init.trim() !== '') {
      const r = parseExpression(v.init);
      if (r.diagnostics.length) {
        errors.push({
          ...r.diagnostics[0]!,
          message: `Startwert von ${v.name}: ${r.diagnostics[0]!.message}`,
          ...NO_SPAN,
          location: { block, part, section, row },
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
      ...(v.retain ? { retain: true } : {}),
      span: NO_SPAN,
      row,
    };
  });
}

function unitFromBlock(b: Block): Unit {
  const errors: ProjectDiagnostic[] = [];
  const decls = (section: IfaceSection, rows: VarDecl[]) =>
    rowsToDecls(b.name, b.kind === 'DB' ? 'code' : 'interface', section, rows, errors);

  if (b.kind === 'DB') {
    return {
      kind: 'DB',
      name: b.name,
      decls: decls('Static', b.vars),
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
      ...(b.start ? { start: b.start } : {}),
    };
  }
  const ifaceDecls = Object.entries(b.iface).flatMap(([section, rows]) =>
    decls(section as IfaceSection, rows ?? []),
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
    decls: ifaceDecls,
    body,
    origin: 'project',
    errors,
    intrinsics: b.generatedFrom === 'FUP',
    event: b.kind === 'OB' ? b.event : undefined,
    number: b.number,
    returnType: b.kind === 'FC' ? returnTypeOf(b.returnType) : undefined,
    source: b,
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

const CONV_RE = new RegExp(`^(${DATA_TYPES.join('|')})_TO_(${DATA_TYPES.join('|')})$`);

/** Zahlentypen für + - * / (mit TIME) und für Funktionen wie MIN/MAX/LIMIT */
const ARITH_TYPES: DataType[] = DATA_TYPES.filter(isArithmeticType);
const NUMBER_TYPES: DataType[] = ARITH_TYPES.filter((t) => t !== 'TIME');

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
  LEN: { params: ['IN'] },
  CONCAT: { params: ['IN1', 'IN2'], variadic: true },
  LEFT: { params: ['IN', 'L'] },
  RIGHT: { params: ['IN', 'L'] },
  MID: { params: ['IN', 'L', 'P'] },
  FIND: { params: ['IN1', 'IN2'] },
  DELETE: { params: ['IN', 'L', 'P'] },
  INSERT: { params: ['IN1', 'IN2', 'P'] },
  REPLACE: { params: ['IN1', 'IN2', 'L', 'P'] },
  SWAP: { params: ['IN'] },
  RD_SYS_T: { params: ['OUT'] },
  GET_ERR_ID: { params: [] },
  RUNTIME: { params: ['MEM'] },
  RD_LOC_T: { params: ['OUT'] },
};

/** Standarddatentyp DTL (Datum und Uhrzeit) */
const DTL_TYPE: VarType = {
  k: 'struct',
  name: 'DTL',
  fields: (
    [
      ['YEAR', 'UINT', 1970],
      ['MONTH', 'USINT', 1],
      ['DAY', 'USINT', 1],
      ['WEEKDAY', 'USINT', 5],
      ['HOUR', 'USINT', 0],
      ['MINUTE', 'USINT', 0],
      ['SECOND', 'USINT', 0],
      ['NANOSECOND', 'UDINT', 0],
    ] as const
  ).map(([name, t, v]) => ({ name, type: { k: 'elem', t }, init: [v] })),
};

/** Blockbefehle als Anweisung mit IN := …, COUNT := …, OUT => … */
const BLOCK_MOVES = ['MOVE_BLK', 'UMOVE_BLK', 'FILL_BLK', 'UFILL_BLK'];

export function isBuiltinFunction(name: string): boolean {
  const n = name.toUpperCase();
  return n in FUNCTIONS || CONV_RE.test(n);
}

function compileUnits(units: Unit[], tags: Tag[], opts: CompileOptions): CompileResult {
  const gen = new CodeGen(opts);
  const program = gen.run(units, tags);
  const diagnostics = gen.diagnostics;
  const ok = !diagnostics.some((d) => d.severity === 'error');
  return {
    ok,
    program: ok ? program : undefined,
    diagnostics,
    statementCount: gen.statementCount,
    boolLiterals: gen.boolLiterals,
    xref: gen.xref,
    calls: gen.calls,
  };
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
    }
  /** Multiinstanz eines Systembausteins im FB (Static vom Typ TON_TIME, IEC_TIMER …) */
  | { k: 'inst'; name: string; entry: InstEntry; decl: Decl & { row?: number }; used: boolean }
  /** Multiinstanz eines eigenen FB */
  | { k: 'uinst'; name: string; inst: UserInst; decl: Decl & { row?: number }; used: boolean }
  /** Feld oder Struktur; `inits` Startwerte aller Slots */
  | {
      k: 'agg';
      name: string;
      place: Place;
      inits: Value[];
      decl: Decl & { row?: number };
      used: boolean;
    };

/**
 * Lage zusammengesetzter Daten: Slots ab `base + off`, bei variablem Index zusätzlich
 * `dyn` (geprüfter, nullbasierter Index in einem DINT-Slot, Schrittweite in Slots).
 */
interface Place {
  base: number;
  type: VarType;
  off: number;
  dyn?: { o: Operand; len: number; stride: number };
}

/** Summand eines variablen Index: geprüfter Index o (0 … n−1) mal stride */
interface Term {
  o: Operand;
  n: number;
  stride: number;
}

/** größte Anzahl Slots einer Variablen */
const MAX_SLOTS = 4096;

/** Instanz eines eigenen FB (Instanz-DB oder Multiinstanz) */
interface UserInst {
  fb: Unit;
  display: string;
  /** Startwerte aus dem Instanz-DB (Element klein geschrieben → Literal) */
  start?: Record<string, string>;
  /** Eingänge, Ausgänge, statische Daten – einmal je Instanz angelegt */
  vars?: Map<string, Sym>;
}

interface InstEntry {
  key: string;
  display: string;
  typeName: string;
  type: InstanceType;
  /** bei generischen Instanzen: Anweisung aus dem ersten Aufruf */
  kind?: InstanceKind;
  irIndex?: number;
}

/** PLC-Datentyp; `type` nach der Auflösung (einmal je Übersetzung) */
interface UdtEntry {
  unit: Unit;
  state: 'new' | 'busy' | 'done' | 'error';
  type?: VarType;
}

interface DbEntry {
  name: string;
  vars: Map<string, { t: DataType; op: Operand } | { inst: InstEntry } | { place: Place }>;
}

type Resolved =
  | {
      k: 'value';
      op: Operand;
      t: DataType;
      writable: boolean;
      input?: boolean;
      isConst?: boolean;
      /** Element eines Feldes/einer Struktur (Indizes der Referenz sind verbraucht) */
      indexed?: boolean;
    }
  | { k: 'instance'; entry: InstEntry }
  | { k: 'uinst'; inst: UserInst }
  /** ganzes Feld bzw. ganze Struktur */
  | { k: 'place'; place: Place; writable: boolean }
  /** Teilzugriff .%X3 / .%B1 / .%W0 / .%D0 auf eine Bitfolge oder Ganzzahl */
  | {
      k: 'slice';
      base: Extract<Resolved, { k: 'value' }>;
      unit: number;
      n: number;
      t: DataType;
    };

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
  readonly boolLiterals: BoolLiteral[] = [];
  readonly xref: XRef[] = [];
  readonly calls: CallRef[] = [];
  private readonly xrefOf = new WeakMap<Ref, XRef>();
  /** Startinformation der Diagnose-/Ausfall-OBs: OB-Name → Slot von #Event_Class */
  private readonly eventInfo = new Map<string, Operand>();
  /** GET_ERR_ID wird verwendet (lokale Fehlerbehandlung) */
  private localErrors = false;
  /** Verschachtelung in IF/CASE/Schleifen (0 = unbedingte Anweisung) */
  private condDepth = 0;
  /** unbedingte Zuweisungen an Ausgänge: Schlüssel → erste Stelle */
  private readonly outputWrites = new Map<string, { block: string; line: number; name: string }>();
  private readonly b = new ProgramBuilder();
  private tags = new TagTable();
  private locals = new Map<string, Sym>();
  private readonly dbs = new Map<string, DbEntry>();
  private readonly udts = new Map<string, UdtEntry>();
  private readonly idbs = new Map<string, InstEntry>();
  /** eigene FB/FC nach Namen */
  private readonly units = new Map<string, Unit>();
  /** Instanz-DBs eigener FBs */
  private readonly uinsts = new Map<string, UserInst>();
  /** aktuell expandierte FB/FC (Rekursionsschutz) */
  private readonly callStack: string[] = [];
  private readonly called = new Set<string>();
  /** >0: Meldungen unterdrücken (Bausteinrumpf wurde schon einzeln geprüft) */
  private mute = 0;
  private loopDepth = 0;
  private expansions = 0;
  /** Namenspräfix für Temp-Variablen des aktuellen OB */
  private prefix = '';
  private blockKind: Unit['kind'] = 'OB';
  private readonly areas: Record<Area, ByteArea>;
  private readonly temps = new Map<DataType, Operand[]>();
  private tempUse = new Map<DataType, number>();
  private readonly loops: Loop[] = [];
  private returns: Extract<Instr, { op: 'jmp' }>[] = [];
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
      if (u.kind === 'FB' || u.kind === 'FC') this.units.set(u.name.toLowerCase(), u);
      if (u.kind === 'TYPE') this.udts.set(u.name.toLowerCase(), { unit: u, state: 'new' });
    }
    for (const e of this.udts.values()) this.resolveUdt(e);
    for (const u of units) {
      this.origin = u.origin;
      if (u.kind === 'DB') this.globalDb(u);
      if (u.kind === 'IDB') this.instanceDb(u);
    }

    // Eigene FB/FC einmal für sich prüfen (Meldungen, Programmgröße); der erzeugte Code wird
    // verworfen – an jeder Aufrufstelle wird der Baustein eingesetzt.
    for (const u of this.units.values()) {
      if (u.errors.some((e) => e.severity === 'error' && e.location.part === 'code')) continue;
      this.statementCount += countStatements(u.body);
      const pc = this.b.pc;
      this.where = { block: u.name, part: 'code' };
      const dummy = u.kind === 'FB' ? { fb: u, display: `~${u.name}` } : undefined;
      this.guard(() => this.callUser(u, dummy, [], NO_SPAN, true));
      this.b.truncate(pc);
    }

    const obs = units.filter((u) => u.kind === 'OB');
    const main = obs.find((u) => !u.event);
    if (!main) {
      this.where = { part: 'project' };
      this.guard(() => this.fail('Kein Organisationsbaustein „Main“ (OB1) vorhanden', NO_SPAN));
    }
    const tasks: IrTask[] = [];
    let mainEnd = 0;
    for (const ob of main ? [main, ...obs.filter((o) => o !== main)] : obs) {
      this.where = { block: ob.name, part: 'project' };
      let task: IrTask | undefined;
      if (ob !== main) {
        let t: IrTask | undefined;
        this.guard(() => {
          t = this.eventTask(ob);
        });
        if (!t) continue;
        task = t;
      }
      if (ob.errors.some((e) => e.severity === 'error' && e.location.part === 'code')) continue;
      this.origin = ob.origin;
      this.intrinsics = !!ob.intrinsics;
      const start = this.b.pc;
      this.prefix = ob === main ? '' : `${ob.name}.`;
      this.codeBlock(ob);
      if (ob === main) mainEnd = this.b.pc;
      if (task) tasks.push({ ...task, start, end: this.b.pc });
    }
    for (const u of this.units.values()) {
      if (!this.called.has(u.name.toLowerCase()) && !LIBRARY.some((l) => l === u.source)) {
        this.push('warning', `Baustein „${u.name}“ wird nirgends aufgerufen`, NO_SPAN, {
          block: u.name,
          part: 'project',
        });
      }
    }

    const seen = new Set<string>();
    const unique = this.diagnostics.filter((d) => {
      const key = JSON.stringify([d.severity, d.message, d.location, d.start, d.end]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    this.diagnostics.length = 0;
    this.diagnostics.push(...unique);
    this.diagnostics.sort(
      (a, b) =>
        (a.location.block ?? '').localeCompare(b.location.block ?? '') ||
        a.start.line - b.start.line ||
        a.start.col - b.start.col,
    );
    const program = this.b.build();
    if (this.localErrors) program.localErrors = true;
    if (tasks.length) {
      program.mainEnd = mainEnd;
      program.tasks = tasks;
    }
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
    if (this.mute) return;
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

  private newSlot(
    name: string,
    t: DataType,
    init?: Value,
    temp = false,
    retain = false,
    len?: number,
  ): Operand {
    this.slotTypes.push(t);
    return temp ? this.b.temp(name, t, init, len) : this.b.slot(name, t, init, retain, len);
  }

  /** Startwert einer Zeichenkette darf die Höchstlänge nicht überschreiten */
  private checkInitLen(vt: VarType, v: Value | undefined, span: Span): void {
    const max = vt.k === 'elem' && vt.t === 'STRING' ? (vt.len ?? 254) : undefined;
    if (max !== undefined && typeof v === 'string' && v.length > max) {
      this.fail(`Startwert ist länger als ${max} Zeichen`, span);
    }
  }

  /** Remanenz nur in Global-DBs und in Input/Output/Static eines FB (wie S7-1500) */
  private checkRetain(d: Decl, kind: Unit['kind']): boolean {
    if (!d.retain) return false;
    const ok =
      kind === 'DB' || (kind === 'FB' && ['Input', 'Output', 'Static'].includes(d.section));
    if (!ok) {
      this.fail(
        'Remanent sind nur Variablen in Global-DBs und Input/Output/Static eines FB',
        d.span,
      );
    }
    return true;
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
        const retain = this.checkRetain(d, 'DB');
        if (it) {
          if (d.init) this.fail('Instanzen haben keinen Startwert', d.init.span);
          if (retain) {
            this.warn(
              'Zeiten und Zähler starten hier bei jedem Neustart neu (nicht remanent)',
              d.span,
            );
          }
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
        const vt = this.varType(d);
        if (vt.k !== 'elem') {
          const init = d.init ? this.initValues(vt, d.init) : undefined;
          const { place } = this.allocate(`${u.name}.${d.name}`, vt, init, false, retain);
          db.vars.set(key, { place });
          return;
        }
        const t = vt.t;
        const init = d.init ? this.constantValue(d.init, t) : undefined;
        this.checkInitLen(vt, init, d.span);
        db.vars.set(key, {
          t,
          op: this.newSlot(`${u.name}.${d.name}`, t, init, false, retain, vt.len),
        });
      });
    }
  }

  private instanceDb(u: Unit): void {
    this.where = { block: u.name, part: 'project' };
    this.guard(() => {
      const user = this.units.get(unquote(u.instanceOf ?? '').toLowerCase());
      if (user?.kind === 'FC') {
        this.fail(`„${user.name}“ ist eine Funktion (FC) und hat keinen Instanz-DB`, NO_SPAN);
      }
      if (user) {
        const start = u.start
          ? Object.fromEntries(Object.entries(u.start).map(([k, v]) => [k.toLowerCase(), v]))
          : undefined;
        if (start) {
          for (const k of Object.keys(start)) {
            if (!user.decls.some((d) => d.name.toLowerCase() === k && d.section !== 'Temp'))
              this.fail(`Instanz-DB „${u.name}“: ${user.name} hat kein Element ${k}`, NO_SPAN);
            const r = parseExpression(start[k]!);
            if (!r.expr || r.diagnostics.length)
              this.fail(
                `Instanz-DB „${u.name}“: Startwert von ${k} („${start[k]}“) ist ungültig`,
                NO_SPAN,
              );
          }
        }
        this.uinsts.set(u.name.toLowerCase(), { fb: user, display: u.name, start });
        return;
      }
      const it = instanceType(u.instanceOf ?? '');
      if (!it) {
        this.fail(
          `Instanz-DB „${u.name}“: unbekannter Typ „${u.instanceOf}“ (erwartet ein eigener FB oder z. B. IEC_TIMER, IEC_COUNTER, TON_TIME, R_TRIG)`,
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

  /** Elemente eines PLC-Datentyps auflösen (Meldungen je Element, Zyklen erkennen). */
  private resolveUdt(e: UdtEntry): void {
    if (e.state !== 'new') return;
    e.state = 'busy';
    const u = e.unit;
    const saved = { locals: this.locals, origin: this.origin, where: this.where };
    this.locals = new Map();
    this.origin = u.origin;
    const fields: Field[] = [];
    let ok = !u.errors.some((d) => d.severity === 'error');
    try {
      if (!u.decls.length) {
        this.where = { block: u.name, part: 'project' };
        this.push('error', `PLC-Datentyp „${u.name}“ hat keine Elemente`, NO_SPAN);
        ok = false;
      }
      for (const d of u.decls) {
        this.where = this.declWhere(u.name, d);
        let done = false;
        this.guard(() => {
          if (fields.some((f) => f.name.toLowerCase() === d.name.toLowerCase())) {
            this.fail(`Element ${d.name} ist im Datentyp doppelt vorhanden`, d.span);
          }
          if (instanceType(d.typeName) || this.units.has(unquote(d.typeName).toLowerCase())) {
            this.fail(`Instanzen (${d.typeName}) gehören nicht in einen PLC-Datentyp`, d.typeSpan);
          }
          const type = this.varType(d);
          fields.push({
            name: d.name,
            type,
            init: d.init ? this.initValues(type, d.init) : undefined,
          });
          done = true;
        });
        if (!done) ok = false;
      }
    } finally {
      Object.assign(this, saved);
    }
    e.state = ok ? 'done' : 'error';
    if (ok) e.type = { k: 'struct', name: u.name, fields };
  }

  private udtType(e: UdtEntry, span: Span): VarType {
    this.resolveUdt(e);
    if (e.state === 'busy') {
      this.fail(`PLC-Datentyp „${e.unit.name}“ enthält sich selbst`, span);
    }
    if (e.state === 'error') this.fail(`PLC-Datentyp „${e.unit.name}“ ist fehlerhaft`, span);
    return e.type!;
  }

  /** Datentyp einer Deklaration (Text aus der Tabelle oder geparst aus der Quelle). */
  private varType(d: Decl): VarType {
    let te = d.type;
    if (!te) {
      const r = parseTypeText(d.typeName);
      if (!r.type) {
        this.fail(
          `Datentyp „${d.typeName}“: ${r.diagnostics[0]?.message ?? 'ungültig'}`,
          d.typeSpan,
        );
      }
      te = r.type;
    }
    return this.resolveType(te, d.typeSpan);
  }

  private resolveType(te: TypeExpr, declSpan: Span): VarType {
    // Positionen im Typtext gibt es nur bei Quellen; in der Tabelle zählt die Zeile
    const at = (s: Span) => (this.origin === 'source' ? s : declSpan);
    switch (te.k) {
      case 'name': {
        const upper = te.name.toUpperCase();
        if (!te.quoted && upper === 'STRING') {
          const len = te.len ?? 254;
          if (!(len >= 1 && len <= 254)) {
            this.fail('Länge einer Zeichenkette: 1 … 254 (String[20])', at(te.span));
          }
          return te.len === undefined
            ? { k: 'elem', t: 'STRING' }
            : { k: 'elem', t: 'STRING', len };
        }
        if (!te.quoted && upper === 'DTL' && te.len === undefined) return DTL_TYPE;
        const t = te.quoted ? undefined : ELEMENTARY[upper];
        if (t && te.len === undefined) return { k: 'elem', t };
        const udt = this.udts.get(te.name.toLowerCase());
        if (udt && te.len === undefined) return this.udtType(udt, at(te.span));
        if (instanceType(te.name) || this.units.has(te.name.toLowerCase())) {
          this.fail(
            `Instanzen (${te.name}) können nicht Element eines Feldes oder einer Struktur sein`,
            at(te.span),
          );
        }
        this.fail(`Unbekannter Datentyp „${te.name}“`, at(te.span));
      }
      case 'array': {
        for (const [lo, hi] of te.dims) {
          if (lo > hi) {
            this.fail(`Feldgrenzen ${lo}..${hi}: Untergrenze größer als Obergrenze`, at(te.span));
          }
        }
        const t: VarType = { k: 'array', dims: te.dims, of: this.resolveType(te.of, declSpan) };
        if (sizeOf(t) > MAX_SLOTS) {
          this.fail(`Feld ist zu groß (höchstens ${MAX_SLOTS} Elemente)`, at(te.span));
        }
        return t;
      }
      case 'struct': {
        const fields: Field[] = [];
        for (const f of te.fields) {
          if (fields.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) {
            this.fail(`Element ${f.name} ist in der Struktur doppelt vorhanden`, at(f.span));
          }
          const type = this.resolveType(f.type!, declSpan);
          fields.push({
            name: f.name,
            type,
            init: f.init ? this.initValues(type, f.init) : undefined,
          });
        }
        if (!fields.length) this.fail('Struktur ohne Elemente', at(te.span));
        return { k: 'struct', fields };
      }
    }
  }

  /** Startwerte aller Slots eines Typs aus einem Startwert (Konstante bzw. Liste [1, 2, 3(0)]). */
  private initValues(t: VarType, e: Expr): (Value | undefined)[] {
    if (t.k === 'elem') {
      if (e.k === 'list') this.fail('Startwertliste [ … ] gibt es nur für Felder', e.span);
      return [this.constantValue(e, t.t)];
    }
    if (t.k === 'struct') {
      this.fail('Strukturen bekommen Startwerte je Element', e.span);
    }
    let of: VarType = t.of;
    let count = elementCount(t);
    while (of.k === 'array') {
      count *= elementCount(of);
      of = of.of;
    }
    if (of.k !== 'elem') {
      this.fail('Startwertlisten gibt es nur für Felder mit elementarem Typ', e.span);
    }
    if (e.k !== 'list') {
      this.fail(`Startwert eines Feldes ist eine Liste, z. B. [1, 2, ${count - 2}(0)]`, e.span);
    }
    const out: Value[] = [];
    for (const it of e.items) {
      if (it.n < 1) this.fail('Wiederholung braucht mindestens 1', it.e.span);
      const v = this.constantValue(it.e, of.t);
      for (let i = 0; i < it.n; i++) out.push(v);
    }
    if (out.length > count) {
      this.fail(`Zu viele Startwerte: ${out.length} für ${count} Elemente`, e.span);
    }
    return out;
  }

  /** Legt die Slots einer zusammengesetzten Variablen an (zusammenhängend). */
  private allocate(
    name: string,
    t: VarType,
    init: (Value | undefined)[] | undefined,
    temp: boolean,
    retain = false,
  ): { place: Place; inits: Value[] } {
    const ls = leaves(t, name);
    const inits = ls.map((l, i) => {
      const v = normalize(l.t, init?.[i] ?? l.init ?? defaultValue(l.t));
      return l.t === 'STRING' && l.len !== undefined ? (v as string).slice(0, l.len) : v;
    });
    let base = -1;
    ls.forEach((l, i) => {
      const o = this.newSlot(l.name, l.t, inits[i], temp, retain, l.len);
      if (i === 0 && o.k === 'slot') base = o.i;
    });
    return { place: { base, type: t, off: 0 }, inits };
  }

  /** Slot-Operand des i-ten elementaren Teils einer Lage */
  private leafOp(p: Place, i: number): Operand {
    return p.dyn
      ? {
          k: 'islot',
          base: p.base,
          idx: p.dyn.o,
          len: p.dyn.len,
          stride: p.dyn.stride,
          off: p.off + i,
        }
      : { k: 'slot', i: p.base + p.off + i };
  }

  private copyPlace(src: Place, dst: Place, span: Span): void {
    if (!sameType(src.type, dst.type)) {
      this.fail(
        `Typkonflikt: ${typeText(src.type)} passt nicht zu ${typeText(dst.type)} – nur gleiche Typen lassen sich als Ganzes zuweisen`,
        span,
      );
    }
    const n = sizeOf(src.type);
    for (let i = 0; i < n; i++) {
      this.b.emit({ op: 'mov', dst: this.leafOp(dst, i), src: this.leafOp(src, i) });
    }
  }

  /** DATA von TSEND_C/TRCV_C: eine Variable (elementar, Feld oder Struktur) als Elementliste */
  private commData(e: Expr, write: boolean, name: string): { data: Operand[]; types: DataType[] } {
    const res = e.k === 'ref' ? this.resolve(e) : undefined;
    if (res?.k === 'value') {
      if (write && !res.writable) this.fail(`DATA von ${name} ist nicht beschreibbar`, e.span);
      if (res.t === 'STRING') this.fail(`DATA von ${name}: String wird nicht übertragen`, e.span);
      return { data: [res.op], types: [res.t] };
    }
    if (res?.k === 'place') {
      if (write && !res.writable) this.fail(`DATA von ${name} ist nicht beschreibbar`, e.span);
      const n = sizeOf(res.place.type);
      const data = Array.from({ length: n }, (_, k) => this.leafOp(res.place, k));
      const types = Array.from({ length: n }, (_, k) =>
        this.b.slotType(res.place.base + res.place.off + k),
      );
      if (types.includes('STRING'))
        this.fail(`DATA von ${name}: String wird nicht übertragen`, e.span);
      return { data, types };
    }
    this.fail(`DATA von ${name} muss eine Variable sein (elementar, Feld oder Struktur)`, e.span);
  }

  /** Ganzes Feld bzw. ganze Struktur zuweisen: Quelle muss eine Variable gleichen Typs sein. */
  private assignPlace(dst: Place, e: Expr, what: string): void {
    const src = e.k === 'ref' ? this.resolve(e) : undefined;
    if (src?.k !== 'place') {
      this.fail(
        `${what} ist vom Typ ${typeText(dst.type)} – zuweisen lässt sich nur eine ganze Variable gleichen Typs`,
        e.span,
      );
    }
    this.copyPlace(src.place, dst, e.span);
  }

  /** Konstanter Feldindex (Literal oder Konstante), sonst undefined */
  private constIndex(e: Expr, quiet: boolean): number | undefined {
    if (e.k === 'lit' && typeof e.v === 'number' && Number.isInteger(e.v)) return e.v;
    if (e.k === 'ref' && e.scope !== 'addr' && e.scope !== 'tag' && !e.path.length && !e.idx) {
      const s = this.locals.get(e.name.toLowerCase());
      if (s?.k === 'const' && typeof s.v === 'number' && Number.isInteger(s.v)) {
        if (!quiet) s.used = true;
        return s.v;
      }
    }
    return undefined;
  }

  /**
   * Zugriff in eine Lage: Indizes und Elementnamen der Referenz ab Pfadposition `start`.
   * Konstante Indizes werden beim Übersetzen geprüft, variable zur Laufzeit (`chk`).
   * `quiet`: nur Typableitung, kein Code.
   */
  private access(p: Place, r: Ref, start: number, writable: boolean, quiet: boolean): Resolved {
    const idx = r.idx ?? [];
    const early = idx.find((x) => x.at < start);
    if (early) this.fail(`${refHead(r, early.at)} ist kein Feld`, early.span);
    let type = p.type;
    let off = p.off;
    const terms: Term[] = p.dyn ? [{ o: p.dyn.o, n: p.dyn.len, stride: p.dyn.stride }] : [];
    for (let i = start; ; i++) {
      for (const ix of idx.filter((x) => x.at === i)) {
        if (type.k !== 'array') {
          this.fail(`${refHead(r, i)} ist kein Feld (Typ ${typeText(type)})`, ix.span);
        }
        if (ix.es.length !== type.dims.length) {
          this.fail(
            `${refHead(r, i)} hat ${type.dims.length} Dimension${type.dims.length > 1 ? 'en' : ''}, angegeben ${ix.es.length} Index${ix.es.length > 1 ? 'e' : ''}`,
            ix.span,
          );
        }
        let stride = sizeOf(type.of) * elementCount(type);
        type.dims.forEach(([lo, hi], d) => {
          const e = ix.es[d]!;
          const n = hi - lo + 1;
          stride /= n;
          const c = this.constIndex(e, quiet);
          if (c !== undefined) {
            if (c < lo || c > hi) {
              this.fail(`Index ${c} liegt außerhalb von ${refHead(r, i)} (${lo}..${hi})`, e.span);
            }
            off += (c - lo) * stride;
            return;
          }
          if (quiet) {
            terms.push({ o: { k: 'const', t: 'DINT', v: 0 }, n, stride });
            return;
          }
          const nat = this.infer(e);
          if (nat !== 'ANY_INT' && !(nat && !isLiteralType(nat) && isIntType(nat))) {
            if (!nat) this.invalid(e);
            this.fail(`Feldindex muss eine Ganzzahl sein, ist ${typeName(nat)}`, e.span);
          }
          let a: Operand;
          if (nat === 'INT') a = this.genAs(e, 'INT');
          else if (nat === 'ANY_INT' || implicitOk(nat, 'DINT')) a = this.genAs(e, 'DINT');
          else {
            // UDInt, LInt, ULInt: gesättigt nach DInt, die Grenzprüfung meldet dann den Fehler
            const v = this.gen(e);
            a = this.temp('DINT');
            this.b.emit({ op: 'conv', dst: a, src: v.o, mode: 'round' });
          }
          const o = this.temp('DINT');
          this.b.emit({ op: 'chk', dst: o, a, lo, hi, msg: refHead(r, i) });
          terms.push({ o, n, stride });
        });
        type = type.of;
      }
      if (i >= r.path.length) break;
      const name = r.path[i]!;
      if (type.k !== 'struct') {
        this.fail(`${refHead(r, i)} hat kein Element ${name} (Typ ${typeText(type)})`, r.span);
      }
      const f = fieldOf(type, name);
      if (!f) {
        this.fail(
          `${refHead(r, i)} hat kein Element ${name} (verfügbar: ${type.fields.map((x) => x.name).join(', ')})`,
          r.span,
        );
      }
      off += f.off;
      type = f.field.type;
    }
    const dyn = this.combine(terms, quiet);
    const place: Place = { base: p.base, type, off, dyn };
    if (type.k === 'elem') {
      return { k: 'value', op: this.leafOp(place, 0), t: type.t, writable, indexed: true };
    }
    return { k: 'place', place, writable };
  }

  /** Mehrere variable Indizes zu einem zusammenfassen (Schrittweite = ggT). */
  private combine(terms: Term[], quiet: boolean): Place['dyn'] {
    if (!terms.length) return undefined;
    if (terms.length === 1) return { o: terms[0]!.o, len: terms[0]!.n, stride: terms[0]!.stride };
    const g = terms.reduce((a, t) => gcd(a, t.stride), 0);
    const len = terms.reduce((a, t) => a + (t.n - 1) * (t.stride / g), 0) + 1;
    if (quiet) return { o: { k: 'const', t: 'DINT', v: 0 }, len, stride: g };
    const acc = this.temp('DINT');
    terms.forEach((t, i) => {
      const f = this.constant('DINT', t.stride / g);
      if (i === 0) {
        this.b.emit({ op: 'bin', fn: 'mul', t: 'DINT', dst: acc, a: t.o, b: f });
        return;
      }
      const tmp = this.temp('DINT');
      this.b.emit({ op: 'bin', fn: 'mul', t: 'DINT', dst: tmp, a: t.o, b: f });
      this.b.emit({ op: 'bin', fn: 'add', t: 'DINT', dst: acc, a: acc, b: tmp });
    });
    return { o: acc, len, stride: g };
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
    this.locals = new Map();
    this.returns = [];
    this.blockKind = u.kind;
    const info = this.eventInfo.get(u.name.toLowerCase());
    if (info) {
      const decl: Decl = {
        section: 'Input',
        name: 'Event_Class',
        typeName: 'Byte',
        typeSpan: NO_SPAN,
        span: NO_SPAN,
      };
      this.locals.set('event_class', {
        k: 'var',
        name: 'Event_Class',
        t: 'BYTE',
        op: info,
        decl,
        used: true,
      });
    }
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
    this.checkRetain(d, 'OB');
    if (instanceType(d.typeName)) {
      this.fail(
        `Instanzen (${d.typeName}) gehören in einen Instanz-DB, z. B. "${d.name}_DB" vom Typ ${d.typeName}`,
        d.typeSpan,
      );
    }
    const vt = this.varType(d);
    if (vt.k !== 'elem') {
      if (d.section === 'Constant') this.fail('Konstanten haben einen elementaren Typ', d.typeSpan);
      const init = d.init ? this.initValues(vt, d.init) : undefined;
      const { place, inits } = this.allocate(this.prefix + d.name, vt, init, true);
      this.locals.set(key, { k: 'agg', name: d.name, place, inits, decl: d, used: false });
      return;
    }
    const t = vt.t;
    const init = d.init ? this.constantValue(d.init, t) : undefined;
    if (d.section === 'Constant') {
      this.locals.set(key, { k: 'const', name: d.name, t, v: init!, decl: d, used: false });
      return;
    }
    this.checkInitLen(vt, init, d.span);
    const op = this.newSlot(this.prefix + d.name, t, init, true, false, vt.len);
    this.locals.set(key, { k: 'var', name: d.name, t, op, decl: d, used: false });
  }

  // ---------- Alarm-OBs ----------

  private eventTask(ob: Unit): IrTask {
    const ev = ob.event;
    if (!ev) {
      this.fail(
        `Nur OB1 „Main“ läuft ohne Ereignis – weise „${ob.name}“ einen Weck-, Prozessalarm oder Anlauf zu`,
        NO_SPAN,
      );
    }
    const [lo, hi] = OB_NUMBERS[ev.kind];
    const label =
      ev.kind === 'cyclic'
        ? 'Weckalarm'
        : ev.kind === 'process'
          ? 'Prozessalarm'
          : SIMPLE_EVENTS[ev.kind];
    if (ob.number !== undefined && (ob.number < lo || ob.number > hi)) {
      this.fail(
        lo === hi
          ? `${label}-OBs haben die Nummer ${lo} (ist ${ob.number})`
          : `${label}-OBs haben die Nummern ${lo} … ${hi} (ist ${ob.number})`,
        NO_SPAN,
      );
    }
    if (ev.kind === 'diagnostic' || ev.kind === 'rackFailure') {
      // Startinformation #Event_Class (nur lesbar im OB)
      const op = this.newSlot(`${ob.name}.Event_Class`, 'BYTE');
      this.eventInfo.set(ob.name.toLowerCase(), op);
      return {
        kind: ev.kind,
        name: ob.name,
        start: 0,
        end: 0,
        eventClass: (op as { i: number }).i,
      };
    }
    if (isSimpleEvent(ev)) return { kind: ev.kind, name: ob.name, start: 0, end: 0 };
    if (ev.kind === 'cyclic') {
      if (!Number.isInteger(ev.intervalMs) || ev.intervalMs < 1 || ev.intervalMs > 60000) {
        this.fail('Weckalarm: Takt muss 1 … 60000 ms betragen', NO_SPAN);
      }
      const phase = ev.phaseMs ?? 0;
      if (!Number.isInteger(phase) || phase < 0 || phase >= ev.intervalMs) {
        this.fail('Weckalarm: Phasenverschiebung muss zwischen 0 und Takt − 1 ms liegen', NO_SPAN);
      }
      return {
        kind: 'cyclic',
        name: ob.name,
        start: 0,
        end: 0,
        intervalMs: ev.intervalMs,
        phaseMs: phase,
      };
    }
    const text = unquote(ev.input.trim());
    let op: Operand | undefined;
    try {
      op = text.startsWith('%') ? io(text, 'BOOL') : this.tags.resolve(text);
    } catch {
      op = undefined;
    }
    if (
      !op ||
      op.k !== 'io' ||
      op.area !== 'I' ||
      op.t !== 'BOOL' ||
      !this.areas.I.fits('BOOL', op.byte)
    ) {
      this.fail(`Prozessalarm: „${ev.input}“ ist kein Eingangsbit (z. B. %I0.0)`, NO_SPAN);
    }
    return {
      kind: 'process',
      name: ob.name,
      start: 0,
      end: 0,
      input: { byte: op.byte, bit: op.bit },
      edge: ev.edge,
    };
  }

  // ---------- Eigene FB/FC (werden an der Aufrufstelle eingesetzt) ----------

  /** Aufgerufener eigener Baustein: FC, Instanz-DB eines FB oder Multiinstanz. */
  private userCallee(r: Ref): { unit: Unit; inst?: UserInst } | undefined {
    if (r.scope === 'addr') return undefined;
    if (r.scope !== 'tag') {
      const s = this.locals.get(r.name.toLowerCase());
      if (s) {
        if (s.k !== 'uinst') return undefined;
        if (r.path.length) this.fail(`Multiinstanz wird direkt aufgerufen: #${s.name}(…)`, r.span);
        s.used = true;
        return { unit: s.inst.fb, inst: s.inst };
      }
      if (r.scope === 'local') return undefined;
    }
    if (r.path.length) return undefined;
    const key = r.name.toLowerCase();
    const ui = this.uinsts.get(key);
    if (ui) return { unit: ui.fb, inst: ui };
    const unit = this.units.get(key);
    if (unit?.kind === 'FC') return { unit };
    if (unit?.kind === 'FB') {
      this.fail(
        `FB „${unit.name}“ braucht eine Instanz – lege einen Instanz-DB an und rufe ihn auf, z. B. "${unit.name}_DB"(…);`,
        r.span,
      );
    }
    return undefined;
  }

  /** Legt eine Variable eines eigenen Bausteins an (Elementartyp, Konstante oder Multiinstanz). */
  private makeSym(u: Unit, d: Decl & { row?: number }, slotName: string, temp: boolean): Sym {
    const sys = instanceType(d.typeName);
    const user = this.units.get(unquote(d.typeName).toLowerCase());
    const retain = this.checkRetain(d, u.kind) && !temp;
    if (sys || user) {
      if (d.section !== 'Static') {
        this.fail(
          `Instanzen (${d.typeName}) sind nur als statische Variable möglich (Multiinstanz)`,
          d.typeSpan,
        );
      }
      if (d.init) this.fail('Instanzen haben keinen Startwert', d.init.span);
      if (sys) {
        return {
          k: 'inst',
          name: d.name,
          entry: {
            key: slotName.toLowerCase(),
            display: slotName,
            typeName: d.typeName,
            type: sys,
          },
          decl: d,
          used: false,
        };
      }
      if (user!.kind !== 'FB') {
        this.fail(`„${user!.name}“ ist eine Funktion (FC) und hat keine Instanz`, d.typeSpan);
      }
      if (user === u)
        this.fail('Ein FB kann sich nicht selbst als Multiinstanz enthalten', d.typeSpan);
      return {
        k: 'uinst',
        name: d.name,
        inst: { fb: user!, display: slotName },
        decl: d,
        used: false,
      };
    }
    const vt = this.varType(d);
    if (vt.k !== 'elem') {
      if (d.section === 'Constant') this.fail('Konstanten haben einen elementaren Typ', d.typeSpan);
      const init = d.init ? this.initValues(vt, d.init) : undefined;
      const { place, inits } = this.allocate(slotName, vt, init, temp, retain);
      return { k: 'agg', name: d.name, place, inits, decl: d, used: false };
    }
    const t = vt.t;
    const init = d.init ? this.constantValue(d.init, t) : undefined;
    if (d.section === 'Constant') {
      if (init === undefined) this.fail(`Konstante ${d.name} braucht einen Wert`, d.span);
      return { k: 'const', name: d.name, t, v: init, decl: d, used: false };
    }
    return {
      k: 'var',
      name: d.name,
      t,
      op:
        (this.checkInitLen(vt, init, d.span),
        this.newSlot(slotName, t, init, temp, retain, vt.len)),
      decl: d,
      used: false,
    };
  }

  private declareAll(
    u: Unit,
    decls: (Decl & { row?: number })[],
    into: Map<string, Sym>,
    slotName: (d: Decl) => string,
    temp: boolean,
  ): void {
    const saved = { locals: this.locals, origin: this.origin, where: this.where };
    // Startwerte dürfen Konstanten des Bausteins verwenden
    this.locals = into;
    this.origin = u.origin;
    try {
      for (const d of decls) {
        this.where = this.declWhere(u.name, d);
        this.guard(() => {
          const key = d.name.toLowerCase();
          if (into.has(key)) this.fail(`#${d.name} ist bereits deklariert`, d.span);
          into.set(key, this.makeSym(u, d, slotName(d), temp));
        });
      }
    } finally {
      Object.assign(this, saved);
    }
  }

  /** Eingänge, Ausgänge und statische Daten einer FB-Instanz (einmal je Instanz). */
  private instanceScope(ui: UserInst): Map<string, Sym> {
    if (ui.vars) return ui.vars;
    const vars = new Map<string, Sym>();
    ui.vars = vars;
    const order: IfaceSection[] = ['Constant', 'Input', 'Output', 'Static'];
    const decls = order
      .flatMap((s) => ui.fb.decls.filter((d) => d.section === s))
      .map((d) => {
        const text = ui.start?.[d.name.toLowerCase()];
        if (text === undefined || d.section === 'Constant') return d;
        const r = parseExpression(text);
        return r.expr && !r.diagnostics.length ? { ...d, init: r.expr } : d;
      });
    this.declareAll(ui.fb, decls, vars, (d) => `${ui.display}.${d.name}`, false);
    return vars;
  }

  /** Zugriff von außen auf eine FB-Instanz: "Motor_DB".Laufzeit, "Motor_DB".T1.Q */
  private userPath(ui: UserInst, path: string[], r: Ref, quiet = false): Resolved {
    const vars = this.instanceScope(ui);
    const s = vars.get(path[0]!.toLowerCase());
    if (!s || s.k === 'const') {
      const names = [...vars.values()].filter((v) => v.k !== 'const').map((v) => v.name);
      this.fail(
        `${ui.display} hat kein Element ${path[0]}${names.length ? ` (verfügbar: ${names.join(', ')})` : ''}`,
        r.span,
      );
    }
    s.used = true;
    if (s.k === 'agg') {
      const start = r.path.length - path.length + 1;
      return this.access(s.place, r, start, s.decl.section !== 'Output', quiet);
    }
    if (s.k === 'var') {
      if (path.length > 1) this.fail(`${refText(r)}: zu viele Elemente`, r.span);
      // Ausgänge schreibt nur der FB selbst
      return { k: 'value', op: s.op, t: s.t, writable: s.decl.section !== 'Output' };
    }
    if (s.k === 'inst') {
      if (path.length === 1) return { k: 'instance', entry: s.entry };
      if (path.length > 2) this.fail(`${refText(r)}: zu viele Elemente`, r.span);
      return this.member(s.entry, path[1]!, r);
    }
    return path.length === 1
      ? { k: 'uinst', inst: s.inst }
      : this.userPath(s.inst, path.slice(1), r, quiet);
  }

  /**
   * Aufruf eines eigenen FB/FC: Eingänge kopieren, Rumpf einsetzen, Ausgänge kopieren.
   * Durchgangsparameter (InOut) werden direkt auf den Aktualparameter abgebildet.
   * `dry`: Prüflauf ohne Aufrufstelle (Meldungen, Code wird verworfen).
   */
  private callUser(
    callee: Unit,
    inst: UserInst | undefined,
    givenArgs: FbArg[],
    span: Span,
    dry = false,
  ): Map<string, Sym> {
    const key = callee.name.toLowerCase();
    if (this.callStack.includes(key)) {
      // auch innerhalb eines stummen Einsetzens melden: Rekursion zeigt sich erst hier
      const mute = this.mute;
      this.mute = 0;
      this.push('error', `Rekursiver Aufruf von „${callee.name}“ ist nicht möglich`, span);
      this.mute = mute;
      return new Map();
    }
    if (!dry) this.called.add(key);
    const where = this.where;
    if (!dry && !this.mute && !this.intrinsics && where.block && where.part === 'code') {
      this.calls.push({
        from: where.block,
        to: callee.name,
        ...(inst ? { instance: inst.display } : {}),
        line: span.start.line,
      });
    }

    // Gültigkeitsbereich des Bausteins
    const scope = new Map<string, Sym>(inst ? this.instanceScope(inst) : []);
    const allowed = SECTIONS_BY_KIND[callee.kind as 'FB' | 'FC'];
    if (dry) {
      for (const d of callee.decls) {
        if (allowed.includes(d.section)) continue;
        this.where = this.declWhere(callee.name, d);
        this.push(
          'error',
          `${callee.kind === 'FC' ? 'Eine FC' : 'Ein FB'} hat keinen Bereich ${d.section}${d.section === 'Static' ? ' – statische Daten brauchen einen FB' : ''}`,
          d.span,
        );
      }
    }
    const local: IfaceSection[] =
      callee.kind === 'FC' ? ['Constant', 'Input', 'Output', 'Temp'] : ['Temp'];
    if (dry) local.push('InOut');
    const n = this.expansions++;
    this.declareAll(
      callee,
      local.flatMap((s) => callee.decls.filter((d) => d.section === s)),
      scope,
      (d) => `${callee.name}#${n}.${d.name}`,
      true,
    );
    if (callee.kind === 'FC' && callee.returnType) {
      // Rückgabewert: im Baustein #Ret_Val, beim Aufrufer der Wert des Ausdrucks
      const ret: Decl = {
        section: 'Output',
        name: 'Ret_Val',
        typeName: callee.returnType,
        typeSpan: NO_SPAN,
        span: NO_SPAN,
      };
      this.where = { block: callee.name, part: 'interface' };
      const t = this.varType(ret);
      if (t.k !== 'elem') {
        this.fail(`Rückgabewert von „${callee.name}“: nur elementare Datentypen`, NO_SPAN);
      }
      scope.set('ret_val', this.makeSym(callee, ret, `${callee.name}#${n}.Ret_Val`, true));
    }
    this.where = where;

    // Parameter binden (im Kontext des Aufrufers)
    const params = callee.decls.filter(
      (d) => d.section === 'Input' || d.section === 'Output' || d.section === 'InOut',
    );
    // Positionsparameter der Reihe nach auf Eingänge und Durchgangsparameter; Ausgänge
    // bleiben benannt (NAME => ziel)
    let args = givenArgs;
    const positional = args.filter((a) => !a.name);
    if (positional.length) {
      if (args.some((a) => a.name && !a.out)) {
        this.fail('Eingänge entweder alle benannt oder alle ohne Namen angeben', span);
      }
      const ins = params.filter((d) => d.section !== 'Output');
      if (positional.length > ins.length) {
        this.fail(
          `„${callee.name}“ hat ${ins.length} Eingänge/Durchgangsparameter, angegeben ${positional.length}`,
          span,
        );
      }
      let i = 0;
      args = args.map((a) => (a.name ? a : { ...a, name: ins[i++]!.name.toUpperCase() }));
    }
    const byName = new Map(params.map((d) => [d.name.toUpperCase(), d]));
    const given = new Map<string, FbArg>();
    for (const a of args) {
      if (given.has(a.name)) this.fail(`Parameter ${a.name} ist doppelt angegeben`, a.span);
      given.set(a.name, a);
      const d = byName.get(a.name);
      if (!d) {
        this.fail(
          `„${callee.name}“ hat keinen Parameter ${a.name}${params.length ? ` (Parameter: ${params.map((p) => p.name).join(', ')})` : ''}`,
          a.span,
        );
      }
      if (d.section === 'Output' && !a.out) {
        this.fail(`${d.name} ist ein Ausgang – verschalte ihn mit ${d.name} => …`, a.span);
      }
      if (d.section !== 'Output' && !a.e) {
        this.fail(`${d.name} ist ein Eingang – versorge ihn mit ${d.name} := …`, a.span);
      }
    }
    for (const d of params) {
      if (dry || d.section === 'Output') continue;
      const a = given.get(d.name.toUpperCase());
      if (d.section === 'InOut') {
        if (!a) this.fail(`Durchgangsparameter ${d.name} von „${callee.name}“ fehlt`, span);
        if (a.e!.k !== 'ref')
          this.fail(`Durchgangsparameter ${d.name} braucht eine Variable`, a.span);
        const res = this.resolve(a.e as Ref);
        const vt = this.varType(d);
        if (res.k === 'place' || vt.k !== 'elem') {
          if (res.k !== 'place' || !sameType(res.place.type, vt)) {
            this.fail(
              `Durchgangsparameter ${d.name}: ${res.k === 'place' ? typeText(res.place.type) : res.k === 'value' ? typeName(res.t) : 'Instanz'} passt nicht zu ${typeText(vt)} – die Typen müssen gleich sein`,
              a.e!.span,
            );
          }
          if (!res.writable) this.fail(`${refText(a.e as Ref)} kann nur gelesen werden`, a.e!.span);
          scope.set(d.name.toLowerCase(), {
            k: 'agg',
            name: d.name,
            place: res.place,
            inits: [],
            decl: d,
            used: true,
          });
          continue;
        }
        const v = this.writableOf(res, a.e as Ref);
        const t = vt.t;
        if (v.t !== t) {
          this.fail(
            `Durchgangsparameter ${d.name}: ${typeName(v.t)} passt nicht zu ${typeName(t)} – die Typen müssen gleich sein`,
            a.e!.span,
          );
        }
        scope.set(d.name.toLowerCase(), {
          k: 'var',
          name: d.name,
          t,
          op: v.o,
          decl: d,
          used: true,
        });
        continue;
      }
      const s = scope.get(d.name.toLowerCase());
      if (!a) {
        if (callee.kind === 'FC') this.fail(`Eingang ${d.name} von „${callee.name}“ fehlt`, span);
        continue; // FB: Eingang behält den Wert vom letzten Aufruf
      }
      if (s?.k === 'var') this.assignTo({ o: s.op, t: s.t }, a.e!);
      if (s?.k === 'agg') this.assignPlace(s.place, a.e!, `Eingang ${d.name}`);
    }

    // Rumpf einsetzen
    const saved = {
      locals: this.locals,
      returns: this.returns,
      where: this.where,
      origin: this.origin,
      intrinsics: this.intrinsics,
      blockKind: this.blockKind,
    };
    const loops = this.loops.splice(0);
    this.locals = scope;
    this.returns = [];
    this.where = { block: callee.name, part: 'code' };
    this.origin = callee.origin;
    this.intrinsics = !!callee.intrinsics;
    this.blockKind = callee.kind;
    this.callStack.push(key);
    if (!dry) this.mute++;
    try {
      // Temp-Variablen starten bei jedem Aufruf neu; außerhalb von Schleifen erledigt das
      // schon die CPU zu Zyklusbeginn, weil jede Aufrufstelle eigene Temp-Variablen hat.
      if (this.loopDepth > 0) {
        for (const s of scope.values()) {
          if (s.k === 'agg' && s.decl.section === 'Temp') {
            s.inits.forEach((v, i) => {
              const o = this.leafOp(s.place, i);
              this.b.emit({ op: 'mov', dst: o, src: this.constant(this.typeOfOp(o)!, v) });
            });
          }
          if (s.k !== 'var' || s.decl.section !== 'Temp') continue;
          const v = s.decl.init ? this.constantValue(s.decl.init, s.t) : defaultValue(s.t);
          this.b.emit({ op: 'mov', dst: s.op, src: this.constant(s.t, v) });
        }
      }
      this.collectMethods(callee.body);
      this.stmts(callee.body);
      for (const r of this.returns) r.to = this.b.pc;
      if (dry) {
        for (const s of scope.values()) {
          if (s.used || !['Temp', 'Static', 'Constant'].includes(s.decl.section)) continue;
          this.push(
            'warning',
            `Variable #${s.name} wird nicht verwendet`,
            s.decl.span,
            this.declWhere(callee.name, s.decl),
          );
        }
      }
    } finally {
      Object.assign(this, saved);
      this.loops.push(...loops);
      this.callStack.pop();
      if (!dry) this.mute--;
    }

    // Ausgänge
    for (const a of args) {
      if (!a.out) continue;
      const s = scope.get(a.name.toLowerCase());
      if (s?.k === 'agg') {
        const res = this.resolve(a.out);
        if (res.k !== 'place') {
          this.fail(
            `Ausgang ${s.name} ist vom Typ ${typeText(s.place.type)} – verschalte ihn mit einer Variablen gleichen Typs`,
            a.span,
          );
        }
        if (!res.writable) this.fail(`${refText(a.out)} kann nur gelesen werden`, a.span);
        this.copyPlace(s.place, res.place, a.span);
        continue;
      }
      if (s?.k !== 'var') continue;
      this.store({ o: s.op, t: s.t }, this.writable(a.out), a.span);
    }
    return scope;
  }

  /** FC-Aufruf in einem Ausdruck bzw. als Anweisung: Argumente wie beim Bausteinaufruf */
  private callFc(e: Extract<Expr, { k: 'call' }>, unit: Unit, needValue: boolean): Val | undefined {
    if (unit.kind === 'FB') {
      this.fail(
        `„${unit.name}“ ist ein FB – rufe seinen Instanz-DB als Anweisung auf, z. B. "${unit.name}_DB"(…);`,
        e.span,
      );
    }
    if (needValue && !unit.returnType) {
      this.fail(
        `„${unit.name}“ liefert keinen Wert (Rückgabetyp Void) – rufe sie als Anweisung auf`,
        e.span,
      );
    }
    const args: FbArg[] = e.args.map((a) => ({
      name: a.name ?? '',
      ...(a.out ? { out: a.out } : { e: a.e }),
      span: a.span,
    }));
    const scope = this.callUser(unit, undefined, args, e.span);
    const ret = scope.get('ret_val');
    return ret?.k === 'var' ? { o: ret.op, t: ret.t } : undefined;
  }

  /** Eigene FC zu einem Aufruf (Name in Anführungszeichen oder kein Standardbefehl) */
  private userFc(e: Extract<Expr, { k: 'call' }>): Unit | undefined {
    if (!e.quoted && isBuiltinFunction(e.name)) return undefined;
    return this.units.get((e.raw ?? e.name).toLowerCase());
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
    if (r.scope === 'addr') return undefined;
    if (r.scope !== 'tag' && r.path.length === 0) {
      const s = this.locals.get(r.name.toLowerCase());
      if (s?.k === 'inst') return s.entry;
    }
    if (r.scope === 'local') return undefined;
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
      if (s.k !== 'region') this.probe('line', s.span);
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
        this.probe('cond', s.cond.span, cond);
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
        this.probe('cond', s.cond.span, cond);
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
        const user = s.e.k === 'call' ? this.userFc(s.e) : undefined;
        if (user && s.e.k === 'call') {
          this.callFc(s.e, user, false);
          return;
        }
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

  /** Messpunkt im Quelltext des aktuellen Bausteins (nur SCL, nicht aus FUP erzeugt) */
  private probe(kind: 'line' | 'cond', span: Span, src?: Operand): void {
    const block = this.where.block;
    if (!this.opts.probes || this.intrinsics || !block || this.where.part !== 'code') return;
    const i = this.b.probe({ block, line: span.start.line, kind });
    this.b.emit(src ? { op: 'probe', i, src } : { op: 'probe', i });
  }

  private loopBody(loop: Loop, body: Stmt[]): void {
    this.loops.push(loop);
    this.loopDepth++;
    this.condDepth++;
    this.stmts(body);
    this.condDepth--;
    this.loopDepth--;
    this.loops.pop();
  }

  private closeLoop(loop: Loop, cont: number, exit: number): void {
    for (const j of loop.continues) j.to = cont;
    for (const j of loop.exits) j.to = exit;
  }

  private assign(target: Ref, e: Expr): void {
    const res = this.resolve(target);
    if (res.k === 'slice') {
      this.assignSlice(res, target, e);
      return;
    }
    if (res.k === 'place') {
      if (!res.writable) this.fail(`${refText(target)} kann nur gelesen werden`, target.span);
      this.markWrite(target);
      this.assignPlace(res.place, e, refText(target));
      return;
    }
    const dst = this.writableOf(res, target);
    this.checkMultipleWrite(dst.o, target);
    this.assignTo(dst, e);
  }

  /**
   * Warnung, wenn ein Ausgang an zwei Stellen unbedingt zugewiesen wird: die frühere Zuweisung
   * wirkt dann nie (häufiger Fehler beim Erweitern eines Programms).
   */
  private checkMultipleWrite(o: Operand, r: Ref): void {
    const block = this.where.block;
    if (
      o.k !== 'io' ||
      o.area !== 'Q' ||
      this.condDepth ||
      this.mute ||
      this.intrinsics ||
      !block
    ) {
      return;
    }
    const key = `${o.byte}.${o.bit}|${o.t}`;
    const first = this.outputWrites.get(key);
    const here = { block, line: r.span.start.line, name: refText(r) };
    if (!first) {
      this.outputWrites.set(key, here);
      return;
    }
    if (first.block === here.block && first.line === here.line) return;
    this.warn(
      `${here.name} wird schon in ${first.block === block ? '' : `„${first.block}“ `}Zeile ${first.line} unbedingt zugewiesen – die frühere Zuweisung wirkt nie`,
      r.span,
    );
  }

  private assignTo(dst: Val, e: Expr): void {
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
    return this.writableOf(this.resolve(r), r);
  }

  /** Bitfolge gleicher Breite für Teilzugriffe */
  private bitsOf(t: DataType): DataType {
    const w = bitWidth(t);
    return w === 8 ? 'BYTE' : w === 16 ? 'WORD' : 'DWORD';
  }

  /** Wert der Basis als Bitfolge (Kopie in einem Temp, wenn umgewandelt werden muss) */
  private bitsOfValue(base: Extract<Resolved, { k: 'value' }>): Operand {
    const W = this.bitsOf(base.t);
    if (base.t === W) return base.op;
    const tmp = this.temp(W);
    this.b.emit({ op: 'conv', dst: tmp, src: base.op, mode: 'round' });
    return tmp;
  }

  private readSlice(s: Extract<Resolved, { k: 'slice' }>, dst?: Operand): Val {
    const W = this.bitsOf(s.base.t);
    const w = this.bitsOfValue(s.base);
    const sh = this.temp(W);
    this.b.emit({
      op: 'bin',
      fn: 'shr',
      t: W,
      dst: sh,
      a: w,
      b: this.constant('INT', s.n * s.unit),
    });
    const mask = s.unit === 32 ? 0xffffffff : 2 ** s.unit - 1;
    const m = this.temp(W);
    this.b.emit({ op: 'bin', fn: 'and', t: W, dst: m, a: sh, b: this.constant(W, mask) });
    if (s.t === W) return { o: m, t: W };
    const o = this.result(s.t, dst);
    this.b.emit({ op: 'conv', dst: o, src: m, mode: 'round' });
    return { o, t: s.t };
  }

  /** x.%X3 := TRUE: Bits löschen, neuen Wert einschieben, zurückschreiben */
  private assignSlice(s: Extract<Resolved, { k: 'slice' }>, r: Ref, e: Expr): void {
    const base = this.writableOf(s.base, r);
    const v = this.genAs(e, s.t);
    const W = this.bitsOf(s.base.t);
    const shift = s.n * s.unit;
    const full = 2 ** bitWidth(W) - 1;
    const mask = (s.unit === 32 ? 0xffffffff : 2 ** s.unit - 1) * 2 ** shift;
    const w = this.temp(W);
    const cur = this.bitsOfValue(s.base);
    this.b.emit({ op: 'bin', fn: 'and', t: W, dst: w, a: cur, b: this.constant(W, full - mask) });
    const part = this.temp(W);
    this.b.emit({ op: 'conv', dst: part, src: v, mode: 'round' });
    if (shift) {
      this.b.emit({
        op: 'bin',
        fn: 'shl',
        t: W,
        dst: part,
        a: part,
        b: this.constant('INT', shift),
      });
    }
    this.b.emit({ op: 'bin', fn: 'or', t: W, dst: w, a: w, b: part });
    this.b.emit(
      base.t === W
        ? { op: 'mov', dst: base.o, src: w }
        : { op: 'conv', dst: base.o, src: w, mode: 'round' },
    );
  }

  /** Feldelement #Feld[i] für Blockbefehle: Lage des Feldes, Startindex */
  private arrayElem(r: Ref | undefined, what: string, span: Span) {
    const last = r?.idx?.[r.idx.length - 1];
    if (!r || !last || last.at !== r.path.length) {
      this.fail(`${what} muss ein Feldelement sein, z. B. #Werte[0]`, r?.span ?? span);
    }
    if (last.es.length !== 1) this.fail(`${what}: nur eindimensionale Felder`, last.span);
    const rest = r.idx!.slice(0, -1);
    const arrRef: Ref = { ...r, idx: rest.length ? rest : undefined };
    if (!rest.length) delete arrRef.idx;
    const res = this.resolve(arrRef);
    if (res.k !== 'place' || res.place.type.k !== 'array' || res.place.type.dims.length !== 1) {
      this.fail(`${what} muss ein Element eines eindimensionalen Feldes sein`, r.span);
    }
    return {
      place: res.place,
      arr: res.place.type,
      start: last.es[0]!,
      writable: res.writable,
      ref: arrRef,
    };
  }

  /** MOVE_BLK / FILL_BLK als Schleife: Elemente einzeln geprüft (außerhalb → Programmierfehler) */
  private blockMove(name: string, args: FbArg[], span: Span): void {
    const fill = name.includes('FILL');
    const known = ['IN', 'COUNT', 'OUT'];
    for (const a of args) {
      if (!known.includes(a.name)) {
        this.fail(
          `${name} hat keinen Parameter ${a.name || '(ohne Namen)'} (IN, COUNT, OUT)`,
          a.span,
        );
      }
    }
    const get = (p: string) => args.find((a) => a.name === p);
    const inArg = get('IN');
    const cntArg = get('COUNT');
    const outArg = get('OUT');
    if (!inArg?.e || !cntArg?.e || !outArg?.out) {
      this.fail(`${name} braucht IN := …, COUNT := … und OUT => …`, span);
    }
    const dst = this.arrayElem(outArg.out, 'OUT', span);
    this.markWrite(dst.ref);
    if (!dst.writable) this.fail(`${refText(outArg.out)} kann nur gelesen werden`, outArg.span);
    const elemT = dst.arr.of;
    const size = sizeOf(elemT);

    // Quelle bzw. Füllwert einmal vor der Schleife
    let src: ReturnType<CodeGen['arrayElem']> | undefined;
    let value: { op: Operand } | { place: Place } | undefined;
    if (!fill) {
      src = this.arrayElem(inArg.e.k === 'ref' ? inArg.e : undefined, 'IN', inArg.span);
      if (!sameType(src.arr.of, elemT)) {
        this.fail(
          `${name}: Elemente ${typeText(src.arr.of)} und ${typeText(elemT)} passen nicht zusammen`,
          span,
        );
      }
    } else if (elemT.k === 'elem') {
      const v = this.temp(elemT.t);
      this.b.emit({ op: 'mov', dst: v, src: this.genAs(inArg.e, elemT.t) });
      value = { op: v };
    } else {
      const res = inArg.e.k === 'ref' ? this.resolve(inArg.e) : undefined;
      if (res?.k !== 'place' || !sameType(res.place.type, elemT)) {
        this.fail(`${name}: IN muss vom Typ ${typeText(elemT)} sein`, inArg.span);
      }
      value = { place: res.place };
    }
    const cnt = this.temp('DINT');
    this.b.emit({ op: 'mov', dst: cnt, src: this.genAs(cntArg.e, 'DINT') });
    const start = (x: { start: Expr }) => {
      const s = this.temp('DINT');
      this.b.emit({ op: 'mov', dst: s, src: this.genAs(x.start, 'DINT') });
      return s;
    };
    const d0 = start(dst);
    const s0 = src ? start(src) : undefined;

    const k = this.temp('DINT');
    this.b.emit({ op: 'mov', dst: k, src: this.constant('DINT', 0) });
    const c = this.temp('BOOL');
    const top = this.b.pc;
    this.b.emit({ op: 'cmp', fn: 'lt', t: 'DINT', dst: c, a: k, b: cnt });
    const jz = this.b.emit({ op: 'jz', cond: c, to: -1 });
    const element = (x: NonNullable<typeof src>, s: Operand): Place => {
      const [lo, hi] = x.arr.dims[0]!;
      const i = this.temp('DINT');
      this.b.emit({ op: 'bin', fn: 'add', t: 'DINT', dst: i, a: s, b: k });
      const z = this.temp('DINT');
      this.b.emit({ op: 'chk', dst: z, a: i, lo, hi, msg: `${name} ${refText(x.ref)}` });
      const terms: Term[] = x.place.dyn
        ? [{ o: x.place.dyn.o, n: x.place.dyn.len, stride: x.place.dyn.stride }]
        : [];
      terms.push({ o: z, n: hi - lo + 1, stride: size });
      return { base: x.place.base, type: elemT, off: x.place.off, dyn: this.combine(terms, false) };
    };
    const to = element(dst, d0);
    const from = src && s0 ? element(src, s0) : undefined;
    for (let n = 0; n < size; n++) {
      const v = from
        ? this.leafOp(from, n)
        : value && 'place' in value
          ? this.leafOp(value.place, n)
          : value!.op;
      this.b.emit({ op: 'mov', dst: this.leafOp(to, n), src: v });
    }
    this.b.emit({ op: 'bin', fn: 'add', t: 'DINT', dst: k, a: k, b: this.constant('DINT', 1) });
    this.b.emit({ op: 'jmp', to: top });
    jz.to = this.b.pc;
  }

  /** RD_SYS_T / RD_LOC_T: Spielzeit in eine DTL-Variable */
  private readClock(out: Ref | undefined, span: Span): void {
    const res = out ? this.resolve(out) : undefined;
    if (res?.k !== 'place' || res.place.type.k !== 'struct' || res.place.type.name !== 'DTL') {
      this.fail('RD_SYS_T braucht OUT => Variable vom Typ DTL', out?.span ?? span);
    }
    if (!res.writable) this.fail(`${refText(out!)} kann nur gelesen werden`, out!.span);
    this.markWrite(out!);
    this.b.emit({
      op: 'clock',
      dst: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => this.leafOp(res.place, i)),
    });
  }

  private writableOf(res: Resolved, r: Ref): Val {
    this.markWrite(r);
    if (res.k === 'slice') {
      this.fail(`Teilzugriff ${refText(r)} geht nur in einer Zuweisung`, r.span);
    }
    if (res.k === 'place') {
      this.fail(
        `${refText(r)} ist vom Typ ${typeText(res.place.type)} – greife auf ein Element zu`,
        r.span,
      );
    }
    if (res.k !== 'value') this.fail(`Instanz ${refText(r)} kann nicht zugewiesen werden`, r.span);
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
      this.probe('cond', br.cond.span, cond);
      this.tempUse = mark;
      const jz = this.b.emit({ op: 'jz', cond, to: -1 });
      this.condDepth++;
      this.stmts(br.body);
      this.condDepth--;
      const last = n === s.branches.length - 1 && !s.else;
      if (!last) ends.push(this.b.emit({ op: 'jmp', to: -1 }));
      jz.to = this.b.pc;
    });
    if (s.else) {
      this.condDepth++;
      this.stmts(s.else);
      this.condDepth--;
    }
    for (const j of ends) j.to = this.b.pc;
  }

  private caseStmt(s: Extract<Stmt, { k: 'case' }>): void {
    const natural = this.infer(s.sel);
    const t =
      natural === 'ANY_INT'
        ? 'INT'
        : natural && !isLiteralType(natural) && isIntType(natural)
          ? natural
          : undefined;
    if (!t) {
      this.fail(
        `CASE-Ausdruck muss eine Ganzzahl sein (SInt … ULInt), ist ${typeName(natural ?? 'BOOL')}`,
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
      this.condDepth++;
      this.stmts(item.body);
      this.condDepth--;
      // nach dem letzten Zweig ohne ELSE liegt das Ende direkt dahinter
      if (n < s.items.length - 1 || s.else) ends.push(this.b.emit({ op: 'jmp', to: -1 }));
    });
    toElse.to = this.b.pc;
    if (s.else) {
      this.condDepth++;
      this.stmts(s.else);
      this.condDepth--;
    }
    for (const j of ends) j.to = this.b.pc;
  }

  private forStmt(s: Extract<Stmt, { k: 'for' }>): void {
    const v = this.writable(s.v);
    if (v.o.k === 'islot') {
      this.fail('Laufvariable braucht einen festen Speicherplatz (kein variabler Index)', s.v.span);
    }
    if (!isIntType(v.t)) this.fail('Laufvariable muss eine Ganzzahl sein (SInt … ULInt)', s.v.span);
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
    if (instRef.scope === 'auto' && instRef.path.length === 0 && !instRef.idx) {
      const n = instRef.name.toUpperCase();
      if (BLOCK_MOVES.includes(n)) {
        this.blockMove(n, args, span);
        return;
      }
      if (n === 'RD_SYS_T' || n === 'RD_LOC_T') {
        const out = args.find((a) => a.out && (a.name === 'OUT' || a.name === ''));
        this.readClock(out?.out, span);
        return;
      }
    }
    if (instRef.scope === 'auto' && instRef.path.length === 0 && isBuiltinFunction(instRef.name)) {
      this.fail(
        `${instRef.name.toUpperCase()} ist eine Funktion und liefert einen Wert – verwende sie in einer Zuweisung`,
        span,
      );
    }
    if (instRef.scope === 'local' && this.blockKind !== 'FB') {
      this.fail(
        'Multiinstanzen (#Instanz(…)) gibt es nur in Funktionsbausteinen – lege im OB einen Instanz-DB an',
        instRef.span,
      );
    }
    const user = this.userCallee(instRef);
    if (user) {
      this.callUser(user.unit, user.inst, args, span);
      return;
    }
    const positional = args.find((a) => !a.name);
    if (positional) {
      this.fail(
        'Bausteinaufrufe brauchen benannte Parameter, z. B. IN := …, PT := …',
        positional.span,
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
    if (!this.mute && !this.intrinsics && this.where.block && this.where.part === 'code') {
      this.calls.push({
        from: this.where.block,
        to: kind,
        instance: entry.display,
        line: span.start.line,
      });
    }

    const params = FB_INPUTS[kind];
    const outputs = FB_OUTPUTS[kind];
    const given = new Map<string, FbArg>();
    for (const a of args) {
      if (given.has(a.name)) this.fail(`Parameter ${a.name} ist doppelt angegeben`, a.span);
      given.set(a.name, a);
      if (
        a.e &&
        !params.some(([n]) => n === a.name) &&
        !(a.name === 'DATA' && COMM_KINDS.includes(kind))
      ) {
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
      case 'ALARM':
        this.b.emit({ op: 'alarm', i, sig: inputs.SIG!, text: inputs.TEXT! });
        break;
      case 'TSEND':
      case 'TRCV': {
        const name = kind === 'TSEND' ? 'TSEND_C' : 'TRCV_C';
        const a = given.get('DATA');
        if (!a?.e) this.fail(`Eingang DATA von ${name} fehlt`, span);
        const { data, types } = this.commData(a.e, kind === 'TRCV', name);
        this.b.emit({
          op: 'comm',
          i,
          kind: kind === 'TSEND' ? 'send' : 'recv',
          en: kind === 'TSEND' ? inputs.REQ! : inputs.EN_R!,
          id: inputs.ID!,
          data,
          types,
        });
        break;
      }
    }

    for (const a of args) {
      if (!a.out) continue;
      const dst = this.writable(a.out);
      const t = outputs[a.name]!;
      this.store({ o: { k: 'inst', i, f: a.name as 'Q' }, t }, dst, a.span);
    }
  }

  // ---------- Namensauflösung ----------

  /** Querverweis eintragen (nur im Code, nicht beim Einsetzen und nicht für FUP) */
  private recordRef(r: Ref, res: Resolved): void {
    const block = this.where.block;
    if (this.mute || this.intrinsics || this.where.part !== 'code' || !block) return;
    if (this.xrefOf.has(r)) return;
    const local =
      r.scope === 'local' || (r.scope === 'auto' && this.locals.has(r.name.toLowerCase()));
    const head = r.scope === 'addr' ? r.name : local ? `#${r.name}` : `"${r.name}"`;
    const symbol = [head, ...r.path].join('.');
    const tag =
      !local && r.scope !== 'addr' && !r.path.length && res.k === 'value'
        ? this.tags.get(r.name)
        : undefined;
    const address = r.scope === 'addr' ? r.name : tag?.address;
    const x: XRef = {
      symbol,
      ...(address ? { address } : {}),
      block,
      line: r.span.start.line,
      col: r.span.start.col,
      access: 'r',
    };
    this.xref.push(x);
    this.xrefOf.set(r, x);
  }

  private markWrite(r: Ref): void {
    const x = this.xrefOf.get(r);
    if (x) x.access = 'w';
  }

  private resolve(r: Ref, quiet = false): Resolved {
    const res = this.resolveInner(r, quiet);
    if (!quiet) this.recordRef(r, res);
    return res;
  }

  private resolveInner(r: Ref, quiet: boolean): Resolved {
    const last = r.path[r.path.length - 1];
    if (last?.startsWith('%')) return this.slice(r, last, quiet);
    const res = this.resolveRef(r, quiet);
    const ix = r.idx?.[0];
    if (ix && res.k !== 'place' && !(res.k === 'value' && res.indexed)) {
      this.fail(`${refHead(r, ix.at)} ist kein Feld`, ix.span);
    }
    return res;
  }

  private slice(r: Ref, last: string, quiet: boolean): Resolved {
    if (r.idx?.some((x) => x.at === r.path.length)) {
      this.fail('Nach einem Teilzugriff ist kein Index möglich', r.span);
    }
    const baseRef: Ref = { ...r, path: r.path.slice(0, -1) };
    const base = this.resolve(baseRef, quiet);
    const unit = { X: 1, B: 8, W: 16, D: 32 }[last[1] as 'X'];
    const n = Number(last.slice(2));
    if (base.k !== 'value' || !(isBitStringType(base.t) || isIntType(base.t))) {
      this.fail(
        `${refText(baseRef)}: Teilzugriff ${last} nur auf Bitfolgen und Ganzzahlen`,
        r.span,
      );
    }
    const width = bitWidth(base.t);
    if (width === 64)
      this.fail(`Teilzugriff auf ${typeName(base.t)} wird nicht unterstützt`, r.span);
    if (unit >= width || (n + 1) * unit > width) {
      this.fail(`${last} passt nicht in ${typeName(base.t)} (${width} Bit)`, r.span);
    }
    const t = unit === 1 ? 'BOOL' : unit === 8 ? 'BYTE' : unit === 16 ? 'WORD' : 'DWORD';
    return { k: 'slice', base, unit, n, t };
  }

  private resolveRef(r: Ref, quiet: boolean): Resolved {
    switch (r.scope) {
      case 'addr':
        return this.address(r);
      case 'local': {
        const s = this.locals.get(r.name.toLowerCase());
        if (!s) this.fail(`Lokale Variable #${r.name} ist nicht deklariert`, r.span);
        return this.fromSym(s, r, quiet);
      }
      case 'tag':
        return this.global(r, quiet);
      case 'auto': {
        const s = this.locals.get(r.name.toLowerCase());
        if (s) return this.fromSym(s, r, quiet);
        const known =
          this.tags.get(r.name) ||
          this.dbs.has(r.name.toLowerCase()) ||
          this.idbs.has(r.name.toLowerCase()) ||
          this.uinsts.has(r.name.toLowerCase());
        if (known) return this.global(r, quiet);
        this.fail(
          `„${r.name}“ ist weder lokal deklariert noch eine PLC-Variable oder ein Datenbaustein`,
          r.span,
        );
      }
    }
  }

  private fromSym(s: Sym, r: Ref, quiet: boolean): Resolved {
    if (!quiet) s.used = true;
    if (s.k === 'inst') {
      if (r.path.length === 0) return { k: 'instance', entry: s.entry };
      if (r.path.length > 1) this.fail(`${refText(r)}: zu viele Elemente`, r.span);
      return this.member(s.entry, r.path[0]!, r);
    }
    if (s.k === 'uinst') {
      return r.path.length ? this.userPath(s.inst, r.path, r, quiet) : { k: 'uinst', inst: s.inst };
    }
    if (s.k === 'agg') return this.access(s.place, r, 0, true, quiet);
    if (r.path.length) this.fail(`#${s.name} hat keine Elemente`, r.span);
    if (s.k === 'const') {
      return { k: 'value', op: this.constant(s.t, s.v), t: s.t, writable: false, isConst: true };
    }
    return { k: 'value', op: s.op, t: s.t, writable: true };
  }

  /** "Tag", "DB".Variable, "DB".Instanz.Element, "IDB".Element */
  private global(r: Ref, quiet = false): Resolved {
    const key = r.name.toLowerCase();
    const ui = this.uinsts.get(key);
    if (ui) return r.path.length ? this.userPath(ui, r.path, r, quiet) : { k: 'uinst', inst: ui };
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
      if ('place' in v) return this.access(v.place, r, 1, true, quiet);
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
          return r.k === 'value' || r.k === 'slice' ? r.t : undefined;
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
        case 'list':
          return undefined;
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
    const user = this.userFc(e);
    if (user) {
      if (user.kind !== 'FC' || !user.returnType) return undefined;
      const t = this.varType({
        section: 'Output',
        name: 'Ret_Val',
        typeName: user.returnType,
        typeSpan: NO_SPAN,
        span: NO_SPAN,
      });
      return t.k === 'elem' ? t.t : undefined;
    }
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
      case 'GET_ERR_ID':
        return 'WORD';
      case 'RUNTIME':
        return 'LREAL';
      case 'LEN':
      case 'FIND':
      case 'RD_SYS_T':
      case 'RD_LOC_T':
        return 'INT';
      case 'CONCAT':
      case 'LEFT':
      case 'RIGHT':
      case 'MID':
      case 'DELETE':
      case 'INSERT':
      case 'REPLACE':
        return 'STRING';
      case 'SWAP': {
        const t = this.infer(this.callArgs(e)[0]!);
        return t === 'ANY_INT' ? 'WORD' : t;
      }
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
    if (o.k === 'islot') return this.slotTypes[o.base + o.off];
    if (o.k === 'io' || o.k === 'const') return o.t;
    return undefined;
  }

  private constant(t: DataType, v: Value): Operand {
    return { k: 'const', t, v: normalize(t, v) } as Operand;
  }

  /** Literal im gewünschten Typ (mit Bereichsprüfung). */
  private literal(e: Extract<Expr, { k: 'lit' }>, want?: DataType): { v: Value; t: DataType } {
    if (want === 'BOOL' && e.t === 'ANY_INT') {
      // 0/1 statt FALSE/TRUE – nur als Literal, Variablen bleiben typstreng
      if (e.v !== 0 && e.v !== 1) this.fail(BOOL_LITERAL_ERROR, e.span);
      const block = this.where.block ?? '';
      if (
        !this.boolLiterals.some(
          (b) =>
            b.block === block &&
            b.start.line === e.span.start.line &&
            b.start.col === e.span.start.col,
        )
      ) {
        this.boolLiterals.push({ block, start: e.span.start, value: e.v === 1 });
      }
      return { v: e.v === 1, t: 'BOOL' };
    }
    let t: DataType;
    if (e.t === 'ANY_INT') {
      if (want && acceptsIntLiteral(want)) t = want;
      else t = (e.v as number) >= -32768 && (e.v as number) <= 32767 ? 'INT' : 'DINT';
    } else if (e.t === 'ANY_REAL') {
      t = want === 'LREAL' ? 'LREAL' : 'REAL';
    } else if (e.t === 'STRING') {
      const s = e.v as string;
      if (want === 'CHAR') {
        if (s.length !== 1) this.fail("Char braucht genau ein Zeichen, z. B. 'A'", e.span);
        return { v: s, t: 'CHAR' };
      }
      if (s.length > 254) this.fail('Zeichenkette länger als 254 Zeichen', e.span);
      return { v: s, t: 'STRING' };
    } else {
      t = e.t;
    }
    if (isIntegerType(t) || t === 'DATE' || t === 'TOD') {
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
        if (r.k === 'slice') return this.readSlice(r, dst);
        if (r.k === 'place') {
          this.fail(
            `${refText(e)} ist vom Typ ${typeText(r.place.type)} – greife auf ein Element zu`,
            e.span,
          );
        }
        if (r.k !== 'value') {
          this.fail(
            r.k === 'instance'
              ? `Instanz ${refText(e)} kann nicht als Wert verwendet werden – meinst du ${refText(e)}.Q?`
              : `Instanz ${refText(e)} kann nicht als Wert verwendet werden – wähle einen Ausgang, z. B. ${refText(e)}.${firstOutput(r.inst.fb) ?? 'Q'}`,
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
      case 'list':
        this.fail('Eine Liste [ … ] gibt es nur als Startwert eines Feldes', e.span);
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
      if (hint && allowed.includes(hint) && (u === 'ANY_INT' || isRealType(hint))) return hint;
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
    const t = arithmeticOf(this.workType(nat, hint, ARITH_TYPES));
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

    const t = arithmeticOf(this.workType(u, hint, NUMBER_TYPES));
    if (!isArithmeticType(t))
      this.fail(`Operator ${op} ist nicht auf ${typeName(u)} anwendbar`, e.span);
    if (op === 'MOD' && !isIntType(t)) this.fail('MOD ist nur auf Ganzzahlen anwendbar', e.span);
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
    const outArg = e.args.find((a) => a.out);
    if (outArg) this.fail(`${e.name} hat keine Ausgänge (${outArg.name} =>)`, outArg.span);
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
    const user = this.userFc(e);
    if (user) return this.callFc(e, user, true)!;
    if (e.name === 'RD_SYS_T' || e.name === 'RD_LOC_T') {
      const out = e.args.find((a) => a.out);
      this.readClock(out?.out, e.span);
      return { o: this.constant('INT', 0), t: 'INT' };
    }
    if (!isBuiltinFunction(e.name)) {
      if (e.quoted) this.fail(`Baustein „${e.raw}“ ist nicht definiert`, e.span);
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

    const numeric = ARITH_TYPES;
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
        const t = common(args.slice(1), [...DATA_TYPES], 'gleicher Typ für IN0 und IN1');
        return emitFn('sel', t, t, [g, this.genAs(args[1]!, t), this.genAs(args[2]!, t)]);
      }
      case 'MUX': {
        const k = this.genAs(args[0]!, 'INT');
        const elseArg = e.args.find((a) => a.name === 'INELSE')?.e;
        const valueArgs = elseArg ? [...args.slice(1), elseArg] : args.slice(1);
        const t = common(valueArgs, [...DATA_TYPES], 'gleicher Typ für alle Eingänge');
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
      case 'GET_ERR_ID': {
        // lokale Fehlerbehandlung: Programmierfehler halten die CPU nicht mehr an
        this.localErrors = true;
        const o = this.result('WORD', dst);
        this.b.emit({ op: 'errid', dst: o });
        return { o, t: 'WORD' };
      }
      case 'RUNTIME': {
        const m = args[0]!;
        if (m.k !== 'ref') this.fail('RUNTIME braucht MEM := Variable vom Typ LReal', m.span);
        const mem = this.writable(m);
        if (mem.t !== 'LREAL') {
          this.fail(`RUNTIME: MEM muss vom Typ LReal sein, ist ${typeName(mem.t)}`, m.span);
        }
        const o = this.result('LREAL', dst);
        this.b.emit({ op: 'runtime', dst: o, mem: mem.o });
        return { o, t: 'LREAL' };
      }
      case 'LEN':
        return emitFn('len', 'STRING', 'INT', [this.genAs(args[0]!, 'STRING')]);
      case 'FIND':
        return emitFn(
          'find',
          'STRING',
          'INT',
          args.map((a) => this.genAs(a, 'STRING')),
        );
      case 'CONCAT':
        return emitFn(
          'concat',
          'STRING',
          'STRING',
          args.map((a) => this.genAs(a, 'STRING')),
        );
      case 'LEFT':
      case 'RIGHT':
      case 'MID':
      case 'DELETE':
      case 'INSERT':
      case 'REPLACE': {
        const strings = e.name === 'INSERT' || e.name === 'REPLACE' ? 2 : 1;
        const ops = args.map((a, i) => this.genAs(a, i < strings ? 'STRING' : 'INT'));
        return emitFn(e.name.toLowerCase() as CallFn, 'STRING', 'STRING', ops);
      }
      case 'SWAP': {
        const nat = this.infer(args[0]!) ?? this.invalid(args[0]!);
        const t = nat === 'ANY_INT' ? 'WORD' : concrete(nat);
        if (!isBitStringType(t) || t === 'BYTE') {
          this.fail(
            `SWAP erwartet Word, DWord oder LWord, erhalten ${typeName(nat)}`,
            args[0]!.span,
          );
        }
        return emitFn('swap', t, t, [this.genAs(args[0]!, t)]);
      }
      case 'ROUND':
      case 'TRUNC': {
        const a = this.genAs(args[0]!, this.infer(args[0]!) === 'LREAL' ? 'LREAL' : 'REAL');
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

function unquote(s: string): string {
  return s.replace(/^"(.*)"$/, '$1');
}

function firstOutput(u: Unit): string | undefined {
  return u.decls.find((d) => d.section === 'Output')?.name;
}

function isIntish(t: LiteralType): boolean {
  return t === 'INT' || t === 'DINT' || t === 'ANY_INT';
}

export function refText(r: Ref): string {
  return refHead(r, r.path.length + 1);
}

/** Referenz bis vor Pfadelement n, mit den Indizes davor: #Werte[#i].Teil */
function refHead(r: Ref, n: number): string {
  let s = r.scope === 'local' ? `#${r.name}` : r.scope === 'tag' ? `"${r.name}"` : r.name;
  for (let i = 0; i <= Math.min(n, r.path.length); i++) {
    for (const ix of r.idx ?? []) {
      if (ix.at === i && i < n) s += `[${ix.es.map(exprText).join(', ')}]`;
    }
    if (i < n && i < r.path.length) s += `.${r.path[i]}`;
  }
  return s;
}

function exprText(e: Expr): string {
  if (e.k === 'lit') return String(e.v);
  if (e.k === 'ref') return refText(e);
  return '…';
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
