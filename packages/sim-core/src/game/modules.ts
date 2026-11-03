import { CPU_TYPES, type CpuType } from '../catalog';
import type { Text } from './text';

export type ModuleKind = 'cpu' | 'di' | 'do' | 'dio' | 'ai' | 'ao' | 'rel' | 'cp' | 'im';
export type ChannelKind = 'DI' | 'DO' | 'AI' | 'AO';

/** Messbereich eines Analogkanals bzw. Signalart eines Analoggeräts */
export type AnalogRange = '0-10V' | '4-20mA';

export const RANGE_LABEL: Record<AnalogRange, string> = { '0-10V': '0–10 V', '4-20mA': '4–20 mA' };

/** Kanäle einer Art auf einer Baugruppe; `ranges`: wählbare Messbereiche, der erste ist Standard */
export interface IoGroup {
  kind: ChannelKind;
  count: number;
  ranges?: AnalogRange[];
}

export interface ModuleType {
  id: string;
  name: Text;
  kind: ModuleKind;
  /** Breite auf der Hutschiene in Rasterschritten (TE) zu 15 mm */
  width: number;
  price: number;
  /** Anzahl E/A-Kanäle insgesamt */
  channels: number;
  /** Kanalgruppen in Kanalreihenfolge (gemischte Baugruppen, E/A auf der CPU) */
  io?: IoGroup[];
  cpu?: CpuType;
  /** Relaisausgang: Ansprech- und Abfallverzögerung in ms */
  delay?: { on: number; off: number };
  /** Eingänge können einen Prozessalarm (OB40) auslösen; Kanal 0 als schneller Zähler (HSC) */
  alarms?: boolean;
  /** Ausgänge als PWM/PTO einstellbar */
  pulse?: boolean;
  description: Text;
}

/** Koppelmodul: Sende-/Empfangswörter je CPU (wie PUT/GET, 1 Zyklus Latenz) */
export const COUPLER_WORDS = 2;
export const COUPLER_BASE = 100;

/** Schneller Zähler: Standardadresse des Zählwerts (%ID) bzw. Rücksetzbits (%Q…0) */
export const HSC_BASE = 112;
/** PWM/PTO: Standardadresse des ersten Stellworts (%QW, je Kanal 2 Byte) */
export const PULSE_BASE = 120;

/** Dezentrale Station: Standard-Aktualisierungszeit in ms und wählbare Werte */
export const UPDATE_TIMES = [1, 2, 4, 8, 16] as const;
export const DEFAULT_UPDATE_TIME = 4;

/** Rasterschritt der Hutschiene in mm */
export const TE_MM = 15;

const BOTH: AnalogRange[] = ['0-10V', '4-20mA'];

const CPU_EN: Record<string, string> = {
  '10 ms Zyklus, bis 40 SCL-Anweisungen bzw. 10 Netzwerke.':
    '10 ms cycle, up to 40 SCL statements or 10 networks.',
  '10 ms Zyklus wie CPU klein, dazu E/A auf der CPU: DI 6 (%I0.0…%I0.5), DO 4 (%Q0.0…%Q0.3), AI 2 0–10 V (%IW64, %IW66).':
    '10 ms cycle like CPU klein, plus on-board I/O: DI 6 (%I0.0…%I0.5), DO 4 (%Q0.0…%Q0.3), AI 2 0–10 V (%IW64, %IW66).',
  '5 ms Zyklus, mehr Programmspeicher, Weck- und Prozessalarm.':
    '5 ms cycle, more program memory, cyclic and hardware interrupts.',
  '1 ms Zyklus, Weck- und Prozessalarm, kleiner Programmspeicher.':
    '1 ms cycle, cyclic and hardware interrupts, small program memory.',
};

const cpu = (key: keyof typeof CPU_TYPES, description: string, io?: IoGroup[]): ModuleType => {
  const c = CPU_TYPES[key];
  return {
    id: `cpu-${key}`,
    name: { de: c.name },
    kind: 'cpu',
    width: c.width,
    price: c.price,
    channels: io ? io.reduce((n, g) => n + g.count, 0) : 0,
    ...(io ? { io } : {}),
    cpu: c,
    description: { de: description, ...(CPU_EN[description] ? { en: CPU_EN[description] } : {}) },
  };
};

