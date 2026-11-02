import { useSyncExternalStore } from 'react';
import { platform } from '@zyklus/platform';

/** Anzeige von BOOL-Werten: 0/1 (Standard) oder TRUE/FALSE */
export type BoolFormat = '01' | 'text';

const KEY = 'zyklus.ui.boolFormat';
const listeners = new Set<() => void>();

function read(): BoolFormat {
  try {
    return platform.storage.getItem(KEY) === 'text' ? 'text' : '01';
  } catch {
    return '01';
  }
}

let current: BoolFormat = read();

export function setBoolFormat(f: BoolFormat): void {
  current = f;
  try {
    platform.storage.setItem(KEY, f);
  } catch {
    // ohne Speicher nur für diese Sitzung
  }
  for (const l of listeners) l();
}

/** Einstellung für alle Ansichten gemeinsam (Zeitdiagramm, Live-Werte, Variablen) */
export function useBoolFormat(): BoolFormat {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function formatBool(v: boolean, f: BoolFormat): string {
  return f === '01' ? (v ? '1' : '0') : v ? 'TRUE' : 'FALSE';
}

/** Wert für die Anzeige: Bool nach Einstellung, Zahlen mit `digits` Nachkommastellen */
export function formatValue(v: boolean | number | undefined, f: BoolFormat, digits = 0): string {
  if (v === undefined) return '';
  if (typeof v === 'boolean') return formatBool(v, f);
  return Number.isInteger(v) && digits === 0 ? String(v) : v.toFixed(digits);
}
