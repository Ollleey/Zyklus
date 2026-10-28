import type { Arg, BinaryOp, CaseLabel, Decl, Expr, FbArg, Ref, SclUnit, Stmt } from './ast';
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
  'END_VAR',
]);

export interface ParseResult {
  unit: SclUnit;
  diagnostics: Diagnostic[];
}

/** Parst SCL-Quelltext. Syntaxfehler werden gesammelt; der Parser setzt nach `;` bzw. Blockende wieder auf. */
export function parse(src: string): ParseResult {
  let tokens: Token[];
  try {
    tokens = tokenize(src);
  } catch (e) {
    if (e instanceof SclError) {
      return {
        unit: { decls: [], body: [] },
        diagnostics: [{ severity: 'error', message: e.message, ...e.span }],
      };
    }
    throw e;
  }
  return new Parser(tokens).parseUnit();
}

function describe(t: Token): string {
  switch (t.kind) {
    case 'eof':
      return 'Ende des Programms';
    case 'local':
      return `„#${t.value}“`;
    case 'quoted':
      return `„"${t.value}"“`;
    default:
      return `„${t.value}“`;
  }
}

class Parser {
  private p = 0;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: Token[]) {}

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

  // ---------- Programm ----------

  parseUnit(): ParseResult {
    const decls: Decl[] = [];
    while (this.isKw('VAR') || this.isKw('VAR_TEMP')) {
      const start = this.p;
      try {
        decls.push(...this.declBlock());
      } catch (e) {
        this.record(e);
        while (this.t.kind !== 'eof' && !this.isKw('END_VAR')) this.next();
        if (this.isKw('END_VAR')) this.next();
        if (this.p === start) this.next();
      }
    }
    const body = this.stmtList(() => this.t.kind === 'eof');
    return { unit: { decls, body }, diagnostics: this.diagnostics };
  }

  private declBlock(): Decl[] {
    const head = this.next();
    let section: Decl['section'] = head.value === 'VAR_TEMP' ? 'VAR_TEMP' : 'VAR';
    if (section === 'VAR' && this.isKw('CONSTANT')) {
      this.next();
      section = 'CONST';
    }
    const decls: Decl[] = [];
    while (!this.isKw('END_VAR')) {
      if (this.t.kind === 'eof') this.error('END_VAR fehlt', head);
      const names: Token[] = [];
      do {
        if (names.length) this.next(); // Komma
        if (this.t.kind !== 'ident') {
          this.error(`Variablenname erwartet, gefunden ${describe(this.t)}`);
        }
        names.push(this.next());
      } while (this.isOp(','));
      this.expectOp(':', 'nach dem Variablennamen');
      if (this.t.kind !== 'ident') this.error(`Datentyp erwartet, gefunden ${describe(this.t)}`);
      const typeTok = this.next();
      let init: Expr | undefined;
      if (this.isOp(':=')) {
        this.next();
        init = this.expr();
      } else if (section === 'CONST') {
        this.error('Konstante braucht einen Wert (name : TYP := wert;)');
      }
      const semi = this.expectOp(';', 'am Ende der Deklaration');
      for (const n of names) {
        decls.push({
          section,
          name: n.value,
          typeName: typeTok.value,
          typeSpan: typeTok,
          init,
          span: joinSpans(n, semi),
        });
      }
    }
    this.next(); // END_VAR
    this.optionalSemicolon();
    return decls;
  }

  // ---------- Anweisungen ----------

  private stmtList(atEnd: () => boolean): Stmt[] {
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
        case 'EXIT':
        case 'CONTINUE':
        case 'RETURN': {
          this.next();
          const semi = this.expectOp(';', `nach ${t.value}`);
          return { k: t.value.toLowerCase() as 'exit', span: joinSpans(t, semi) };
        }
        case 'VAR':
        case 'VAR_TEMP':
          this.error('Deklarationen müssen vor den Anweisungen stehen');
      }
      this.error(`Unerwartetes Schlüsselwort ${t.value}`);
    }

    if (t.kind === 'ident' && this.isOp('(', this.peek())) {
      // Funktion oder FB-Instanz ohne # – der Compiler entscheidet
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
    // Benannte Parameter mit => deuten auf FB hin; sonst als Funktionsaufruf parsen
    const save = this.p;
    this.next();
    this.next(); // (
    const fbLike =
      this.t.kind === 'ident' && (this.isOp(':=', this.peek()) || this.isOp('=>', this.peek()));
    const isEmpty = this.isOp(')');
    this.p = save;
    if (fbLike || isEmpty) {
      const inst: Ref = { k: 'ref', scope: 'auto', name: name.value, span: name };
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
        this.error('FB-Aufrufe brauchen benannte Parameter, z. B. IN := …, PT := …');
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
          if (hi.name)
            this.error('Konstantennamen als CASE-Marke werden nicht unterstützt', hi.span);
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

  private static readonly LEVELS: { ops: string[]; kw?: boolean }[] = [
    { ops: ['OR'] },
    { ops: ['XOR'] },
    { ops: ['AND', '&'] },
    { ops: ['=', '<>'] },
    { ops: ['<', '<=', '>', '>='] },
    { ops: ['+', '-'] },
    { ops: ['*', '/', 'MOD'] },
  ];

  private matchLevel(level: number): BinaryOp | undefined {
    const t = this.t;
    if (t.kind !== 'op' && t.kind !== 'keyword') return undefined;
    if (!Parser.LEVELS[level]!.ops.includes(t.value)) return undefined;
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

  private call(): Expr {
    const name = this.next();
    this.next(); // (
    const args: Arg[] = [];
    while (!this.isOp(')')) {
      if (args.length) this.expectOp(',', 'zwischen Argumenten');
      // ELSE ist Schlüsselwort, aber auch Parametername bei MUX
      const paramName = this.t.kind === 'ident' || this.isKw('ELSE');
      if (paramName && this.isOp(':=', this.peek())) {
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
    let member: string | undefined;
    if (this.isOp('.') && scope !== 'addr') {
      this.next();
      const m = this.t;
      if (m.kind !== 'ident' && m.kind !== 'keyword') this.error('Name nach „.“ erwartet');
      this.next();
      member = m.value;
      span = joinSpans(t, m);
    }
    if (this.isOp('[')) this.error('Arrays werden nicht unterstützt');
    return { k: 'ref', scope, name: t.value, member, span };
  }
}
