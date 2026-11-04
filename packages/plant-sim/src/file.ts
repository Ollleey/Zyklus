import { upgradeSolution, type Solution } from '@zyklus/sim-core';
import { z } from 'zod';
import { CATALOG, boundsOf } from './catalog';
import { COLORS, MATERIALS, SIZES } from './materials';
import type { Layout, Part, PartType } from './model';
import type { Scenario } from './scenario';
import { levelFromLayout } from './plant';

/**
 * Austauschformat `*.anlage.json`: Anlage, Schaltschrank mit allen CPU-Programmen,
 * Simulationseinstellungen und Angaben zur Datei. Beim Einlesen prüft zod den Aufbau; unbekannte
 * Felder fallen weg, ältere Versionen werden angehoben.
 */

export const ANLAGE_FORMAT = 'zyklus-anlage';
export const ANLAGE_VERSION = 1;

export interface AnlageMeta {
  name: string;
  description: string;
  author: string;
  /** ISO-Zeitpunkte */
  created: string;
  modified: string;
}

export interface SimSettings {
  speed: number;
  /** Spuren im Zeitdiagramm; `null` = Standardauswahl */
  signals: string[] | null;
}

export interface AnlageFile extends AnlageMeta {
  format: typeof ANLAGE_FORMAT;
  formatVersion: typeof ANLAGE_VERSION;
  layout: Layout;
  solution: Solution;
  sim: SimSettings;
}

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];

const PartSchema = z.object({
  id: z.string().min(1),
  type: z.enum(keys(CATALOG)),
  tag: z.string().min(1),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  params: z.record(z.string(), z.unknown()).default({}),
  fault: z.string().optional(),
});

const SpecSchema = z.object({
  material: z.enum(keys(MATERIALS)),
  color: z.enum(keys(COLORS)),
  size: z.enum(keys(SIZES)),
});

const t = z.number().min(0);
const EventSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('control'),
      ref: z.string(),
      value: z.union([z.number(), z.boolean()]),
    }),
    z.object({ kind: z.literal('fault'), ref: z.string(), fault: z.string(), until: t.optional() }),
    z.object({ kind: z.literal('power'), until: t }),
    z.object({ kind: z.literal('workpiece'), ref: z.string(), spec: SpecSchema }),
    z.object({ kind: z.literal('magazine'), ref: z.string() }),
    z.object({ kind: z.literal('tank'), ref: z.string(), level: z.number().min(0).max(100) }),
  ])
  .and(z.object({ at: t, jitter: t.optional() }));

const RuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sorted') }),
  z.object({ kind: z.literal('noLoss') }),
  z.object({ kind: z.literal('minIn'), bin: z.string(), n: z.number().int().min(1) }),
  z.object({
    kind: z.literal('tankRange'),
    tank: z.string(),
    min: z.number(),
    max: z.number(),
    fromMs: t,
  }),
  z.object({ kind: z.literal('exclusive'), a: z.string(), b: z.string() }),
  z.object({ kind: z.literal('neverOn'), output: z.string() }),
  z.object({ kind: z.literal('offFrom'), output: z.string(), fromMs: t }),
  z.object({ kind: z.literal('onBetween'), output: z.string(), fromMs: t, toMs: t }),
]);

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().default('Szenario'),
  durationMs: z.number().positive().max(600_000),
  seeds: z.array(z.number().int().min(1)).default([]),
  events: z.array(EventSchema).default([]),
  rules: z.array(RuleSchema).default([]),
});

const LayoutSchema = z.object({
  formatVersion: z.literal(1).default(1),
  parts: z.array(PartSchema),
  workpieces: z
    .array(SpecSchema.extend({ x: z.number(), y: z.number(), z: z.number() }))
    .optional(),
  seed: z.number().int().min(1).default(1),
  area: z
    .object({ w: z.number().positive(), h: z.number().positive() })
    .default({ w: 2000, h: 1200 }),
  scenarios: z.array(ScenarioSchema).optional(),
});

const SolutionSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  modules: z.array(z.object({ id: z.string(), type: z.string(), x: z.number() })),
  wires: z.array(z.object({ device: z.string(), module: z.string(), channel: z.number().int() })),
  projects: z
    .record(z.string(), z.object({ tags: z.array(z.any()), blocks: z.array(z.any()) }))
    .default({}),
  config: z.record(z.string(), z.any()).optional(),
});

