import type { DataType, Value } from '@zyklus/sim-core';
import { typeName } from './typerules';

/**
 * Datentyp einer Variablen nach der Auflösung: elementar, Feld oder Struktur.
 * Zusammengesetzte Daten liegen flach in aufeinanderfolgenden Slots (ein Slot je Element).
 */
export type VarType =
  | { k: 'elem'; t: DataType }
  | { k: 'array'; dims: [number, number][]; of: VarType }
  | { k: 'struct'; name?: string; fields: Field[] };

export interface Field {
  name: string;
  type: VarType;
  /** Startwerte der Slots dieses Elements (undefined = Standardwert) */
  init?: (Value | undefined)[];
}

/** Anzahl der Slots */
export function sizeOf(t: VarType): number {
  switch (t.k) {
    case 'elem':
      return 1;
    case 'array':
      return elementCount(t) * sizeOf(t.of);
    case 'struct':
      return t.fields.reduce((n, f) => n + sizeOf(f.type), 0);
  }
}

export function elementCount(t: Extract<VarType, { k: 'array' }>): number {
  return t.dims.reduce((n, [lo, hi]) => n * (hi - lo + 1), 1);
}

/** Element einer Struktur mit Slot-Versatz */
export function fieldOf(
  t: Extract<VarType, { k: 'struct' }>,
  name: string,
): { field: Field; off: number } | undefined {
  let off = 0;
  for (const f of t.fields) {
    if (f.name.toLowerCase() === name.toLowerCase()) return { field: f, off };
    off += sizeOf(f.type);
  }
  return undefined;
}

export function sameType(a: VarType, b: VarType): boolean {
  if (a.k === 'elem' || b.k === 'elem') return a.k === 'elem' && b.k === 'elem' && a.t === b.t;
  if (a.k === 'array' && b.k === 'array') {
    return (
      a.dims.length === b.dims.length &&
      a.dims.every(([lo, hi], i) => lo === b.dims[i]![0] && hi === b.dims[i]![1]) &&
      sameType(a.of, b.of)
    );
  }
  if (a.k === 'struct' && b.k === 'struct') {
    if (a.name || b.name) return a.name?.toLowerCase() === b.name?.toLowerCase();
    return (
      a.fields.length === b.fields.length &&
      a.fields.every(
        (f, i) =>
          f.name.toLowerCase() === b.fields[i]!.name.toLowerCase() &&
          sameType(f.type, b.fields[i]!.type),
      )
    );
  }
  return false;
}

/** Schreibweise wie in der Schnittstelle: Array[0..9] of Int, "Rezept", Struct */
export function typeText(t: VarType): string {
  switch (t.k) {
    case 'elem':
      return typeName(t.t);
    case 'array':
      return `Array[${t.dims.map(([lo, hi]) => `${lo}..${hi}`).join(', ')}] of ${typeText(t.of)}`;
    case 'struct':
      return t.name ? `"${t.name}"` : 'Struct';
  }
}

/** Elementare Typen, Namen und Startwerte aller Slots in Speicherreihenfolge */
export function leaves(t: VarType, name: string): { t: DataType; name: string; init?: Value }[] {
  const out: { t: DataType; name: string; init?: Value }[] = [];
  const walk = (t: VarType, name: string, init?: (Value | undefined)[]) => {
    switch (t.k) {
      case 'elem':
        out.push({ t: t.t, name, init: init?.[0] });
        return;
      case 'array': {
        const size = sizeOf(t.of);
        const n = elementCount(t);
        for (let i = 0; i < n; i++) {
          walk(t.of, `${name}[${indexText(t.dims, i)}]`, init?.slice(i * size, (i + 1) * size));
        }
        return;
      }
      case 'struct': {
        let off = 0;
        for (const f of t.fields) {
          const size = sizeOf(f.type);
          const own = init?.slice(off, off + size);
          const merged = own?.some((v) => v !== undefined) ? own : f.init;
          walk(f.type, `${name}.${f.name}`, merged);
          off += size;
        }
        return;
      }
    }
  };
  walk(t, name);
  return out;
}

/** i-tes Element (Zeilenreihenfolge) als Indextext „2,0“ */
function indexText(dims: [number, number][], i: number): string {
  const parts: number[] = [];
  for (let d = dims.length - 1; d >= 0; d--) {
    const [lo, hi] = dims[d]!;
    const n = hi - lo + 1;
    parts.unshift(lo + (i % n));
    i = Math.floor(i / n);
  }
  return parts.join(',');
}
