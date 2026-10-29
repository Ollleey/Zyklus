import { formatAddress } from '../address';
import type { PlcProject } from '../project';
import type { DataType } from '../types';
import type { Device, Level } from './level';
import { SOLUTION_VERSION, wallRange } from './migrate';
import {
  MODULE_TYPES,
  RANGE_LABEL,
  channelInfo,
  ioGroups,
  type AnalogRange,
  type ModuleType,
} from './modules';

/** Ein Modul auf der Hutschiene; `x` = linker Steckplatz. */
export interface PlacedModule {
  id: string;
  type: string;
  x: number;
}

/** Leitung von einem Feldgerät zu einem Kanal eines E/A-Moduls. */
export interface Wire {
  device: string;
  module: string;
  channel: number;
}

/** Lösung eines Levels: Aufbau, Verdrahtung und je CPU ein PLC-Projekt. Positionen in TE (15 mm). */
export interface Solution {
  version: 2;
  modules: PlacedModule[];
  wires: Wire[];
  /** PLC-Projekt je CPU-Modul (Schlüssel = Modul-id) */
  projects: Record<string, PlcProject>;
  /** Einstellungen je Baugruppe (Modul-Inspektor), z. B. Messbereich je Analogkanal */
  config?: Record<string, ModuleConfig>;
}

export interface ModuleConfig {
  /** Messbereich je Kanalnummer */
  ranges?: Record<number, AnalogRange>;
}

/** Eingestellter Messbereich eines Analogkanals (Standard: erster wählbarer Bereich) */
export function channelRange(
  solution: Pick<Solution, 'config'>,
  moduleId: string,
  t: ModuleType,
  ch: number,
): AnalogRange | undefined {
  const ranges = channelInfo(t, ch)?.group.ranges;
  if (!ranges?.length) return undefined;
  const set = solution.config?.[moduleId]?.ranges?.[ch];
  return set && ranges.includes(set) ? set : ranges[0];
}

export function emptySolution(): Solution {
  return { version: SOLUTION_VERSION, modules: [], wires: [], projects: {} };
}

export type BoardIssueCode =
  | 'unknown-module'
  | 'not-allowed'
  | 'out-of-board'
  | 'overlap'
  | 'no-cpu'
  | 'io-without-cpu'
  | 'bad-wire'
  | 'channel-kind'
  | 'channel-used'
  | 'device-twice'
  | 'duct-full'
  | 'needs-relay'
  | 'wall'
  | 'coupler'
  | 'range-mismatch'
  | 'unwired';

export interface BoardIssue {
  code: BoardIssueCode;
  severity: 'error' | 'warning';
  message: string;
  module?: string;
  device?: string;
  column?: number;
}

/** Wohin ein Feldgerät elektrisch führt. */
export interface Binding {
  cpu: string;
  address: string;
  t: DataType;
  /** über einen Relaisausgang angeschlossen: Schaltverzögerung in ms */
  delay?: { on: number; off: number };
  /** Analogkanal: eingestellter Messbereich */
  range?: AnalogRange;
  /** Signalart des Geräts passt nicht zum Messbereich: Kanal liefert Überlauf bzw. kein Signal */
  mismatch?: boolean;
}

export interface BoardAnalysis {
  issues: BoardIssue[];
  /** CPU-Modul, zu dem ein E/A-Modul gehört */
  cpuOf: Map<string, string>;
  /** Adresse je Modul-Kanal, Schlüssel `${modul}:${kanal}` */
  channelAddress: Map<string, string>;
  bindings: Map<string, Binding>;
  /** belegte Leitungen je Spalte des Kabelkanals */
  ductLoad: number[];
  /** über Koppelmodule verbundene CPU-Paare */
  links: [string, string][];
  cost: number;
  ok: boolean;
}

/** Erste Adresse für Analogkanäle wie in TIA üblich */
const ANALOG_BASE = 64;

/**
 * Prüft Aufbau und Verdrahtung und berechnet die Adressen.
 * Adressvergabe je CPU in Steckplatzreihenfolge: DI/DO bekommen fortlaufende Bytes ab 0,
 * AI/AO fortlaufende Wörter ab 64 (wie die automatische Adressvergabe in TIA).
 */
