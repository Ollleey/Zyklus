import type { IfaceSection } from '@zyklus/sim-core';
import type {
  Arg,
  BinaryOp,
  CaseLabel,
  Decl,
  Expr,
  FbArg,
  Index,
  Ref,
  SourceBlock,
  Stmt,
  TypeExpr,
} from './ast';
import { SclError, joinSpans, type Diagnostic, type Span } from './diagnostics';
import { tokenize, type Token } from './lexer';

const MAX_ERRORS = 50;

/** Schlüsselwörter, an denen eine Anweisungsliste endet (Fehler-Recovery hält hier an). */
const BLOCK_ENDS = new Set([
  'END_IF',
  'ELSIF',
  'ELSE',
  'END_CASE',
  'END_FOR',
  'END_WHILE',
  'UNTIL',
  'END_REPEAT',
  'END_REGION',
  'END_VAR',
  'END_ORGANIZATION_BLOCK',
  'END_FUNCTION_BLOCK',
  'END_FUNCTION',
  'END_DATA_BLOCK',
]);

const BLOCK_KEYWORDS: Record<string, { kind: SourceBlock['kind']; end: string }> = {
  ORGANIZATION_BLOCK: { kind: 'OB', end: 'END_ORGANIZATION_BLOCK' },
  FUNCTION_BLOCK: { kind: 'FB', end: 'END_FUNCTION_BLOCK' },
  FUNCTION: { kind: 'FC', end: 'END_FUNCTION' },
  DATA_BLOCK: { kind: 'DB', end: 'END_DATA_BLOCK' },
};

const SECTION_KEYWORDS: Record<string, IfaceSection> = {
  VAR_INPUT: 'Input',
  VAR_OUTPUT: 'Output',
  VAR_IN_OUT: 'InOut',
  VAR: 'Static',
  VAR_TEMP: 'Temp',
};

export interface BodyResult {
  body: Stmt[];
  diagnostics: Diagnostic[];
}

export interface SourceResult {
  blocks: SourceBlock[];
  diagnostics: Diagnostic[];
}

function lex(src: string): { tokens?: Token[]; diagnostics: Diagnostic[] } {
  try {
    return { tokens: tokenize(src), diagnostics: [] };
  } catch (e) {
    if (e instanceof SclError) {
      return { diagnostics: [{ severity: 'error', message: e.message, ...e.span }] };
    }
    throw e;
  }
}

/**
 * Parst den Anweisungsteil eines Bausteins (wie im TIA-Editor: ohne Kopf und Schnittstelle).
 * Syntaxfehler werden gesammelt; der Parser setzt nach `;` bzw. Blockende wieder auf.
 */
export function parseBody(src: string): BodyResult {
  const { tokens, diagnostics } = lex(src);
  if (!tokens) return { body: [], diagnostics };
  const p = new Parser(tokens, src);
  const body = p.stmtList(() => false);
  return { body, diagnostics: p.diagnostics };
}

/** Parst einen einzelnen Ausdruck (z. B. Startwert aus der Schnittstellentabelle). */
export function parseExpression(src: string): { expr?: Expr; diagnostics: Diagnostic[] } {
  const { tokens, diagnostics } = lex(src);
  if (!tokens) return { diagnostics };
  const p = new Parser(tokens, src);
  try {
    const expr = p.expr();
    p.expectEof();
    return { expr, diagnostics: [] };
  } catch (e) {
    if (!(e instanceof SclError)) throw e;
    return { diagnostics: [{ severity: 'error', message: e.message, ...e.span }] };
  }
}

/** Parst einen Datentyp aus der Schnittstellentabelle (Int, Array[1..5] of Real, "Rezept" …). */
export function parseTypeText(src: string): { type?: TypeExpr; diagnostics: Diagnostic[] } {
  const { tokens, diagnostics } = lex(src);
  if (!tokens) return { diagnostics };
  const p = new Parser(tokens, src);
  try {
    const type = p.typeExpr();
    p.expectEof();
    return { type, diagnostics: [] };
  } catch (e) {
    if (!(e instanceof SclError)) throw e;
    return { diagnostics: [{ severity: 'error', message: e.message, ...e.span }] };
  }
}

