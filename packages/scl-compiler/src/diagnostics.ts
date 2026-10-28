/** Position im Quelltext, 1-basiert (wie im Editor angezeigt). */
export interface Pos {
  line: number;
  col: number;
}

export interface Span {
  start: Pos;
  /** exklusiv: erste Position nach dem Element */
  end: Pos;
}

export type Severity = 'error' | 'warning';

export interface Diagnostic extends Span {
  severity: Severity;
  message: string;
}

export class SclError extends Error {
  constructor(
    message: string,
    readonly span: Span,
  ) {
    super(message);
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  const kind = d.severity === 'error' ? 'Fehler' : 'Warnung';
  return `${kind} in Zeile ${d.start.line}, Spalte ${d.start.col}: ${d.message}`;
}

export function joinSpans(a: Span, b: Span): Span {
  return { start: a.start, end: b.end };
}
