import { deriveSeed, Rng, type Value } from '@zyklus/sim-core';
import { CATALOG } from './catalog';
import { deviceId } from './devices';
import {
  COLORS,
  MATERIALS,
  SIZES,
  massOf,
  type ColorId,
  type MaterialId,
  type SizeId,
  type WorkpieceSpec,
} from './materials';
import {
  DIR,
  LEFT,
  bool,
  inside,
  num,
  overlaps,
  rectOf,
  str,
  toLocal,
  type Layout,
  type Part,
  type Rect,
  type Vec,
} from './model';

/** Mechanik-Zeitschritt in ms */
export const STEP_MS = 2;
const DT = STEP_MS / 1000;
/** Erdbeschleunigung in mm/s² */
const G = 9810;
/** größte Stufe, die ein Werkstück beim Übergang zwischen zwei Flächen nach oben überwindet */
const STEP_UP = 3;
/** Rastabstand zur Fläche */
const SNAP = 0.5;

export type WorkpieceState = 'free' | 'binned' | 'lost';

export interface Workpiece {
  id: number;
  spec: WorkpieceSpec;
  /** Mitte der Grundfläche */
  x: number;
  y: number;
  /** Unterkante */
  z: number;
  /** Kantenlänge der quadratischen Grundfläche und Höhe */
  s: number;
  h: number;
  mass: number;
  vx: number;
  vy: number;
  vz: number;
  state: WorkpieceState;
  /** Behälter (Bauteil-id), in den es gefallen ist */
  bin?: string;
  /** liegt auf einer Fläche (sonst im Fall) */
  grounded: boolean;
}

/** veränderlicher Zustand eines Bauteils */
export interface PartState {
  /** Zylinder, Hubtisch: 0 = eingefahren/unten … 1 = ausgefahren/oben */
  pos: number;
  /** Drehtisch: Winkel in Grad 0…90 */
  angle: number;
  /** 5/2-Ventil bistabil: gespeicherte Stellung */
  latch: boolean;
  /** Antrieb läuft bzw. Ausgang ist an (Band, Lampe, Hupe, Pumpe, Ventil, Weiche, Anschlag) */
  on: boolean;
  /** Band: Geschwindigkeit in mm/s (vorzeichenbehaftet in Bandrichtung) */
  speed: number;
  /** Ampel: rot/gelb/grün */
  lights: [boolean, boolean, boolean];
  /** Bedienelemente: Taster/Schalter/Not-Halt betätigt, Wahlschalter 0/1/2, Poti 0…100 */
  control: number;
  /** Magazin: Anzahl ausgegebener Teile, letzte Flanke */
  issued: number;
  lastTrigger: boolean;
  nextAt: number;
  /** Tank: Inhalt in l */
  volume: number;
  /** Behälter: Anzahl je Werkstoff und Farbe */
  counts: Partial<Record<MaterialId | ColorId, number>>;
  total: number;
  /** Behälter: Teile, die nicht zur Soll-Regel passen */
  missorted: number;
  /** Zeigerinstrument: Anzeige in % */
  value: number;
}

const blankState = (): PartState => ({
  pos: 0,
  angle: 0,
  latch: false,
  on: false,
  speed: 0,
  lights: [false, false, false],
  control: 0,
  issued: 0,
  lastTrigger: false,
  nextAt: 0,
  volume: 0,
  counts: {},
  total: 0,
  missorted: 0,
  value: 0,
});

interface Surface {
  part: Part;
  rect: Rect;
  /** Oberkante an (x, y) oder undefined, wenn der Punkt nicht auf der Fläche liegt */
  top(x: number, y: number): number | undefined;
  /** Mitnahmegeschwindigkeit an (x, y) */
  vel(x: number, y: number): Vec;
}

interface Solid {
  part: Part;
  rect: Rect;
  z0: number;
  z1: number;
}

const ZERO: Vec = { x: 0, y: 0 };

/**
 * Mechanik der Anlage. Rechnet mit festem Zeitschritt von 2 ms und ist deterministisch:
 * gleiche Anlage, gleicher Seed und gleiche Ausgänge ergeben denselben Verlauf.
 */