export function analyzeBoard(level: Level, solution: Solution): BoardAnalysis {
  const issues: BoardIssue[] = [];
  const err = (i: Omit<BoardIssue, 'severity'>) => issues.push({ ...i, severity: 'error' });
  const width = level.board.width;
  const types = new Map<string, ModuleType>();
  let cost = 0;

  const occupied: (string | undefined)[] = new Array(width).fill(undefined);
  for (const m of solution.modules) {
    const t = MODULE_TYPES[m.type];
    if (!t) {
      err({ code: 'unknown-module', message: `Unbekanntes Modul „${m.type}“`, module: m.id });
      continue;
    }
    types.set(m.id, t);
    cost += t.price;
    if (!level.allowedModules.includes(m.type)) {
      err({
        code: 'not-allowed',
        message: `${t.name.de} ist in diesem Auftrag nicht zugelassen`,
        module: m.id,
      });
    }
    if (m.x < 0 || m.x + t.width > width) {
      err({
        code: 'out-of-board',
        message: `${t.name.de} ragt über die Hutschiene hinaus`,
        module: m.id,
      });
      continue;
    }
    const wr = wallRange(level.board);
    if (wr && m.x < wr[1] && wr[0] < m.x + t.width) {
      err({ code: 'wall', message: `${t.name.de} steht auf der Trennwand`, module: m.id });
      continue;
    }
    for (let c = m.x; c < m.x + t.width; c++) {
      if (occupied[c]) {
        err({
          code: 'overlap',
          message: `${t.name.de} überlappt mit einem anderen Modul`,
          module: m.id,
        });
        break;
      }
      occupied[c] = m.id;
    }
  }

  // Zuordnung zur CPU links davon, Adressvergabe
  const sorted = [...solution.modules].filter((m) => types.has(m.id)).sort((a, b) => a.x - b.x);
  const cpuOf = new Map<string, string>();
  const channelAddress = new Map<string, string>();
  let cpu: string | undefined;
  let counters = { di: 0, do: 0, ai: ANALOG_BASE, ao: ANALOG_BASE };
  const wall = level.board.wall;
  const wr = wallRange(level.board);
  let pastWall = false;
  const couplers: { module: string; cpu: string }[] = [];
  /** Adressen je Kanalgruppe: Digital byteweise, Analog wortweise (Relais zählen als DO) */
  const assign = (id: string, t: ModuleType) => {
    let ch = 0;
    for (const g of ioGroups(t)) {
      const k = g.kind.toLowerCase() as 'di' | 'do' | 'ai' | 'ao';
      for (let i = 0; i < g.count; i++, ch++) {
        const addr =
          k === 'di' || k === 'do'
            ? formatAddress({
                area: k === 'di' ? 'I' : 'Q',
                size: 'X',
                byte: counters[k] + Math.floor(i / 8),
                bit: i % 8,
              })
            : formatAddress({
                area: k === 'ai' ? 'I' : 'Q',
                size: 'W',
                byte: counters[k] + i * 2,
                bit: 0,
              });
        channelAddress.set(`${id}:${ch}`, addr);
      }
      counters[k] += k === 'di' || k === 'do' ? Math.ceil(g.count / 8) : g.count * 2;
    }
  };
  for (const m of sorted) {
    const t = types.get(m.id)!;
    if (wr && !pastWall && m.x >= wr[1]) {
      // Module rechts der Trennwand gehören nicht zur CPU links davon
      pastWall = true;
      cpu = undefined;
    }
    if (t.kind === 'cpu') {
      cpu = m.id;
      counters = { di: 0, do: 0, ai: ANALOG_BASE, ao: ANALOG_BASE };
      // E/A auf der CPU bekommen die ersten Adressen
      if (t.channels) {
        cpuOf.set(m.id, cpu);
        assign(m.id, t);
      }
      continue;
    }
    if (!cpu) {
      err({
        code: 'io-without-cpu',
        message: `${t.name.de} steht links von jeder CPU und ist nicht angebunden`,
        module: m.id,
      });
      continue;
    }
    cpuOf.set(m.id, cpu);
    if (t.kind === 'cp') {
      if (couplers.some((c) => c.cpu === cpu)) {
        err({ code: 'coupler', message: 'Je CPU ist nur ein Koppelmodul möglich', module: m.id });
      } else {
        couplers.push({ module: m.id, cpu });
      }
      continue;
    }
    assign(m.id, t);
  }
  if (!sorted.some((m) => types.get(m.id)!.kind === 'cpu')) {
    err({ code: 'no-cpu', message: 'Es ist keine CPU gesteckt' });
  }
  // Koppelmodule paarweise in Steckplatzreihenfolge verbinden
  const links: [string, string][] = [];
  for (let i = 0; i + 1 < couplers.length; i += 2) {
    links.push([couplers[i]!.cpu, couplers[i + 1]!.cpu]);
  }
  if (couplers.length % 2) {
    issues.push({
      code: 'coupler',
      severity: 'warning',
      message: 'Ein Koppelmodul hat keinen Partner',
      module: couplers[couplers.length - 1]!.module,
    });
  }

  // Verdrahtung
  const devices = new Map(level.devices.map((d) => [d.id, d]));
  const bindings = new Map<string, Binding>();
  const usedChannels = new Set<string>();
  const ductLoad: number[] = new Array(width).fill(0);
  for (const w of solution.wires) {
    const dev = devices.get(w.device);
    const mod = solution.modules.find((m) => m.id === w.module);
    const t = mod ? types.get(mod.id) : undefined;
    if (!dev || !mod || !t) {
      err({
        code: 'bad-wire',
        message: 'Leitung zu einem unbekannten Gerät oder Modul',
        device: w.device,
        module: w.module,
      });
      continue;
    }
    const info = channelInfo(t, w.channel);
    if (!info) {
      err({
        code: 'bad-wire',
        message: `${t.name.de} hat keinen Kanal ${w.channel}`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    if (info.group.kind !== dev.kind) {
      err({
        code: 'channel-kind',
        message: `${dev.name.de} braucht einen ${dev.kind}-Kanal, nicht ${info.group.kind}`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    if (dev.power && t.kind !== 'rel') {
      err({
        code: 'needs-relay',
        message: `${dev.name.de} ist ein Leistungsverbraucher und braucht einen Relaisausgang`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    if (wall !== undefined && (dev.side === 'left') !== mod.x < wall) {
      err({
        code: 'wall',
        message: `Die Leitung von ${dev.name.de} kann die Trennwand nicht kreuzen`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    const key = `${mod.id}:${w.channel}`;
    if (usedChannels.has(key)) {
      err({
        code: 'channel-used',
        message: `Kanal ${w.channel} von ${t.name.de} ist doppelt belegt`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    if (bindings.has(dev.id) || solution.wires.filter((x) => x.device === dev.id).length > 1) {
      if (!issues.some((i) => i.code === 'device-twice' && i.device === dev.id)) {
        err({
          code: 'device-twice',
          message: `${dev.name.de} ist mehrfach angeschlossen`,
          device: dev.id,
        });
      }
    }
    usedChannels.add(key);
    // Kabelkanal: links eingespeiste Geräte bis zur ersten Modulspalte, rechts ab der letzten
    const [from, to] = dev.side === 'left' ? [0, mod.x] : [mod.x + t.width - 1, width - 1];
    for (let c = Math.max(0, from); c <= Math.min(width - 1, to); c++) ductLoad[c]!++;
    const cpuId = cpuOf.get(mod.id);
    const address = channelAddress.get(key);
    const range = channelRange(solution, mod.id, t, w.channel);
    const mismatch = !!(range && dev.signal && dev.signal !== range);
    if (mismatch) {
      issues.push({
        code: 'range-mismatch',
        severity: 'warning',
        message: `${dev.name.de} liefert ${RANGE_LABEL[dev.signal!]}, der Kanal ist auf ${RANGE_LABEL[range!]} eingestellt`,
        device: dev.id,
        module: mod.id,
      });
    }
    if (cpuId && address && !bindings.has(dev.id)) {
      bindings.set(dev.id, {
        cpu: cpuId,
        address,
        t: dev.kind === 'DI' || dev.kind === 'DO' ? 'BOOL' : 'INT',
        delay: t.delay,
        ...(range ? { range } : {}),
        ...(mismatch ? { mismatch } : {}),
      });
    }
  }
  ductLoad.forEach((n, column) => {
    if (n > level.board.ductCapacity) {
      err({
        code: 'duct-full',
        message: `Kabelkanal in Spalte ${column + 1} ist überfüllt (${n} von ${level.board.ductCapacity} Leitungen)`,
        column,
      });
    }
  });
  for (const d of level.devices) {
    if (!solution.wires.some((w) => w.device === d.id)) {
      issues.push({
        code: 'unwired',
        severity: 'warning',
        message: `${d.name.de} ist nicht angeschlossen`,
        device: d.id,
      });
    }
  }

  return {
    issues,
    cpuOf,
    channelAddress,
    bindings,
    ductLoad,
    links,
    cost,
    ok: !issues.some((i) => i.severity === 'error'),
  };
}

/**
 * Ergänzt die PLC-Variablentabelle einer CPU um angeschlossene Geräte (Name aus dem Level)
 * und führt Adressen nach, wenn Leitungen umgesteckt wurden. Eigene Variablen bleiben unberührt.
 */
export function syncDeviceTags(
  level: Level,
  analysis: BoardAnalysis,
  cpu: string,
  project: PlcProject,
): PlcProject {
  const tags = [...project.tags];
  for (const d of level.devices as Device[]) {
    const b = analysis.bindings.get(d.id);
    const i = tags.findIndex((t) => t.comment === `Gerät ${d.id}`);
    if (!b || b.cpu !== cpu) {
      if (i >= 0) tags.splice(i, 1);
      continue;
    }
    const tag = {
      name: tags[i]?.name ?? d.tag,
      address: b.address,
      t: b.t,
      comment: `Gerät ${d.id}`,
    };
    if (i >= 0) tags[i] = tag;
    else tags.push(tag);
  }
  return { ...project, tags };
}
