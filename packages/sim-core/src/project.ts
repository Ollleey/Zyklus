import type { Tag } from './tags';

/**
 * PLC-Projekt einer CPU im Stil des TIA-Bausteineditors: Variablentabelle plus Bausteine.
 * Codebausteine haben eine tabellarische Schnittstelle und einen Codeteil (SCL-Text oder FUP).
 */

export type BlockLang = 'SCL' | 'FUP';

export type IfaceSection = 'Input' | 'Output' | 'InOut' | 'Static' | 'Temp' | 'Constant';

export const IFACE_SECTIONS: readonly IfaceSection[] = [
  'Input',
  'Output',
  'InOut',
  'Static',
  'Temp',
  'Constant',
];

/** Erlaubte Schnittstellenbereiche je Bausteinart (wie S7-1500). */
export const SECTIONS_BY_KIND: Record<CodeBlockKind, readonly IfaceSection[]> = {
  OB: ['Temp', 'Constant'],
  FB: ['Input', 'Output', 'InOut', 'Static', 'Temp', 'Constant'],
  FC: ['Input', 'Output', 'InOut', 'Temp', 'Constant'],
};

/** Eine Zeile der Schnittstelle bzw. eines Global-DBs. */
export interface VarDecl {
  name: string;
  /** Datentyp wie in TIA geschrieben, z. B. "Bool", "Int", "Time" */
  type: string;
  /** Startwert als Literaltext, z. B. "T#500ms", "100", "TRUE" */
  init?: string;
  comment?: string;
  /** remanent (nur Global-DB und FB-Schnittstelle außer Temp/InOut/Constant) */
  retain?: boolean;
}

export type CodeBlockKind = 'OB' | 'FB' | 'FC';

/**
 * Startereignis eines Alarm-OBs (in TIA Teil der Gerätekonfiguration):
 * Weckalarm (OB30…OB38) im festen Takt oder Prozessalarm (OB40…OB47) an einer Eingangsflanke.
 */
export type ObEvent =
  | { kind: 'cyclic'; intervalMs: number; phaseMs?: number }
  | { kind: 'process'; input: string; edge: 'rising' | 'falling' }
  /** Anlauf: einmal nach jedem Neustart, vor dem ersten Zyklus von OB1 */
  | { kind: 'startup' }
  /** Fehler-OBs: Zykluszeitfehler, Diagnosealarm, Baugruppenausfall, Programmierfehler */
  | { kind: 'timeError' }
  | { kind: 'diagnostic' }
  | { kind: 'rackFailure' }
  | { kind: 'programError' };

/** Ereignisse ohne Parameter mit ihrem Namen (Anlauf und Fehler-OBs) */
export const SIMPLE_EVENTS = {
  startup: 'Anlauf',
  timeError: 'Zykluszeitfehler',
  diagnostic: 'Diagnosealarm',
  rackFailure: 'Baugruppenausfall',
  programError: 'Programmierfehler',
} as const satisfies Partial<Record<ObEvent['kind'], string>>;

export type SimpleEvent = keyof typeof SIMPLE_EVENTS;

export function isSimpleEvent(e: ObEvent): e is { kind: SimpleEvent } {
  return e.kind in SIMPLE_EVENTS;
}

export const OB_NUMBERS = {
  cyclic: [30, 38],
  process: [40, 47],
  startup: [100, 100],
  timeError: [80, 80],
  diagnostic: [82, 82],
  rackFailure: [86, 86],
  programError: [121, 121],
} as const satisfies Record<ObEvent['kind'], readonly [number, number]>;

export interface CodeBlock {
  kind: CodeBlockKind;
  name: string;
  number: number;
  lang: BlockLang;
  title?: string;
  comment?: string;
  iface: Partial<Record<IfaceSection, VarDecl[]>>;
  /** SCL: Anweisungsteil (ohne Bausteinkopf) */
  source: string;
  /** FUP: Netzwerke (Modell in @zyklus/fup-model) */
  fup?: unknown;
  /**
   * Intern: Baustein wurde aus FUP erzeugt. Der SCL-Compiler erlaubt dann die FUP-Funktionen
   * (SR, RS, P_TRIG, N_TRIG, IN_RANGE, OUT_RANGE, CONV), die es in SCL nicht gibt.
   */
  generatedFrom?: 'FUP';
  /** nur OB: Startereignis; ohne Ereignis ist der OB der zyklische OB1 */
  event?: ObEvent;
  /** nur FC: Datentyp des Rückgabewerts `Ret_Val` (fehlt oder „Void“: keiner) */
  returnType?: string;
}

/** Globaler Datenbaustein */
export interface GlobalDb {
  kind: 'DB';
  name: string;
  number: number;
  vars: VarDecl[];
}

/** Instanz-Datenbaustein, z. B. vom Typ IEC_TIMER, IEC_COUNTER, R_TRIG oder TON_TIME */
export interface InstanceDb {
  kind: 'IDB';
  name: string;
  number: number;
  of: string;
}

export type Block = CodeBlock | GlobalDb | InstanceDb;

/** PLC-Datentyp (UDT): benannte Struktur, verwendbar in DBs und Schnittstellen als "Name" */
export interface PlcType {
  name: string;
  fields: VarDecl[];
  comment?: string;
}

export interface PlcProject {
  tags: Tag[];
  blocks: Block[];
  /** PLC-Datentypen (fehlt in älteren Spielständen) */
  types?: PlcType[];
}

export const MAIN_OB = 'Main';

/** Leeres Projekt mit OB1 „Main“. */
export function emptyProject(lang: BlockLang = 'SCL'): PlcProject {
  return {
    tags: [],
    blocks: [
      { kind: 'OB', name: MAIN_OB, number: 1, lang, iface: { Temp: [], Constant: [] }, source: '' },
    ],
  };
}