export class World {
  readonly parts: Part[];
  readonly state = new Map<string, PartState>();
  readonly workpieces: Workpiece[] = [];
  /** Zeit in ms */
  time = 0;
  /** Ausgangswerte der SPS je Geräte-id */
  private outputs: Record<string, Value> = {};
  private readonly rng = new Map<string, Rng>();
  private nextId = 1;
  private readonly grid = new Map<number, Workpiece[]>();
  private readonly byPart = new Map<Part, PartState>();
  /** Rasterzellen je Suchrechteck (Sensorzonen sind fest) */
  private readonly cellsOf = new WeakMap<Rect, number[]>();
  /** Hub der Zylinder im vorigen Schritt: nur bewegte Druckplatten schieben */
  private readonly lastPos = new Map<Part, number>();
  /** Hindernisse, die sich nie ändern (Magazin, Behälterwände, Zylindergehäuse) */
  private staticSolids: Solid[] = [];
  private surfaceList: Surface[] = [];
  private readonly lastBlocker = new WeakMap<Workpiece, Workpiece>();
  private readonly cylinders: Part[];
  private readonly diverters: { part: Part; rect: Rect }[];
  private readonly bins: { part: Part; rect: Rect }[];
  private readonly byTag = new Map<string, Part>();
  spawned = 0;

  constructor(
    readonly layout: Layout,
    seed = layout.seed,
  ) {
    this.parts = layout.parts;
    for (const p of this.parts) {
      const st = blankState();
      if (p.type === 'tank')
        st.volume = (num(p.params, 'volume', 100) * num(p.params, 'level0')) / 100;
      if (p.type === 'magazine') st.nextAt = num(p.params, 'intervalMs', 3000);
      if (p.type === 'stopper') st.on = false;
      this.state.set(p.id, st);
      this.byPart.set(p, st);
      this.byTag.set(p.tag, p);
      this.rng.set(p.id, new Rng(deriveSeed(seed, p.id)));
    }
    this.cylinders = this.parts.filter((p) => p.type === 'cylinder');
    const area = (p: Part) => {
      const size = CATALOG[p.type].size(p.params);
      return { part: p, rect: rectOf(p, size.l, size.w) };
    };
    this.diverters = this.parts.filter((p) => p.type === 'diverter').map(area);
    this.bins = this.parts.filter((p) => p.type === 'bin').map(area);
    this.staticSolids = this.buildStaticSolids();
    this.surfaceList = this.buildSurfaces();
    for (const w of layout.workpieces ?? []) this.addWorkpiece(w, w.x, w.y, w.z);
  }

  st(p: Part): PartState {
    return this.byPart.get(p) ?? this.state.get(p.id)!;
  }

  /** Bauteil über id oder Kennzeichnung */
  find(ref: string): Part | undefined {
    return this.parts.find((p) => p.id === ref) ?? this.byTag.get(ref);
  }

  out(p: Part, key = ''): Value {
    return this.outputs[deviceId(p, key)] ?? false;
  }

  private on(p: Part, key = ''): boolean {
    return this.out(p, key) === true;
  }

  setOutputs(outputs: Record<string, Value>): void {
    this.outputs = outputs;
  }

  /** Bedienelement betätigen (Taster, Schalter, Wahlschalter 0/1/2, Poti 0…100) */
  setControl(ref: string, value: number | boolean): void {
    const p = this.find(ref);
    if (!p) return;
    const st = this.st(p);
    const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    if (p.type === 'estop') {
      // verrastend: Drücken rastet ein, erst erneutes Betätigen (Ziehen) entriegelt
      if (v) st.control = 1;
      return;
    }
    st.control = p.type === 'poti' ? Math.max(0, Math.min(100, v)) : v;
  }

  /** Not-Halt entriegeln */
  releaseEstop(ref: string): void {
    const p = this.find(ref);
    if (p?.type === 'estop') this.st(p).control = 0;
  }

  addWorkpiece(spec: WorkpieceSpec, x: number, y: number, z: number): Workpiece {
    const size = SIZES[spec.size];
    const w: Workpiece = {
      id: this.nextId++,
      spec: { ...spec },
      x,
      y,
      z,
      s: size.w,
      h: size.h,
      mass: massOf(spec),
      vx: 0,
      vy: 0,
      vz: 0,
      state: 'free',
      grounded: false,
    };
    this.workpieces.push(w);
    return w;
  }

