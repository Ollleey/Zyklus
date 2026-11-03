import type { PlcProject, VarDecl } from '@zyklus/sim-core';

/**
 * Boxkatalog wie im TIA-FUP-Editor. Bool-Pins lassen sich verbinden und negieren,
 * Wert-Pins bekommen einen Operanden.
 */

export type PinKind = 'bool' | 'value';

export interface PinSpec {
  name: string;
  kind: PinKind;
  /** darf offen bleiben */
  optional?: boolean;
  /** Beschriftung wird nicht angezeigt (z. B. Eingänge von &) */
  unlabeled?: boolean;
}

export type BoxKind =
  | 'logic' // &, >=1, X
  | 'assign' // =, S, R
  | 'memory' // SR, RS (Operand = Speicherbit)
  | 'edge' // P_TRIG, N_TRIG (Operand = Flankenmerker)
  | 'instance' // Zeiten, Zähler, R_TRIG, F_TRIG (Operand = Instanz-DB)
  | 'compare' // CMP, IN_RANGE, OUT_RANGE
  | 'function' // MOVE, ADD, …, mit EN/ENO
  | 'call'; // eigener FB/FC (Typ CALL:<Name>), mit EN/ENO

export type Category =
  | 'Bitverknüpfungen'
  | 'Zeiten'
  | 'Zähler'
  | 'Vergleicher'
  | 'Mathematik'
  | 'Übertragen'
  | 'Bausteine';

export interface BoxSpec {
  type: string;
  /** Kopfzeile der Box */
  label: string;
  kind: BoxKind;
  category: Category;
  inputs: PinSpec[];
  outputs: PinSpec[];
  /** erweiterbare Eingänge: Präfix, Startindex, Mindestanzahl */
  variadic?: { prefix: string; start: number; min: number; kind: PinKind };
  /** Beschriftung des Operanden über der Box */
  operandLabel?: string;
  /** Instanztyp, der beim Einfügen angelegt wird */
  instanceType?: string;
  description: string;
}

const B = (name: string, extra: Partial<PinSpec> = {}): PinSpec => ({
  name,
  kind: 'bool',
  ...extra,
});
const V = (name: string, extra: Partial<PinSpec> = {}): PinSpec => ({
  name,
  kind: 'value',
  ...extra,
});
const EN = B('EN', { optional: true });
const ENO = B('ENO', { optional: true });

function logic(type: string, label: string, description: string): BoxSpec {
  return {
    type,
    label,
    kind: 'logic',
    category: 'Bitverknüpfungen',
    inputs: [],
    outputs: [B('OUT', { unlabeled: true })],
    variadic: { prefix: 'IN', start: 1, min: 2, kind: 'bool' },
    description,
  };
}

function assign(type: string, label: string, description: string): BoxSpec {
  return {
    type,
    label,
    kind: 'assign',
    category: 'Bitverknüpfungen',
    inputs: [B('IN', { unlabeled: true })],
    outputs: [],
    operandLabel: 'Operand',
    description,
  };
}

function timer(type: string, description: string, withReset = false): BoxSpec {
  return {
    type,
    label: type,
    kind: 'instance',
    category: 'Zeiten',
    inputs: [B('IN'), ...(withReset ? [B('R', { optional: true })] : []), V('PT')],
    outputs: [B('Q', { optional: true }), V('ET', { optional: true })],
    operandLabel: 'Instanz',
    instanceType: 'IEC_TIMER',
    description,
  };
}

function compare(type: string, label: string, description: string): BoxSpec {
  return {
    type,
    label,
    kind: 'compare',
    category: 'Vergleicher',
    inputs: [V('IN1'), V('IN2')],
    outputs: [B('OUT', { unlabeled: true })],
    description,
  };
}

function fn(
  type: string,
  label: string,
  category: Category,
  inputs: PinSpec[],
  description: string,
  variadic?: BoxSpec['variadic'],
  out = 'OUT',
): BoxSpec {
  return {
    type,
    label,
    kind: 'function',
    category,
    inputs: [EN, ...inputs],
    outputs: [ENO, V(out)],
    variadic,
    description,
  };
}

