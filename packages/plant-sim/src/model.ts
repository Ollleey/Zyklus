import type { ColorId, MaterialId, SizeId, WorkpieceSpec } from './materials';
import type { Scenario } from './scenario';

/**
 * Datenmodell einer frei gebauten Anlage. Alle Maße in mm, Zeiten in ms, Geschwindigkeiten in mm/s.
 * Lage: (x, y) ist die Mitte der Grundfläche in der Draufsicht (y nach unten), z die Höhe der
 * Oberfläche bzw. Unterkante über dem Boden. `rot` dreht im Uhrzeigersinn; Richtung 0° = +x.
 */

export type Rot = 0 | 90 | 180 | 270;

export type PartType =
  // Fördertechnik und Mechanik
  | 'belt'
  | 'rollers'
  | 'curve'
  | 'magazine'
  | 'chute'
  | 'bin'
  | 'diverter'
  | 'turntable'
  | 'lift'
  | 'stopper'
  | 'tank'
  | 'pipe'
  // Aktoren
  | 'cylinder'
  | 'pump'
  | 'valve'
  | 'lamp'
  | 'horn'
  | 'traffic'
  | 'gauge'
  // Bedienelemente
  | 'button'
  | 'switch'
  | 'estop'
  | 'selector'
  | 'poti'
  // Sensoren
  | 'inductive'
  | 'capacitive'
  | 'diffuse'
  | 'thrubeam'
  | 'retro'
  | 'color'
  | 'ultrasonic'
  | 'limit'
  | 'reed'
  | 'loadcell'
  | 'level'
  | 'levelswitch';

export type ParamValue = number | string | boolean | string[] | WorkpieceSpec[];
export type Params = Record<string, ParamValue>;

export interface Part {
  id: string;
  type: PartType;
  /** Betriebsmittelkennzeichnung, z. B. B1, M1, 1A1 */
  tag: string;
  x: number;
  y: number;
  z: number;
  rot: Rot;
  params: Params;
  /** Störung, im Inspektor schaltbar (S6) */
  fault?: string;
}

/** Werkstück-Mix eines Magazins: feste Liste oder Zufall aus den erlaubten Eigenschaften */
export interface Mix {
  list?: WorkpieceSpec[];
  random?: { materials: MaterialId[]; colors: ColorId[]; sizes: SizeId[] };
}

export interface Layout {
  formatVersion: 1;
  parts: Part[];
  /** von Hand eingelegte Werkstücke */
  workpieces?: (WorkpieceSpec & { x: number; y: number; z: number })[];
  /** Zufallsstartwert für Magazine mit Zufallsmix */
  seed: number;
  /** Größe der Arbeitsfläche */
  area: { w: number; h: number };
  /** Szenarien (Prüfläufe mit Zeitleiste), im Sandkasten als Testfälle wählbar */
  scenarios?: Scenario[];
}

export function emptyLayout(): Layout {
  return { formatVersion: 1, parts: [], seed: 1, area: { w: 2000, h: 1200 } };
}

// ---------------------------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------------------------

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const DIR: Record<Rot, Vec> = {
  0: { x: 1, y: 0 },
  90: { x: 0, y: 1 },
  180: { x: -1, y: 0 },
  270: { x: 0, y: -1 },
};

/** Linke Seite in Förderrichtung (Draufsicht, y nach unten) */
export const LEFT: Record<Rot, Vec> = {
  0: { x: 0, y: -1 },
  90: { x: 1, y: 0 },
  180: { x: 0, y: 1 },
  270: { x: -1, y: 0 },
};

export const rotate = (r: Rot, by: 90 | 180 | 270): Rot => ((r + by) % 360) as Rot;

/** Punkt in Bauteilkoordinaten: u längs der Richtung, v quer (positiv nach links) */
export function toLocal(
  p: Pick<Part, 'x' | 'y' | 'rot'>,
  x: number,
  y: number,
): { u: number; v: number } {
  const d = DIR[p.rot];
  const lft = LEFT[p.rot];
  const dx = x - p.x;
  const dy = y - p.y;
  return { u: dx * d.x + dy * d.y, v: dx * lft.x + dy * lft.y };
}

export function toWorld(p: Pick<Part, 'x' | 'y' | 'rot'>, u: number, v: number): Vec {
  const d = DIR[p.rot];
  const lft = LEFT[p.rot];
  return { x: p.x + u * d.x + v * lft.x, y: p.y + u * d.y + v * lft.y };
}

/** Rechteck aus Mitte und Abmessungen längs/quer, gedreht */
export function rectOf(p: Pick<Part, 'x' | 'y' | 'rot'>, length: number, width: number): Rect {
  const along = p.rot === 0 || p.rot === 180;
  const hw = (along ? length : width) / 2;
  const hh = (along ? width : length) / 2;
  return { x0: p.x - hw, y0: p.y - hh, x1: p.x + hw, y1: p.y + hh };
}

export const inside = (r: Rect, x: number, y: number) =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export const num = (p: Params, k: string, fallback = 0): number => {
  const v = p[k];
  return typeof v === 'number' ? v : fallback;
};
export const str = (p: Params, k: string, fallback = ''): string => {
  const v = p[k];
  return typeof v === 'string' ? v : fallback;
};
export const bool = (p: Params, k: string, fallback = false): boolean => {
  const v = p[k];
  return typeof v === 'boolean' ? v : fallback;
};