  /** Werkstück mit der Maus versetzen */
  moveWorkpiece(id: number, x: number, y: number, z?: number): void {
    const w = this.workpieces.find((k) => k.id === id);
    if (!w) return;
    w.x = x;
    w.y = y;
    if (z !== undefined) w.z = z;
    w.vx = w.vy = w.vz = 0;
    w.grounded = false;
    w.state = 'free';
    w.bin = undefined;
  }

  removeWorkpiece(id: number): void {
    const i = this.workpieces.findIndex((k) => k.id === id);
    if (i >= 0) this.workpieces.splice(i, 1);
  }

  /** Magazin von Hand auslösen */
  triggerMagazine(ref: string): boolean {
    const p = this.find(ref);
    return p?.type === 'magazine' ? this.issue(p) : false;
  }

  // -------------------------------------------------------------------------------------------
  // Zeitschritt
  // -------------------------------------------------------------------------------------------

  step(): void {
    this.time += STEP_MS;
    for (const p of this.parts) this.actuate(p);
    const surfaces = this.surfaces();
    const solids = this.solids();
    for (const p of this.cylinders) {
      const pos = this.st(p).pos;
      if (this.lastPos.get(p) !== pos) this.push(p);
      this.lastPos.set(p, pos);
    }
    // Raster für die Nachbarsuche; Verschiebungen je Schritt sind viel kleiner als eine Zelle
    for (const list of this.grid.values()) list.length = 0;
    for (const w of this.workpieces) {
      if (w.state !== 'free') continue;
      const k = cellKey(Math.floor(w.x / CELL), Math.floor(w.y / CELL));
      const list = this.grid.get(k);
      if (list) list.push(w);
      else this.grid.set(k, [w]);
    }
    for (const w of this.workpieces) if (w.state === 'free') this.move(w, surfaces, solids);
  }

  private actuate(p: Part): void {
    const st = this.st(p);
    const q = p.params;
    const jammed = p.fault === 'klemmt';
    switch (p.type) {
      case 'belt': {
        const base = num(q, 'speed', 120);
        if (str(q, 'drive') === 'vfd') {
          const raw = Number(this.out(p, 'soll') || 0);
          st.on = this.on(p, 'frei');
          st.speed = st.on ? (base * Math.max(0, Math.min(raw, 27648))) / 27648 : 0;
        } else {
          const fwd = this.on(p);
          const rev = bool(q, 'reversible') && this.on(p, 'rueck');
          st.on = fwd !== rev;
          st.speed = st.on ? (fwd ? base : -base) : 0;
        }
        if (p.fault === 'blockiert') st.speed = 0;
        break;
      }
      case 'curve':
        st.on = this.on(p);
        st.speed = st.on && p.fault !== 'blockiert' ? num(q, 'speed', 120) : 0;
        break;
      case 'cylinder': {
        const valve = str(q, 'valve', '3/2');
        if (valve === '5/2-bi') {
          const a = this.on(p, 'aus');
          const b = this.on(p, 'ein');
          if (a && !b) st.latch = true;
          if (b && !a) st.latch = false;
        } else {
          st.latch = this.on(p, 'aus');
        }
        st.on = st.latch;
        if (!jammed) {
          const t = st.latch ? num(q, 'extendMs', 400) : num(q, 'retractMs', 400);
          st.pos = approach(st.pos, st.latch ? 1 : 0, STEP_MS / Math.max(t, 1));
        }
        break;
      }
      case 'lift':
        st.on = this.on(p, 'heben');
        if (!jammed) st.pos = approach(st.pos, st.on ? 1 : 0, STEP_MS / num(q, 'timeMs', 800));
        break;
      case 'turntable':
        st.on = this.on(p, 'dreh');
        if (!jammed)
          st.angle = approach(st.angle, st.on ? 90 : 0, (90 * STEP_MS) / num(q, 'turnMs', 1000));
        break;
      case 'stopper':
        // federnd ausgefahren: Ausgang öffnet; sonst fährt der Ausgang ihn aus
        st.on = q.springOut === false ? this.on(p) : !this.on(p);
        break;
      case 'diverter':
      case 'gauge': {
        const raw = Number(this.out(p) || 0);
        st.value = Math.max(0, Math.min(100, (raw / 27648) * 100));
        st.on = st.value > 0;
        break;
      }
      case 'lamp':
      case 'horn':
      case 'pump':
      case 'valve':
        st.on = this.on(p);
        break;
      case 'traffic':
        st.lights = [this.on(p, 'rot'), this.on(p, 'gelb'), this.on(p, 'gruen')];
        st.on = st.lights.some(Boolean);
        break;
      case 'magazine': {
        if (str(q, 'mode') === 'manual') {
          const trig = this.on(p, 'aus');
          if (trig && !st.lastTrigger) this.issue(p);
          st.lastTrigger = trig;
        } else if (this.time >= st.nextAt) {
          if (this.issue(p)) st.nextAt = this.time + num(q, 'intervalMs', 3000);
        }
        break;
      }
      case 'tank': {
        const cap = num(q, 'volume', 100);
        let flow = -num(q, 'drain');
        for (const k of this.parts) {
          if ((k.type !== 'pump' && k.type !== 'valve') || !this.st(k).on) continue;
          if (this.tankOf(k) !== p) continue;
          const f = num(k.params, 'flow', 2);
          flow += k.type === 'pump' ? f : -f;
        }
        st.volume = Math.max(0, Math.min(cap, st.volume + flow * DT));
        break;
      }
    }
  }

