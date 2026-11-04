import {
  MODULE_TYPES,
  tr,
  validateLevel,
  type Check,
  type Level,
  type TestCase,
} from '@zyklus/sim-core';
import { connectionsOf, identifier } from './devices';
import type { Layout } from './model';
import { eventText, powerOf, type Scenario, type ScenarioEvent } from './scenario';

/**
 * Anlage als Auftrag veröffentlichen: Testfälle mit Bedienfolge und Prüfregeln werden zu einem
 * gewöhnlichen Level. Die Bedienfolge stellt die Anlage selbst ein (Taster und Schalter gehören
 * zur Anlage), die Regeln werden zu Prüfkriterien auf Ausgängen und Anlagenwerten.
 */

/** Betätigung eines Bedienelements: ab `t` ms hat es den Wert (Wahlschalter 0/1/2, Poti 0…100) */
export type ControlStep = [t: number, ref: string, value: number | boolean];

export type Rule =
  /** keine Fehlsortierung nach den Soll-Regeln der Behälter */
  | { kind: 'sorted' }
  /** kein Werkstück fällt auf den Boden */
  | { kind: 'noLoss' }
  /** am Ende mindestens `n` Teile im Behälter */
  | { kind: 'minIn'; bin: string; n: number }
  /** Füllstand ab `fromMs` zwischen `min` und `max` % */
  | { kind: 'tankRange'; tank: string; min: number; max: number; fromMs: number }
  /** zwei Ausgänge nie gleichzeitig an (Kennzeichnung bzw. Kennzeichnung.Anschluss) */
  | { kind: 'exclusive'; a: string; b: string }
  /** Ausgang bleibt immer aus (z. B. Hupe) */
  | { kind: 'neverOn'; output: string }
  /** Ausgang ist ab `fromMs` bis zum Ende aus (z. B. Band nach Not-Halt) */
  | { kind: 'offFrom'; output: string; fromMs: number }
  /** Ausgang ist von `fromMs` bis `toMs` durchgehend an (z. B. Störlampe) */
  | { kind: 'onBetween'; output: string; fromMs: number; toMs: number };

export interface PublishTest {
  name: string;
  durationMs: number;
  seeds: number[];
  /** Bedienfolge (ältere Aufträge); neue Testfälle haben alles in `events` */
  controls?: ControlStep[];
  /** Zeitleiste wie im Szenario */
  events?: ScenarioEvent[];
  rules: Rule[];
}

export interface PublishMeta {
  title: string;
  customer: string;
  /** Auftragstext (Markdown) */
  mail: string;
  /** zusätzlicher Text vor der Gerätetabelle im Datenblatt */
  notes: string;
}

export function ruleText(r: Rule): string {
  switch (r.kind) {
    case 'sorted':
      return 'Kein Teil landet im falschen Behälter';
    case 'noLoss':
      return 'Kein Teil fällt auf den Boden';
    case 'minIn':
      return `Am Ende mindestens ${r.n} Teile in ${r.bin}`;
    case 'tankRange':
      return `Füllstand ${r.tank} ab ${r.fromMs / 1000} s zwischen ${r.min} und ${r.max} %`;
    case 'exclusive':
      return `${r.a} und ${r.b} nie gleichzeitig`;
    case 'neverOn':
      return `${r.output} bleibt aus`;
    case 'offFrom':
      return `${r.output} ab ${r.fromMs / 1000} s aus`;
    case 'onBetween':
      return `${r.output} von ${r.fromMs / 1000} bis ${r.toMs / 1000} s an`;
  }
}

/** Regeltext auf Englisch (Datenblatt, Oberfläche) */
export function ruleTextEn(r: Rule): string {
  switch (r.kind) {
    case 'sorted':
      return 'No part ends up in the wrong bin';
    case 'noLoss':
      return 'No part falls on the floor';
    case 'minIn':
      return `At least ${r.n} parts in ${r.bin} at the end`;
    case 'tankRange':
      return `Level ${r.tank} between ${r.min} and ${r.max} % from ${r.fromMs / 1000} s`;
    case 'exclusive':
      return `${r.a} and ${r.b} never at the same time`;
    case 'neverOn':
      return `${r.output} stays off`;
    case 'offFrom':
      return `${r.output} off from ${r.fromMs / 1000} s`;
    case 'onBetween':
      return `${r.output} on from ${r.fromMs / 1000} to ${r.toMs / 1000} s`;
  }
}

/** Geräte-id eines Ausgangs aus der Anzeige (`1A1.aus`, `M1`) */
function deviceByLabel(layout: Layout, label: string): string {
  const c = connectionsOf(layout).find((x) => x.device.label === label);
  if (!c) throw new Error(`Unbekannter Anschluss „${label}“`);
  return c.device.id;
}

