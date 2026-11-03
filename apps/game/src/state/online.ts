import { tokenize } from '@zyklus/scl-compiler';
import type { DataType, PlcProject, Value } from '@zyklus/sim-core';
import { platform } from '@zyklus/platform';

/** Anzeigeformat einer Zeile der Beobachtungstabelle */
export type WatchFormat = 'dec' | 'hex' | 'bin' | 'time';

export interface WatchRow {
  operand: string;
  format: WatchFormat;
  /** Steuerwert als Literal (TRUE, 42, 16#FF, T#2s, 'Text') */
  modify?: string;
}

export interface ForceRow {
  operand: string;
  value: string;
  active: boolean;
}

/** Beobachtungs- und Forcetabelle einer CPU */
export interface OnlineTables {
  watch: WatchRow[];
  force: ForceRow[];
  /** Steuerwerte in jedem Bild erneut schreiben („Steuern zyklisch“) */
  cyclic?: boolean;
}

export type OnlineState = Record<string, OnlineTables>;

export const EMPTY_TABLES: OnlineTables = { watch: [], force: [] };

const key = (levelId: string) => `zyklus.online.${levelId}`;

export function loadOnline(levelId: string): OnlineState {
  try {
    const raw = platform.storage.getItem(key(levelId));
    return raw ? (JSON.parse(raw) as OnlineState) : {};
  } catch {
    return {};
  }
}

export function saveOnline(levelId: string, s: OnlineState): void {
  try {
    const empty = Object.values(s).every((t) => !t.watch.length && !t.force.length);
    if (empty) platform.storage.removeItem(key(levelId));
    else platform.storage.setItem(key(levelId), JSON.stringify(s));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}

/** Ziel eines Operanden in der CPU */
export type Target =
  | { kind: 'address'; address: string; t?: DataType }
  | { kind: 'slot'; name: string }
  | { kind: 'instance'; name: string; field: string };

/**
 * Operand wie in TIA: `"Motor"` (PLC-Variable), `%IW64`, `"Daten".Wert`, `"Daten".Feld[2].x`,
 * `"T1".ET` (Instanz). Ohne Anführungszeichen geht es auch.
 */
export function resolveOperand(project: PlcProject, text: string): Target | { error: string } {
  const s = text.trim();
  if (!s) return { error: 'Operand fehlt' };
  if (s.startsWith('%')) return { kind: 'address', address: s.toUpperCase() };
  const m = /^"?([^".[\]]+)"?(.*)$/.exec(s);
  if (!m) return { error: 'Operand nicht erkannt' };
  const name = m[1]!.trim();
  const rest = m[2]!.replace(/\s+/g, '');
  if (!rest) {
    const tag = project.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (tag) return { kind: 'address', address: tag.address, t: tag.t };
    return { error: `PLC-Variable „${name}“ unbekannt` };
  }
  if (!rest.startsWith('.') && !rest.startsWith('[')) return { error: 'Operand nicht erkannt' };
  const block = project.blocks.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (!block) return { error: `Datenbaustein „${name}“ unbekannt` };
  const path = rest.replace(/"/g, '');
  if (block.kind === 'IDB' && /^\.[A-Za-z]+$/.test(path) && !/^"/.test(block.of)) {
    return { kind: 'instance', name: block.name, field: path.slice(1).toUpperCase() };
  }
  return { kind: 'slot', name: `${block.name}${path}` };
}

/** Steuer- bzw. Forcewert aus einem Literal */
export function parseValue(text: string): Value | undefined {
  try {
    const toks = tokenize(text.trim()).filter((t) => t.kind !== 'eof');
    let sign = 1;
    if (toks[0]?.kind === 'op' && toks[0].value === '-') {
      sign = -1;
      toks.shift();
    }
    if (toks.length !== 1) return undefined;
    const t = toks[0]!;
    if (t.kind === 'keyword' && (t.value === 'TRUE' || t.value === 'FALSE')) {
      return sign === 1 ? t.value === 'TRUE' : undefined;
    }
    if (t.kind === 'typed' && t.type === 'BOOL') return t.num === 1;
    if (t.kind === 'string') return sign === 1 ? t.value : undefined;
    if (t.kind === 'int' || t.kind === 'real' || t.kind === 'typed') return sign * t.num!;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Zeitwert in ms als T#… */
export function timeText(ms: number): string {
  if (ms === 0) return 'T#0ms';
  const neg = ms < 0;
  let r = Math.abs(ms);
  const parts: string[] = [];
  for (const [u, f] of [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
    ['ms', 1],
  ] as const) {
    const n = Math.floor(r / f);
    if (n) parts.push(`${n}${u}`);
    r -= n * f;
  }
  return `T#${neg ? '-' : ''}${parts.join('_')}`;
}

/** Zahl im gewählten Format (Bool und Text bleiben, wie sie sind) */
export function formatAs(v: number, f: WatchFormat): string {
  if (!Number.isInteger(v) || f === 'dec') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (f === 'time') return timeText(v);
  const u = v < 0 ? v >>> 0 : v;
  return f === 'hex' ? `16#${u.toString(16).toUpperCase()}` : `2#${u.toString(2)}`;
}