  /** Tank, den eine Pumpe füllt bzw. ein Ventil entleert (Parameter oder erster Tank) */
  tankOf(p: Part): Part | undefined {
    const ref = str(p.params, 'tank');
    const t = ref ? this.find(ref) : undefined;
    return t?.type === 'tank' ? t : this.parts.find((k) => k.type === 'tank');
  }

  /** Füllstand eines Tanks in % */
  levelOf(tank: Part): number {
    return (this.st(tank).volume / num(tank.params, 'volume', 100)) * 100;
  }

  remaining(p: Part): number {
    const list = p.params.list;
    if (!p.params.random && Array.isArray(list) && list.length)
      return list.length - this.st(p).issued;
    return num(p.params, 'capacity', 20) - this.st(p).issued;
  }

  /** ein Werkstück aus dem Magazin ausschieben, wenn vor der Öffnung Platz ist */
  private issue(p: Part): boolean {
    if (this.remaining(p) <= 0) return false;
    const st = this.st(p);
    const spec = this.nextSpec(p, st.issued);
    const s = SIZES[spec.size].w;
    const d = DIR[p.rot];
    const x = p.x + d.x * (40 + s / 2 + 1);
    const y = p.y + d.y * (40 + s / 2 + 1);
    const box = square(x, y, s);
    for (const w of this.workpieces) {
      if (w.state !== 'free') continue;
      if (overlaps(box, square(w.x, w.y, w.s)) && w.z < p.z + 60) return false;
    }
    st.issued++;
    this.spawned++;
    this.addWorkpiece(spec, x, y, p.z);
    return true;
  }

