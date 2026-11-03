import { formatAddress, parseAddress } from '../address';
import type { PlcProject } from '../project';
import type { DataType } from '../types';
import type { Device, Level } from './level';
import { SOLUTION_VERSION, wallRange } from './migrate';
import {
  DEFAULT_UPDATE_TIME,
  MODULE_TYPES,
  RANGE_LABEL,
  channelInfo,
  ioGroups,
  moduleType,
  type AnalogRange,
  type ChannelKind,
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
  /** Bedienpanel: zugeordnete CPU und Merkeradresse je Element (sonst automatisch) */
  hmi?: { cpu?: string; tags?: Record<string, string> };
}

/** Bedienpanel: automatische Adressen der Bitelemente ab %M200.0, der Wertelemente ab %MW220 */
export const HMI_BIT_BASE = 200;
export const HMI_WORD_BASE = 220;

/** Standardadressen der Panel-Elemente eines Levels (in Gerätereihenfolge) */
export function hmiDefaultAddresses(level: Level): Map<string, string> {
  const out = new Map<string, string>();
  let bit = 0;
  let word = 0;
  for (const d of level.devices) {
    if (!d.hmi) continue;
    if (d.kind === 'DI' || d.kind === 'DO') {
      out.set(d.id, `%M${HMI_BIT_BASE + Math.floor(bit / 8)}.${bit % 8}`);
      bit++;
    } else {
      out.set(d.id, `%MW${HMI_WORD_BASE + 2 * word}`);
      word++;
    }
  }
  return out;
}

export interface ModuleConfig {
  /** Messbereich je Kanalnummer */
  ranges?: Record<number, AnalogRange>;
  /** Anfangsadresse je Kanalart (Byte bei DI/DO, Byteadresse des ersten Worts bei AI/AO) */
  start?: Partial<Record<'di' | 'do' | 'ai' | 'ao', number>>;
  /** Eingangsverzögerung der Digitaleingänge in ms (Standard 0,05 = keine spürbare) */
  inputDelay?: number;
  /** Ausgänge bei CPU-STOP: abschalten (Standard), letzten Wert halten oder Ersatzwert */
  onStop?: 'off' | 'hold' | 'substitute';
  /** Ersatzwert je Kanalnummer (bei `onStop: 'substitute'`) */
  substitute?: Record<number, boolean | number>;
  /** Diagnose freigegeben (Drahtbruch, fehlende Lastspannung) */
  diagnostics?: boolean;
  /** nur CPU: Systemmerkerbyte (FirstScan, DiagStatusUpdate, AlwaysTRUE, AlwaysFALSE) */
  systemByte?: number;
  /** nur CPU: Taktmerkerbyte (Bit 0 = 10 Hz … Bit 7 = 0,5 Hz) */
  clockByte?: number;
  /**
   * nur DI 8 HF: schneller Zähler an Kanal 0 – Byteadresse des Zählwerts (%ID, DInt);
   * dasselbe Byte im Ausgangsbereich, Bit 0, setzt den Zähler zurück (%Q<n>.0). Fehlt: aus.
   */
  hsc?: number;
  /** nur DQ 4 HF: Betriebsart je Kanal; PWM mit Periodendauer in ms */
  pulse?: Record<number, PulseConfig>;
  /** nur DQ 4 HF: Byteadresse des Stellworts von Kanal 0 (%QW, Standard 120) */
  pulseAddress?: number;
  /** nur CPU: Verbindungen für TSEND_C/TRCV_C, ID → Partner-CPU (bei zwei CPUs: ID 1 automatisch) */
  connections?: Record<number, string>;
  /** nur Interfacemodul: zugeordnete CPU (Standard: erste CPU auf der Schiene) */
  controller?: string;
  /** nur Interfacemodul: Aktualisierungszeit in ms (1…16, Standard 4) */
  updateTime?: number;
  /** Teilprozessabbild der Kanäle (1…31; fehlt: OB1-Prozessabbild) */
  tpa?: number;
}

