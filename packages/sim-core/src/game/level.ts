import { MODULE_TYPES, type ChannelKind } from './modules';
import type { Text } from './text';

/** Zeitpunkt und Wert: ab `t` (ms) gilt `v`. */
export type Edge = [t: number, v: boolean | number];

export type DeviceRole = 'button' | 'switch' | 'sensor' | 'motor' | 'lamp' | 'valve' | 'actuator';

export interface BounceSpec {
  /** Anzahl zusätzlicher Umschaltungen je Flanke (wird auf gerade Zahl gerundet) */
  minToggles: number;
  maxToggles: number;
  /** Abstand zwischen zwei Umschaltungen in ms */
  gapMs: [number, number];
}

/** Feldgerät am Rand des Schaltschranks (fest vom Level vorgegeben). */
export interface Device {
  id: string;
  /** vorgeschlagener Name in der PLC-Variablentabelle */
  tag: string;
  name: Text;
  /** Kanalart, an die das Gerät angeschlossen wird */
  kind: ChannelKind;
  side: 'left' | 'right';
  role: DeviceRole;
  /** Öffner: elektrisches Signal ist 1, solange nicht betätigt */
  nc?: boolean;
  bounce?: BounceSpec;
}

export interface TestCase {
  id: string;
  name: Text;
  durationMs: number;
  seeds: number[];
  /** Betätigung je Eingangsgerät (physikalisch: gedrückt/nicht gedrückt) */
  stimuli: Record<string, Edge[]>;
  /** Soll-Verlauf je Ausgangsgerät */
  expect: Record<string, Edge[]>;
}

export interface Level {
  id: string;
  order: number;
  title: Text;
  customer: Text;
  mail: { from: Text; subject: Text; body: Text };
  /** Datenblatt in einfachem Markdown */
  datasheet: Text;
  board: { width: number; ductCapacity: number };
  allowedModules: string[];
  devices: Device[];
  /** Anlagenvisualisierung */
  plant?: { type: string; params?: Record<string, unknown> };
  /** Zeitliche Toleranz um jede Soll-Flanke in ms */
  toleranceMs: number;
  tests: TestCase[];
}

export class LevelError extends Error {
  constructor(
    readonly levelId: string,
    readonly problems: string[],
  ) {
    super(`Level „${levelId}“ ist fehlerhaft:\n${problems.join('\n')}`);
  }
}

const isText = (x: unknown): x is Text =>
  typeof x === 'object' && x !== null && typeof (x as Text).de === 'string';

/** Prüft ein Level aus JSON und liefert es typisiert zurück. */
export function validateLevel(json: unknown): Level {
  const p: string[] = [];
  const l = json as Level;
  const id = typeof l?.id === 'string' ? l.id : '?';
  if (typeof l !== 'object' || l === null) throw new LevelError(id, ['kein Objekt']);
  if (typeof l.id !== 'string' || !l.id) p.push('id fehlt');
  if (typeof l.order !== 'number') p.push('order fehlt');
  for (const k of ['title', 'customer', 'datasheet'] as const)
    if (!isText(l[k])) p.push(`${k} fehlt`);
  if (!l.mail || !isText(l.mail.from) || !isText(l.mail.subject) || !isText(l.mail.body)) {
    p.push('mail unvollständig (from, subject, body)');
  }
  if (!l.board || !(l.board.width > 0) || !(l.board.ductCapacity > 0)) {
    p.push('board braucht width und ductCapacity > 0');
  }
  if (!Array.isArray(l.allowedModules) || !l.allowedModules.length) p.push('allowedModules fehlt');
  else for (const m of l.allowedModules) if (!MODULE_TYPES[m]) p.push(`unbekanntes Modul ${m}`);
  if (!(l.toleranceMs >= 0)) p.push('toleranceMs fehlt');

  const devices = new Map<string, Device>();
  if (!Array.isArray(l.devices)) p.push('devices fehlt');
  for (const d of l.devices ?? []) {
    if (devices.has(d.id)) p.push(`Gerät ${d.id} doppelt`);
    devices.set(d.id, d);
    if (!isText(d.name)) p.push(`Gerät ${d.id}: name fehlt`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(d.tag ?? '')) p.push(`Gerät ${d.id}: tag ungültig`);
    if (!['DI', 'DO', 'AI', 'AO'].includes(d.kind)) p.push(`Gerät ${d.id}: kind ungültig`);
    if (d.side !== 'left' && d.side !== 'right') p.push(`Gerät ${d.id}: side ungültig`);
    if (
      d.bounce &&
      (d.bounce.minToggles > d.bounce.maxToggles || d.bounce.gapMs[0] > d.bounce.gapMs[1])
    ) {
      p.push(`Gerät ${d.id}: bounce ungültig`);
    }
  }

  const checkEdges = (where: string, edges: Edge[], duration: number) => {
    let last = -1;
    for (const [t] of edges) {
      if (!(t >= 0) || t <= last) p.push(`${where}: Zeitpunkte müssen aufsteigend und ≥ 0 sein`);
      if (t >= duration) p.push(`${where}: Zeitpunkt ${t} liegt hinter dem Testende`);
      last = t;
    }
  };
  if (!Array.isArray(l.tests) || !l.tests.length) p.push('tests fehlt');
  for (const tc of l.tests ?? []) {
    if (!(tc.durationMs > 0)) p.push(`Test ${tc.id}: durationMs fehlt`);
    if (!Array.isArray(tc.seeds) || !tc.seeds.length) p.push(`Test ${tc.id}: seeds fehlt`);
    for (const [dev, edges] of Object.entries(tc.stimuli ?? {})) {
      const d = devices.get(dev);
      if (!d || (d.kind !== 'DI' && d.kind !== 'AI'))
        p.push(`Test ${tc.id}: Stimulus für ${dev} ist kein Eingangsgerät`);
      checkEdges(`Test ${tc.id} / ${dev}`, edges, tc.durationMs);
    }
    for (const [dev, edges] of Object.entries(tc.expect ?? {})) {
      const d = devices.get(dev);
      if (!d || (d.kind !== 'DO' && d.kind !== 'AO'))
        p.push(`Test ${tc.id}: Soll für ${dev} ist kein Ausgangsgerät`);
      checkEdges(`Test ${tc.id} / ${dev}`, edges, tc.durationMs);
    }
  }
  if (p.length) throw new LevelError(id, p);
  return l;
}
