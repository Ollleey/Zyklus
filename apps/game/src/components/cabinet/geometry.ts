import { TE_MM, type Level } from '@zyklus/sim-core';

/**
 * Maße des Schaltschranks in mm (1 SVG-Einheit = 1 mm). Gezoomt wird über eine Transformation.
 *
 *   Feldgeräte │ Montageplatte: Kanal oben · Hutschiene mit Baugruppen · Kanal unten │ Feldgeräte
 */
export const G = {
  te: TE_MM,
  /** Breite der Gerätespalte links und rechts außerhalb der Platte */
  side: 66,
  /** Rand der Montageplatte um Kanäle und Schiene */
  margin: 10,
  ductTop: { y: 8, h: 26 },
  module: { y: 44, h: 120 },
  /** 35-mm-Hutschiene, mittig hinter den Baugruppen */
  rail: { y: 86.5, h: 35 },
  ductBottom: { y: 176, h: 28 },
  plateBottomPad: 10,
  device: { y: 48, step: 19, w: 54, h: 15 },
  /** Lücke zwischen zwei Baugruppen */
  gap: 0.6,
} as const;

export interface Layout {
  plateX: number;
  plateW: number;
  plateH: number;
  railX: number;
  railW: number;
  width: number;
  height: number;
}

export function layout(level: Level): Layout {
  const railW = level.board.width * G.te;
  const plateW = railW + 2 * G.margin;
  const left = level.devices.filter((d) => d.side === 'left').length;
  const right = level.devices.filter((d) => d.side === 'right').length;
  const devicesH = G.device.y + Math.max(left, right) * G.device.step + 6;
  const plateH = Math.max(G.ductBottom.y + G.ductBottom.h + G.plateBottomPad, devicesH);
  return {
    plateX: G.side,
    plateW,
    plateH,
    railX: G.side + G.margin,
    railW,
    width: G.side * 2 + plateW,
    height: plateH,
  };
}

/** x-Koordinate eines Rasterschritts */
export const colX = (l: Layout, col: number) => l.railX + col * G.te;

/** Breite des CPU-Teils einer Kompakt-CPU; rechts daneben liegt das E/A-Feld (2 TE) */
export const cpuFrontWidth = (t: { width: number; channels: number; kind: string }) =>
  t.kind === 'cpu' && t.channels ? t.width - 2 : t.width;

/** Lage des Klemmenfelds einer Baugruppe: Spalte und Breite in TE */
export function ioPanel(
  m: { x: number },
  t: { width: number; channels: number; kind: string },
): { x: number; width: number } {
  const front = cpuFrontWidth(t);
  return t.kind === 'cpu' ? { x: m.x + front, width: t.width - front } : { x: m.x, width: t.width };
}

/** Klemmenposition (Federzug) eines Kanals: zwei Spalten, von oben nach unten nummeriert */
export function terminalPos(
  l: Layout,
  module: { x: number },
  widthTe: number,
  channels: number,
  ch: number,
): { x: number; y: number } {
  const w = widthTe * G.te - G.gap;
  const cols = channels > 8 ? 4 : channels > 4 || widthTe > 1 ? 2 : 1;
  const rows = Math.ceil(channels / cols);
  const top = G.module.y + G.module.h - 44;
  const rowH = Math.min(10, 40 / Math.max(1, rows));
  const col = ch % cols;
  const row = Math.floor(ch / cols);
  const cellW = w / cols;
  return {
    x: colX(l, module.x) + G.gap / 2 + cellW * col + cellW / 2,
    y: top + row * rowH + rowH * 0.72,
  };
}
