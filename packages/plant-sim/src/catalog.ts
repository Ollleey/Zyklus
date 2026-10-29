import type { AnalogRange, DeviceRole } from '@zyklus/sim-core';
import { num, str, type Params, type Part, type PartType } from './model';

/** Elektrischer Anschluss eines Bauteils (wird zum Feldgerät im Schaltschrank) */
export interface IoPoint {
  /** Zusatz zur Kennzeichnung bei mehreren Anschlüssen, z. B. „aus“ → 1A1_aus */
  key: string;
  kind: 'DI' | 'DO' | 'AI' | 'AO';
  label: string;
  role: DeviceRole;
  nc?: boolean;
  power?: boolean;
  analog?: { unit: string; min: number; max: number; noise?: number };
  signal?: AnalogRange;
}

export type Category = 'foerder' | 'aktor' | 'bedien' | 'sensor';

export interface PartInfo {
  type: PartType;
  name: string;
  category: Category;
  /** Buchstabe der automatischen Kennzeichnung (Zylinder: 1A1, 2A1 …) */
  prefix: string;
  defaults: Params;
  /** Grundfläche: Länge in Richtung, Breite quer, Bauhöhe */
  size: (p: Params) => { l: number; w: number; h: number };
  io: (part: Part) => IoPoint[];
}

const none = () => [];
const SENSOR = { l: 24, w: 16, h: 24 };
const sensorDi =
  (label: string) =>
  (part: Part): IoPoint[] => [
    { key: '', kind: 'DI', label, role: 'sensor', nc: str(part.params, 'contact', 'NO') === 'NC' },
  ];

