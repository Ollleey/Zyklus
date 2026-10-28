import { CPU_TYPES, type CpuType } from '../catalog';
import type { Text } from './text';

export type ModuleKind = 'cpu' | 'di' | 'do' | 'ai' | 'ao';
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
  description: Text;
}

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
  'cpu-mittel': cpu('mittel', '5 ms Zyklus, mehr Programmspeicher, Weckalarm.'),
  'cpu-schnell': cpu('schnell', '1 ms Zyklus, Prozessalarm.'),
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
  return kind === 'cpu' ? undefined : (kind.toUpperCase() as ChannelKind);
}

export function moduleType(id: string): ModuleType {
  const t = MODULE_TYPES[id];
  if (!t) throw new Error(`Unbekannter Modultyp „${id}“`);
  return t;
}
