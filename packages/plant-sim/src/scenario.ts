import { deriveSeed, Rng } from '@zyklus/sim-core';
import type { WorkpieceSpec } from './materials';
import type { ControlStep, Rule } from './publish';

/**
 * Szenario im Sandkasten: ein Prüflauf mit Zeitleiste. Ereignisse betätigen Bedienelemente,
 * schalten Störungen ein und aus, lassen Strom ausfallen, legen Teile ein oder verändern
 * Füllstände. Regeln bewerten den Lauf wie beim Veröffentlichen.
 *
 * `at` in ms ab Start; `jitter` verschiebt das Ereignis zufällig um 0…jitter ms (je Seed
 * reproduzierbar). Ereignisse bei 0 ms legen den Startzustand fest.
 */
export type ScenarioEvent = (
  | /** Bedienelement betätigen (Taster, Schalter, Not-Halt, Wahlschalter 0/1/2, Poti 0…100) */
    { kind: 'control'; ref: string; value: number | boolean }
    /** Störung an einem Bauteil einschalten (`fault` wie im Inspektor), optional bis `until` */
  | { kind: 'fault'; ref: string; fault: string; until?: number }
  /** Spannungsausfall der Steuerung bis `until` (kein Zufallsversatz) */
  | { kind: 'power'; until: number }
  /** Werkstück über einem Bauteil fallen lassen (z. B. auf ein Band) */
  | { kind: 'workpiece'; ref: string; spec: WorkpieceSpec }
  /** Magazin gibt ein Teil aus */
  | { kind: 'magazine'; ref: string }
  /** Füllstand eines Tanks setzen (Leck, Nachfüllen) in % */
  | { kind: 'tank'; ref: string; level: number }
) & { at: number; jitter?: number };

export type ScenarioEventKind = ScenarioEvent['kind'];

export const EVENT_KINDS: ScenarioEventKind[] = [
  'control',
  'fault',
  'power',
  'workpiece',
  'magazine',
  'tank',
];

export interface Scenario {
  id: string;
  name: string;
  durationMs: number;
  seeds: number[];
  events: ScenarioEvent[];
  rules: Rule[];
}

/** Ereignis, wie es das Anlagenmodell ausführt: Zeit fest, Störungsende als eigenes Ereignis */
export type PlantEvent =
  | { at: number; kind: 'control'; ref: string; value: number | boolean }
  | { at: number; kind: 'fault'; ref: string; fault: string }
  | { at: number; kind: 'workpiece'; ref: string; spec: WorkpieceSpec }
  | { at: number; kind: 'magazine'; ref: string }
  | { at: number; kind: 'tank'; ref: string; level: number };

/**
 * Zeitpunkte für einen Seed festlegen und nach Zeit sortieren. Ein Störungsende bleibt um
 * denselben Versatz verschoben wie der Beginn. Spannungsausfälle gehen an die Steuerung.
 */
export function resolveEvents(events: ScenarioEvent[], seed: number): PlantEvent[] {
  const rng = new Rng(deriveSeed(seed, 'szenario'));
  const out: PlantEvent[] = [];
  for (const e of events) {
    // für jedes Ereignis genau eine Zufallszahl, damit Änderungen an einem die anderen nicht verschieben
    const r = rng.next();
    const shift = e.jitter && e.jitter > 0 ? Math.floor(r * (Math.round(e.jitter) + 1)) : 0;
    const at = Math.max(0, Math.round(e.at + shift));
    switch (e.kind) {
      case 'power':
        break;
      case 'fault':
        out.push({ at, kind: 'fault', ref: e.ref, fault: e.fault });
        if (e.until !== undefined && e.until > e.at)
          out.push({ at: Math.round(e.until + shift), kind: 'fault', ref: e.ref, fault: '' });
        break;
      case 'control':
        out.push({ at, kind: 'control', ref: e.ref, value: e.value });
        break;
      case 'workpiece':
        out.push({ at, kind: 'workpiece', ref: e.ref, spec: e.spec });
        break;
      case 'magazine':
        out.push({ at, kind: 'magazine', ref: e.ref });
        break;
      case 'tank':
        out.push({ at, kind: 'tank', ref: e.ref, level: e.level });
        break;
    }
  }
  // stabil sortieren: gleiche Zeit in der Reihenfolge der Zeitleiste
  return out
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].at - b[0].at || a[1] - b[1])
    .map(([e]) => e);
}

/** Spannungsausfälle für den Prüflauf (feste Zeiten) */
export function powerOf(events: ScenarioEvent[]): [number, number][] {
  return events
    .filter((e): e is Extract<ScenarioEvent, { kind: 'power' }> => e.kind === 'power')
    .filter((e) => e.until > e.at)
    .map((e) => [Math.round(e.at), Math.round(e.until)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/** Bedienfolge aus älteren veröffentlichten Aufträgen als Ereignisse */
export function eventsFromControls(controls: ControlStep[]): ScenarioEvent[] {
  return controls.map(([at, ref, value]) => ({ kind: 'control', at, ref, value }));
}

/** Szenarien, die auf ein Bauteil verweisen, das es nicht mehr gibt */
export function missingRefs(s: Scenario, tags: Set<string>): string[] {
  const out = new Set<string>();
  for (const e of s.events) if ('ref' in e && !tags.has(e.ref)) out.add(e.ref);
  return [...out];
}

/** Text eines Ereignisses für Zeitleiste und Datenblatt */
export function eventText(e: ScenarioEvent, en = false): string {
  const at = `${(e.at / 1000).toLocaleString(en ? 'en' : 'de')} s`;
  const j = e.jitter ? ` (+0…${e.jitter / 1000} s)` : '';
  const L = (de: string, english: string) => (en ? english : de);
  switch (e.kind) {
    case 'control':
      return `${at}${j}: ${e.ref} = ${typeof e.value === 'boolean' ? (e.value ? L('betätigt', 'pressed') : L('losgelassen', 'released')) : e.value}`;
    case 'fault':
      return `${at}${j}: ${L('Störung', 'Fault')} ${e.ref} – ${e.fault}${e.until !== undefined ? ` ${L('bis', 'until')} ${e.until / 1000} s` : ''}`;
    case 'power':
      return `${at}: ${L('Stromausfall bis', 'Power failure until')} ${e.until / 1000} s`;
    case 'workpiece':
      return `${at}${j}: ${L('Teil auf', 'Part onto')} ${e.ref} (${e.spec.material}, ${e.spec.color}, ${e.spec.size})`;
    case 'magazine':
      return `${at}${j}: ${L('Magazin', 'Magazine')} ${e.ref} ${L('gibt aus', 'issues')}`;
    case 'tank':
      return `${at}${j}: ${L('Füllstand', 'Level')} ${e.ref} = ${e.level} %`;
  }
}

let counter = 0;
/** neue Szenario-id */
export function newScenarioId(): string {
  counter = (counter + 1) % 1e6;
  return `sz${Date.now().toString(36)}${counter.toString(36)}`;
}

/** leeres Szenario mit sinnvollen Vorgaben */
export function newScenario(name: string, seed: number): Scenario {
  return { id: newScenarioId(), name, durationMs: 60000, seeds: [seed], events: [], rules: [] };
}
