import { CATALOG } from './catalog';
import { COLORS, MATERIALS, SIZES } from './materials';
import type { PartType } from './model';

/** Beschreibung eines einstellbaren Parameters für den Inspektor */
export type ParamSpec =
  | {
      key: string;
      label: string;
      kind: 'num';
      unit?: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | { key: string; label: string; kind: 'bool' }
  | { key: string; label: string; kind: 'select'; options: [string, string][] }
  | { key: string; label: string; kind: 'multi'; options: [string, string][] }
  /** Verweis auf ein anderes Bauteil (Kennzeichnung) */
  | { key: string; label: string; kind: 'ref'; of: PartType };

const n = (
  key: string,
  label: string,
  unit?: string,
  min = 0,
  max?: number,
  step?: number,
): ParamSpec => ({
  key,
  label,
  kind: 'num',
  unit,
  min,
  max,
  step,
});
const b = (key: string, label: string): ParamSpec => ({ key, label, kind: 'bool' });
const sel = (key: string, label: string, options: [string, string][]): ParamSpec => ({
  key,
  label,
  kind: 'select',
  options,
});

const CONTACT = sel('contact', 'Schaltausgang', [
  ['NO', 'Schließer'],
  ['NC', 'Öffner'],
]);
const RESPONSE = n('responseMs', 'Ansprechzeit', 'ms', 0, 100);
const HYST = n('hysteresis', 'Schalthysterese', 'mm', 0, 50, 0.5);
const COLOR_OPTS = Object.values(COLORS).map((c) => [c.id, c.name] as [string, string]);
const LIGHT = sel('color', 'Farbe', [
  ['gruen', 'Grün'],
  ['gelb', 'Gelb'],
  ['rot', 'Rot'],
  ['weiss', 'Weiß'],
  ['blau', 'Blau'],
]);

export const PARAMS: Record<PartType, ParamSpec[]> = {
  belt: [
    n('length', 'Länge', 'mm', 100, 3000, 10),
    n('width', 'Breite', 'mm', 40, 300, 10),
    n('speed', 'Geschwindigkeit', 'mm/s', 10, 1000, 10),
    sel('drive', 'Antrieb', [
      ['motor', 'Motor (Schütz)'],
      ['vfd', 'Umrichter (Freigabe + Sollwert)'],
    ]),
    b('reversible', 'Wendeschütz (rückwärts)'),
  ],
  rollers: [
    n('length', 'Länge', 'mm', 100, 3000, 10),
    n('width', 'Breite', 'mm', 40, 300, 10),
    n('speed', 'Geschwindigkeit', 'mm/s', 0, 500, 10),
  ],
  curve: [
    n('radius', 'Außenradius', 'mm', 100, 800, 10),
    n('width', 'Breite', 'mm', 40, 300, 10),
    n('speed', 'Geschwindigkeit', 'mm/s', 10, 1000, 10),
  ],
  magazine: [
    sel('mode', 'Ausgabe', [
      ['manual', 'Ausschieben über Ausgang'],
      ['auto', 'im Takt'],
    ]),
    n('intervalMs', 'Takt', 'ms', 200, 60000, 100),
    n('capacity', 'Füllung', 'Stück', 1, 10000, 1),
    b('random', 'Zufallsmix (sonst Liste)'),
    {
      key: 'materials',
      label: 'Werkstoffe',
      kind: 'multi',
      options: Object.values(MATERIALS).map((m) => [m.id, m.name]),
    },
    { key: 'colors', label: 'Farben', kind: 'multi', options: COLOR_OPTS },
    {
      key: 'sizes',
      label: 'Größen',
      kind: 'multi',
      options: Object.entries(SIZES).map(([k, v]) => [k, v.name]),
    },
  ],
  chute: [
    n('length', 'Länge', 'mm', 50, 2000, 10),
    n('width', 'Breite', 'mm', 40, 300, 10),
    n('drop', 'Gefälle', 'mm', 0, 1000, 10),
    n('speed', 'Rutschgeschwindigkeit', 'mm/s', 10, 2000, 10),
  ],
  bin: [
    n('width', 'Breite', 'mm', 60, 600, 10),
    n('depth', 'Tiefe', 'mm', 60, 600, 10),
    sel('rule', 'Soll-Inhalt', [
      ['alle', 'alles'],
      ['metall', 'nur Metall'],
      ['nichtmetall', 'kein Metall'],
      ...Object.values(MATERIALS).map((m) => [`mat:${m.id}`, `nur ${m.name}`] as [string, string]),
      ...Object.values(COLORS).map((c) => [`farbe:${c.id}`, `nur ${c.name}`] as [string, string]),
    ]),
  ],
  diverter: [
    n('length', 'Länge', 'mm', 40, 600, 10),
    n('width', 'Breite', 'mm', 40, 300, 10),
    sel('side', 'Auswurf nach', [
      ['links', 'links'],
      ['rechts', 'rechts'],
    ]),
    n('speed', 'Querschub', 'mm/s', 50, 1000, 10),
  ],
  turntable: [
    n('diameter', 'Durchmesser', 'mm', 60, 600, 10),
    n('turnMs', 'Drehzeit 90°', 'ms', 100, 10000, 50),
  ],
  lift: [
    n('length', 'Länge', 'mm', 40, 600, 10),
    n('width', 'Breite', 'mm', 40, 600, 10),
    n('stroke', 'Hub', 'mm', 10, 1000, 10),
    n('timeMs', 'Hubzeit', 'ms', 100, 10000, 50),
  ],
  stopper: [
    n('width', 'Breite', 'mm', 20, 300, 10),
    b('springOut', 'federnd ausgefahren (Ausgang öffnet)'),
  ],
  tank: [
    n('volume', 'Inhalt', 'l', 1, 10000, 1),
    n('level0', 'Anfangsfüllung', '%', 0, 100, 1),
    n('height', 'Höhe', 'mm', 50, 2000, 10),
    n('diameter', 'Durchmesser', 'mm', 50, 2000, 10),
    n('drain', 'Verbrauch', 'l/s', 0, 100, 0.1),
  ],
  pipe: [n('length', 'Länge', 'mm', 20, 3000, 10)],
  cylinder: [
    n('stroke', 'Hub', 'mm', 10, 500, 5),
    n('extendMs', 'Ausfahrzeit', 'ms', 50, 5000, 10),
    n('retractMs', 'Einfahrzeit', 'ms', 50, 5000, 10),
    sel('valve', 'Ventil', [
      ['3/2', '3/2, einfachwirkend mit Feder'],
      ['5/2', '5/2 monostabil, doppeltwirkend'],
      ['5/2-bi', '5/2 bistabil (zwei Spulen)'],
    ]),
  ],
  pump: [
    n('flow', 'Förderstrom', 'l/s', 0, 100, 0.1),
    { key: 'tank', label: 'Tank', kind: 'ref', of: 'tank' },
  ],
  valve: [
    n('flow', 'Durchfluss', 'l/s', 0, 100, 0.1),
    { key: 'tank', label: 'Tank', kind: 'ref', of: 'tank' },
  ],
  lamp: [LIGHT],
  horn: [],
  traffic: [],
  gauge: [],
  button: [CONTACT, LIGHT],
  switch: [],
  estop: [],
  selector: [],
  poti: [],
  inductive: [n('range', 'Schaltabstand (Stahl)', 'mm', 1, 60, 0.5), HYST, RESPONSE, CONTACT],
  capacitive: [n('range', 'Schaltabstand (Metall)', 'mm', 1, 60, 0.5), HYST, RESPONSE, CONTACT],
  diffuse: [n('range', 'Tastweite (weiß)', 'mm', 10, 1000, 5), HYST, RESPONSE, CONTACT],
  thrubeam: [n('length', 'Abstand zum Empfänger', 'mm', 20, 3000, 10), RESPONSE, CONTACT],
  retro: [
    n('length', 'Abstand zum Reflektor', 'mm', 20, 3000, 10),
    b('polfilter', 'Polfilter'),
    RESPONSE,
    CONTACT,
  ],
  color: [
    n('range', 'Tastweite', 'mm', 5, 60, 1),
    sel('mode', 'Ausgang', [
      ['di', 'DI für eine Farbe'],
      ['code', 'Farbcode als INT'],
    ]),
    sel('target', 'eingelernte Farbe', COLOR_OPTS),
    RESPONSE,
  ],
  ultrasonic: [
    n('range', 'Messbereich', 'mm', 50, 5000, 10),
    n('blind', 'Blindzone', 'mm', 0, 500, 5),
    sel('facing', 'Blickrichtung', [
      ['unten', 'nach unten'],
      ['vorn', 'nach vorn'],
    ]),
  ],
  limit: [CONTACT, b('bounce', 'prellt')],
  reed: [
    { key: 'cylinder', label: 'Zylinder', kind: 'ref', of: 'cylinder' },
    sel('position', 'Endlage', [
      ['aus', 'ausgefahren'],
      ['ein', 'eingefahren'],
    ]),
  ],
  loadcell: [
    n('length', 'Länge', 'mm', 40, 600, 10),
    n('width', 'Breite', 'mm', 40, 600, 10),
    n('max', 'Messbereich', 'g', 10, 100000, 10),
  ],
  level: [{ key: 'tank', label: 'Tank', kind: 'ref', of: 'tank' }],
  levelswitch: [
    { key: 'tank', label: 'Tank', kind: 'ref', of: 'tank' },
    n('at', 'Schaltpunkt', '%', 0, 100, 1),
    CONTACT,
  ],
};

/** Störungen, die sich im Inspektor einschalten lassen */
export function faultsOf(type: PartType): [string, string][] {
  const info = CATALOG[type];
  const out: [string, string][] = [];
  if (info.category === 'sensor' || type === 'button' || type === 'switch') {
    out.push(['dauer0', 'Sensor defekt: dauernd 0'], ['dauer1', 'Sensor defekt: dauernd 1']);
  }
  if (type === 'cylinder' || type === 'lift' || type === 'turntable')
    out.push(['klemmt', 'klemmt']);
  if (type === 'belt' || type === 'curve') out.push(['blockiert', 'Band blockiert']);
  if (info.io({ id: '', type, tag: '', x: 0, y: 0, z: 0, rot: 0, params: info.defaults }).length)
    out.push(['drahtbruch', 'Drahtbruch']);
  return out;
}
