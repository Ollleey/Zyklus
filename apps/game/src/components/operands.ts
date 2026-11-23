import type { CodeBlock, PlcProject } from '@zyklus/sim-core';

/** Operanden einer SCL-Zeile: "Tag", "DB".Element[.Element|[i]], #lokal[.Element], %I0.0 */
export const OPERAND_RE =
  /"[^"]+"(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)*|#[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|%[IQM][BWD]?\d+(?:\.[0-7])?/g;

/** Operand an Spalte `col` (1-basiert) einer Zeile, sonst undefined */
export function operandAt(line: string, col: number): string | undefined {
  for (const m of line.matchAll(OPERAND_RE)) {
    const start = (m.index ?? 0) + 1;
    if (col >= start && col <= start + m[0].length) return m[0];
  }
  return undefined;
}

/** Sieht ein Text wie ein Operand aus (für Rechtsklick in FUP/KOP/GRAPH-Feldern)? */
export const looksLikeOperand = (s: string) => /^\s*("|#|%[IQM])/.test(s);

/** Vergleichsschlüssel eines Bausteins für den Online/Offline-Vergleich */
export const blockKey = (b: CodeBlock) =>
  JSON.stringify([b.lang, b.source, b.fup, b.kop, b.graph, b.iface, b.event]);

export type CompareState = 'same' | 'changed' | 'offline' | 'online';

/** Vergleich je Codebaustein: geladener Stand (online) gegen Editor (offline) */
export function compareBlocks(
  offline: PlcProject | undefined,
  online: PlcProject | undefined,
): Map<string, CompareState> {
  const out = new Map<string, CompareState>();
  const code = (p?: PlcProject) =>
    (p?.blocks ?? []).filter(
      (b): b is CodeBlock => b.kind === 'OB' || b.kind === 'FB' || b.kind === 'FC',
    );
  const on = new Map(code(online).map((b) => [b.name, b]));
  for (const b of code(offline)) {
    const o = on.get(b.name);
    out.set(b.name, !o ? 'offline' : blockKey(o) === blockKey(b) ? 'same' : 'changed');
    on.delete(b.name);
  }
  for (const name of on.keys()) out.set(name, 'online');
  return out;
}

export const COMPARE_ICON: Record<CompareState, string> = {
  same: '●',
  changed: '◐',
  offline: '◑',
  online: '○',
};
