import { Rng, type Text } from '@zyklus/sim-core';
import {
  CATALOG,
  connectionsOf,
  type Layout,
  type Params,
  type Part,
  type PartType,
  type PublishTest,
  type Rot,
  type Rule,
  type ScenarioEvent,
  type WorkpieceSpec,
} from '@zyklus/plant-sim';
import type { Difficulty } from './code';
import { sign, type Customer } from './texts';

/**
 * Baupläne für Zufallsaufträge. Jeder Bauplan erzeugt aus Zufallswerten eine Anlage, die
 * Testfälle, die Musterlösung (SCL) und Stellen für eingebaute Fehler (Bestandsanlage).
 * Die Geometrie folgt den Vorlagen des Sandkastens; der Generator prüft jede Musterlösung,
 * bevor ein Auftrag ausgegeben wird.
 */

export interface Mutation {
  from: string;
  to: string;
  /** Beschwerde der Kundschaft: was an der Anlage auffällt */
  symptom: Text;
}

export interface Draft {
  layout: Layout;
  cpu: string;
  source: string;
  tests: PublishTest[];
  title: Text;
  mail: Text;
  notes: Text;
  mutations: Mutation[];
}

const DB_HEAD = `{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN`;

function part(
  id: string,
  type: PartType,
  tag: string,
  x: number,
  y: number,
  z: number,
  rot: Rot = 0,
  params: Params = {},
): Part {
  return {
    id,
    type,
    tag,
    x,
    y,
    z,
    rot,
    params: { ...structuredClone(CATALOG[type].defaults), ...params },
  };
}

/** Variablenname eines Anschlusses (Namensvorschlag des Geräts) */
function tagOf(layout: Layout, partTag: string, key = ''): string {
  const c = connectionsOf(layout).find((x) => x.part.tag === partTag && x.io.key === key);
  if (!c) throw new Error(`kein Anschluss ${partTag}.${key}`);
  return c.device.tag!;
}

const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

// ---------------------------------------------------------------------------------------------
// Sortieranlage: Magazin, Band, 1–3 Auswerferstationen, Endbehälter
// ---------------------------------------------------------------------------------------------

interface Category {
  spec: WorkpieceSpec;
  /** Sensor der Station und Soll-Regel des Behälters */
  sensor: 'inductive' | 'color';
  rule: string;
  de: string;
  en: string;
}

const METAL: Category[] = [
  {
    spec: { material: 'stahl', color: 'silber', size: 'mittel' },
    sensor: 'inductive',
    rule: 'metall',
    de: 'Stahlteile',
    en: 'steel parts',
  },
  {
    spec: { material: 'aluminium', color: 'silber', size: 'mittel' },
    sensor: 'inductive',
    rule: 'metall',
    de: 'Aluminiumteile',
    en: 'aluminium parts',
  },
];
const PLASTIC: Category[] = (
  [
    ['rot', 'rote', 'red'],
    ['blau', 'blaue', 'blue'],
    ['schwarz', 'schwarze', 'black'],
  ] as const
).map(([color, de, en]) => ({
  spec: { material: 'kunststoff', color, size: 'mittel' },
  sensor: 'color',
  rule: `farbe:${color}`,
  de: `${de} Kunststoffteile`,
  en: `${en} plastic parts`,
}));
const WOOD: Category = {
  spec: { material: 'holz', color: 'natur', size: 'mittel' },
  sensor: 'color',
  rule: 'mat:holz',
  de: 'Holzteile',
  en: 'wooden parts',
};

/** Regel des Endbehälters für die übrigen Teile */
const restRule = (c: Category) =>
  c.spec.material === 'kunststoff'
    ? `farbe:${c.spec.color}`
    : c.spec.material === 'holz'
      ? 'mat:holz'
      : 'metall';