const FileSchema = z.object({
  format: z.literal(ANLAGE_FORMAT),
  formatVersion: z.literal(ANLAGE_VERSION),
  name: z.string().default('Unbenannte Anlage'),
  description: z.string().default(''),
  author: z.string().default(''),
  created: z.string().default(''),
  modified: z.string().default(''),
  layout: LayoutSchema,
  solution: SolutionSchema.default({ version: 2, modules: [], wires: [], projects: {} }),
  sim: z
    .object({
      speed: z.number().positive().default(1),
      signals: z.array(z.string()).nullable().default(null),
    })
    .default({ speed: 1, signals: null }),
});

const TYPE_DE: Record<string, string> = {
  number: 'Zahl',
  string: 'Text',
  boolean: 'Ja/Nein',
  array: 'Liste',
  object: 'Objekt',
};

/** zod-Meldung auf Deutsch mit Fundstelle */
function message(issue: z.core.$ZodIssue, data: unknown): string {
  const where = issue.path.length ? `„${issue.path.join('.')}“` : 'Datei';
  let value: unknown = data;
  for (const k of issue.path)
    value = (value as Record<PropertyKey, unknown> | undefined)?.[k as PropertyKey];
  switch (issue.code) {
    case 'invalid_type':
      return value === undefined
        ? `${where} fehlt`
        : `${where}: ${TYPE_DE[issue.expected] ?? issue.expected} erwartet`;
    case 'invalid_value':
      return `${where}: unzulässiger Wert ${JSON.stringify(value)}`;
    case 'invalid_union':
      return `${where}: unzulässiger Wert ${JSON.stringify(value)}`;
    case 'too_small':
      return `${where}: Wert zu klein`;
    case 'too_big':
      return `${where}: Wert zu groß`;
    default:
      return `${where}: ${issue.message}`;
  }
}

/** Ältere Dateien auf das aktuelle Format heben. Version 0: eine nackte Anlage ohne Hülle. */
export function migrateAnlage(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const o = raw as Record<string, unknown>;
  if (o.format === undefined && Array.isArray(o.parts)) {
    return { format: ANLAGE_FORMAT, formatVersion: ANLAGE_VERSION, layout: o };
  }
  return o;
}

export type ParsedAnlage = { ok: true; file: AnlageFile } | { ok: false; error: string };

export function parseAnlageFile(text: string): ParsedAnlage {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  data = migrateAnlage(data);
  const o = data as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null || o.format !== ANLAGE_FORMAT) {
    return { ok: false, error: 'Das ist keine ZYKLUS-Anlagendatei (*.anlage.json).' };
  }
  if (typeof o.formatVersion === 'number' && o.formatVersion > ANLAGE_VERSION) {
    return { ok: false, error: 'Die Datei stammt aus einer neueren Version des Spiels.' };
  }
  const r = FileSchema.safeParse(data);
  if (!r.success) {
    const lines = r.error.issues.slice(0, 5).map((i) => message(i, data));
    const more = r.error.issues.length > 5 ? `\n… und ${r.error.issues.length - 5} weitere` : '';
    return { ok: false, error: `Die Datei ist fehlerhaft:\n${lines.join('\n')}${more}` };
  }
  const f = r.data;
  // fehlende Parameter mit Standardwerten auffüllen
  const parts: Part[] = f.layout.parts.map((p) => ({
    ...p,
    params: {
      ...structuredClone(CATALOG[p.type as PartType].defaults),
      ...(p.params as Part['params']),
    },
  }));
  const ids = new Set<string>();
  for (const p of parts) {
    if (ids.has(p.id)) return { ok: false, error: `Bauteil-id „${p.id}“ kommt doppelt vor.` };
    ids.add(p.id);
  }
  const layout: Layout = { ...f.layout, parts } as Layout;
  if (!layout.workpieces) delete layout.workpieces;
  if (!layout.scenarios?.length) delete layout.scenarios;
  const level = levelFromLayout(layout);
  const solution = upgradeSolution(level, f.solution);
  if (!solution)
    return { ok: false, error: 'Der Schaltschrank in der Datei lässt sich nicht lesen.' };
  return {
    ok: true,
    file: { ...f, layout, solution, format: ANLAGE_FORMAT, formatVersion: ANLAGE_VERSION },
  };
}