export const MODULE_TYPES: Record<string, ModuleType> = {
  'cpu-klein': cpu('klein', '10 ms Zyklus, bis 40 SCL-Anweisungen bzw. 10 Netzwerke.'),
  'cpu-kompakt': cpu(
    'kompakt',
    '10 ms Zyklus wie CPU klein, dazu E/A auf der CPU: DI 6 (%I0.0…%I0.5), DO 4 (%Q0.0…%Q0.3), AI 2 0–10 V (%IW64, %IW66).',
    [
      { kind: 'DI', count: 6 },
      { kind: 'DO', count: 4 },
      { kind: 'AI', count: 2, ranges: ['0-10V'] },
    ],
  ),
  'cpu-mittel': cpu('mittel', '5 ms Zyklus, mehr Programmspeicher, Weck- und Prozessalarm.'),
  'cpu-schnell': cpu('schnell', '1 ms Zyklus, Weck- und Prozessalarm, kleiner Programmspeicher.'),
  di8hf: {
    id: 'di8hf',
    name: { de: 'DI 8 HF' },
    kind: 'di',
    width: 1,
    price: 4,
    channels: 8,
    alarms: true,
    description: {
      de: '8 schnelle digitale Eingänge; jede Flanke kann einen Prozessalarm (OB40) auslösen. Kanal 0 lässt sich als schneller Zähler (HSC) einstellen, der jede Flanke unabhängig vom Zyklus zählt.',
      en: '8 fast digital inputs; every edge can trigger a hardware interrupt (OB40). Channel 0 can be set up as a high-speed counter (HSC) that counts every edge independently of the cycle.',
    },
  },
  dq4hf: {
    id: 'dq4hf',
    name: { de: 'DQ 4 HF' },
    kind: 'do',
    width: 1,
    price: 4,
    channels: 4,
    pulse: true,
    description: {
      de: '4 schnelle digitale Ausgänge; je Kanal als Pulsweitenmodulation (PWM) oder Impulsfolge (PTO) einstellbar – das Ausgangssignal erzeugt die Baugruppe selbst, unabhängig vom Zyklus.',
      en: '4 fast digital outputs; each channel configurable as pulse width modulation (PWM) or pulse train (PTO) – the module generates the output signal itself, independently of the cycle.',
    },
  },
  'im-pn': {
    id: 'im-pn',
    name: { de: 'IM PN' },
    kind: 'im',
    width: 1,
    price: 3,
    channels: 0,
    description: {
      de: 'Interfacemodul einer dezentralen Station: die Baugruppen rechts davon (bis zur nächsten CPU bzw. zum nächsten Interfacemodul) gehören über PROFINET zu einer CPU. Eingänge und Ausgänge werden im Takt der Aktualisierungszeit (1…16 ms) übertragen. Fällt die Station aus, meldet die CPU einen Baugruppenträgerausfall (OB86).',
      en: 'Interface module of a distributed station: the modules to its right (up to the next CPU or interface module) belong to a CPU via PROFINET. Inputs and outputs are transferred at the update time (1…16 ms). If the station fails, the CPU reports a rack failure (OB86).',
    },
  },
  kop: {
    id: 'kop',
    name: { de: 'KOP' },
    kind: 'cp',
    width: 2,
    price: 3,
    channels: 0,
    description: {
      de: 'Koppelmodul: tauscht mit dem Koppelmodul der Nachbar-CPU je 2 Wörter aus. Senden über %QW100/%QW102, Empfang über %IW100/%IW102. Was eine CPU am Zyklusende sendet, liest die Partner-CPU ab ihrem nächsten Zyklus.',
      en: 'Coupler module: exchanges 2 words each with the coupler module of the neighbouring CPU. Send via %QW100/%QW102, receive via %IW100/%IW102. What one CPU sends at the end of its cycle, the partner CPU reads from its next cycle.',
    },
  },
  di4: {
    id: 'di4',
    name: { de: 'DI 4' },
    kind: 'di',
    width: 1,
    price: 1,
    channels: 4,
    description: {
      de: '4 digitale Eingänge, 24 V.',
      en: '4 digital inputs, 24 V.',
    },
  },
  do4: {
    id: 'do4',
    name: { de: 'DO 4' },
    kind: 'do',
    width: 1,
    price: 1,
    channels: 4,
    description: {
      de: '4 digitale Ausgänge, 24 V / 0,5 A.',
      en: '4 digital outputs, 24 V / 0.5 A.',
    },
  },
  dio8: {
    id: 'dio8',
    name: { de: 'DI 8/DO 8' },
    kind: 'dio',
    width: 2,
    price: 3,
    channels: 16,
    io: [
      { kind: 'DI', count: 8 },
      { kind: 'DO', count: 8 },
    ],
    description: {
      de: '8 digitale Eingänge und 8 digitale Ausgänge, 24 V, auf einer Baugruppe.',
      en: '8 digital inputs and 8 digital outputs, 24 V, on one module.',
    },
  },
  di8: {
    id: 'di8',
    name: { de: 'DI 8' },
    kind: 'di',
    width: 1,
    price: 2,
    channels: 8,
    description: {
      de: '8 digitale Eingänge, 24 V.',
      en: '8 digital inputs, 24 V.',
    },
  },
  do8: {
    id: 'do8',
    name: { de: 'DO 8' },
    kind: 'do',
    width: 1,
    price: 2,
    channels: 8,
    description: {
      de: '8 digitale Ausgänge, 24 V / 0,5 A.',
      en: '8 digital outputs, 24 V / 0.5 A.',
    },
  },
  ai2: {
    id: 'ai2',
    name: { de: 'AI 2' },
    kind: 'ai',
    width: 1,
    price: 3,
    channels: 2,
    io: [{ kind: 'AI', count: 2, ranges: BOTH }],
    description: {
      de: '2 analoge Eingänge, Messbereich je Kanal 0–10 V oder 4–20 mA, Rohwert 0…27648. Bei 4–20 mA meldet der Kanal Drahtbruch mit 32767.',
      en: '2 analog inputs, measuring range per channel 0–10 V or 4–20 mA, raw value 0…27648. With 4–20 mA the channel reports a wire break with 32767.',
    },
  },
  ai4: {
    id: 'ai4',
    name: { de: 'AI 4' },
    kind: 'ai',
    width: 2,
    price: 5,
    channels: 4,
    io: [{ kind: 'AI', count: 4, ranges: BOTH }],
    description: {
      de: '4 analoge Eingänge, Messbereich je Kanal 0–10 V oder 4–20 mA, Rohwert 0…27648.',
      en: '4 analog inputs, measuring range per channel 0–10 V or 4–20 mA, raw value 0…27648.',
    },
  },
  rel4: {
    id: 'rel4',
    name: { de: 'REL 4' },
    kind: 'rel',
    width: 2,
    price: 3,
    channels: 4,
    delay: { on: 15, off: 30 },
    description: {
      de: '4 Relaisausgänge für Schütze/Leistung. Ansprechzeit 15 ms, Abfallzeit 30 ms.',
      en: '4 relay outputs for contactors/power. Pick-up time 15 ms, drop-out time 30 ms.',
    },
  },
  ao2: {
    id: 'ao2',
    name: { de: 'AO 2' },
    kind: 'ao',
    width: 1,
    price: 3,
    channels: 2,
    io: [{ kind: 'AO', count: 2, ranges: BOTH }],
    description: {
      de: '2 analoge Ausgänge, je Kanal 0–10 V oder 4–20 mA, Rohwert 0…27648.',
      en: '2 analog outputs, per channel 0–10 V or 4–20 mA, raw value 0…27648.',
    },
  },
};