  private nextSpec(p: Part, i: number): WorkpieceSpec {
    const q = p.params;
    const list = Array.isArray(q.list) ? (q.list as WorkpieceSpec[]) : [];
    if (!q.random && list.length) return list[i % list.length]!;
    const r = this.rng.get(p.id)!;
    const pick = <T>(arr: unknown, all: T[]): T => {
      const a = (Array.isArray(arr) && arr.length ? arr : all) as T[];
      return a[Math.floor(r.next() * a.length)]!;
    };
    return {
      material: pick(q.materials, Object.keys(MATERIALS) as MaterialId[]),
      color: pick(q.colors, Object.keys(COLORS) as ColorId[]),
      size: pick(q.sizes, Object.keys(SIZES) as SizeId[]),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Flächen und Hindernisse
  // -------------------------------------------------------------------------------------------

  /** Auflageflächen; einmal gebaut, Geschwindigkeit und Höhe lesen den Zustand beim Aufruf */
  private surfaces(): Surface[] {
    return this.surfaceList;
  }

  private buildSurfaces(): Surface[] {
    const out: Surface[] = [];
    for (const p of this.parts) {
      const st = this.st(p);
      const q = p.params;
      const size = CATALOG[p.type].size(q);
      const rect = rectOf(p, size.l, size.w);
      const d = DIR[p.rot];
      switch (p.type) {
        case 'belt':
        case 'rollers': {
          const fixed = num(q, 'speed', 60);
          const v = { x: d.x * fixed, y: d.y * fixed };
          const belt = p.type === 'belt';
          out.push({
            part: p,
            rect,
            top: (x, y) => (inside(rect, x, y) ? p.z : undefined),
            vel: () => {
              if (!belt) return v;
              v.x = d.x * st.speed;
              v.y = d.y * st.speed;
              return v;
            },
          });
          break;
        }
        case 'lift': {
          const stroke = num(q, 'stroke', 80);
          out.push({
            part: p,
            rect,
            top: (x, y) => (inside(rect, x, y) ? p.z + st.pos * stroke : undefined),
            vel: () => ZERO,
          });
          break;
        }
        case 'chute': {
          const len = size.l;
          const drop = num(q, 'drop', 100);
          const sp = num(q, 'speed', 220);
          const v = { x: d.x * sp, y: d.y * sp };
          out.push({
            part: p,
            rect,
            top: (x, y) => {
              if (!inside(rect, x, y)) return undefined;
              const u = toLocal(p, x, y).u;
              return p.z + drop * (0.5 - u / len);
            },
            vel: () => v,
          });
          break;
        }
        case 'turntable': {
          const r = num(q, 'diameter', 140) / 2;
          const rate = (Math.PI / 2 / num(q, 'turnMs', 1000)) * 1000;
          out.push({
            part: p,
            rect,
            top: (x, y) => ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r ? p.z : undefined),
            vel: (x, y) => {
              const turning = st.angle > 0 && st.angle < 90 && p.fault !== 'klemmt';
              const omega = turning ? (st.on ? 1 : -1) * rate : 0;
              return { x: -omega * (y - p.y), y: omega * (x - p.x) };
            },
          });
          break;
        }
        case 'curve': {
          const R = num(q, 'radius', 200);
          const W = num(q, 'width', 80);
          const rc = R - W / 2;
          // Bogenmitte an der hinteren rechten Ecke; Einlauf in Richtung, Auslauf nach rechts
          const c = { u: -R / 2, v: -R / 2 };
          const lft = LEFT[p.rot];
          out.push({
            part: p,
            rect,
            top: (x, y) => {
              const l = toLocal(p, x, y);
              const du = l.u - c.u;
              const dv = l.v - c.v;
              const r = Math.hypot(du, dv);
              return du >= 0 && dv >= 0 && r >= R - W && r <= R ? p.z : undefined;
            },
            vel: (x, y) => {
              const sp = st.speed;
              if (!sp) return ZERO;
              const l = toLocal(p, x, y);
              const du = l.u - c.u;
              const dv = l.v - c.v;
              const r = Math.hypot(du, dv) || 1;
              // tangential im Uhrzeigersinn, dazu eine Rückführung auf die Mittellinie
              const k = (rc - r) * 4;
              const tu = (dv / r) * sp + (du / r) * k;
              const tv = (-du / r) * sp + (dv / r) * k;
              return { x: tu * d.x + tv * lft.x, y: tu * d.y + tv * lft.y };
            },
          });
          break;
        }
        case 'loadcell':
          out.push({
            part: p,
            rect,
            top: (x, y) => (inside(rect, x, y) ? p.z : undefined),
            vel: () => ZERO,
          });
          break;
      }
    }
    return out;
  }

  /** feste Körper, an denen Werkstücke anstoßen */
  private solids(): Solid[] {
    const out = this.staticSolids.slice();
    for (const p of this.parts) {
      const size = CATALOG[p.type].size(p.params);
      if (p.type === 'stopper' && this.st(p).on)
        out.push({ part: p, rect: rectOf(p, size.l, size.w), z0: p.z, z1: p.z + size.h });
      if (p.type === 'cylinder')
        out.push({ part: p, rect: this.pusher(p), z0: p.z, z1: p.z + size.h });
    }
    return out;
  }

  private buildStaticSolids(): Solid[] {
    const out: Solid[] = [];
    for (const p of this.parts) {
      const size = CATALOG[p.type].size(p.params);
      switch (p.type) {
        case 'magazine':
          out.push({ part: p, rect: rectOf(p, size.l, size.w), z0: p.z - 40, z1: p.z + size.h });
          break;
        case 'cylinder':
          out.push({ part: p, rect: rectOf(p, size.l, size.w), z0: p.z, z1: p.z + size.h });
          break;
        case 'bin': {
          // Wände des Behälters: Werkstücke fallen von oben hinein, schieben aber nicht seitlich durch
          // z ist die Oberkante (Rand) des Behälters
          const r = rectOf(p, size.l, size.w);
          const t = 4;
          const z0 = Math.max(0, p.z - size.h);
          const z1 = p.z;
          out.push({ part: p, rect: { ...r, x1: r.x0 + t }, z0, z1 });
          out.push({ part: p, rect: { ...r, x0: r.x1 - t }, z0, z1 });
          out.push({ part: p, rect: { ...r, y1: r.y0 + t }, z0, z1 });
          out.push({ part: p, rect: { ...r, y0: r.y1 - t }, z0, z1 });
          break;
        }
      }
    }
    return out;
  }

  /** Druckplatte eines Zylinders (vor dem Gehäuse, um den Hub verschoben) */
  pusher(p: Part): Rect {
    const st = this.st(p);
    const front = 30 + st.pos * num(p.params, 'stroke', 80);
    const d = DIR[p.rot];
    const cx = p.x + d.x * (front + 4);
    const cy = p.y + d.y * (front + 4);
    return rectOf({ x: cx, y: cy, rot: p.rot }, 8, 40);
  }

  /** Zylinder schiebt Werkstücke vor der Druckplatte in Hubrichtung weg */
  private push(p: Part): void {
    const plate = this.pusher(p);
    const d = DIR[p.rot];
    const z1 = p.z + 30;
    const pushed = new Set<number>();
    const shove = (box: Rect, depth: number) => {
      if (depth > 20) return;
      for (const w of this.workpieces) {
        if (w.state !== 'free' || pushed.has(w.id)) continue;
        if (w.z >= z1 || w.z + w.h <= p.z) continue;
        const wb = square(w.x, w.y, w.s);
        if (!overlaps(box, wb)) continue;
        // so weit verschieben, dass die Rückseite an der Vorderkante des Schiebenden liegt
        let delta = 0;
        if (d.x > 0) delta = box.x1 - wb.x0;
        else if (d.x < 0) delta = wb.x1 - box.x0;
        else if (d.y > 0) delta = box.y1 - wb.y0;
        else delta = wb.y1 - box.y0;
        if (delta <= 0) continue;
        w.x += d.x * delta;
        w.y += d.y * delta;
        w.grounded = false;
        pushed.add(w.id);
        shove(square(w.x, w.y, w.s), depth + 1);
      }
    };
    shove(plate, 0);
  }

  /** freie Werkstücke, deren Mitte in der Nähe des Rechtecks liegen kann (Raster des letzten Schritts) */
  near(r: Rect, out: Workpiece[]): Workpiece[] {
    out.length = 0;
    if (!this.time) {
      // vor dem ersten Schritt gibt es kein Raster
      for (const w of this.workpieces) if (w.state === 'free') out.push(w);
      return out;
    }
    let keys = this.cellsOf.get(r);
    if (!keys) {
      keys = [];
      const i0 = Math.floor((r.x0 - CELL) / CELL);
      const i1 = Math.floor((r.x1 + CELL) / CELL);
      const j0 = Math.floor((r.y0 - CELL) / CELL);
      const j1 = Math.floor((r.y1 + CELL) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) keys.push(cellKey(i, j));
      this.cellsOf.set(r, keys);
    }
    for (const k of keys) {
      const list = this.grid.get(k);
      if (list) for (const w of list) if (w.state === 'free') out.push(w);
    }
    return out;
  }

  /** höchste Auflagefläche an (x, y), 0 = Boden (zum Ablegen mit der Maus) */
  topAt(x: number, y: number): number {
    let top = 0;
    for (const s of this.surfaces()) {
      if (!inside(s.rect, x, y)) continue;
      const t = s.top(x, y);
      if (t !== undefined && t > top) top = t;
    }
    return top;
  }

  // -------------------------------------------------------------------------------------------
  // Werkstückbewegung
  // -------------------------------------------------------------------------------------------

  private support(w: Workpiece, x: number, y: number, surfaces: Surface[]): Surface | undefined {
    let best: Surface | undefined;
    let bestTop = -Infinity;
    for (const s of surfaces) {
      if (!inside(s.rect, x, y)) continue;
      const top = s.top(x, y);
      if (top === undefined || top > w.z + STEP_UP || top <= bestTop) continue;
      best = s;
      bestTop = top;
    }
    return best;
  }

  private move(w: Workpiece, surfaces: Surface[], solids: Solid[]): void {
    const sup = this.support(w, w.x, w.y, surfaces);
    const top = sup?.top(w.x, w.y) ?? 0;
    if (w.z <= top + SNAP && w.vz <= 0) {
      // liegt auf: übernimmt die Geschwindigkeit der Fläche
      w.z = top;
      w.vz = 0;
      w.grounded = true;
      const v = sup ? sup.vel(w.x, w.y) : ZERO;
      w.vx = v.x;
      w.vy = v.y;
      this.divert(w);
      if (!sup) {
        this.landOnFloor(w);
        return;
      }
    } else {
      // freier Fall, waagrechte Geschwindigkeit bleibt (leicht gebremst)
      w.grounded = false;
      w.vz -= G * DT;
      w.z = Math.max(top, w.z + w.vz * DT);
      w.vx *= 0.995;
      w.vy *= 0.995;
      if (w.z <= top) {
        w.vz = 0;
        if (!sup) {
          this.landOnFloor(w);
          return;
        }
      }
      const bin = this.binAt(w);
      if (bin && w.z + w.h < bin.z) {
        this.capture(w, bin);
        return;
      }
    }
    if (w.vx) {
      const nx = w.x + w.vx * DT;
      if (!this.blocked(w, nx, w.y, surfaces, solids)) w.x = nx;
      else w.vx = 0;
    }
    if (w.vy) {
      const ny = w.y + w.vy * DT;
      if (!this.blocked(w, w.x, ny, surfaces, solids)) w.y = ny;
      else w.vy = 0;
    }
  }

  /** aktive Weiche schiebt Werkstücke in ihrem Bereich seitlich weg */
  private divert(w: Workpiece): void {
    for (const { part: p, rect } of this.diverters) {
      if (!this.st(p).on || !inside(rect, w.x, w.y)) continue;
      if (w.z < p.z - 5 || w.z > p.z + 30) continue;
      const side = str(p.params, 'side', 'links') === 'links' ? 1 : -1;
      const l = LEFT[p.rot];
      const sp = num(p.params, 'speed', 250) * side;
      w.vx += l.x * sp;
      w.vy += l.y * sp;
    }
  }

  private binAt(w: Workpiece): Part | undefined {
    for (const b of this.bins) if (inside(b.rect, w.x, w.y)) return b.part;
    return undefined;
  }

  private landOnFloor(w: Workpiece): void {
    const bin = this.binAt(w);
    if (bin) this.capture(w, bin);
    else {
      w.state = 'lost';
      w.vx = w.vy = w.vz = 0;
    }
  }

  private capture(w: Workpiece, bin: Part): void {
    w.state = 'binned';
    w.bin = bin.id;
    w.vx = w.vy = w.vz = 0;
    const st = this.st(bin);
    st.total++;
    st.counts[w.spec.material] = (st.counts[w.spec.material] ?? 0) + 1;
    st.counts[w.spec.color] = (st.counts[w.spec.color] ?? 0) + 1;
    if (!binAccepts(str(bin.params, 'rule', 'alle'), w.spec)) st.missorted++;
  }

  private blocked(
    w: Workpiece,
    x: number,
    y: number,
    surfaces: Surface[],
    solids: Solid[],
  ): boolean {
    const z0 = w.z + 0.01;
    const z1 = w.z + w.h;
    // Stau: zuerst das Teil prüfen, an dem es zuletzt hing (gleiches Ergebnis, viel schneller)
    const last = this.lastBlocker.get(w);
    if (last && pieceBlocks(w, last, x, y, z0, z1)) return true;
    const box = square(x, y, w.s);
    // schon überlappende Körper (Kante beim Abkippen, frisch abgelegt) dürfen sich trennen
    const here = square(w.x, w.y, w.s);
    for (const s of solids) {
      if (s.z1 <= z0 || s.z0 >= z1) continue;
      if (overlaps(box, s.rect) && !overlaps(here, s.rect)) return true;
    }
    // höhere Fläche wirkt als Wand (Bandkante, Hubtisch oben)
    for (const s of surfaces) {
      if (!overlaps(box, s.rect)) continue;
      const top =
        s.top(x, y) ?? s.top(clamp(x, s.rect.x0, s.rect.x1), clamp(y, s.rect.y0, s.rect.y1));
      if (top === undefined || top <= w.z + STEP_UP) continue;
      const body =
        s.part.type === 'lift'
          ? top - this.st(s.part).pos * num(s.part.params, 'stroke', 80) - 40
          : top - 40;
      if (body < z1 && overlapsInterior(box, s) && !overlapsInterior(here, s)) return true;
    }
    // Nachbarn aus dem Raster (3 × 3 Zellen), ohne Hilfsobjekte
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        const list = this.grid.get(cellKey(i, j));
        if (!list) continue;
        for (const o of list) {
          if (pieceBlocks(w, o, x, y, z0, z1)) {
            this.lastBlocker.set(w, o);
            return true;
          }
        }
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------------------------
  // Auswertung
  // -------------------------------------------------------------------------------------------

  /** Anzahl der Werkstücke je Zustand */
  tally(): { free: number; binned: number; lost: number } {
    const t = { free: 0, binned: 0, lost: 0 };
    for (const w of this.workpieces) t[w.state]++;
    return t;
  }
}

/** Werkstück `o` versperrt `w` den Weg nach (x, y): überlappt dort, aber nicht schon jetzt */
function pieceBlocks(
  w: Workpiece,
  o: Workpiece,
  x: number,
  y: number,
  z0: number,
  z1: number,
): boolean {
  if (o === w || o.state !== 'free') return false;
  if (o.z >= z1 || o.z + o.h <= z0) return false;
  const r = (o.s + w.s) / 2;
  return (
    Math.abs(o.x - x) < r &&
    Math.abs(o.y - y) < r &&
    !(Math.abs(o.x - w.x) < r && Math.abs(o.y - w.y) < r)
  );
}

/** Zellgröße des Rasters (größer als jedes Werkstück) */
const CELL = 64;
const cellKey = (i: number, j: number) => i * 65_536 + j;

const square = (x: number, y: number, s: number): Rect => ({
  x0: x - s / 2,
  y0: y - s / 2,
  x1: x + s / 2,
  y1: y + s / 2,
});

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const approach = (v: number, target: number, rate: number) =>
  v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);

/** Teilfläche eines Rechtecks, die wirklich zur Fläche gehört (Drehtisch rund, Kurve als Bogen) */
function overlapsInterior(box: Rect, s: Surface): boolean {
  const pts: [number, number][] = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
    [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
  ];
  return pts.some(([x, y]) => s.top(x, y) !== undefined);
}

/** Soll-Regel eines Behälters: alle, metall, nichtmetall, mat:<werkstoff>, farbe:<farbe> */
export function binAccepts(rule: string, spec: WorkpieceSpec): boolean {
  if (rule === 'metall') return MATERIALS[spec.material].metal;
  if (rule === 'nichtmetall') return !MATERIALS[spec.material].metal;
  if (rule.startsWith('mat:')) return spec.material === rule.slice(4);
  if (rule.startsWith('farbe:')) return spec.color === rule.slice(6);
  return true;
}