export const CATALOG: Record<PartType, PartInfo> = {
  belt: {
    type: 'belt',
    name: 'Förderband',
    category: 'foerder',
    prefix: 'M',
    defaults: { length: 600, width: 80, speed: 120, drive: 'motor', reversible: false },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 40 }),
    io: (part) => {
      const p = part.params;
      if (str(p, 'drive') === 'vfd') {
        return [
          { key: 'frei', kind: 'DO', label: 'Freigabe Umrichter', role: 'actuator' },
          {
            key: 'soll',
            kind: 'AO',
            label: 'Drehzahlsollwert',
            role: 'actuator',
            analog: { unit: '%', min: 0, max: 100 },
            signal: '0-10V',
          },
        ];
      }
      const out: IoPoint[] = [
        { key: '', kind: 'DO', label: 'Bandmotor', role: 'motor', power: true },
      ];
      if (p.reversible === true) {
        out.push({ key: 'rueck', kind: 'DO', label: 'Rückwärts', role: 'motor', power: true });
      }
      return out;
    },
  },
  rollers: {
    type: 'rollers',
    name: 'Rollenbahn',
    category: 'foerder',
    prefix: 'R',
    defaults: { length: 400, width: 80, speed: 60 },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 40 }),
    io: none,
  },
  curve: {
    type: 'curve',
    name: 'Kurve',
    category: 'foerder',
    prefix: 'M',
    defaults: { radius: 200, width: 80, speed: 120 },
    size: (p) => ({ l: num(p, 'radius'), w: num(p, 'radius'), h: 40 }),
    io: () => [{ key: '', kind: 'DO', label: 'Kurvenmotor', role: 'motor', power: true }],
  },
  magazine: {
    type: 'magazine',
    name: 'Magazin',
    category: 'foerder',
    prefix: 'G',
    defaults: {
      capacity: 20,
      mode: 'manual',
      intervalMs: 3000,
      random: true,
      materials: ['stahl', 'holz'],
      colors: ['silber', 'natur'],
      sizes: ['mittel'],
      list: [],
    },
    size: () => ({ l: 80, w: 80, h: 120 }),
    io: (part) =>
      str(part.params, 'mode') === 'manual'
        ? [
            { key: 'aus', kind: 'DO', label: 'Ausschieben', role: 'valve' },
            { key: 'leer', kind: 'DI', label: 'Magazin leer', role: 'sensor' },
          ]
        : [{ key: 'leer', kind: 'DI', label: 'Magazin leer', role: 'sensor' }],
  },
  chute: {
    type: 'chute',
    name: 'Rutsche',
    category: 'foerder',
    prefix: 'R',
    defaults: { length: 300, width: 80, drop: 100, speed: 220 },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 20 }),
    io: none,
  },
  bin: {
    type: 'bin',
    name: 'Auffangbehälter',
    category: 'foerder',
    prefix: 'K',
    defaults: { width: 160, depth: 160, rule: 'alle' },
    size: (p) => ({ l: num(p, 'depth'), w: num(p, 'width'), h: 150 }),
    io: none,
  },
  diverter: {
    type: 'diverter',
    name: 'Weiche',
    category: 'foerder',
    prefix: 'Y',
    defaults: { length: 120, width: 80, side: 'links', speed: 250 },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 30 }),
    io: () => [{ key: '', kind: 'DO', label: 'Weiche umstellen', role: 'valve' }],
  },
  turntable: {
    type: 'turntable',
    name: 'Drehtisch',
    category: 'foerder',
    prefix: 'M',
    defaults: { diameter: 140, turnMs: 1000 },
    size: (p) => ({ l: num(p, 'diameter'), w: num(p, 'diameter'), h: 40 }),
    io: () => [
      { key: 'dreh', kind: 'DO', label: 'Drehen auf 90°', role: 'actuator' },
      { key: 'pos0', kind: 'DI', label: 'Endlage 0°', role: 'sensor' },
      { key: 'pos90', kind: 'DI', label: 'Endlage 90°', role: 'sensor' },
    ],
  },
  lift: {
    type: 'lift',
    name: 'Hubtisch',
    category: 'foerder',
    prefix: 'M',
    defaults: { length: 120, width: 100, stroke: 80, timeMs: 800 },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 40 }),
    io: () => [
      { key: 'heben', kind: 'DO', label: 'Heben', role: 'actuator' },
      { key: 'oben', kind: 'DI', label: 'Endlage oben', role: 'sensor' },
      { key: 'unten', kind: 'DI', label: 'Endlage unten', role: 'sensor' },
    ],
  },
  stopper: {
    type: 'stopper',
    name: 'Anschlag',
    category: 'foerder',
    prefix: 'Y',
    defaults: { width: 80, springOut: true },
    size: (p) => ({ l: 12, w: num(p, 'width'), h: 40 }),
    io: (part) => [
      {
        key: '',
        kind: 'DO',
        label: part.params.springOut === false ? 'Anschlag ausfahren' : 'Anschlag öffnen',
        role: 'valve',
      },
    ],
  },
  tank: {
    type: 'tank',
    name: 'Tank',
    category: 'foerder',
    prefix: 'T',
    defaults: { volume: 100, level0: 30, height: 300, diameter: 200, drain: 0 },
    size: (p) => ({ l: num(p, 'diameter'), w: num(p, 'diameter'), h: num(p, 'height') }),
    io: none,
  },
  pipe: {
    type: 'pipe',
    name: 'Rohrleitung',
    category: 'foerder',
    prefix: 'L',
    defaults: { length: 200 },
    size: (p) => ({ l: num(p, 'length'), w: 16, h: 16 }),
    io: none,
  },
  cylinder: {
    type: 'cylinder',
    name: 'Pneumatikzylinder',
    category: 'aktor',
    prefix: 'A',
    defaults: { stroke: 80, extendMs: 400, retractMs: 400, valve: '3/2' },
    size: () => ({ l: 60, w: 30, h: 30 }),
    io: (part) =>
      str(part.params, 'valve') === '5/2-bi'
        ? [
            { key: 'aus', kind: 'DO', label: 'Ausfahren (5/2, bistabil)', role: 'valve' },
            { key: 'ein', kind: 'DO', label: 'Einfahren (5/2, bistabil)', role: 'valve' },
          ]
        : [
            {
              key: 'aus',
              kind: 'DO',
              label: `Ausfahren (${str(part.params, 'valve', '3/2')})`,
              role: 'valve',
            },
          ],
  },
  pump: {
    type: 'pump',
    name: 'Pumpe',
    category: 'aktor',
    prefix: 'M',
    defaults: { flow: 2, tank: '' },
    size: () => ({ l: 60, w: 60, h: 60 }),
    io: () => [{ key: '', kind: 'DO', label: 'Pumpe', role: 'motor', power: true }],
  },
  valve: {
    type: 'valve',
    name: 'Magnetventil',
    category: 'aktor',
    prefix: 'Y',
    defaults: { flow: 3, tank: '' },
    size: () => ({ l: 40, w: 30, h: 40 }),
    io: () => [{ key: '', kind: 'DO', label: 'Ventil auf', role: 'valve' }],
  },
  lamp: {
    type: 'lamp',
    name: 'Meldeleuchte',
    category: 'aktor',
    prefix: 'H',
    defaults: { color: 'gruen' },
    size: () => ({ l: 24, w: 24, h: 24 }),
    io: () => [{ key: '', kind: 'DO', label: 'Leuchte', role: 'lamp' }],
  },
  horn: {
    type: 'horn',
    name: 'Hupe',
    category: 'aktor',
    prefix: 'H',
    defaults: {},
    size: () => ({ l: 30, w: 30, h: 30 }),
    io: () => [{ key: '', kind: 'DO', label: 'Hupe', role: 'actuator' }],
  },
  traffic: {
    type: 'traffic',
    name: 'Ampel',
    category: 'aktor',
    prefix: 'H',
    defaults: {},
    size: () => ({ l: 30, w: 30, h: 90 }),
    io: () => [
      { key: 'rot', kind: 'DO', label: 'Ampel rot', role: 'lamp' },
      { key: 'gelb', kind: 'DO', label: 'Ampel gelb', role: 'lamp' },
      { key: 'gruen', kind: 'DO', label: 'Ampel grün', role: 'lamp' },
    ],
  },
  button: {
    type: 'button',
    name: 'Taster',
    category: 'bedien',
    prefix: 'S',
    defaults: { contact: 'NO', color: 'gruen' },
    size: () => ({ l: 30, w: 30, h: 20 }),
    io: (part) => [
      {
        key: '',
        kind: 'DI',
        label: 'Taster',
        role: 'button',
        nc: str(part.params, 'contact', 'NO') === 'NC',
      },
    ],
  },
  switch: {
    type: 'switch',
    name: 'Schalter',
    category: 'bedien',
    prefix: 'S',
    defaults: {},
    size: () => ({ l: 30, w: 30, h: 20 }),
    io: () => [{ key: '', kind: 'DI', label: 'Schalter', role: 'switch' }],
  },
  estop: {
    type: 'estop',
    name: 'Not-Halt',
    category: 'bedien',
    prefix: 'S',
    defaults: {},
    size: () => ({ l: 40, w: 40, h: 30 }),
    io: () => [{ key: '', kind: 'DI', label: 'Not-Halt', role: 'button', nc: true }],
  },
  selector: {
    type: 'selector',
    name: 'Wahlschalter Hand/Auto',
    category: 'bedien',
    prefix: 'S',
    defaults: {},
    size: () => ({ l: 30, w: 30, h: 20 }),
    io: () => [
      { key: 'hand', kind: 'DI', label: 'Hand', role: 'switch' },
      { key: 'auto', kind: 'DI', label: 'Auto', role: 'switch' },
    ],
  },
  poti: {
    type: 'poti',
    name: 'Potentiometer',
    category: 'bedien',
    prefix: 'R',
    defaults: {},
    size: () => ({ l: 30, w: 30, h: 20 }),
    io: () => [
      {
        key: '',
        kind: 'AI',
        label: 'Sollwert',
        role: 'sensor',
        analog: { unit: '%', min: 0, max: 100, noise: 10 },
        signal: '0-10V',
      },
    ],
  },
  inductive: {
    type: 'inductive',
    name: 'Induktiver Sensor',
    category: 'sensor',
    prefix: 'B',
    defaults: { range: 8, contact: 'NO', responseMs: 2, hysteresis: 1 },
    size: () => SENSOR,
    io: sensorDi('induktiv'),
  },
  capacitive: {
    type: 'capacitive',
    name: 'Kapazitiver Sensor',
    category: 'sensor',
    prefix: 'B',
    defaults: { range: 15, contact: 'NO', responseMs: 5, hysteresis: 2 },
    size: () => SENSOR,
    io: sensorDi('kapazitiv'),
  },
  diffuse: {
    type: 'diffuse',
    name: 'Optischer Taster',
    category: 'sensor',
    prefix: 'B',
    defaults: { range: 120, contact: 'NO', responseMs: 1, hysteresis: 5 },
    size: () => SENSOR,
    io: sensorDi('optisch'),
  },
  thrubeam: {
    type: 'thrubeam',
    name: 'Einweg-Lichtschranke',
    category: 'sensor',
    prefix: 'B',
    defaults: { length: 120, contact: 'NO', responseMs: 1 },
    size: () => SENSOR,
    io: sensorDi('Lichtschranke'),
  },
  retro: {
    type: 'retro',
    name: 'Reflexions-Lichtschranke',
    category: 'sensor',
    prefix: 'B',
    defaults: { length: 120, contact: 'NO', responseMs: 1, polfilter: true },
    size: () => SENSOR,
    io: sensorDi('Reflexions-Lichtschranke'),
  },
  color: {
    type: 'color',
    name: 'Farbsensor',
    category: 'sensor',
    prefix: 'B',
    defaults: { range: 20, mode: 'di', target: 'rot', responseMs: 3 },
    size: () => SENSOR,
    io: (part) =>
      str(part.params, 'mode') === 'code'
        ? [
            {
              key: '',
              kind: 'AI',
              label: 'Farbcode',
              role: 'sensor',
              analog: { unit: 'Code', min: 0, max: 27648 },
              signal: '0-10V',
            },
          ]
        : [{ key: '', kind: 'DI', label: `Farbe ${str(part.params, 'target')}`, role: 'sensor' }],
  },
  ultrasonic: {
    type: 'ultrasonic',
    name: 'Ultraschallsensor',
    category: 'sensor',
    prefix: 'B',
    defaults: { range: 400, blind: 30, facing: 'unten' },
    size: () => SENSOR,
    io: (part) => [
      {
        key: '',
        kind: 'AI',
        label: 'Abstand',
        role: 'sensor',
        analog: { unit: 'mm', min: 0, max: num(part.params, 'range', 400), noise: 20 },
        signal: '4-20mA',
      },
    ],
  },
  limit: {
    type: 'limit',
    name: 'Endschalter',
    category: 'sensor',
    prefix: 'B',
    defaults: { contact: 'NO', bounce: true },
    size: () => ({ l: 20, w: 16, h: 24 }),
    io: sensorDi('Endschalter'),
  },
  reed: {
    type: 'reed',
    name: 'Zylinderschalter',
    category: 'sensor',
    prefix: 'B',
    defaults: { cylinder: '', position: 'aus' },
    size: () => ({ l: 16, w: 10, h: 10 }),
    io: sensorDi('Zylinderschalter'),
  },
  loadcell: {
    type: 'loadcell',
    name: 'Wägezelle',
    category: 'sensor',
    prefix: 'B',
    defaults: { length: 100, width: 100, max: 1000 },
    size: (p) => ({ l: num(p, 'length'), w: num(p, 'width'), h: 30 }),
    io: (part) => [
      {
        key: '',
        kind: 'AI',
        label: 'Masse',
        role: 'sensor',
        analog: { unit: 'g', min: 0, max: num(part.params, 'max', 1000), noise: 15 },
        signal: '4-20mA',
      },
    ],
  },
  level: {
    type: 'level',
    name: 'Füllstandssensor',
    category: 'sensor',
    prefix: 'B',
    defaults: { tank: '' },
    size: () => SENSOR,
    io: () => [
      {
        key: '',
        kind: 'AI',
        label: 'Füllstand',
        role: 'sensor',
        analog: { unit: '%', min: 0, max: 100, noise: 30 },
        signal: '4-20mA',
      },
    ],
  },
  levelswitch: {
    type: 'levelswitch',
    name: 'Grenzwertschalter',
    category: 'sensor',
    prefix: 'B',
    defaults: { tank: '', at: 80, contact: 'NO' },
    size: () => SENSOR,
    io: sensorDi('Grenzwert'),
  },
};

/** Nächste freie Kennzeichnung für einen Bauteiltyp (Zylinder: 1A1, 2A1 …) */
export function nextTag(type: PartType, parts: Part[]): string {
  const info = CATALOG[type];
  const used = new Set(parts.map((p) => p.tag));
  for (let n = 1; ; n++) {
    const tag = info.prefix === 'A' ? `${n}A1` : `${info.prefix}${n}`;
    if (!used.has(tag)) return tag;
  }
}

/** Neues Bauteil mit Standardwerten */
export function createPart(
  type: PartType,
  parts: Part[],
  at: { x: number; y: number; z?: number },
): Part {
  const id = `p${parts.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0) + 1}`;
  const params = structuredClone(CATALOG[type].defaults);
  return { id, type, tag: nextTag(type, parts), x: at.x, y: at.y, z: at.z ?? 100, rot: 0, params };
}
