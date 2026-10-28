import type { DataType } from '@zyklus/sim-core';
import type { Span } from './diagnostics';

/**
 * Variablenreferenz:
 * - `local`  #name           (nur lokale Deklarationen)
 * - `tag`    "name"          (PLC-Variablentabelle bzw. Global-DB mit Member)
 * - `auto`   name            (erst lokal, dann PLC-Variable)
 * - `addr`   %I0.0
 */
export interface Ref {
  k: 'ref';
  scope: 'local' | 'tag' | 'auto' | 'addr';
  name: string;
  /** z. B. Q bei #T1.Q oder Wert bei "Daten".Wert */
  member?: string;
  span: Span;
}

/** Ganzzahl-/Gleitkomma-Literal ohne Typpräfix passt sich dem Kontext an. */
export type LiteralType = DataType | 'ANY_INT' | 'ANY_REAL';

export type Expr =
  | { k: 'lit'; t: LiteralType; v: number | boolean; span: Span }
  | Ref
  | { k: 'unary'; op: '-' | 'NOT'; e: Expr; span: Span }
  | { k: 'binary'; op: BinaryOp; a: Expr; b: Expr; span: Span }
  | { k: 'call'; name: string; args: Arg[]; span: Span };

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
  | { k: 'exit'; span: Span }
  | { k: 'continue'; span: Span }
  | { k: 'return'; span: Span }
  | { k: 'fbcall'; inst: Ref; args: FbArg[]; span: Span }
  /** Aufruf einer Funktion als Anweisung (Ergebnis wird verworfen → Fehler im Compiler) */
  | { k: 'exprstmt'; e: Expr; span: Span };

export type DeclSection = 'VAR' | 'VAR_TEMP' | 'CONST';

export interface Decl {
  section: DeclSection;
  name: string;
  typeName: string;
  typeSpan: Span;
  init?: Expr;
  span: Span;
}

export interface SclUnit {
  decls: Decl[];
  body: Stmt[];
}