const SPECS: BoxSpec[] = [
  logic('AND', '&', 'UND-Verknüpfung: Ausgang 1, wenn alle Eingänge 1 sind.'),
  logic('OR', '>=1', 'ODER-Verknüpfung: Ausgang 1, wenn mindestens ein Eingang 1 ist.'),
  logic('XOR', 'X', 'EXKLUSIV-ODER: Ausgang 1 bei ungerader Anzahl gesetzter Eingänge.'),
  assign('ASSIGN', '=', 'Zuweisung: schreibt das Verknüpfungsergebnis auf den Operanden.'),
  assign(
    'SET',
    'S',
    'Setzen: Operand wird 1, solange der Eingang 1 ist; bleibt sonst unverändert.',
  ),
  assign('RESET', 'R', 'Rücksetzen: Operand wird 0, solange der Eingang 1 ist.'),
  {
    type: 'SR',
    label: 'SR',
    kind: 'memory',
    category: 'Bitverknüpfungen',
    inputs: [B('S'), B('R1')],
    outputs: [B('Q', { optional: true })],
    operandLabel: 'Speicher',
    description: 'Setz-/Rücksetz-Flipflop, Rücksetzen dominant.',
  },
  {
    type: 'RS',
    label: 'RS',
    kind: 'memory',
    category: 'Bitverknüpfungen',
    inputs: [B('R'), B('S1')],
    outputs: [B('Q', { optional: true })],
    operandLabel: 'Speicher',
    description: 'Rücksetz-/Setz-Flipflop, Setzen dominant.',
  },
  {
    type: 'P_TRIG',
    label: 'P_TRIG',
    kind: 'edge',
    category: 'Bitverknüpfungen',
    inputs: [B('CLK')],
    outputs: [B('Q', { optional: true })],
    operandLabel: 'Flankenmerker',
    description: 'Steigende Flanke: Q ist für einen Zyklus 1, wenn CLK von 0 auf 1 wechselt.',
  },
  {
    type: 'N_TRIG',
    label: 'N_TRIG',
    kind: 'edge',
    category: 'Bitverknüpfungen',
    inputs: [B('CLK')],
    outputs: [B('Q', { optional: true })],
    operandLabel: 'Flankenmerker',
    description: 'Fallende Flanke: Q ist für einen Zyklus 1, wenn CLK von 1 auf 0 wechselt.',
  },
  ...(['R_TRIG', 'F_TRIG'] as const).map((type): BoxSpec => ({
    type,
    label: type,
    kind: 'instance',
    category: 'Bitverknüpfungen',
    inputs: [B('CLK')],
    outputs: [B('Q', { optional: true })],
    operandLabel: 'Instanz',
    instanceType: type,
    description:
      type === 'R_TRIG' ? 'Steigende Flanke mit Instanz-DB.' : 'Fallende Flanke mit Instanz-DB.',
  })),
  timer('TP', 'Impuls: Q ist für die Dauer PT 1 nach steigender Flanke an IN.'),
  timer('TON', 'Einschaltverzögerung: Q wird PT nach IN = 1 gesetzt.'),
  timer('TOF', 'Ausschaltverzögerung: Q fällt PT nach IN = 0 ab.'),
  timer('TONR', 'Speichernde Einschaltverzögerung, Rücksetzen mit R.', true),
  {
    type: 'CTU',
    label: 'CTU',
    kind: 'instance',
    category: 'Zähler',
    inputs: [B('CU'), B('R', { optional: true }), V('PV')],
    outputs: [B('Q', { optional: true }), V('CV', { optional: true })],
    operandLabel: 'Instanz',
    instanceType: 'IEC_COUNTER',
    description: 'Vorwärtszähler: zählt steigende Flanken an CU, Q = CV ≥ PV.',
  },
  {
    type: 'CTD',
    label: 'CTD',
    kind: 'instance',
    category: 'Zähler',
    inputs: [B('CD'), B('LD', { optional: true }), V('PV')],
    outputs: [B('Q', { optional: true }), V('CV', { optional: true })],
    operandLabel: 'Instanz',
    instanceType: 'IEC_COUNTER',
    description: 'Rückwärtszähler: LD lädt PV, Q = CV ≤ 0.',
  },
  {
    type: 'CTUD',
    label: 'CTUD',
    kind: 'instance',
    category: 'Zähler',
    inputs: [B('CU'), B('CD'), B('R', { optional: true }), B('LD', { optional: true }), V('PV')],
    outputs: [
      B('QU', { optional: true }),
      B('QD', { optional: true }),
      V('CV', { optional: true }),
    ],
    operandLabel: 'Instanz',
    instanceType: 'IEC_COUNTER',
    description: 'Vor-/Rückwärtszähler.',
  },
  compare('CMP_EQ', '==', 'Vergleich auf gleich.'),
  compare('CMP_NE', '<>', 'Vergleich auf ungleich.'),
  compare('CMP_GT', '>', 'Vergleich auf größer.'),
  compare('CMP_GE', '>=', 'Vergleich auf größer gleich.'),
  compare('CMP_LT', '<', 'Vergleich auf kleiner.'),
  compare('CMP_LE', '<=', 'Vergleich auf kleiner gleich.'),
  {
    type: 'IN_RANGE',
    label: 'IN_RANGE',
    kind: 'compare',
    category: 'Vergleicher',
    inputs: [V('MIN'), V('VAL'), V('MAX')],
    outputs: [B('OUT', { unlabeled: true })],
    description: 'Wert liegt im Bereich MIN … MAX.',
  },
  {
    type: 'OUT_RANGE',
    label: 'OUT_RANGE',
    kind: 'compare',
    category: 'Vergleicher',
    inputs: [V('MIN'), V('VAL'), V('MAX')],
    outputs: [B('OUT', { unlabeled: true })],
    description: 'Wert liegt außerhalb von MIN … MAX.',
  },
  fn('ADD', 'ADD', 'Mathematik', [], 'Addieren.', {
    prefix: 'IN',
    start: 1,
    min: 2,
    kind: 'value',
  }),
  fn('SUB', 'SUB', 'Mathematik', [V('IN1'), V('IN2')], 'Subtrahieren: OUT = IN1 − IN2.'),
  fn('MUL', 'MUL', 'Mathematik', [], 'Multiplizieren.', {
    prefix: 'IN',
    start: 1,
    min: 2,
    kind: 'value',
  }),
  fn('DIV', 'DIV', 'Mathematik', [V('IN1'), V('IN2')], 'Dividieren: OUT = IN1 / IN2.'),
  fn('MOD', 'MOD', 'Mathematik', [V('IN1'), V('IN2')], 'Divisionsrest.'),
  fn('ABS', 'ABS', 'Mathematik', [V('IN')], 'Betrag.'),
  fn('LIMIT', 'LIMIT', 'Mathematik', [V('MN'), V('IN'), V('MX')], 'Begrenzen auf MN … MX.'),
  fn('MIN', 'MIN', 'Mathematik', [], 'Kleinster Wert.', {
    prefix: 'IN',
    start: 1,
    min: 2,
    kind: 'value',
  }),
  fn('MAX', 'MAX', 'Mathematik', [], 'Größter Wert.', {
    prefix: 'IN',
    start: 1,
    min: 2,
    kind: 'value',
  }),
  fn(
    'NORM_X',
    'NORM_X',
    'Übertragen',
    [V('MIN'), V('VALUE'), V('MAX')],
    'Normieren auf 0.0 … 1.0.',
  ),
  fn(
    'SCALE_X',
    'SCALE_X',
    'Übertragen',
    [V('MIN'), V('VALUE'), V('MAX')],
    'Skalieren von 0.0 … 1.0 auf MIN … MAX.',
  ),
  fn('MOVE', 'MOVE', 'Übertragen', [V('IN')], 'Wert übertragen.', undefined, 'OUT1'),
  fn('CONV', 'CONV', 'Übertragen', [V('IN')], 'Konvertieren in den Datentyp des Ausgangs.'),
  fn(
    'SEL',
    'SEL',
    'Übertragen',
    [B('G'), V('IN0'), V('IN1')],
    'Auswählen: G = 0 → IN0, G = 1 → IN1.',
  ),
  {
    ...fn('MUX', 'MUX', 'Übertragen', [V('K')], 'Multiplexen: K wählt den Eingang, sonst ELSE.', {
      prefix: 'IN',
      start: 0,
      min: 2,
      kind: 'value',
    }),
  },
  fn('SHL', 'SHL', 'Übertragen', [V('IN'), V('N')], 'Links schieben.'),
  fn('SHR', 'SHR', 'Übertragen', [V('IN'), V('N')], 'Rechts schieben.'),
];