/** Parst eine externe SCL-Quelle mit ORGANIZATION_BLOCK / FUNCTION_BLOCK / DATA_BLOCK … */
export function parseSource(src: string): SourceResult {
  const { tokens, diagnostics } = lex(src);
  if (!tokens) return { blocks: [], diagnostics };
  const p = new Parser(tokens, src);
  const blocks = p.sourceBlocks();
  return { blocks, diagnostics: p.diagnostics };
}

/** true, wenn der Text wie eine vollständige SCL-Quelle beginnt. */
export function looksLikeSource(src: string): boolean {
  const stripped = src.replace(/\/\/.*$/gm, '').replace(/\(\*[\s\S]*?\*\)/g, '');
  return /^\s*(ORGANIZATION_BLOCK|FUNCTION_BLOCK|FUNCTION|DATA_BLOCK)\b/i.test(stripped);
}

function describe(t: Token): string {
  switch (t.kind) {
    case 'eof':
      return 'Ende des Programms';
    case 'local':
      return `„#${t.value}“`;
    case 'quoted':
      return `„"${t.value}"“`;
    case 'string':
      return `„'${t.value}'“`;
    default:
      return `„${t.value}“`;
  }
}

class Parser {
  private p = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly tokens: Token[],
    private readonly src: string,
  ) {}

  // ---------- Hilfsfunktionen ----------

  private get t(): Token {
    return this.tokens[this.p]!;
  }

  private peek(n = 1): Token {
    return this.tokens[Math.min(this.p + n, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.t;
    if (t.kind !== 'eof') this.p++;
    return t;
  }

  private isOp(v: string, t = this.t): boolean {
    return t.kind === 'op' && t.value === v;
  }

  private isKw(v: string, t = this.t): boolean {
    return t.kind === 'keyword' && t.value === v;
  }

  private isIdent(v: string, t = this.t): boolean {
    return t.kind === 'ident' && t.value.toUpperCase() === v;
  }

  private error(msg: string, span: Span = this.t): never {
    throw new SclError(msg, { start: span.start, end: span.end });
  }

  private expectOp(v: string, context?: string): Token {
    if (!this.isOp(v)) {
      this.error(`„${v}“ erwartet${context ? ` ${context}` : ''}, gefunden ${describe(this.t)}`);
    }
    return this.next();
  }

  private expectKw(v: string, context?: string): Token {
    if (!this.isKw(v)) {
      this.error(`${v} erwartet${context ? ` ${context}` : ''}, gefunden ${describe(this.t)}`);
    }
    return this.next();
  }

  expectEof(): void {
    if (this.t.kind !== 'eof') this.error(`Unerwartet: ${describe(this.t)}`);
  }

  private optionalSemicolon(): void {
    if (this.isOp(';')) this.next();
  }

  private record(e: unknown): void {
    if (!(e instanceof SclError)) throw e;
    if (this.diagnostics.length < MAX_ERRORS) {
      this.diagnostics.push({ severity: 'error', message: e.message, ...e.span });
    }
  }

  /** Überspringt Tokens bis hinter das nächste `;` oder bis zu einem Blockende. */
  private sync(startPos: number): void {
    while (this.t.kind !== 'eof') {
      if (this.isOp(';')) {
        this.next();
        break;
      }
      if (this.t.kind === 'keyword' && BLOCK_ENDS.has(this.t.value) && this.p > startPos) break;
      this.next();
    }
  }

  /** überspringt Attribute in geschweiften Klammern, z. B. { S7_Optimized_Access := 'TRUE' } */
  private skipAttributes(): void {
    while (this.isOp('{')) {
      const open = this.next();
      while (!this.isOp('}')) {
        if (this.t.kind === 'eof') this.error('„}“ fehlt', open);
        this.next();
      }
      this.next();
    }
  }

  // ---------- Externe Quelle ----------

  sourceBlocks(): SourceBlock[] {
    const blocks: SourceBlock[] = [];
    while (this.t.kind !== 'eof') {
      const start = this.p;
      try {
        blocks.push(this.sourceBlock());
      } catch (e) {
        this.record(e);
        // bis zum nächsten Bausteinende springen
        const ends = Object.values(BLOCK_KEYWORDS).map((b) => b.end);
        const atBlockEnd = (t: Token) =>
          t.kind === 'eof' || (t.kind === 'keyword' && ends.includes(t.value));
        while (!atBlockEnd(this.t)) this.next();
        this.next();
        if (this.p === start) this.next();
      }
    }
    return blocks;
  }

  private sourceBlock(): SourceBlock {
    const head = this.t;
    const info = head.kind === 'keyword' ? BLOCK_KEYWORDS[head.value] : undefined;
    if (!info) {
      this.error(
        `Bausteinanfang erwartet (ORGANIZATION_BLOCK, FUNCTION_BLOCK, FUNCTION, DATA_BLOCK), gefunden ${describe(head)}`,
      );
    }
    this.next();
    const nameTok = this.next();
    if (nameTok.kind !== 'quoted' && nameTok.kind !== 'ident') {
      this.error(`Bausteinname erwartet, gefunden ${describe(nameTok)}`, nameTok);
    }
    if (info.kind === 'FC' && this.isOp(':')) {
      this.next();
      this.next(); // Rückgabetyp, z. B. Void
    }

    let title: string | undefined;
    let instanceOf: string | undefined;
    const decls: Decl[] = [];
    // Kopf: TITLE, Attribute, VERSION, NON_RETAIN, bei Instanz-DBs der Typ
    for (;;) {
      if (this.isIdent('TITLE')) {
        title = this.next().text;
      } else if (this.isOp('{')) {
        this.skipAttributes();
      } else if (this.isIdent('VERSION')) {
        this.next();
        this.expectOp(':', 'nach VERSION');
        this.next();
      } else if (
        this.isIdent('NON_RETAIN') ||
        this.isIdent('RETAIN') ||
        this.isIdent('AUTHOR') ||
        this.isIdent('FAMILY') ||
        this.isIdent('NAME')
      ) {
        const kw = this.next();
        if (kw.value.toUpperCase() !== 'NON_RETAIN' && kw.value.toUpperCase() !== 'RETAIN') {
          this.expectOp(':');
          this.next();
        }
      } else if (
        info.kind === 'DB' &&
        (this.t.kind === 'ident' || this.t.kind === 'quoted') &&
        !instanceOf
      ) {
        instanceOf = this.next().value;
      } else {
        break;
      }
    }

    while (
      this.t.kind === 'keyword' &&
      (this.t.value in SECTION_KEYWORDS || this.t.value === 'STRUCT')
    ) {
      decls.push(...this.declSection());
    }

    const begin = this.expectKw('BEGIN', 'vor dem Anweisungsteil');
    const body = this.stmtList(() => this.isKw(info.end));
    const end = this.expectKw(info.end, 'am Bausteinende');
    return {
      kind: info.kind,
      name: nameTok.value,
      nameSpan: nameTok,
      title,
      instanceOf,
      decls,
      body,
      bodyText: this.src.slice(begin.to, end.from),
      bodyLine: begin.end.line,
      span: joinSpans(head, end),
    };
  }

  private declSection(): Decl[] {
    const head = this.next();
    let section: IfaceSection = SECTION_KEYWORDS[head.value] ?? 'Static';
    const endKw = head.value === 'STRUCT' ? 'END_STRUCT' : 'END_VAR';
    if (this.isKw('CONSTANT')) {
      this.next();
      section = 'Constant';
    }
    while (this.isIdent('RETAIN') || this.isIdent('NON_RETAIN') || this.isIdent('DB_SPECIFIC'))
      this.next();
    const decls = this.declLines(endKw, section, head);
    this.next();
    this.optionalSemicolon();
    return decls;
  }

  /** Deklarationszeilen bis `endKw` (ohne es zu verbrauchen) */
  private declLines(endKw: string, section: IfaceSection, head: Token): Decl[] {
    const decls: Decl[] = [];
    while (!this.isKw(endKw)) {
      if (this.t.kind === 'eof') this.error(`${endKw} fehlt`, head);
      const names: Token[] = [];
      do {
        if (names.length) this.next(); // Komma
        if (this.t.kind !== 'ident') {
          this.error(`Variablenname erwartet, gefunden ${describe(this.t)}`);
        }
        names.push(this.next());
        this.skipAttributes();
      } while (this.isOp(','));
      this.expectOp(':', 'nach dem Variablennamen');
      const typeStart = this.t;
      const type = this.typeExpr();
      const typeEnd = this.tokens[this.p - 1]!;
      let init: Expr | undefined;
      let initText: string | undefined;
      if (this.isOp(':=')) {
        this.next();
        const from = this.t.from;
        init = this.expr();
        initText = this.src.slice(from, this.tokens[this.p - 1]!.to);
      } else if (section === 'Constant') {
        this.error('Konstante braucht einen Wert (name : Typ := wert;)');
      }
      const semi = this.expectOp(';', 'am Ende der Deklaration');
      for (const n of names) {
        decls.push({
          section,
          name: n.value,
          // einfache Typen wie bisher ohne Anführungszeichen, sonst der Quelltext
          typeName:
            type.k === 'name' && type.len === undefined
              ? type.name
              : this.src.slice(typeStart.from, typeEnd.to),
          typeSpan: joinSpans(typeStart, typeEnd),
          type,
          init,
          initText,
          span: joinSpans(n, semi),
        });
      }
    }
    return decls;
  }

  /** Datentyp: Int, "UDT", String[20], Array[0..9, 1..3] of Typ, Struct … END_STRUCT */
  typeExpr(): TypeExpr {
    const t = this.t;
    if (this.isKw('STRUCT')) {
      this.next();
      const fields = this.declLines('END_STRUCT', 'Static', t);
      const end = this.next();
      return { k: 'struct', fields, span: joinSpans(t, end) };
    }
    if (this.isIdent('ARRAY') && this.isOp('[', this.peek())) {
      this.next();
      this.next();
      const dims: [number, number][] = [];
      do {
        if (dims.length) this.next(); // Komma
        const lo = this.bound();
        this.expectOp('..', 'im Indexbereich (z. B. 0..9)');
        const hi = this.bound();
        dims.push([lo, hi]);
      } while (this.isOp(','));
      this.expectOp(']', 'nach dem Indexbereich');
      this.expectKw('OF', 'nach Array[…]');
      const of = this.typeExpr();
      return { k: 'array', dims, of, span: joinSpans(t, of.span) };
    }
    if (t.kind !== 'ident' && t.kind !== 'quoted') {
      this.error(`Datentyp erwartet, gefunden ${describe(t)}`);
    }
    this.next();
    if (this.isOp('[')) {
      this.next();
      if (this.t.kind !== 'int') this.error('Länge erwartet, z. B. String[20]');
      const len = this.next().num!;
      const end = this.expectOp(']', 'nach der Länge');
      return {
        k: 'name',
        name: t.value,
        quoted: t.kind === 'quoted',
        len,
        span: joinSpans(t, end),
      };
    }
    return { k: 'name', name: t.value, quoted: t.kind === 'quoted', span: t };
  }

  /** Feldgrenze: ganze Zahl, auch negativ */
  private bound(): number {
    const neg = this.isOp('-');
    if (neg) this.next();
    if (this.t.kind !== 'int') this.error(`Feldgrenze erwartet, gefunden ${describe(this.t)}`);
    const n = this.next().num!;
    return neg ? -n : n;
  }

  // ---------- Anweisungen ----------

  stmtList(atEnd: () => boolean): Stmt[] {
    const out: Stmt[] = [];
    while (!atEnd() && this.t.kind !== 'eof') {
      const start = this.p;
      try {
        const s = this.stmt();
        if (s) out.push(s);
      } catch (e) {
        this.record(e);
        this.sync(start);
        if (this.p === start) this.next();
      }
    }
    return out;
  }

  private endsWith(...kws: string[]): () => boolean {
    return () => this.t.kind === 'keyword' && kws.includes(this.t.value);
  }

  private stmt(): Stmt | undefined {
    const t = this.t;
    if (this.isOp(';')) {
      this.next();
      return undefined;
    }
    if (t.kind === 'keyword') {
      switch (t.value) {
        case 'IF':
          return this.ifStmt();
        case 'CASE':
          return this.caseStmt();
        case 'FOR':
          return this.forStmt();
        case 'WHILE':
          return this.whileStmt();
        case 'REPEAT':
          return this.repeatStmt();
        case 'REGION': {
          this.next();
          const body = this.stmtList(this.endsWith('END_REGION'));
          const end = this.expectKw(
            'END_REGION',
            `zum Abschluss von REGION ${t.text ?? ''}`.trim(),
          );
          this.optionalSemicolon();
          return { k: 'region', name: t.text ?? '', body, span: joinSpans(t, end) };
        }
        case 'EXIT':
        case 'CONTINUE':
        case 'RETURN': {
          this.next();
          const semi = this.expectOp(';', `nach ${t.value}`);
          return { k: t.value.toLowerCase() as 'exit', span: joinSpans(t, semi) };
        }
        case 'VAR':
        case 'VAR_TEMP':
        case 'VAR_INPUT':
        case 'VAR_OUTPUT':
        case 'VAR_IN_OUT':
          this.error('Variablen werden in der Bausteinschnittstelle deklariert, nicht im Code');
      }
      this.error(`Unerwartetes Schlüsselwort ${t.value}`);
    }

    if (t.kind === 'ident' && this.isOp('(', this.peek())) {
      // Funktion oder Instanz ohne Anführungszeichen – der Compiler entscheidet
      return this.callStmt();
    }
    if (t.kind === 'local' || t.kind === 'quoted' || t.kind === 'ident' || t.kind === 'address') {
      const target = this.ref();
      if (this.isOp('(')) return this.fbCall(target);
      if (this.isOp('=')) this.error('Zuweisung mit „:=“, nicht „=“');
      this.expectOp(':=', 'für eine Zuweisung');
      const e = this.expr();
      const semi = this.expectOp(';', 'am Ende der Anweisung');
      return { k: 'assign', target, e, span: joinSpans(target.span, semi) };
    }
    this.error(`Anweisung erwartet, gefunden ${describe(t)}`);
  }

  private callStmt(): Stmt {
    const name = this.t;
    // Benannte Parameter mit := / => deuten auf einen Instanzaufruf hin
    const save = this.p;
    this.next();
    this.next(); // (
    const fbLike =
      this.t.kind === 'ident' && (this.isOp(':=', this.peek()) || this.isOp('=>', this.peek()));
    const isEmpty = this.isOp(')');
    this.p = save;
    if (fbLike || isEmpty) {
      const inst: Ref = { k: 'ref', scope: 'auto', name: name.value, path: [], span: name };
      this.next();
      return this.fbCall(inst);
    }
    const e = this.primary();
    const semi = this.expectOp(';', 'am Ende der Anweisung');
    return { k: 'exprstmt', e, span: joinSpans(name, semi) };
  }

  private fbCall(inst: Ref): Stmt {
    this.expectOp('(');
    const args: FbArg[] = [];
    while (!this.isOp(')')) {
      if (args.length) this.expectOp(',', 'zwischen Parametern');
      const nameTok = this.t;
      if (
        nameTok.kind !== 'ident' ||
        !(this.isOp(':=', this.peek()) || this.isOp('=>', this.peek()))
      ) {
        this.error('Bausteinaufrufe brauchen benannte Parameter, z. B. IN := …, PT := …');
      }
      this.next();
      if (this.next().value === ':=') {
        const e = this.expr();
        args.push({ name: nameTok.value.toUpperCase(), e, span: joinSpans(nameTok, e.span) });
      } else {
        const out = this.ref();
        args.push({ name: nameTok.value.toUpperCase(), out, span: joinSpans(nameTok, out.span) });
      }
    }
    this.next(); // )
    const semi = this.expectOp(';', 'nach dem Aufruf');
    return { k: 'fbcall', inst, args, span: joinSpans(inst.span, semi) };
  }

  private ifStmt(): Stmt {
    const head = this.next();
    const branches: { cond: Expr; body: Stmt[] }[] = [];
    const cond = this.expr();
    this.expectKw('THEN', 'nach der IF-Bedingung');
    branches.push({ cond, body: this.stmtList(this.endsWith('ELSIF', 'ELSE', 'END_IF')) });
    let elseBody: Stmt[] | undefined;
    while (this.isKw('ELSIF')) {
      this.next();
      const c = this.expr();
      this.expectKw('THEN', 'nach der ELSIF-Bedingung');
      branches.push({ cond: c, body: this.stmtList(this.endsWith('ELSIF', 'ELSE', 'END_IF')) });
    }
    if (this.isKw('ELSE')) {
      this.next();
      elseBody = this.stmtList(this.endsWith('END_IF'));
    }
    const end = this.expectKw('END_IF', 'zum Abschluss von IF');
    this.optionalSemicolon();
    return { k: 'if', branches, else: elseBody, span: joinSpans(head, end) };
  }

  private isCaseLabelStart(): boolean {
    const t = this.t;
    if (t.kind === 'int' || t.kind === 'typed') return true;
    if (this.isOp('-') && this.peek().kind === 'int') return true;
    if (t.kind === 'ident') {
      const n = this.peek();
      return this.isOp(':', n) || this.isOp(',', n) || this.isOp('..', n);
    }
    return false;
  }

  private caseValue(): { v: number; span: Span; name?: string } {
    const t = this.t;
    if (this.isOp('-')) {
      this.next();
      const n = this.next();
      if (n.kind !== 'int') this.error('Ganze Zahl erwartet', n);
      return { v: -n.num!, span: joinSpans(t, n) };
    }
    if (t.kind === 'int' || (t.kind === 'typed' && t.type !== 'REAL' && t.type !== 'TIME')) {
      this.next();
      return { v: t.num!, span: t };
    }
    if (t.kind === 'ident') {
      this.next();
      return { v: NaN, span: t, name: t.value };
    }
    this.error(`CASE-Marke muss eine ganze Zahl sein, gefunden ${describe(t)}`);
  }

  private caseStmt(): Stmt {
    const head = this.next();
    const sel = this.expr();
    this.expectKw('OF', 'nach dem CASE-Ausdruck');
    const items: { labels: CaseLabel[]; body: Stmt[] }[] = [];
    let elseBody: Stmt[] | undefined;
    while (!this.isKw('END_CASE') && !this.isKw('ELSE')) {
      if (this.t.kind === 'eof') this.error('END_CASE fehlt', head);
      if (!this.isCaseLabelStart()) {
        this.error(`CASE-Marke erwartet (z. B. 1: oder 2..5:), gefunden ${describe(this.t)}`);
      }
      const labels: CaseLabel[] = [];
      do {
        if (labels.length) this.next(); // Komma
        const lo = this.caseValue();
        if (lo.name) this.error('Konstantennamen als CASE-Marke werden nicht unterstützt', lo.span);
        if (this.isOp('..')) {
          this.next();
          const hi = this.caseValue();
          if (hi.name) {
            this.error('Konstantennamen als CASE-Marke werden nicht unterstützt', hi.span);
          }
          labels.push({ lo: lo.v, hi: hi.v, span: joinSpans(lo.span, hi.span) });
        } else {
          labels.push({ lo: lo.v, span: lo.span });
        }
      } while (this.isOp(','));
      this.expectOp(':', 'nach der CASE-Marke');
      const body = this.stmtList(
        () => this.isKw('END_CASE') || this.isKw('ELSE') || this.isCaseLabelStart(),
      );
      items.push({ labels, body });
    }
    if (this.isKw('ELSE')) {
      this.next();
      elseBody = this.stmtList(this.endsWith('END_CASE'));
    }
    const end = this.expectKw('END_CASE', 'zum Abschluss von CASE');
    this.optionalSemicolon();
    return { k: 'case', sel, items, else: elseBody, span: joinSpans(head, end) };
  }

  private forStmt(): Stmt {
    const head = this.next();
    const t = this.t;
    if (t.kind !== 'local' && t.kind !== 'ident' && t.kind !== 'quoted') {
      this.error('Laufvariable erwartet');
    }
    const v = this.ref();
    this.expectOp(':=', 'nach der Laufvariable');
    const from = this.expr();
    this.expectKw('TO', 'in der FOR-Anweisung');
    const to = this.expr();
    let by: Expr | undefined;
    if (this.isKw('BY')) {
      this.next();
      by = this.expr();
    }
    this.expectKw('DO', 'in der FOR-Anweisung');
    const body = this.stmtList(this.endsWith('END_FOR'));
    const end = this.expectKw('END_FOR', 'zum Abschluss von FOR');
    this.optionalSemicolon();
    return { k: 'for', v, from, to, by, body, span: joinSpans(head, end) };
  }

  private whileStmt(): Stmt {
    const head = this.next();
    const cond = this.expr();
    this.expectKw('DO', 'nach der WHILE-Bedingung');
    const body = this.stmtList(this.endsWith('END_WHILE'));
    const end = this.expectKw('END_WHILE', 'zum Abschluss von WHILE');
    this.optionalSemicolon();
    return { k: 'while', cond, body, span: joinSpans(head, end) };
  }

  private repeatStmt(): Stmt {
    const head = this.next();
    const body = this.stmtList(this.endsWith('UNTIL'));
    this.expectKw('UNTIL', 'in der REPEAT-Anweisung');
    const cond = this.expr();
    const end = this.expectKw('END_REPEAT', 'zum Abschluss von REPEAT');
    this.optionalSemicolon();
    return { k: 'repeat', body, cond, span: joinSpans(head, end) };
  }

  // ---------- Ausdrücke ----------

  expr(): Expr {
    return this.binaryLevel(0);
  }

  private static readonly LEVELS: string[][] = [
    ['OR'],
    ['XOR'],
    ['AND', '&'],
    ['=', '<>'],
    ['<', '<=', '>', '>='],
    ['+', '-'],
    ['*', '/', 'MOD'],
  ];

  private matchLevel(level: number): BinaryOp | undefined {
    const t = this.t;
    if (t.kind !== 'op' && t.kind !== 'keyword') return undefined;
    if (!Parser.LEVELS[level]!.includes(t.value)) return undefined;
    return (t.value === '&' ? 'AND' : t.value) as BinaryOp;
  }

  private binaryLevel(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let left = this.binaryLevel(level + 1);
    for (let op = this.matchLevel(level); op; op = this.matchLevel(level)) {
      this.next();
      const right = this.binaryLevel(level + 1);
      left = { k: 'binary', op, a: left, b: right, span: joinSpans(left.span, right.span) };
    }
    if (this.isOp('**')) this.error('Potenzieren (**) wird nicht unterstützt');
    return left;
  }

  private unary(): Expr {
    const t = this.t;
    if (this.isOp('-') || this.isOp('+')) {
      this.next();
      const e = this.unary();
      if (t.value === '+') return e;
      if (e.k === 'lit' && typeof e.v === 'number') {
        return { ...e, v: -e.v, span: joinSpans(t, e.span) };
      }
      return { k: 'unary', op: '-', e, span: joinSpans(t, e.span) };
    }
    if (this.isKw('NOT')) {
      this.next();
      const e = this.unary();
      return { k: 'unary', op: 'NOT', e, span: joinSpans(t, e.span) };
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.t;
    switch (t.kind) {
      case 'int':
        this.next();
        return { k: 'lit', t: 'ANY_INT', v: t.num!, span: t };
      case 'real':
        this.next();
        return { k: 'lit', t: 'ANY_REAL', v: t.num!, span: t };
      case 'typed':
        this.next();
        return { k: 'lit', t: t.type!, v: t.type === 'BOOL' ? t.num === 1 : t.num!, span: t };
      case 'keyword':
        if (t.value === 'TRUE' || t.value === 'FALSE') {
          this.next();
          return { k: 'lit', t: 'BOOL', v: t.value === 'TRUE', span: t };
        }
        break;
      case 'op':
        if (t.value === '(') {
          this.next();
          const e = this.expr();
          const close = this.expectOp(')', 'zum Schließen der Klammer');
          return { ...e, span: joinSpans(t, close) } as Expr;
        }
        if (t.value === '[') return this.list();
        break;
      case 'ident':
        if (this.isOp('(', this.peek())) return this.call();
        return this.ref();
      case 'local':
      case 'quoted':
      case 'address':
        return this.ref();
    }
    this.error(`Ausdruck erwartet, gefunden ${describe(t)}`);
  }

  /** Startwertliste [1, 2, 3(0)] */
  private list(): Expr {
    const open = this.next();
    const items: { e: Expr; n: number }[] = [];
    while (!this.isOp(']')) {
      if (items.length) this.expectOp(',', 'zwischen Startwerten');
      if (this.t.kind === 'eof') this.error('„]“ fehlt', open);
      if (this.t.kind === 'int' && this.isOp('(', this.peek())) {
        const n = this.next().num!;
        this.next();
        const e = this.expr();
        this.expectOp(')', 'nach dem wiederholten Startwert');
        items.push({ e, n });
      } else {
        items.push({ e: this.expr(), n: 1 });
      }
    }
    const close = this.next();
    return { k: 'list', items, span: joinSpans(open, close) };
  }

  private call(): Expr {
    const name = this.next();
    this.next(); // (
    const args: Arg[] = [];
    while (!this.isOp(')')) {
      if (args.length) this.expectOp(',', 'zwischen Argumenten');
      if (this.isKw('ELSE') && this.isOp(':=', this.peek())) {
        this.error(
          `${name.value.toUpperCase()} hat keinen Parameter ELSE – der Ersatzwert heißt INELSE`,
        );
      }
      if (this.t.kind === 'ident' && this.isOp(':=', this.peek())) {
        const n = this.next();
        this.next();
        const e = this.expr();
        args.push({ name: n.value.toUpperCase(), e, span: joinSpans(n, e.span) });
      } else {
        const e = this.expr();
        args.push({ e, span: e.span });
      }
      if (this.t.kind === 'eof') this.error('„)“ fehlt', name);
    }
    const close = this.next();
    return { k: 'call', name: name.value.toUpperCase(), args, span: joinSpans(name, close) };
  }

  private ref(): Ref {
    const t = this.next();
    const scope =
      t.kind === 'local'
        ? 'local'
        : t.kind === 'quoted'
          ? 'tag'
          : t.kind === 'address'
            ? 'addr'
            : t.kind === 'ident'
              ? 'auto'
              : this.error(`Variable erwartet, gefunden ${describe(t)}`, t);
    let span: Span = t;
    const path: string[] = [];
    const idx: Index[] = [];
    const indices = () => {
      while (this.isOp('[') && scope !== 'addr') {
        const open = this.next();
        const es: Expr[] = [];
        do {
          if (es.length) this.next(); // Komma
          es.push(this.expr());
        } while (this.isOp(','));
        const close = this.expectOp(']', 'nach dem Feldindex');
        idx.push({ at: path.length, es, span: joinSpans(open, close) });
        span = joinSpans(t, close);
      }
    };
    indices();
    while (this.isOp('.') && scope !== 'addr') {
      this.next();
      const m = this.t;
      if (m.kind !== 'ident' && m.kind !== 'keyword' && m.kind !== 'quoted') {
        this.error('Name nach „.“ erwartet');
      }
      this.next();
      path.push(m.value);
      span = joinSpans(t, m);
      indices();
    }
    return idx.length
      ? { k: 'ref', scope, name: t.value, path, idx, span }
      : { k: 'ref', scope, name: t.value, path, span };
  }
}
