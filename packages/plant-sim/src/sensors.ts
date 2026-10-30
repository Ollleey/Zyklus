import { CATALOG } from './catalog';
import { COLORS, MATERIALS, WATER, reflectanceOf, type WorkpieceSpec } from './materials';
import {
  DIR,
  bool,
  num,
  rectOf,
  str,
  toLocal,
  toWorld,
  type Part,
  type Rect,
  type Vec,
} from './model';
import type { PartState, Workpiece } from './world';

/**
 * Sensor-Physik als reine Funktionen: `detect(sensor, szene, vorher)` liefert den Messwert aus der
 * Lage und den Eigenschaften der Werkstücke. Digitale Sensoren geben „erkannt“ zurück (vor der
 * Öffner-Umkehr), analoge den physikalischen Wert in der Einheit ihres Feldgeräts.
 */

/** Was ein Sensor von der Anlage sieht (die Welt erfüllt diese Schnittstelle) */
export interface Scene {
  readonly parts: readonly Part[];
  readonly workpieces: readonly Workpiece[];
  st(p: Part): PartState;
  find(ref: string): Part | undefined;
  levelOf(tank: Part): number;
  pusher(cylinder: Part): Rect;
  /** Vorauswahl der Werkstücke nahe einem Rechteck (optional, beschleunigt die Suche) */
  near?(r: Rect, out: Workpiece[]): Workpiece[];
}

/** Erfassungszone zum Zeichnen: Strahl bzw. Kegel ab der Sensorfläche */
export interface Zone {
  kind: 'cone' | 'beam' | 'down' | 'contact' | 'none';
  /** Sensorfläche und Ende der Zone in der Draufsicht */
  from: Vec;
  to: Vec;
  /** halbe Breite der Zone */
  half: number;
  /** Höhe der Achse */
  z: number;
}

/** Abstand Mitte → aktive Fläche */
const FACE = 12;
/** halbe Breite der Erfassung quer zur Achse */
const HALF: Record<string, number> = {
  inductive: 8,
  capacitive: 10,
  diffuse: 4,
  thrubeam: 2,
  retro: 3,
  color: 6,
  ultrasonic: 10,
  limit: 6,
};

/** Reichweite der Zone (für Darstellung und Auswertung) */
export function zoneLength(p: Part): number {
  const q = p.params;
  switch (p.type) {
    case 'thrubeam':
    case 'retro':
      return num(q, 'length', 120);
    case 'limit':
      return 8;
    default:
      return num(q, 'range', 10) + num(q, 'hysteresis', 0);
  }
}

export function zoneOf(p: Part): Zone {
  const z = p.z;
  const kind =
    p.type === 'thrubeam' || p.type === 'retro'
      ? 'beam'
      : p.type === 'limit'
        ? 'contact'
        : p.type === 'ultrasonic' && str(p.params, 'facing', 'unten') === 'unten'
          ? 'down'
          : HALF[p.type]
            ? 'cone'
            : 'none';
  const half = HALF[p.type] ?? 0;
  if (kind === 'down') return { kind, from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y }, half, z };
  return { kind, from: toWorld(p, FACE, 0), to: toWorld(p, FACE + zoneLength(p), 0), half, z };
}

interface Hit {
  w: Workpiece;
  /** Abstand von der Sensorfläche bis zur nächsten Kante */
  d: number;
}

/** Werkstücke, die die Achse des Sensors schneiden, nach Abstand sortiert */
const nearBuf: Workpiece[] = [];
/** Suchrechteck je Sensor und Reichweite (Bauteile ändern sich während eines Laufs nicht) */
const zoneCache = new WeakMap<Part, Map<number, Rect>>();

/** Werkstücke, die für einen Sensor in Frage kommen (über das Raster der Welt, sonst alle) */
function candidates(p: Part, scene: Scene, length: number, half: number): readonly Workpiece[] {
  if (!scene.near) return scene.workpieces;
  let byLen = zoneCache.get(p);
  if (!byLen) zoneCache.set(p, (byLen = new Map()));
  const key = length * 1000 + half;
  let r = byLen.get(key);
  if (!r) {
    const a = toWorld(p, FACE, 0);
    const b = toWorld(p, FACE + length, 0);
    r = {
      x0: Math.min(a.x, b.x) - half,
      x1: Math.max(a.x, b.x) + half,
      y0: Math.min(a.y, b.y) - half,
      y1: Math.max(a.y, b.y) + half,
    };
    byLen.set(key, r);
  }
  return scene.near(r, nearBuf);
}

