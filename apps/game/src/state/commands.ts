import { useEffect, useRef } from 'react';
import { platform } from '@zyklus/platform';

/**
 * Befehle aus Menüleiste, Tastatur und Dateizuordnung. Der gerade sichtbare Bildschirm meldet
 * an, was er kann; der zuletzt angemeldete Handler gewinnt.
 */
export type AppCommand =
  'save' | 'export' | 'new' | 'toggleSim' | 'importAnlage' | 'importSolution';

const stacks = new Map<AppCommand, ((arg?: string) => void)[]>();

/** Befehl für die Dauer der Anzeige anmelden */
export function useCommand(name: AppCommand, fn: (arg?: string) => void, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const h = (arg?: string) => ref.current(arg);
    const list = stacks.get(name) ?? [];
    list.push(h);
    stacks.set(name, list);
    return () => {
      const l = stacks.get(name) ?? [];
      const i = l.lastIndexOf(h);
      if (i >= 0) l.splice(i, 1);
    };
  }, [name, enabled]);
}

/** Befehl ausführen; false, wenn gerade niemand ihn kann */
export function runCommand(name: AppCommand, arg?: string): boolean {
  const h = stacks.get(name)?.at(-1);
  if (!h) return false;
  h(arg);
  return true;
}

const noticeListeners = new Set<(text: string) => void>();

/** kurzer Hinweis unten in der Mitte (z. B. „gespeichert“) */
export function showNotice(text: string): void {
  for (const l of noticeListeners) l(text);
}

export function onNotice(fn: (text: string) => void): () => void {
  noticeListeners.add(fn);
  return () => noticeListeners.delete(fn);
}

/** Fenstertitel setzen, solange der Bildschirm sichtbar ist */
export function useWindowTitle(title: string): void {
  useEffect(() => {
    platform.setTitle(title);
  }, [title]);
}

/** Tastenkürzel, die in Eingabefeldern und Editoren nicht greifen sollen (Leertaste) */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, button, [contenteditable="true"], .monaco-editor');
}