/**
 * Teilprozessabbilder einer CPU aus der Baugruppenkonfiguration: Byte → TPA je Bereich.
 * undefined, wenn keine Baugruppe dieser CPU einem TPA zugeordnet ist (Spielregel ohne TPA).
 */
export function cpuPartitions(
  solution: Pick<Solution, 'config' | 'modules'>,
  analysis: Pick<BoardAnalysis, 'cpuOf' | 'channelAddress'>,
  cpu: string,
): { I: Record<number, number>; Q: Record<number, number> } | undefined {
  const out = { I: {} as Record<number, number>, Q: {} as Record<number, number> };
  let any = false;
  for (const m of solution.modules) {
    const tpa = solution.config?.[m.id]?.tpa;
    if (!tpa || analysis.cpuOf.get(m.id) !== cpu) continue;
    for (const [key, addr] of analysis.channelAddress) {
      if (!key.startsWith(`${m.id}:`)) continue;
      const a = parseAddress(addr);
      if (a.area !== 'I' && a.area !== 'Q') continue;
      const bytes = a.size === 'X' || a.size === 'B' ? 1 : a.size === 'W' ? 2 : 4;
      for (let b = a.byte; b < a.byte + bytes; b++) out[a.area][b] = tpa;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Schneller Ausgang: PWM – Tastverhältnis aus dem Stellwort in Promille (0…1000) bei fester
 * Periodendauer; PTO – Impulsfolge mit der Frequenz aus dem Stellwort in Hz (0…500).
 */
export interface PulseConfig {
  mode: 'pwm' | 'pto';
  /** PWM: Periodendauer in ms (Standard 100) */
  period?: number;
}

/** Wählbare Eingangsverzögerungen in ms wie bei S7-1500-Digitaleingängen */
export const INPUT_DELAYS = [0.05, 0.1, 0.4, 0.8, 1.6, 3.2, 12.8, 20] as const;

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

/** Aktualisierungszeit einer dezentralen Station in ms (auf 1…16 begrenzt) */
export function updateTimeOf(solution: Pick<Solution, 'config'>, im: string): number {
  const v = solution.config?.[im]?.updateTime ?? DEFAULT_UPDATE_TIME;
  return Math.max(1, Math.min(16, Math.round(v)));
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
  | 'address'
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
  /** Baugruppe und Kanal */
  module: string;
  channel: number;
  address: string;
  t: DataType;
  /** über einen Relaisausgang angeschlossen: Schaltverzögerung in ms */
  delay?: { on: number; off: number };
  /** Analogkanal: eingestellter Messbereich */
  range?: AnalogRange;
  /** Signalart des Geräts passt nicht zum Messbereich: Kanal liefert Überlauf bzw. kein Signal */
  mismatch?: boolean;
  /** Baugruppe einer dezentralen Station: Interfacemodul und Aktualisierungszeit in ms */
  station?: { im: string; updateTime: number };
  /** Element des Bedienpanels (Adresse im Merkerbereich) */
  hmi?: boolean;
}

export interface BoardAnalysis {
  issues: BoardIssue[];
  /** CPU-Modul, zu dem ein E/A-Modul gehört */
  cpuOf: Map<string, string>;
  /** Baugruppe einer dezentralen Station → Interfacemodul */
  stationOf: Map<string, string>;
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
  /** belegte Bytes je CPU und Bereich (für die Prüfung geänderter Anfangsadressen) */
  const usedBytes = new Map<string, string>();
  /** Adressen je Kanalgruppe: Digital byteweise, Analog wortweise (Relais zählen als DO) */
  const assign = (id: string, t: ModuleType) => {
    let ch = 0;
    for (const g of ioGroups(t)) {
      const k = g.kind.toLowerCase() as 'di' | 'do' | 'ai' | 'ao';
      const size = k === 'di' || k === 'do' ? Math.ceil(g.count / 8) : g.count * 2;
      const own = solution.config?.[id]?.start?.[k];
      if (own !== undefined) {
        if (!Number.isInteger(own) || own < 0 || ((k === 'ai' || k === 'ao') && own % 2)) {
          err({
            code: 'address',
            message: `${t.name.de} ${id}: Anfangsadresse ${own} ungültig (Analog: gerade Byteadresse)`,
            module: id,
          });
        } else {
          counters[k] = own;
        }
      }
      const area = k === 'di' || k === 'ai' ? 'I' : 'Q';
      for (let b = counters[k]; b < counters[k] + size; b++) {
        const key = `${cpu}|${area}|${b}`;
        const other = usedBytes.get(key);
        if (other && other !== id) {
          err({
            code: 'address',
            message: `Adressen von ${id} überschneiden sich mit ${other} (%${area}B${b})`,
            module: id,
          });
          break;
        }
        usedBytes.set(key, id);
      }
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
  /** Adresszähler je CPU (dezentrale Stationen vergeben danach weiter) */
  const countersOf = new Map<string, typeof counters>();
  /** dezentrale Stationen: Interfacemodul mit seinen Baugruppen (in Steckplatzreihenfolge) */
  const stations: { im: PlacedModule; modules: PlacedModule[] }[] = [];
  let station: (typeof stations)[number] | undefined;
  const stationOf = new Map<string, string>();
  const firstCpu = sorted.find((m) => types.get(m.id)!.kind === 'cpu')?.id;
  const leave = () => {
    if (cpu && !station) countersOf.set(cpu, counters);
  };
  for (const m of sorted) {
    const t = types.get(m.id)!;
    if (wr && !pastWall && m.x >= wr[1]) {
      // Module rechts der Trennwand gehören nicht zur CPU links davon
      leave();
      pastWall = true;
      cpu = undefined;
      station = undefined;
    }
    if (t.kind === 'im') {
      leave();
      station = { im: m, modules: [] };
      stations.push(station);
      cpu = undefined;
      continue;
    }
    if (station && t.kind !== 'cpu') {
      station.modules.push(m);
      continue;
    }
    if (t.kind === 'cpu') {
      leave();
      station = undefined;
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
  leave();
  // dezentrale Stationen: Adressen im Anschluss an die Baugruppen der zugeordneten CPU
  for (const st of stations) {
    const want = solution.config?.[st.im.id]?.controller ?? firstCpu;
    const ctl = want && types.get(want)?.kind === 'cpu' ? want : undefined;
    if (!ctl) {
      err({
        code: 'io-without-cpu',
        message: `Interfacemodul ${st.im.id}: keine CPU zugeordnet`,
        module: st.im.id,
      });
      continue;
    }
    cpu = ctl;
    counters = countersOf.get(ctl) ?? { di: 0, do: 0, ai: ANALOG_BASE, ao: ANALOG_BASE };
    cpuOf.set(st.im.id, ctl);
    for (const m of st.modules) {
      const t = types.get(m.id)!;
      if (t.kind === 'cp') {
        err({
          code: 'coupler',
          message: 'Ein Koppelmodul gehört neben die CPU, nicht in eine dezentrale Station',
          module: m.id,
        });
        continue;
      }
      cpuOf.set(m.id, ctl);
      stationOf.set(m.id, st.im.id);
      assign(m.id, t);
    }
    countersOf.set(ctl, counters);
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
    if (dev?.hmi) {
      err({
        code: 'bad-wire',
        message: `${dev.name.de} ist ein Element des Bedienpanels und wird nicht verdrahtet`,
        device: w.device,
      });
      continue;
    }
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
        module: mod.id,
        channel: w.channel,
        address,
        t: dev.kind === 'DI' || dev.kind === 'DO' ? 'BOOL' : 'INT',
        delay: t.delay,
        ...(range ? { range } : {}),
        ...(mismatch ? { mismatch } : {}),
        ...(stationOf.has(mod.id)
          ? {
              station: {
                im: stationOf.get(mod.id)!,
                updateTime: updateTimeOf(solution, stationOf.get(mod.id)!),
              },
            }
          : {}),
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
  // Bedienpanel: Elemente über Merkeradressen der zugeordneten CPU
  const hmiDevices = level.devices.filter((d) => d.hmi);
  if (hmiDevices.length) {
    const defaults = hmiDefaultAddresses(level);
    const want = solution.hmi?.cpu ?? firstCpu;
    const hmiCpu = want && types.get(want)?.kind === 'cpu' ? want : undefined;
    for (const d of hmiDevices) {
      const text = solution.hmi?.tags?.[d.id]?.trim() || defaults.get(d.id)!;
      let ok = false;
      try {
        const a = parseAddress(text);
        const bit = d.kind === 'DI' || d.kind === 'DO';
        ok = a.area === 'M' && (bit ? a.size === 'X' : a.size === 'W');
      } catch {
        ok = false;
      }
      if (!ok) {
        err({
          code: 'address',
          message: `${d.name.de}: ${text} ist keine passende Merkeradresse (${d.kind === 'DI' || d.kind === 'DO' ? 'Bit, z. B. %M200.0' : 'Wort, z. B. %MW220'})`,
          device: d.id,
        });
        continue;
      }
      if (!hmiCpu) continue;
      bindings.set(d.id, {
        cpu: hmiCpu,
        module: 'hmi',
        channel: hmiDevices.indexOf(d),
        address: text.toUpperCase().replace(/^%M/, '%M'),
        t: d.kind === 'DI' || d.kind === 'DO' ? 'BOOL' : 'INT',
        hmi: true,
      });
    }
  }
  for (const d of level.devices) {
    if (d.hmi) continue;
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
    stationOf,
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

/**
 * Automatisch verdrahten: jedes nicht angeschlossene Gerät auf den ersten freien passenden Kanal
 * (Leistungsverbraucher nur auf Relais, sonst Relais zuletzt). Messbereiche analoger Kanäle werden
 * auf die Signalart des Geräts gestellt. `missing` zählt Geräte, für die kein Kanal frei war.
 */
export function autoWire(
  level: Level,
  s: Solution,
): { solution: Solution; wired: number; missing: Partial<Record<ChannelKind | 'REL', number>> } {
  const used = new Set(s.wires.map((w) => `${w.module}:${w.channel}`));
  const wiredDevices = new Set(s.wires.map((w) => w.device));
  const modules = [...s.modules].sort((a, b) => a.x - b.x);
  const wires = [...s.wires];
  let next: Solution = s;
  const missing: Partial<Record<ChannelKind | 'REL', number>> = {};
  let wired = 0;
  for (const d of level.devices) {
    if (wiredDevices.has(d.id) || d.hmi) continue;
    let found: { module: string; channel: number; ranges?: AnalogRange[] } | undefined;
    for (const pass of d.kind === 'DO' && !d.power ? [false, true] : [d.power === true]) {
      for (const m of modules) {
        const t = moduleType(m.type);
        if (d.kind === 'DO' && (t.kind === 'rel') !== pass) continue;
        const total = ioGroups(t).reduce((n, g) => n + g.count, 0);
        for (let ch = 0; ch < total; ch++) {
          const info = channelInfo(t, ch);
          if (info?.group.kind !== d.kind || used.has(`${m.id}:${ch}`)) continue;
          if (d.signal && info.group.ranges && !info.group.ranges.includes(d.signal)) continue;
          found = { module: m.id, channel: ch, ranges: info.group.ranges };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      const k = d.power ? 'REL' : d.kind;
      missing[k] = (missing[k] ?? 0) + 1;
      continue;
    }
    used.add(`${found.module}:${found.channel}`);
    wires.push({ device: d.id, module: found.module, channel: found.channel });
    wired++;
    if (d.signal && found.ranges?.includes(d.signal)) {
      const cfg = next.config?.[found.module] ?? {};
      next = {
        ...next,
        config: {
          ...next.config,
          [found.module]: { ...cfg, ranges: { ...cfg.ranges, [found.channel]: d.signal } },
        },
      };
    }
  }
  return { solution: { ...next, wires }, wired, missing };
}
