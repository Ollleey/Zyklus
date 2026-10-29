import { CPU_TYPES, type CpuType } from '../catalog';
import type { Text } from './text';

export type ModuleKind = 'cpu' | 'di' | 'do' | 'ai' | 'ao' | 'rel' | 'cp';
export type ChannelKind = 'DI' | 'DO' | 'AI' | 'AO';

export interface ModuleType {
  id: string;
  name: Text;
  kind: ModuleKind;
  /** Breite in Steckplätzen der Hutschiene */
  width: number;
  price: number;
  /** Anzahl E/A-Kanäle (CPU: 0) */
  channels: number;
  cpu?: CpuType;
  /** Relaisausgang: Ansprech- und Abfallverzögerung in ms */
  delay?: { on: number; off: number };
  /** Eingänge können einen Prozessalarm (OB40) auslösen */
  alarms?: boolean;
  description: Text;
}

/** Koppelmodul: Sende-/Empfangswörter je CPU (wie PUT/GET, 1 Zyklus Latenz) */
export const COUPLER_WORDS = 2;
export const COUPLER_BASE = 100;

const cpu = (key: keyof typeof CPU_TYPES, description: string): ModuleType => {
  const c = CPU_TYPES[key];
  return {
    id: `cpu-${key}`,
    name: { de: c.name },
    kind: 'cpu',
    width: c.width,
    price: c.price,
    channels: 0,
    cpu: c,
    description: { de: description },
  };
};

export const MODULE_TYPES: Record<string, ModuleType> = {
  'cpu-klein': cpu('klein', '10 ms Zyklus, bis 40 SCL-Anweisungen bzw. 10 Netzwerke.'),
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
      de: '8 schnelle digitale Eingänge; jede Flanke kann einen Prozessalarm (OB40) auslösen.',
    },
  },
  kop: {
    id: 'kop',
    name: { de: 'KOP' },
    kind: 'cp',
    width: 1,
    price: 3,
    channels: 0,
    description: {
      de: 'Koppelmodul: tauscht mit dem Koppelmodul der Nachbar-CPU je 2 Wörter aus. Senden über %QW100/%QW102, Empfang über %IW100/%IW102. Was eine CPU am Zyklusende sendet, liest die Partner-CPU ab ihrem nächsten Zyklus.',
    },
  },
  di8: {
    id: 'di8',
    name: { de: 'DI 8' },
    kind: 'di',
    width: 1,
    price: 2,
    channels: 8,
    description: { de: '8 digitale Eingänge, 24 V.' },
  },
  do8: {
    id: 'do8',
    name: { de: 'DO 8' },
    kind: 'do',
    width: 1,
    price: 2,
    channels: 8,
    description: { de: '8 digitale Ausgänge, 24 V / 0,5 A.' },
  },
  ai2: {
    id: 'ai2',
    name: { de: 'AI 2' },
    kind: 'ai',
    width: 1,
    price: 3,
    channels: 2,
    description: { de: '2 analoge Eingänge, Rohwert 0…27648.' },
  },
  rel4: {
    id: 'rel4',
    name: { de: 'REL 4' },
    kind: 'rel',
    width: 1,
    price: 3,
    channels: 4,
    delay: { on: 15, off: 30 },
    description: {
      de: '4 Relaisausgänge für Schütze/Leistung. Ansprechzeit 15 ms, Abfallzeit 30 ms.',
    },
  },
  ao2: {
    id: 'ao2',
    name: { de: 'AO 2' },
    kind: 'ao',
    width: 1,
    price: 3,
    channels: 2,
    description: { de: '2 analoge Ausgänge, Rohwert 0…27648.' },
  },
};

export function channelKind(kind: ModuleKind): ChannelKind | undefined {
  if (kind === 'cpu' || kind === 'cp') return undefined;
  // Relaisausgänge sind elektrisch Digitalausgänge
  if (kind === 'rel') return 'DO';
  return kind.toUpperCase() as ChannelKind;
}

export function moduleType(id: string): ModuleType {
  const t = MODULE_TYPES[id];
  if (!t) throw new Error(`Unbekannter Modultyp „${id}“`);
  return t;
}
