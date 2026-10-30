import type { PlacedModule } from '@zyklus/sim-core';
import { CATALOG } from './catalog';
import type { Layout, Params, Part, PartType, Rot } from './model';

/**
 * Vorlagen des Sandkastens als Quelle. Daraus erzeugt der Test `templates.test.ts` die Dateien
 * `vorlagen/*.anlage.json` (je mit und ohne Beispielprogramm): automatisch verdrahtet, Variablen
 * aus den Namensvorschlägen, Programm aus der SCL-Quelle.
 */
export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  layout: Layout;
  modules: PlacedModule[];
  /** SCL-Quelle des Beispielprogramms (externe Quelle wie beim Export) */
  source: string;
}

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

const RACK: PlacedModule[] = [
  { id: 'cpu1', type: 'cpu-klein', x: 0 },
  { id: 'dio1', type: 'dio8', x: 6 },
  { id: 'rel1', type: 'rel4', x: 8 },
];

const DB_HEAD = `{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN`;

const SORTIER: TemplateDef = {
  id: 'sortierstation',
  name: 'Sortierstation Metall/Holz',
  description:
    'Ein Magazin gibt gemischt Stahl- und Holzteile aus. Die Lichtschranke B2 meldet ein Teil ' +
    'vor dem Auswerfer, der induktive Sensor B1 gegenüber erkennt dort Metall. Metall wirft ' +
    'Zylinder 1A1 in den Behälter K1, Holz läuft bis K2. S1 schaltet die Anlage ein.',
  layout: {
    formatVersion: 1,
    seed: 7,
    area: { w: 2000, h: 1200 },
    parts: [
      part('p1', 'magazine', 'G1', -45, 200, 100, 0, {
        mode: 'auto',
        intervalMs: 1500,
        capacity: 100,
        materials: ['stahl', 'holz'],
        colors: ['silber', 'natur'],
        sizes: ['mittel'],
      }),
      part('p2', 'belt', 'M1', 300, 200, 100),
      part('p3', 'inductive', 'B1', 410, 164, 115, 90),
      part('p4', 'thrubeam', 'B2', 440, 150, 115, 90, { length: 100 }),
      part('p5', 'cylinder', '1A1', 420, 290, 100, 270, {
        stroke: 130,
        extendMs: 300,
        retractMs: 300,
      }),
      part('p6', 'reed', 'B3', 450, 300, 100, 0, { cylinder: '1A1', position: 'aus' }),
      part('p7', 'bin', 'K1', 420, 70, 60, 0, { rule: 'metall' }),
      part('p8', 'bin', 'K2', 690, 200, 60, 0, { rule: 'nichtmetall' }),
      part('p9', 'switch', 'S1', -60, 380, 0),
      part('p10', 'lamp', 'H1', -10, 380, 0),
    ],
  },
  modules: RACK,
  source: `DATA_BLOCK "Sort"
${DB_HEAD}
   VAR
      Auswerfen : Bool;   // Zylinder 1A1 fährt aus
   END_VAR

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
TITLE = Sortierstation Metall/Holz
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
	// Teil vor dem Zylinder (B2) und Metall (B1 gegenüber): Band halten und auswerfen
	IF "B2_Lichtschranke" AND "B1_Induktiv" THEN
	    "Sort".Auswerfen := TRUE;
	END_IF;

	// vordere Endlage: Teil ist im Behälter, zurückfahren
	IF "B3_Zylinderschalter" THEN
	    "Sort".Auswerfen := FALSE;
	END_IF;

	"Z1A1_Aus" := "Sort".Auswerfen;
	"M1_Bandmotor" := "S1_Schalter" AND NOT "Sort".Auswerfen;
	"H1_Leuchte" := "S1_Schalter";
END_ORGANIZATION_BLOCK
`,
};

const MIX = [
  { material: 'stahl', color: 'silber', size: 'mittel' },
  { material: 'kunststoff', color: 'schwarz', size: 'mittel' },
  { material: 'holz', color: 'natur', size: 'mittel' },
] as const;
const ORDER = [0, 2, 1, 1, 0, 2, 2, 0, 1, 0, 1, 2];

