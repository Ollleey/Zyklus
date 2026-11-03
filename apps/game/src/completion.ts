/**
 * Namen, die die Autovervollständigung im SCL-Editor zusätzlich anbietet (Variablen, DBs).
 * Eigenes Modul ohne Monaco, damit der Editor erst beim ersten Öffnen geladen wird.
 */
export interface CompletionSymbol {
  label: string;
  detail: string;
  insert: string;
}

let symbols: CompletionSymbol[] = [];

export function setCompletionSymbols(list: CompletionSymbol[]): void {
  symbols = list;
}

export function completionSymbols(): CompletionSymbol[] {
  return symbols;
}
