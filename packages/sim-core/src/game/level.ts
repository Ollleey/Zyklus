import { MODULE_TYPES, type AnalogRange, type ChannelKind } from './modules';
import type { Text } from './text';

/** Die drei Bewertungsgrößen einer Lösung. */
export interface Metrics {
  cost: number;
  /** gewichtete Operationen, gemittelt über alle Testläufe */
  energy: number;
  /** SCL-Anweisungen bzw. FUP-Boxen */
  size: number;
}

export type MetricKey = keyof Metrics;

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

/** Analoger Messbereich: physikalisch min…max ↔ Rohwert 0…27648 (S7-Normbereich). */
export interface AnalogSpec {
  unit: string;
  min: number;
  max: number;
  /** Rauschen: Standardabweichung in Digits */
  noise?: number;
  /** Ausreißer: mittlere Anzahl je Sekunde und Höhe in Digits */
  spikes?: { perSecond: number; amplitude: number };
}

/** Feldgerät am Rand des Schaltschranks (fest vom Level vorgegeben). */
export interface Device {
  id: string;
  /** kurze Anzeige im Schrank und Zeitdiagramm (Sandkasten: Kennzeichnung); sonst die id */
  label?: string;
  /** vorgeschlagener Name in der PLC-Variablentabelle */
  tag: string;
  name: Text;
  /** Kanalart, an die das Gerät angeschlossen wird */
  kind: ChannelKind;
  side: 'left' | 'right';
  role: DeviceRole;
  /** Öffner: elektrisches Signal ist 1, solange nicht betätigt */
  nc?: boolean;
  /** Prellen bzw. Flattern bei jeder Flanke */
  bounce?: BounceSpec;
  /** Analoggeräte (AI/AO) */
  analog?: AnalogSpec;
  /** Leistungsverbraucher (Schütz, Motor): braucht einen Relaisausgang */
  power?: boolean;
  /** Analoggeräte: elektrische Signalart; ohne Angabe passt jeder Messbereich */
  signal?: AnalogRange;
}

/** Geberfehler an einem Analogeingang: Drahtbruch/Überlauf = 32767, Unterlauf = −32768 */
export type FaultKind = 'break' | 'overflow' | 'underflow';

/**
 * Prüfkriterium für Aufgaben, bei denen kein fester Soll-Verlauf vorgegeben werden kann.
 * `signal` ist eine Geräte-id, `plant.<größe>` (Anlagenzustand) oder `true.<id>` (Messwert ohne Störung).
 */
export type Check =
  | { kind: 'always'; name: Text; signal: string; value: boolean; from: number; to: number }
  | {
      kind: 'range';
      name: Text;
      signal: string;
      min: number;
      max: number;
      from: number;
      to: number;
    }
  | { kind: 'exclusive'; name: Text; signals: string[]; from?: number; to?: number }
  | { kind: 'maxChanges'; name: Text; signal: string; max: number; from?: number; to?: number }
  /**
   * Tastverhältnis eines Pulsausgangs: in jedem Fenster der Länge `periodMs` muss der Ausgang
   * `duty` % der Zeit eingeschaltet sein (± `tolerance` Prozentpunkte). Fenster, in denen sich
   * der Sollwert gerade geändert hat, werden übersprungen (Einschwingen).
   */
  | {
      kind: 'duty';
      name: Text;
      signal: string;
      periodMs: number;
      duty: Edge[];
      tolerance: number;
      from: number;
      to?: number;
    }
  | {
      kind: 'track';
      name: Text;
      signal: string;
      reference: string;
      tolerance: number;
      from: number;
      to?: number;
    };

export interface TestCase {
  id: string;
  name: Text;
  durationMs: number;
  seeds: number[];
  /**
   * Betätigung je Eingangsgerät: bei DI gedrückt/nicht gedrückt (stufig),
   * bei AI physikalische Werte, zwischen den Punkten linear interpoliert.
   */
  stimuli: Record<string, Edge[]>;
  /** Soll-Verlauf je Ausgangsgerät */
  expect?: Record<string, Edge[]>;
  /** Geberfehler je Analogeingang: [von, bis, Art] */
  faults?: Record<string, [number, number, FaultKind][]>;
  /** Parameter des Anlagenmodells für diesen Test (überschreibt Level-Parameter) */
  plant?: Record<string, unknown>;
  checks?: Check[];
  /** Spannungsausfälle der Steuerung: [aus ab, wieder ein ab] in ms */
  power?: [number, number][];
}

export interface Level {
  id: string;
  order: number;
  title: Text;
  customer: Text;
  mail: { from: Text; subject: Text; body: Text };
  /** Datenblatt in einfachem Markdown */
  datasheet: Text;
  /** `wall`: Spalte mit Trennwand – Leitungen können sie nicht kreuzen, je Seite eine CPU */
  board: { width: number; ductCapacity: number; wall?: number };
  allowedModules: string[];
  devices: Device[];
  /** Anlagenvisualisierung */
  plant?: { type: string; params?: Record<string, unknown> };
  /** Zeitliche Toleranz um jede Soll-Flanke in ms */
  toleranceMs: number;
  /** Richtwerte (Metriken der Referenzlösung) – Mittelpunkt der Vergleichsverteilungen */
  par?: Metrics;
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
    if ((d.kind === 'AI' || d.kind === 'AO') && (!d.analog || !(d.analog.max > d.analog.min))) {
      p.push(`Gerät ${d.id}: analog (min < max) fehlt`);
    }
    if (d.signal !== undefined && d.signal !== '0-10V' && d.signal !== '4-20mA') {
      p.push(`Gerät ${d.id}: signal muss 0-10V oder 4-20mA sein`);
    }
  }
  const knownSignal = (s: string) =>
    devices.has(s) || s.startsWith('plant.') || (s.startsWith('true.') && devices.has(s.slice(5)));

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
    let lastOn = -1;
    for (const iv of tc.power ?? []) {
      if (!Array.isArray(iv) || !(iv[0] > lastOn) || !(iv[1] > iv[0]) || iv[1] > tc.durationMs) {
        p.push(`Test ${tc.id}: power braucht aufsteigende Abschnitte [aus, ein] im Testzeitraum`);
        break;
      }
      lastOn = iv[1];
    }
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
    for (const dev of Object.keys(tc.faults ?? {})) {
      if (devices.get(dev)?.kind !== 'AI')
        p.push(`Test ${tc.id}: Fehler für ${dev} ist kein Analogeingang`);
    }
    for (const c of tc.checks ?? []) {
      if (!isText(c.name)) p.push(`Test ${tc.id}: Kriterium ohne Namen`);
      const signals =
        c.kind === 'exclusive'
          ? c.signals
          : c.kind === 'track'
            ? [c.signal, c.reference]
            : [c.signal];
      for (const s of signals)
        if (!knownSignal(s)) p.push(`Test ${tc.id}: unbekanntes Signal ${s}`);
      if (c.kind === 'duty' && !(c.periodMs > 0 && c.duty?.length)) {
        p.push(`Test ${tc.id}: Kriterium ${c.name.de} braucht periodMs und duty`);
      }
    }
    if (!tc.expect && !tc.checks) p.push(`Test ${tc.id}: weder expect noch checks`);
  }
  if (p.length) throw new LevelError(id, p);
  return l;
}
