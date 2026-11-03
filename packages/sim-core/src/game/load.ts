import type { IrProgram } from '../ir';

/**
 * Laden in RUN geht nur, wenn sich die Datenstruktur nicht ändert: dieselben Variablen (Name und
 * Typ, ohne Temp) und dieselben Instanzen. Code darf sich beliebig ändern.
 */
export function loadCompatible(
  before: IrProgram,
  after: IrProgram,
): { ok: true } | { ok: false; reason: string } {
  const vars = (p: IrProgram) =>
    p.slots
      .filter((s) => !s.temp)
      .map((s) => `${s.name.toLowerCase()}|${s.t}|${s.len ?? ''}`)
      .sort()
      .join('\n');
  if (vars(before) !== vars(after)) {
    return { ok: false, reason: 'Variablen in Datenbausteinen oder Instanzen haben sich geändert' };
  }
  const inst = (p: IrProgram) =>
    p.instances
      .map((d) => `${d.name.toLowerCase()}|${d.kind}`)
      .sort()
      .join('\n');
  if (inst(before) !== inst(after)) {
    return { ok: false, reason: 'Zeiten, Zähler oder Flanken sind hinzugekommen oder entfallen' };
  }
  return { ok: true };
}
