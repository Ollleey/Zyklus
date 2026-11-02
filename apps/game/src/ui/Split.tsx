import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { platform } from '@zyklus/platform';

const KEY = (name: string) => `zyklus.ui.${name}`;

/** Zahl, die im Speicher überlebt (Panelgrößen); ohne Speicher gilt der Standardwert. */
export function useStoredNumber(
  name: string,
  initial: number,
  [min, max]: [number, number],
): [number, (v: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = Number(platform.storage.getItem(KEY(name)));
      return platform.storage.getItem(KEY(name)) !== null && v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: number) => {
      const c = Math.min(max, Math.max(min, v));
      setValue(c);
      try {
        platform.storage.setItem(KEY(name), String(c));
      } catch {
        // ohne Speicher nur für diese Sitzung
      }
    },
    [name, min, max],
  );
  return [value, set];
}

interface Props {
  /** `x`: senkrechter Balken zwischen zwei Spalten, `y`: waagrechter zwischen zwei Zeilen */
  dir: 'x' | 'y';
  /** neue Größe aus der Zeigerposition relativ zum Elternelement */
  onDrag: (pos: { x: number; y: number; width: number; height: number }) => void;
  /** Tastatur: Pfeiltasten verschieben um ±step */
  onStep: (delta: number) => void;
  label: string;
}

/** Ziehbarer Trenner zwischen zwei Bereichen, auch per Tastatur bedienbar. */
export function Splitter({ dir, onDrag, onStep, label }: Props) {
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    onDrag({ x: e.clientX - r.left, y: e.clientY - r.top, width: r.width, height: r.height });
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const back = dir === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = dir === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back || e.key === fwd) {
      e.preventDefault();
      onStep(e.key === fwd ? 1 : -1);
    }
  };
  return (
    <div
      className={`splitter splitter-${dir}`}
      role="separator"
      aria-orientation={dir === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={move}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      onKeyDown={key}
    />
  );
}