const PRUEF: TemplateDef = {
  id: 'materialpruefung',
  name: 'Materialprüfung',
  description:
    'Drei Sensoren nacheinander: kapazitiv B1 meldet jedes Teil, induktiv B2 Metall, der optische ' +
    'Taster B3 helle Oberflächen. Weiche Y1 lenkt Metall nach K1, Weiche Y2 Holz nach K2, ' +
    'schwarzer Kunststoff läuft bis K3.',
  layout: {
    formatVersion: 1,
    seed: 3,
    area: { w: 2000, h: 1200 },
    parts: [
      part('p1', 'magazine', 'G1', -45, 200, 100, 0, {
        mode: 'auto',
        intervalMs: 4500,
        random: false,
        list: ORDER.map((i) => ({ ...MIX[i]! })),
      }),
      part('p2', 'belt', 'M1', 350, 200, 100, 0, { length: 700 }),
      part('p3', 'capacitive', 'B1', 120, 236, 115, 270),
      part('p4', 'inductive', 'B2', 200, 236, 115, 270),
      part('p5', 'diffuse', 'B3', 260, 275, 115, 270),
      part('p6', 'diverter', 'Y1', 380, 200, 100),
      part('p7', 'diverter', 'Y2', 560, 200, 100),
      part('p8', 'bin', 'K1', 380, 70, 60, 0, { rule: 'metall' }),
      part('p9', 'bin', 'K2', 560, 70, 60, 0, { rule: 'mat:holz' }),
      part('p10', 'bin', 'K3', 790, 200, 60, 0, { rule: 'mat:kunststoff' }),
      part('p11', 'switch', 'S1', -60, 380, 0),
    ],
  },
  modules: RACK,
  source: `DATA_BLOCK "Pruef"
${DB_HEAD}
   VAR
      Metall : Bool;   // B2 hat Metall gemeldet
      Hell : Bool;     // B3 hat eine helle Oberfläche gesehen
   END_VAR

BEGIN

END_DATA_BLOCK

DATA_BLOCK "Neu"
${DB_HEAD}
R_TRIG

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
TITLE = Materialprüfung
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
	// neues Teil an B1: Ergebnis des vorigen vergessen
	"Neu"(CLK := "B1_Kapazitiv");
	IF "Neu".Q THEN
	    "Pruef".Metall := FALSE;
	    "Pruef".Hell := FALSE;
	END_IF;
	IF "B2_Induktiv" THEN
	    "Pruef".Metall := TRUE;
	END_IF;
	IF "B3_Optisch" THEN
	    "Pruef".Hell := TRUE;
	END_IF;

	"Y1_Weiche" := "Pruef".Metall;
	"Y2_Weiche" := "Pruef".Hell AND NOT "Pruef".Metall;
	"M1_Bandmotor" := "S1_Schalter";
END_ORGANIZATION_BLOCK
`,
};

const TANK: TemplateDef = {
  id: 'tankanlage',
  name: 'Tankanlage',
  description:
    'Pumpe M1 füllt Tank T1, Ventil Y1 entnimmt. Ultraschall B1 misst von oben den Abstand zum ' +
    'Spiegel (4–20 mA), Grenzwertschalter B2 meldet Überfüllung. Wahlschalter S1: Hand (Pumpe ' +
    'mit Taster S2) oder Auto (Zweipunktregelung 40…70 %).',
  layout: {
    formatVersion: 1,
    seed: 1,
    area: { w: 2000, h: 1200 },
    parts: [
      part('p1', 'tank', 'T1', 300, 300, 0, 0, { level0: 20 }),
      part('p2', 'pump', 'M1', 100, 300, 0, 0, { flow: 2, tank: 'T1' }),
      part('p3', 'valve', 'Y1', 500, 300, 0, 0, { flow: 1, tank: 'T1' }),
      part('p4', 'pipe', 'L1', 165, 300, 0, 0, { length: 70 }),
      part('p5', 'pipe', 'L2', 445, 300, 0, 0, { length: 90 }),
      part('p6', 'ultrasonic', 'B1', 300, 300, 400),
      part('p7', 'levelswitch', 'B2', 420, 240, 0, 0, { tank: 'T1', at: 90 }),
      part('p8', 'selector', 'S1', 100, 520, 0),
      part('p9', 'button', 'S2', 160, 520, 0),
      part('p10', 'lamp', 'H1', 220, 520, 0, 0, { color: 'rot' }),
      part('p11', 'lamp', 'H2', 280, 520, 0, 0, { color: 'gruen' }),
    ],
  },
  modules: [...RACK, { id: 'ai1', type: 'ai2', x: 10 }],
  source: `DATA_BLOCK "Tank"
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
	IF "S1_Auto" THEN
	    IF "B1_Abstand" > 19354 THEN   // unter 40 %
	        "Tank".Pumpe := TRUE;
	    END_IF;
	    IF "B1_Abstand" < 13133 THEN   // über 70 %
	        "Tank".Pumpe := FALSE;
	    END_IF;
	    "Y1_Ventil" := TRUE;
	ELSE
	    "Tank".Pumpe := "S2_Taster";
	    "Y1_Ventil" := FALSE;
	END_IF;

	// Grenzwertschalter schaltet die Pumpe in jeder Betriebsart ab
	"M1_Pumpe" := "Tank".Pumpe AND NOT "B2_Grenzwert";
	"H1_Leuchte" := "B2_Grenzwert";
	"H2_Leuchte" := "S1_Auto";
END_ORGANIZATION_BLOCK
`,
};

export const TEMPLATES: TemplateDef[] = [SORTIER, PRUEF, TANK];
