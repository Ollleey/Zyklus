import { useCallback, useRef, useState } from 'react';

/** Rückgängig/Wiederholen für einen unveränderlichen Zustand (mindestens 50 Schritte) */
export const HISTORY_LIMIT = 100;

export interface History<T> {
  value: T;
  /** neuer Stand; gleiche `gesture` wie beim vorigen Aufruf fasst zu einem Schritt zusammen (Ziehen) */
  set: (v: T, gesture?: string) => void;
  /** Stand ersetzen und Verlauf leeren (Laden einer Anlage) */
  reset: (v: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: () => T): History<T> {
  const [state, setState] = useState(() => ({
    past: [] as T[],
    value: initial(),
    future: [] as T[],
  }));
  const gestureRef = useRef<string | undefined>(undefined);
  const set = useCallback((v: T, gesture?: string) => {
    const merge = gesture !== undefined && gesture === gestureRef.current;
    gestureRef.current = gesture;
    setState((s) => {
      if (Object.is(v, s.value)) return s;
      const past = merge ? s.past : [...s.past, s.value].slice(-HISTORY_LIMIT);
      return { past, value: v, future: [] };
    });
  }, []);
  const reset = useCallback((v: T) => {
    gestureRef.current = undefined;
    setState({ past: [], value: v, future: [] });
  }, []);
  const undo = useCallback(() => {
    gestureRef.current = undefined;
    setState((s) =>
      s.past.length
        ? {
            past: s.past.slice(0, -1),
            value: s.past[s.past.length - 1]!,
            future: [s.value, ...s.future],
          }
        : s,
    );
  }, []);
  const redo = useCallback(() => {
    gestureRef.current = undefined;
    setState((s) =>
      s.future.length
        ? { past: [...s.past, s.value], value: s.future[0]!, future: s.future.slice(1) }
        : s,
    );
  }, []);
  return {
    value: state.value,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
