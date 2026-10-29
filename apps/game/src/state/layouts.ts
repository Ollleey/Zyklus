import type { Layout } from '@zyklus/plant-sim';

const CURRENT_KEY = 'zyklus.anlage.aktuell';

/** zuletzt bearbeitete Anlage des Sandkastens */
export function loadLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    const l = raw ? (JSON.parse(raw) as Layout) : undefined;
    return l && l.formatVersion === 1 && Array.isArray(l.parts) ? l : undefined;
  } catch {
    return undefined;
  }
}

export function saveLayout(l: Layout): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(l));
  } catch {
    /* ohne Speicher nur für diese Sitzung */
  }
}