/** Datei schreiben; feste Reihenfolge der Felder, damit Export → Import → Export gleich bleibt */
export function toAnlageFile(data: Omit<AnlageFile, 'format' | 'formatVersion'>): string {
  const l = data.layout;
  const file: AnlageFile = {
    format: ANLAGE_FORMAT,
    formatVersion: ANLAGE_VERSION,
    name: data.name,
    description: data.description,
    author: data.author,
    created: data.created,
    modified: data.modified,
    layout: {
      formatVersion: 1,
      parts: l.parts.map((p) => ({
        id: p.id,
        type: p.type,
        tag: p.tag,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot,
        params: p.params,
        ...(p.fault ? { fault: p.fault } : {}),
      })),
      ...(l.workpieces
        ? {
            workpieces: l.workpieces.map((w) => ({
              material: w.material,
              color: w.color,
              size: w.size,
              x: w.x,
              y: w.y,
              z: w.z,
            })),
          }
        : {}),
      seed: l.seed,
      area: { w: l.area.w, h: l.area.h },
      ...(l.scenarios?.length ? { scenarios: l.scenarios } : {}),
    },
    solution: data.solution,
    sim: { speed: data.sim.speed, signals: data.sim.signals },
  };
  return JSON.stringify(file, null, 2);
}

// ---------------------------------------------------------------------------------------------
// Szenario als eigene Datei (*.szenario): zum Weitergeben ohne Anlage, passt auf gleiche Kennzeichen
// ---------------------------------------------------------------------------------------------

export const SZENARIO_FORMAT = 'zyklus-szenario';

const ScenarioFileSchema = z.object({
  format: z.literal(SZENARIO_FORMAT),
  formatVersion: z.literal(1),
  scenario: ScenarioSchema,
});

export function toScenarioFile(s: Scenario): string {
  return JSON.stringify({ format: SZENARIO_FORMAT, formatVersion: 1, scenario: s }, null, 2);
}

export type ParsedScenario = { ok: true; scenario: Scenario } | { ok: false; error: string };

export function parseScenarioFile(text: string): ParsedScenario {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  const r = ScenarioFileSchema.safeParse(data);
  if (!r.success) {
    const o = data as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null || o.format !== SZENARIO_FORMAT)
      return { ok: false, error: 'Das ist keine ZYKLUS-Szenariodatei (*.szenario).' };
    const lines = r.error.issues.slice(0, 5).map((i) => message(i, data));
    return { ok: false, error: `Die Datei ist fehlerhaft:\n${lines.join('\n')}` };
  }
  return { ok: true, scenario: r.data.scenario as Scenario };
}

/** Dateiname aus dem Anlagennamen */
export function anlageFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[ä]/g, 'ae')
      .replace(/[ö]/g, 'oe')
      .replace(/[ü]/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'anlage';
  return `${base}.anlage.json`;
}

const CAT_COLOR: Record<string, string> = {
  foerder: '#5A626C',
  aktor: '#F08A1C',
  bedien: '#3FD98A',
  sensor: '#3CC8DC',
};

/** kleines Vorschaubild der Draufsicht als SVG-Text (für „Meine Anlagen“) */
export function thumbnailSvg(layout: Layout, w = 160, h = 100): string {
  const rects = layout.parts.map((p) => ({ b: boundsOf(p), p }));
  if (!rects.length)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#14171B"/></svg>`;
  const x0 = Math.min(...rects.map((r) => r.b.rect.x0)) - 20;
  const y0 = Math.min(...rects.map((r) => r.b.rect.y0)) - 20;
  const x1 = Math.max(...rects.map((r) => r.b.rect.x1)) + 20;
  const y1 = Math.max(...rects.map((r) => r.b.rect.y1)) + 20;
  const s = Math.min(w / (x1 - x0), h / (y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2;
  const oy = (h - (y1 - y0) * s) / 2;
  const body = rects
    .sort((a, b) => a.b.z1 - b.b.z1)
    .map(({ b, p }) => {
      const x = ox + (b.rect.x0 - x0) * s;
      const y = oy + (b.rect.y0 - y0) * s;
      const fill = CAT_COLOR[CATALOG[p.type].category];
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, (b.rect.x1 - b.rect.x0) * s).toFixed(1)}" height="${Math.max(1, (b.rect.y1 - b.rect.y0) * s).toFixed(1)}" fill="${fill}" rx="1"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#14171B"/>${body}</svg>`;
}