export const BOX_SPECS: Record<string, BoxSpec> = Object.fromEntries(SPECS.map((s) => [s.type, s]));

export const CATEGORIES: Category[] = [
  'Bitverknüpfungen',
  'Zeiten',
  'Zähler',
  'Vergleicher',
  'Mathematik',
  'Übertragen',
];

/** Schnittstellen der eigenen FB/FC des aktuellen Projekts (für Boxen CALL:<Name>) */
const CALLS = new Map<
  string,
  { name: string; kind: 'FB' | 'FC'; inputs: PinSpec[]; outputs: PinSpec[] }
>();

export const CALL_PREFIX = 'CALL:';
export const isCallType = (type: string) => type.startsWith(CALL_PREFIX);
export const callType = (name: string) => `${CALL_PREFIX}${name}`;

/**
 * Schnittstellen der eigenen Bausteine bekannt machen (vor Absenkung und Darstellung):
 * Input/InOut → Eingänge, Output/Ret_Val → Ausgänge; Bool-Pins lassen sich verbinden.
 */
export function setCallSignatures(project: PlcProject): void {
  CALLS.clear();
  for (const b of project.blocks) {
    if (b.kind !== 'FB' && b.kind !== 'FC') continue;
    const pin = (v: VarDecl): PinSpec => ({
      name: v.name,
      kind: v.type.trim().toLowerCase() === 'bool' ? 'bool' : 'value',
      optional: b.kind === 'FB',
    });
    const ret =
      b.kind === 'FC' && b.returnType && b.returnType.trim().toLowerCase() !== 'void'
        ? [
            {
              name: 'Ret_Val',
              kind: b.returnType.trim().toLowerCase() === 'bool' ? 'bool' : 'value',
              optional: true,
            } as PinSpec,
          ]
        : [];
    CALLS.set(b.name.toLowerCase(), {
      name: b.name,
      kind: b.kind,
      inputs: [...(b.iface.Input ?? []), ...(b.iface.InOut ?? [])].map(pin),
      outputs: [...ret, ...(b.iface.Output ?? []).map((v) => ({ ...pin(v), optional: true }))],
    });
  }
}