export function channelKind(kind: ModuleKind): ChannelKind | undefined {
  if (kind === 'cpu' || kind === 'cp' || kind === 'dio' || kind === 'im') return undefined;
  // Relaisausgänge sind elektrisch Digitalausgänge
  if (kind === 'rel') return 'DO';
  return kind.toUpperCase() as ChannelKind;
}

/** Kanalgruppen einer Baugruppe (einfarbige Baugruppen: eine Gruppe) */
export function ioGroups(t: ModuleType): IoGroup[] {
  if (t.io) return t.io;
  const k = channelKind(t.kind);
  return k && t.channels ? [{ kind: k, count: t.channels }] : [];
}

/** Gruppe und Index innerhalb der Gruppe für einen Kanal */
export function channelInfo(
  t: ModuleType,
  ch: number,
): { group: IoGroup; index: number } | undefined {
  let base = 0;
  for (const group of ioGroups(t)) {
    if (ch < base + group.count) return ch >= base ? { group, index: ch - base } : undefined;
    base += group.count;
  }
  return undefined;
}

export function channelKindAt(t: ModuleType, ch: number): ChannelKind | undefined {
  return channelInfo(t, ch)?.group.kind;
}

export function moduleType(id: string): ModuleType {
  const t = MODULE_TYPES[id];
  if (!t) throw new Error(`Unbekannter Modultyp „${id}“`);
  return t;
}