function checkOf(layout: Layout, r: Rule, end: number): Check {
  const name = { de: ruleText(r), en: ruleTextEn(r) };
  switch (r.kind) {
    case 'sorted':
      return { kind: 'range', name, signal: 'plant.missorted', min: 0, max: 0, from: 0, to: end };
    case 'noLoss':
      return { kind: 'range', name, signal: 'plant.lost', min: 0, max: 0, from: 0, to: end };
    case 'minIn':
      return {
        kind: 'range',
        name,
        signal: `plant.${identifier(r.bin)}`,
        min: r.n,
        max: 1e9,
        from: end - 1,
        to: end,
      };
    case 'tankRange':
      return {
        kind: 'range',
        name,
        signal: `plant.${identifier(r.tank)}`,
        min: r.min,
        max: r.max,
        from: r.fromMs,
        to: end,
      };
    case 'exclusive':
      return {
        kind: 'exclusive',
        name,
        signals: [deviceByLabel(layout, r.a), deviceByLabel(layout, r.b)],
      };
    case 'neverOn':
      return {
        kind: 'always',
        name,
        signal: deviceByLabel(layout, r.output),
        value: false,
        from: 0,
        to: end,
      };
    case 'offFrom':
      return {
        kind: 'always',
        name,
        signal: deviceByLabel(layout, r.output),
        value: false,
        from: Math.min(r.fromMs, end - 1),
        to: end,
      };
    case 'onBetween':
      return {
        kind: 'always',
        name,
        signal: deviceByLabel(layout, r.output),
        value: true,
        from: Math.min(r.fromMs, end - 1),
        to: Math.min(Math.max(r.toMs, r.fromMs + 1), end),
      };
  }
}

/** Prüfkriterien eines Testfalls; `lenient`: Regeln auf fehlende Geräte überspringen */
function checksOf(
  layout: Layout,
  test: Pick<PublishTest, 'durationMs' | 'rules'>,
  lenient = false,
): Check[] {
  const out: Check[] = [];
  for (const r of test.rules) {
    try {
      out.push(checkOf(layout, r, test.durationMs));
    } catch (e) {
      if (!lenient) throw e;
    }
  }
  return out;
}

/** Testfall eines Levels aus einem Szenario bzw. einem Testfall des Veröffentlichens */
export function testOfScenario(
  layout: Layout,
  s: PublishTest & { id?: string },
  id: string,
  lenient = false,
): TestCase {
  const events = (s.events ?? []).filter((e) => e.kind !== 'power');
  const power = powerOf(s.events ?? []);
  return {
    id,
    name: { de: s.name },
    durationMs: s.durationMs,
    seeds: s.seeds.length ? s.seeds : [layout.seed],
    stimuli: {},
    plant: { controls: s.controls ?? [], ...(events.length ? { events } : {}) },
    ...(power.length ? { power } : {}),
    checks: checksOf(layout, s, lenient),
  };
}

/** Testfälle der Szenarien einer Anlage (Sandkasten); unbrauchbare Regeln entfallen */
export function scenarioTests(layout: Layout): TestCase[] {
  return (layout.scenarios ?? [])
    .filter((s) => s.durationMs > 0)
    .map((s: Scenario) => testOfScenario(layout, s, `sz-${s.id}`, true));
}

const slug = (s: string) =>
  identifier(s).toLowerCase().replace(/_+/g, '-').slice(0, 40) || 'auftrag';

/** Datenblatt: Notizen, Geräte mit Kennzeichnung und Signal, Prüfregeln je Testfall */
function datasheet(layout: Layout, meta: PublishMeta, tests: PublishTest[]): string {
  const rows = connectionsOf(layout).map(
    (c) =>
      `| ${c.device.label} | ${c.device.kind} | ${tr(c.device.name)}${c.device.nc ? ' – **Öffner**' : ''} |`,
  );
  const checks = tests.map((t) => {
    const ev = (t.events ?? []).map((e) => `- ${eventText(e)}`);
    return [
      `**${t.name}** (${t.durationMs / 1000} s)`,
      ...(ev.length ? [`Ablauf:\n\n${ev.join('\n')}`] : []),
      `Prüfung:\n\n${t.rules.map((r) => `- ${ruleText(r)}`).join('\n')}`,
    ].join('\n\n');
  });
  return [
    meta.notes.trim(),
    '# Geräte',
    '| Gerät | Art | Beschreibung |\n|---|---|---|\n' + rows.join('\n'),
    '# Prüfung',
    ...checks,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Level aus Anlage, Angaben und Testfällen; wirft bei unbrauchbaren Angaben */
export function publishLevel(layout: Layout, meta: PublishMeta, tests: PublishTest[]): Level {
  if (!tests.length) throw new Error('Es fehlt ein Testfall.');
  for (const t of tests) {
    if (!t.rules.length) throw new Error(`Testfall „${t.name}“ hat keine Prüfregel.`);
    if (!(t.durationMs > 0)) throw new Error(`Testfall „${t.name}“ braucht eine Dauer.`);
  }
  const level = {
    id: `eigen-${slug(meta.title)}`,
    order: 0,
    title: { de: meta.title || 'Eigener Auftrag' },
    customer: { de: meta.customer || 'Eigene Anlage' },
    mail: {
      from: { de: meta.customer || 'Eigene Anlage' },
      subject: { de: meta.title || 'Eigener Auftrag' },
      body: { de: meta.mail },
    },
    datasheet: { de: datasheet(layout, meta, tests) },
    board: { width: 48, ductCapacity: 16 },
    allowedModules: Object.keys(MODULE_TYPES),
    devices: connectionsOf(layout).map((c) => c.device),
    plant: { type: 'sandbox', params: { layout } },
    toleranceMs: 0,
    tests: tests.map((t, i) => testOfScenario(layout, t, `t${i + 1}`)),
  };
  return validateLevel(level);
}