export function callInfo(type: string) {
  return CALLS.get(type.slice(CALL_PREFIX.length).toLowerCase());
}

export function boxSpec(type: string): BoxSpec {
  if (isCallType(type)) {
    const name = type.slice(CALL_PREFIX.length);
    const sig = callInfo(type);
    return {
      type,
      label: sig?.name ?? name,
      kind: 'call',
      category: 'Bausteine',
      inputs: [EN, ...(sig?.inputs ?? [])],
      outputs: [ENO, ...(sig?.outputs ?? [])],
      ...(sig?.kind !== 'FC' ? { operandLabel: 'Instanz', instanceType: sig?.name ?? name } : {}),
      description: sig ? `Eigener ${sig.kind} „${sig.name}“` : `Baustein „${name}“ fehlt`,
    };
  }
  const s = BOX_SPECS[type];
  if (!s) throw new Error(`Unbekannter Boxtyp ${type}`);
  return s;
}

/** Tatsächliche Eingänge einer Box (inkl. erweiterbarer Eingänge, bei MUX zusätzlich ELSE). */
export function inputPins(type: string, count?: number): PinSpec[] {
  const s = boxSpec(type);
  if (!s.variadic) return s.inputs;
  const n = Math.max(s.variadic.min, count ?? s.variadic.min);
  const extra = Array.from({ length: n }, (_, i): PinSpec => ({
    name: `${s.variadic!.prefix}${s.variadic!.start + i}`,
    kind: s.variadic!.kind,
    unlabeled: s.kind === 'logic',
  }));
  const pins = [...s.inputs, ...extra];
  if (type === 'MUX') pins.push({ name: 'ELSE', kind: 'value', optional: true });
  return pins;
}

export function outputPins(type: string): PinSpec[] {
  return boxSpec(type).outputs;
}