function along(p: Part, scene: Scene, length: number, half: number): Hit[] {
  const out: Hit[] = [];
  for (const w of candidates(p, scene, length, half)) {
    if (w.state !== 'free') continue;
    if (p.z < w.z || p.z > w.z + w.h) continue;
    const c = toLocal(p, w.x, w.y);
    const u0 = c.u - w.s / 2;
    const u1 = c.u + w.s / 2;
    if (c.v + w.s / 2 < -half || c.v - w.s / 2 > half) continue;
    if (u1 < FACE || u0 > FACE + length) continue;
    out.push({ w, d: Math.max(0, u0 - FACE) });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Schaltabstand mit Hysterese: Einschalten bei ≤ sr, Ausschalten erst über sr + h */
const within = (d: number, sr: number, h: number, prev: boolean) => (prev ? d <= sr + h : d <= sr);

/** Reduktionsfaktor kapazitiver Sensoren aus der Dielektrizitätszahl (Metall, Wasser ≈ 1) */
export const capacitiveFactor = (er: number) => Math.min(1, ((er - 1) / (er + 1)) * 1.02);

/** wirksamer Schaltabstand eines optischen Tasters je nach Reflexionsgrad */
export function diffuseFactor(spec: WorkpieceSpec): number {
  // Glas reflektiert diffus kaum; schwarze Teile nur auf kurzen Abstand
  const r = MATERIALS[spec.material].transparent ? 0.05 : reflectanceOf(spec);
  return Math.min(1, 0.1 + r);
}

export function detect(p: Part, scene: Scene, prev: boolean | number = false): boolean | number {
  const q = p.params;
  const wasOn = prev === true;
  const half = HALF[p.type] ?? 6;
  const sr = num(q, 'range', 10);
  const hyst = num(q, 'hysteresis', 0);
  switch (p.type) {
    case 'inductive':
      return along(p, scene, sr * 1.5 + hyst, half).some(({ w, d }) => {
        const f = MATERIALS[w.spec.material].inductive;
        return f > 0 && within(d, sr * f, hyst * f, wasOn);
      });
    case 'capacitive': {
      const hit = along(p, scene, sr + hyst, half).some(({ w, d }) => {
        const f = capacitiveFactor(MATERIALS[w.spec.material].dielectric);
        return within(d, sr * f, hyst * f, wasOn);
      });
      return hit || liquidAt(p, scene, sr + (wasOn ? hyst : 0));
    }
    case 'diffuse': {
      // nur das vorderste Teil wirft Licht zurück
      const first = along(p, scene, sr + hyst, half)[0];
      if (!first) return false;
      const f = diffuseFactor(first.w.spec);
      return within(first.d, sr * f, hyst * f, wasOn);
    }
    case 'thrubeam':
      return along(p, scene, num(q, 'length', 120), half).some(
        ({ w }) => !MATERIALS[w.spec.material].transparent,
      );
    case 'retro': {
      const polfilter = bool(q, 'polfilter', true);
      return along(p, scene, num(q, 'length', 120), half).some(({ w }) => {
        const m = MATERIALS[w.spec.material];
        if (m.transparent) return false;
        // ohne Polfilter wirft glänzendes Metall den Strahl selbst zurück: keine Unterbrechung
        return polfilter || !(m.metal && m.glossy);
      });
    }
    case 'color': {
      const first = along(p, scene, sr, half)[0];
      const code = first ? COLORS[first.w.spec.color].code : 0;
      if (str(q, 'mode') === 'code') return code;
      return !!first && first.w.spec.color === str(q, 'target', 'rot');
    }
    case 'ultrasonic':
      return ultrasonic(p, scene);
    case 'limit': {
      const zone = contactZone(p);
      for (const w of scene.workpieces) {
        if (w.state !== 'free' || p.z < w.z || p.z > w.z + w.h) continue;
        if (boxesTouch(zone, square(w.x, w.y, w.s))) return true;
      }
      for (const c of scene.parts) {
        if (c.type !== 'cylinder' || p.z < c.z - 1 || p.z > c.z + 31) continue;
        if (boxesTouch(zone, scene.pusher(c))) return true;
      }
      return false;
    }
    case 'reed': {
      const c = cylinderOf(p, scene);
      if (!c) return false;
      const pos = scene.st(c).pos;
      return str(q, 'position', 'aus') === 'aus' ? pos >= 0.98 : pos <= 0.02;
    }
    case 'loadcell': {
      const size = CATALOG.loadcell.size(q);
      const r = rectOf(p, size.l, size.w);
      let g = 0;
      for (const w of scene.workpieces) {
        if (w.state !== 'free' || !w.grounded || Math.abs(w.z - p.z) > 1) continue;
        if (w.x >= r.x0 && w.x <= r.x1 && w.y >= r.y0 && w.y <= r.y1) g += w.mass;
      }
      return g;
    }
    case 'level': {
      const t = tankOf(p, scene);
      return t ? scene.levelOf(t) : 0;
    }
    case 'levelswitch': {
      const t = tankOf(p, scene);
      if (!t) return false;
      const at = num(q, 'at', 80);
      return wasOn ? scene.levelOf(t) >= at - 1 : scene.levelOf(t) >= at;
    }
  }
  return false;
}

/** Ultraschall: Abstand zur nächsten Fläche in mm; in der Blindzone und ohne Echo der Endwert */
function ultrasonic(p: Part, scene: Scene): number {
  const range = num(p.params, 'range', 400);
  const blind = num(p.params, 'blind', 30);
  let d = Infinity;
  if (str(p.params, 'facing', 'unten') === 'unten') {
    // schaut senkrecht nach unten: Werkstücke, Flüssigkeit und Bandoberflächen unter dem Kopf
    const r = HALF.ultrasonic!;
    for (const w of scene.workpieces) {
      if (w.state !== 'free' || w.z + w.h > p.z) continue;
      if (Math.abs(w.x - p.x) > w.s / 2 + r || Math.abs(w.y - p.y) > w.s / 2 + r) continue;
      d = Math.min(d, p.z - (w.z + w.h));
    }
    for (const t of scene.parts) {
      if (t.type === 'tank') {
        const rad = num(t.params, 'diameter', 200) / 2;
        if ((t.x - p.x) ** 2 + (t.y - p.y) ** 2 > rad * rad) continue;
        const surface = t.z + (scene.levelOf(t) / 100) * num(t.params, 'height', 300);
        if (surface <= p.z) d = Math.min(d, p.z - surface);
      } else if (t.type === 'belt' || t.type === 'rollers' || t.type === 'lift') {
        const size = CATALOG[t.type].size(t.params);
        const rect = rectOf(t, size.l, size.w);
        const top = t.type === 'lift' ? t.z + scene.st(t).pos * num(t.params, 'stroke', 80) : t.z;
        if (p.x >= rect.x0 && p.x <= rect.x1 && p.y >= rect.y0 && p.y <= rect.y1 && top <= p.z)
          d = Math.min(d, p.z - top);
      }
    }
  } else {
    const first = along(p, scene, range, HALF.ultrasonic!)[0];
    if (first) d = first.d;
  }
  if (d < blind || d > range) return range;
  return d;
}

/** Flüssigkeit vor einem kapazitiven Sensor an der Tankwand (bis zur Sensorhöhe gefüllt) */
function liquidAt(p: Part, scene: Scene, reach: number): boolean {
  for (const t of scene.parts) {
    if (t.type !== 'tank') continue;
    const rad = num(t.params, 'diameter', 200) / 2;
    const face = toWorld(p, FACE, 0);
    const dist = Math.hypot(face.x - t.x, face.y - t.y) - rad;
    if (dist > reach * capacitiveFactor(WATER.dielectric)) continue;
    const surface = t.z + (scene.levelOf(t) / 100) * num(t.params, 'height', 300);
    if (p.z >= t.z && p.z <= surface) return true;
  }
  return false;
}

function cylinderOf(p: Part, scene: Scene): Part | undefined {
  const ref = str(p.params, 'cylinder');
  const c = ref ? scene.find(ref) : undefined;
  if (c?.type === 'cylinder') return c;
  return nearest(p, scene, 'cylinder');
}

function tankOf(p: Part, scene: Scene): Part | undefined {
  const ref = str(p.params, 'tank');
  const t = ref ? scene.find(ref) : undefined;
  if (t?.type === 'tank') return t;
  return nearest(p, scene, 'tank');
}

function nearest(p: Part, scene: Scene, type: Part['type']): Part | undefined {
  let best: Part | undefined;
  let bd = Infinity;
  for (const k of scene.parts) {
    if (k.type !== type) continue;
    const d = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/** Betätigungszone eines Endschalters vor dem Rollenhebel */
export function contactZone(p: Part): Rect {
  const c = toWorld(p, FACE + 4, 0);
  const d = DIR[p.rot];
  const along = 8;
  const across = 2 * HALF.limit!;
  const hw = (d.x ? along : across) / 2;
  const hh = (d.x ? across : along) / 2;
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
}

const square = (x: number, y: number, s: number): Rect => ({
  x0: x - s / 2,
  y0: y - s / 2,
  x1: x + s / 2,
  y1: y + s / 2,
});

const boxesTouch = (a: Rect, b: Rect) =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Sensorbauteile, die `detect` auswertet */
export const SENSOR_TYPES = new Set<Part['type']>([
  'inductive',
  'capacitive',
  'diffuse',
  'thrubeam',
  'retro',
  'color',
  'ultrasonic',
  'limit',
  'reed',
  'loadcell',
  'level',
  'levelswitch',
]);
