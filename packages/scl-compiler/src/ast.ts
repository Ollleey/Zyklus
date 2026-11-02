import type { CodeBlockKind, DataType, IfaceSection } from '@zyklus/sim-core';
import type { Span } from './diagnostics';

/**
 * Variablenreferenz:
 * - `local`  #name           (Schnittstelle des Bausteins)
 * - `tag`    "name"          (PLC-Variable bzw. Datenbaustein mit Pfad)
 * - `auto`   name            (erst lokal, dann global)
 * - `addr`   %I0.0
 */
export interface Ref {
  k: 'ref';
  scope: 'local' | 'tag' | 'auto' | 'addr';
  name: string;
  /** Elementzugriffe, z. B. ['Q'] bei "T1_DB".Q oder ['T1', 'ET'] bei "Daten".T1.ET */
  path: string[];
  /**
   * Feldindizes: `at` = Anzahl der Pfadelemente davor (0 = direkt nach dem Namen), z. B.
   * "DB".Werte[#i].x → path ['Werte', 'x'], idx [{ at: 1, es: [#i] }]
   */
  idx?: Index[];
  span: Span;
}

export interface Index {
  at: number;
  es: Expr[];
  span: Span;
}

/** Datentyp einer Deklaration (Text aus der Schnittstelle bzw. Quelle, geparst) */
export type TypeExpr =
  | { k: 'name'; name: string; quoted: boolean; len?: number; span: Span }
  | { k: 'array'; dims: [number, number][]; of: TypeExpr; span: Span }
  | { k: 'struct'; fields: Decl[]; span: Span };

/** Ganzzahl-/Gleitkomma-Literal ohne Typpräfix passt sich dem Kontext an. */
export type LiteralType = DataType | 'ANY_INT' | 'ANY_REAL';

export type Expr =
  | { k: 'lit'; t: LiteralType; v: number | boolean; span: Span }
  | Ref
  | { k: 'unary'; op: '-' | 'NOT'; e: Expr; span: Span }
  | { k: 'binary'; op: BinaryOp; a: Expr; b: Expr; span: Span }
  | { k: 'call'; name: string; args: Arg[]; span: Span }
  /** Startwertliste eines Feldes: [1, 2, 3(0)] – nur als Startwert */
  | { k: 'list'; items: { e: Expr; n: number }[]; span: Span };

export type BinaryOp =
  '+' | '-' | '*' | '/' | 'MOD' | '=' | '<>' | '<' | '<=' | '>' | '>=' | 'AND' | 'OR' | 'XOR';

export interface Arg {
  /** Parametername bei `NAME := wert`, sonst undefined (Positionsparameter) */
  name?: string;
  e: Expr;
  span: Span;
}

export interface CaseLabel {
  lo: number;
  hi?: number;
  span: Span;
}

export interface FbArg {
  name: string;
  /** Eingang: NAME := expr */
  e?: Expr;
  /** Ausgang: NAME => ziel */
  out?: Ref;
  span: Span;
}

export type Stmt =
  | { k: 'assign'; target: Ref; e: Expr; span: Span }
  | { k: 'if'; branches: { cond: Expr; body: Stmt[] }[]; else?: Stmt[]; span: Span }
  | {
      k: 'case';
      sel: Expr;
      items: { labels: CaseLabel[]; body: Stmt[] }[];
      else?: Stmt[];
      span: Span;
    }
  | { k: 'for'; v: Ref; from: Expr; to: Expr; by?: Expr; body: Stmt[]; span: Span }
  | { k: 'while'; cond: Expr; body: Stmt[]; span: Span }
  | { k: 'repeat'; body: Stmt[]; cond: Expr; span: Span }
  | { k: 'region'; name: string; body: Stmt[]; span: Span }
  | { k: 'exit'; span: Span }
  | { k: 'continue'; span: Span }
  | { k: 'return'; span: Span }
  /** Aufruf einer Instanz: "T1_DB"(…), "IEC_Timer_0_DB".TON(…), #inst(…) */
  | { k: 'fbcall'; inst: Ref; args: FbArg[]; span: Span }
  /** Aufruf einer Funktion als Anweisung (Ergebnis wird verworfen → Fehler im Compiler) */
  | { k: 'exprstmt'; e: Expr; span: Span };

export interface Decl {
  section: IfaceSection;
  name: string;
  typeName: string;
  typeSpan: Span;
  /** geparster Datentyp (aus Quellen; aus der Tabelle parst der Compiler `typeName`) */
  type?: TypeExpr;
  init?: Expr;
  /** Quelltext des Startwerts (für den Import in das Projektmodell) */
  initText?: string;
  span: Span;
}

/** Ein Baustein aus einer externen SCL-Quelle (TYPE: PLC-Datentyp, Elemente in `decls`). */
export interface SourceBlock {
  kind: CodeBlockKind | 'DB' | 'TYPE';
  name: string;
  nameSpan: Span;
  title?: string;
  /** bei Instanz-DBs: Typ (IEC_TIMER, "MeinFB", …) */
  instanceOf?: string;
  decls: Decl[];
  body: Stmt[];
  /** Anweisungsteil als Text (zwischen BEGIN und END_…) */
  bodyText: string;
  /** Zeile, in der der Anweisungsteil beginnt (für Positionsangaben) */
  bodyLine: number;
  span: Span;
}