export function sortier(rng: Rng, d: Difficulty, customer: Customer): Draft {
  const n = d === 'L' ? 1 : d === 'G' ? 2 : 3;
  // Kategorien: höchstens eine Metallsorte (der induktive Sensor unterscheidet sie nicht)
  const pool = shuffle(rng, [METAL[rng.int(0, 1)]!, ...shuffle(rng, PLASTIC).slice(0, 2), WOOD]);
  const stations = pool
    .slice(0, n)
    .map((c) => (c === WOOD ? { ...c, sensor: 'color' as const } : c));
  // Holz an einer Station: Farbsensor auf „natur“
  const rest = pool[n]!;
  const cats = [...stations, rest];

  const interval = d === 'L' ? 2500 : d === 'G' ? 1800 : 1400;
  const count = d === 'L' ? 8 : d === 'G' ? 12 : 15;
  // jede Kategorie mindestens zweimal, Rest zufällig, dann gemischt
  const list: WorkpieceSpec[] = [];
  for (const c of cats) list.push({ ...c.spec }, { ...c.spec });
  while (list.length < count) list.push({ ...cats[rng.int(0, cats.length - 1)]!.spec });
  const order = shuffle(rng, list);

  const L = 600 + 250 * (n - 1);
  const parts: Part[] = [
    part('p1', 'magazine', 'G1', -45, 200, 100, 0, {
      mode: 'auto',
      intervalMs: interval,
      random: false,
      list: order,
      capacity: order.length,
    }),
    part('p2', 'belt', 'M1', L / 2, 200, 100, 0, { length: L }),
    part('p3', 'switch', 'S1', -60, 380, 0),
    part('p4', 'lamp', 'H1', -10, 380, 0),
  ];
  if (d === 'M') parts.push(part('p5', 'estop', 'S0', 50, 380, 0));
  stations.forEach((c, i) => {
    const base = 420 + 250 * i;
    const k = i + 1;
    parts.push(
      part(`s${k}ls`, 'thrubeam', `B${k}1`, base + 20, 150, 115, 90, { length: 100 }),
      c.sensor === 'inductive'
        ? // Aluminium: Reduktionsfaktor 0,4 – Sensor mit größerem Schaltabstand
          part(`s${k}det`, 'inductive', `B${k}2`, base - 10, 164, 115, 90, {
            range: c.spec.material === 'aluminium' ? 20 : 8,
          })
        : part(`s${k}det`, 'color', `B${k}2`, base - 10, 164, 115, 90, {
            target: c.spec.color,
          }),
      part(`s${k}cyl`, 'cylinder', `${k}A1`, base, 290, 100, 270, {
        stroke: 130,
        extendMs: 300,
        retractMs: 300,
      }),
      part(`s${k}reed`, 'reed', `B${k}3`, base + 30, 300, 100, 0, {
        cylinder: `${k}A1`,
        position: 'aus',
      }),
      part(`s${k}bin`, 'bin', `K${k}`, base, 70, 60, 0, { rule: c.rule }),
    );
  });
  parts.push(part('pend', 'bin', `K${n + 1}`, L + 90, 200, 60, 0, { rule: restRule(rest) }));
  const layout: Layout = {
    formatVersion: 1,
    seed: rng.int(1, 9999),
    area: { w: 2400, h: 1200 },
    parts,
  };

  const tg = (t: string, key = '') => tagOf(layout, t, key);
  const blocks = stations.map((_, i) => {
    const k = i + 1;
    return `	// Station ${k}: Teil an der Lichtschranke und Merkmal erkannt → auswerfen
	IF "${tg(`B${k}1`)}" AND "${tg(`B${k}2`)}" THEN
	    "Sort".Aus${k} := TRUE;
	END_IF;
	IF "${tg(`B${k}3`)}" THEN
	    "Sort".Aus${k} := FALSE;
	END_IF;
	"${tg(`${k}A1`, 'aus')}" := "Sort".Aus${k};`;
  });
  const busy = stations.map((_, i) => `"Sort".Aus${i + 1}`).join(' OR ');
  const estop = d === 'M' ? ` AND "${tg('S0')}"` : '';
  const source = `DATA_BLOCK "Sort"
${DB_HEAD}
   VAR
${stations.map((_, i) => `      Aus${i + 1} : Bool;   // Zylinder ${i + 1}A1 fährt aus`).join('\n')}
   END_VAR

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
TITLE = Sortieranlage
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
${blocks.join('\n\n')}

	// Band steht, solange ein Zylinder arbeitet
	"${tg('M1')}" := "${tg('S1')}"${estop} AND NOT (${busy});
	"${tg('H1')}" := "${tg('S1')}";
END_ORGANIZATION_BLOCK
`;

  const travel = (L / 120) * 1000;
  const duration =
    Math.ceil((order.length * interval + travel + 800 * order.length + 4000) / 5000) * 5000;
  const counts = cats.map(
    (c) => order.filter((s) => s.material === c.spec.material && s.color === c.spec.color).length,
  );
  const rules: Rule[] = [
    { kind: 'sorted' },
    { kind: 'noLoss' },
    ...cats.map((_, i) => ({ kind: 'minIn' as const, bin: `K${i + 1}`, n: counts[i]! })),
  ];
  const start: ScenarioEvent = { kind: 'control', at: 100, ref: 'S1', value: true };
  const tests: PublishTest[] = [
    { name: 'Normalbetrieb', durationMs: duration, seeds: [layout.seed], events: [start], rules },
  ];
  let estopAt = 0;
  if (d === 'M') {
    estopAt = rng.int(8, 14) * 1000;
    tests.push({
      name: 'Not-Halt',
      durationMs: estopAt + 8000,
      seeds: [layout.seed],
      events: [start, { kind: 'control', at: estopAt, jitter: 2000, ref: 'S0', value: true }],
      rules: [{ kind: 'sorted' }, { kind: 'offFrom', output: 'M1', fromMs: estopAt + 2300 }],
    });
  }

  const what = (en: boolean) =>
    stations
      .map((c, i) => `- ${en ? c.en : c.de} → ${en ? 'bin' : 'Behälter'} K${i + 1}`)
      .concat(
        `- ${en ? 'all other parts' : 'alle übrigen Teile'} (${en ? rest.en : rest.de}) → K${n + 1}`,
      )
      .join('\n');
  const mail = (en: boolean) =>
    [
      en
        ? `Our new sorting line needs a controller. The magazine G1 issues mixed parts onto belt M1; switch S1 turns the line on, lamp H1 shows that it is on.`
        : `Unsere neue Sortieranlage braucht eine Steuerung. Das Magazin G1 gibt gemischte Teile auf das Band M1; Schalter S1 schaltet die Anlage ein, Leuchte H1 zeigt das an.`,
      en ? 'Please sort:' : 'Bitte so sortieren:',
      what(en),
      en
        ? `At each station a through-beam sensor (B·1) reports a part in front of the ejector, the sensor opposite (B·2) the feature. The belt has to stop while a cylinder ejects.`
        : `An jeder Station meldet eine Lichtschranke (B·1) ein Teil vor dem Auswerfer, der Sensor gegenüber (B·2) das Merkmal. Während ein Zylinder auswirft, muss das Band stehen.`,
      ...(d === 'M'
        ? [
            en
              ? `Emergency stop S0 must stop the belt at once (it stays latched).`
              : `Not-Halt S0 muss das Band sofort anhalten (er bleibt verrastet).`,
          ]
        : []),
      sign(customer, en),
    ].join('\n\n');
  const alu = stations.some((c) => c.spec.material === 'aluminium');
  const notes = (en: boolean) =>
    en
      ? `${order.length} parts, one every ${interval / 1000} s. Cylinders: extend 0.3 s, reed switch B·3 at the front end position.${alu ? ' The inductive sensor has a 20 mm sensing range: aluminium only reaches 0.4 of it.' : ''}`
      : `${order.length} Teile, alle ${interval / 1000} s eines. Zylinder: 0,3 s Hub, Zylinderschalter B·3 in der vorderen Endlage.${alu ? ' Der induktive Sensor hat 20 mm Schaltabstand: Aluminium erreicht davon nur 0,4.' : ''}`;

  const mutations: Mutation[] = [];
  const k1 = 1;
  mutations.push({
    from: `IF "${tg(`B${k1}1`)}" AND "${tg(`B${k1}2`)}" THEN`,
    to: `IF "${tg(`B${k1}1`)}" OR "${tg(`B${k1}2`)}" THEN`,
    symptom: {
      de: 'Station 1 wirft ständig Teile aus, auch solche, die gar nicht dorthin gehören.',
      en: 'Station 1 keeps ejecting parts, even ones that do not belong there.',
    },
  });
  mutations.push({
    from: ` AND NOT (${busy});`,
    to: ';',
    symptom: {
      de: 'Manche Teile rutschen am Auswerfer vorbei oder werden schief erwischt.',
      en: 'Some parts slip past the ejector or are hit at an angle.',
    },
  });
  mutations.push({
    from: `	IF "${tg(`B${k1}3`)}" THEN\n	    "Sort".Aus${k1} := FALSE;`,
    to: `	IF "${tg(`B${k1}1`)}" THEN\n	    "Sort".Aus${k1} := FALSE;`,
    symptom: {
      de: 'Der Zylinder 1A1 zuckt nur kurz, die Teile bleiben auf dem Band.',
      en: 'Cylinder 1A1 only twitches, the parts stay on the belt.',
    },
  });
  if (n >= 2)
    mutations.push({
      from: `IF "${tg('B21')}" AND "${tg('B22')}" THEN`,
      to: `IF "${tg('B21')}" AND "${tg('B12')}" THEN`,
      symptom: {
        de: 'An Station 2 landen die falschen Teile im Behälter K2.',
        en: 'At station 2 the wrong parts end up in bin K2.',
      },
    });

  return {
    layout,
    cpu: 'cpu-klein',
    source,
    tests,
    title: {
      de: `Sortieranlage mit ${n} ${n === 1 ? 'Station' : 'Stationen'}`,
      en: `Sorting line with ${n} ${n === 1 ? 'station' : 'stations'}`,
    },
    mail: { de: mail(false), en: mail(true) },
    notes: { de: notes(false), en: notes(true) },
    mutations,
  };
}

// ---------------------------------------------------------------------------------------------
// Tankanlage: Pumpe füllt, Ventil entnimmt, Ultraschall misst, Wahlschalter Hand/Auto
// ---------------------------------------------------------------------------------------------

/** Rohwert des Ultraschallsensors bei Füllstand `p` %: Sensor 400 mm über dem Boden, Tank 300 mm */
const raw = (p: number) => Math.round(((400 - (300 * p) / 100) / 400) * 27648);

export function tank(rng: Rng, d: Difficulty, customer: Customer): Draft {
  const lo = [30, 35, 40, 45][rng.int(0, 3)]!;
  const hi = lo + [20, 25, 30][rng.int(0, 2)]!;
  const level0 = rng.int(5, Math.min(25, lo - 10));
  const pump = [2, 2.5][rng.int(0, 1)]!;
  const valve = [0.6, 0.8, 1][rng.int(0, 2)]!;
  // Schaltpunkte mit Abstand zum Rand des Bands
  const on = lo + 4;
  const off = hi - 4;

  const parts: Part[] = [
    part('p1', 'tank', 'T1', 300, 300, 0, 0, { level0 }),
    part('p2', 'pump', 'M1', 100, 300, 0, 0, { flow: pump, tank: 'T1' }),
    part('p3', 'valve', 'Y1', 500, 300, 0, 0, { flow: valve, tank: 'T1' }),
    part('p4', 'pipe', 'L1', 165, 300, 0, 0, { length: 70 }),
    part('p5', 'pipe', 'L2', 445, 300, 0, 0, { length: 90 }),
    part('p6', 'ultrasonic', 'B1', 300, 300, 400),
    part('p7', 'levelswitch', 'B2', 420, 240, 0, 0, { tank: 'T1', at: 90 }),
    part('p8', 'selector', 'S1', 100, 520, 0),
    part('p9', 'button', 'S2', 160, 520, 0),
    part('p10', 'lamp', 'H1', 220, 520, 0, 0, { color: 'rot' }),
    part('p11', 'lamp', 'H2', 280, 520, 0, 0, { color: 'gruen' }),
  ];
  const layout: Layout = {
    formatVersion: 1,
    seed: rng.int(1, 9999),
    area: { w: 2000, h: 1200 },
    parts,
  };
  const tg = (t: string, key = '') => tagOf(layout, t, key);
  const source = `DATA_BLOCK "Tank"
${DB_HEAD}
   VAR
      Pumpe : Bool;
   END_VAR

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
TITLE = Tankanlage
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
	// B1: Abstand Sensor–Spiegel 0…400 mm = 0…27648; Tank 300 mm hoch, Sensor 400 mm über dem Boden
	IF "${tg('S1', 'auto')}" THEN
	    IF "${tg('B1')}" > ${raw(on)} THEN   // unter ${on} %
	        "Tank".Pumpe := TRUE;
	    END_IF;
	    IF "${tg('B1')}" < ${raw(off)} THEN   // über ${off} %
	        "Tank".Pumpe := FALSE;
	    END_IF;
	    "${tg('Y1')}" := TRUE;
	ELSE
	    "Tank".Pumpe := "${tg('S2')}";
	    "${tg('Y1')}" := FALSE;
	END_IF;

	// Grenzwertschalter schaltet die Pumpe in jeder Betriebsart ab
	"${tg('M1')}" := "Tank".Pumpe AND NOT "${tg('B2')}";
	"${tg('H1')}" := "${tg('B2')}";
	"${tg('H2')}" := "${tg('S1', 'auto')}";
END_ORGANIZATION_BLOCK
`;
  // Zeit bis zum Band: Anfangsstand → Untergrenze bei (Pumpe − Ventil) l/s im 100-l-Tank, mit Reserve
  const fill = Math.ceil(((lo + 2 - level0) / (pump - valve)) * 1000 * 1.5 + 5000);
  const auto: ScenarioEvent = { kind: 'control', at: 100, ref: 'S1', value: 2 };
  const tests: PublishTest[] = [
    {
      name: 'Automatik',
      durationMs: d === 'L' ? 60000 : 90000,
      seeds: [layout.seed],
      events: [auto],
      rules: [
        { kind: 'tankRange', tank: 'T1', min: lo, max: hi, fromMs: fill },
        { kind: 'neverOn', output: 'H1' },
      ],
    },
  ];
  if (d !== 'L') {
    tests.push({
      name: 'Handbetrieb',
      durationMs: 12000,
      seeds: [layout.seed],
      events: [
        { kind: 'control', at: 100, ref: 'S1', value: 1 },
        { kind: 'control', at: 2000, ref: 'S2', value: true },
        { kind: 'control', at: 6000, ref: 'S2', value: false },
      ],
      rules: [
        { kind: 'onBetween', output: 'M1', fromMs: 2300, toMs: 5800 },
        { kind: 'offFrom', output: 'M1', fromMs: 6300 },
        { kind: 'neverOn', output: 'Y1' },
      ],
    });
  }
  if (d === 'M') {
    const leakAt = rng.int(40, 55) * 1000;
    const powerAt = rng.int(20, 30) * 1000;
    tests.push({
      name: 'Störungen',
      durationMs: leakAt + 40000,
      seeds: [layout.seed, layout.seed + 1],
      events: [
        auto,
        { kind: 'power', at: powerAt, until: powerAt + 2000 },
        { kind: 'tank', at: leakAt, jitter: 3000, ref: 'T1', level: lo - 15 },
      ],
      rules: [
        {
          kind: 'tankRange',
          tank: 'T1',
          min: lo,
          max: hi,
          fromMs: leakAt + 3000 + Math.ceil((17 / (pump - valve)) * 1500 + 3000),
        },
        { kind: 'neverOn', output: 'H1' },
      ],
    });
  }

  const mail = (en: boolean) =>
    [
      en
        ? `Our buffer tank T1 needs a controller. Pump M1 fills it, valve Y1 takes water out. Ultrasonic sensor B1 measures the distance to the surface from above (4–20 mA), level switch B2 reports overfilling at 90 %.`
        : `Unser Puffertank T1 braucht eine Steuerung. Pumpe M1 füllt, Ventil Y1 entnimmt. Der Ultraschallsensor B1 misst von oben den Abstand zum Spiegel (4–20 mA), Grenzwertschalter B2 meldet Überfüllung bei 90 %.`,
      en
        ? `In Auto (selector S1) the level has to stay between ${lo} and ${hi} % and Y1 is open. Lamp H1 shows overfilling, H2 shows Auto.`
        : `In Auto (Wahlschalter S1) muss der Füllstand zwischen ${lo} und ${hi} % bleiben, Y1 ist offen. Leuchte H1 zeigt Überfüllung, H2 zeigt Auto.`,
      ...(d !== 'L'
        ? [
            en
              ? `In Manual the pump only runs while S2 is pressed and Y1 stays closed. B2 always switches the pump off.`
              : `In Hand läuft die Pumpe nur, solange S2 gedrückt ist, Y1 bleibt zu. B2 schaltet die Pumpe immer ab.`,
          ]
        : []),
      ...(d === 'M'
        ? [
            en
              ? `Please also check: after a power failure and after a sudden drop of the level (leak) the control has to recover on its own.`
              : `Bitte auch prüfen: nach einem Stromausfall und nach einem plötzlichen Absinken des Füllstands (Leck) muss sich die Regelung selbst wieder fangen.`,
          ]
        : []),
      sign(customer, en),
    ].join('\n\n');
  const notes = (en: boolean) =>
    en
      ? `Tank 100 l, 300 mm high, start at ${level0} %. Pump ${pump} l/s, valve ${valve} l/s. B1 is mounted 400 mm above the floor: 0…400 mm distance = 0…27648.`
      : `Tank 100 l, 300 mm hoch, Start bei ${level0} %. Pumpe ${pump} l/s, Ventil ${valve} l/s. B1 sitzt 400 mm über dem Boden: 0…400 mm Abstand = 0…27648.`;

  const mutations: Mutation[] = [
    {
      from: `> ${raw(on)} THEN`,
      to: `> ${raw(lo - 12)} THEN`,
      symptom: {
        de: 'Der Tank läuft fast leer, bevor die Pumpe anspringt.',
        en: 'The tank runs almost empty before the pump starts.',
      },
    },
    {
      from: `< ${raw(off)} THEN`,
      to: `< ${raw(Math.min(88, hi + 12))} THEN`,
      symptom: {
        de: 'Die Pumpe hört zu spät auf, der Tank wird zu voll.',
        en: 'The pump stops too late, the tank gets too full.',
      },
    },
    {
      from: `	    "${tg('Y1')}" := TRUE;`,
      to: `	    "${tg('Y1')}" := "Tank".Pumpe;`,
      symptom: {
        de: 'Im Automatikbetrieb kommt unten nur zeitweise Wasser heraus.',
        en: 'In Auto, water only comes out at the bottom now and then.',
      },
    },
  ];
  if (d !== 'L')
    mutations.push({
      from: `	    "Tank".Pumpe := "${tg('S2')}";\n	    "${tg('Y1')}" := FALSE;`,
      to: `	    "Tank".Pumpe := "${tg('S2')}";\n	    "${tg('Y1')}" := TRUE;`,
      symptom: {
        de: 'Im Handbetrieb läuft der Tank über das Ventil leer.',
        en: 'In Manual the tank drains through the valve.',
      },
    });

  return {
    layout,
    cpu: 'cpu-klein',
    source,
    tests,
    title: { de: `Tankregelung ${lo}…${hi} %`, en: `Tank control ${lo}…${hi} %` },
    mail: { de: mail(false), en: mail(true) },
    notes: { de: notes(false), en: notes(true) },
    mutations,
  };
}
