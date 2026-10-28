import { formatAddress } from '../address';
import type { PlcProject } from '../project';
import type { DataType } from '../types';
import type { Device, Level } from './level';
import { MODULE_TYPES, channelKind, type ModuleType } from './modules';

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

/** Lösung eines Levels: Aufbau, Verdrahtung und je CPU ein PLC-Projekt. */
export interface Solution {
  version: 1;
  modules: PlacedModule[];
  wires: Wire[];
  /** PLC-Projekt je CPU-Modul (Schlüssel = Modul-id) */
  projects: Record<string, PlcProject>;
}

export function emptySolution(): Solution {
  return { version: 1, modules: [], wires: [], projects: {} };
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
  for (const m of sorted) {
    const t = types.get(m.id)!;
    if (t.kind === 'cpu') {
      cpu = m.id;
      counters = { di: 0, do: 0, ai: ANALOG_BASE, ao: ANALOG_BASE };
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
    for (let ch = 0; ch < t.channels; ch++) {
      let addr: string;
      if (t.kind === 'di' || t.kind === 'do') {
        const byte = counters[t.kind];
        addr = formatAddress({ area: t.kind === 'di' ? 'I' : 'Q', size: 'X', byte, bit: ch });
      } else {
        const word = counters[t.kind] + ch * 2;
        addr = formatAddress({ area: t.kind === 'ai' ? 'I' : 'Q', size: 'W', byte: word, bit: 0 });
      }
      channelAddress.set(`${m.id}:${ch}`, addr);
    }
    if (t.kind === 'di' || t.kind === 'do') counters[t.kind] += 1;
    else counters[t.kind] += t.channels * 2;
  }
  if (!sorted.some((m) => types.get(m.id)!.kind === 'cpu')) {
    err({ code: 'no-cpu', message: 'Es ist keine CPU gesteckt' });
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
    if (w.channel < 0 || w.channel >= t.channels) {
      err({
        code: 'bad-wire',
        message: `${t.name.de} hat keinen Kanal ${w.channel}`,
        device: w.device,
        module: w.module,
      });
      continue;
    }
    if (channelKind(t.kind) !== dev.kind) {
      err({
        code: 'channel-kind',
        message: `${dev.name.de} braucht einen ${dev.kind}-Kanal, nicht ${channelKind(t.kind) ?? 'die CPU'}`,
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
    if (cpuId && address && !bindings.has(dev.id)) {
      bindings.set(dev.id, {
        cpu: cpuId,
        address,
        t: dev.kind === 'DI' || dev.kind === 'DO' ? 'BOOL' : 'INT',
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
