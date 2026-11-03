import type { Area } from './address';
import type { DataType, Value } from './types';

/**
 * Zwischenrepräsentation (IR): eine lineare, typisierte Befehlsliste pro Baustein.
 * FUP und SCL werden beide hierher übersetzt; simuliert wird ausschließlich die IR.
 */

export type Operand =
  | { k: 'const'; t: DataType; v: Value }
  /** Prozessabbild bzw. Merker. Bei BOOL ist `bit` relevant. */
  | { k: 'io'; area: Area; t: DataType; byte: number; bit: number }
  /** Variable aus Global-DB, Instanz-DB (statisch) oder TEMP. */
  | { k: 'slot'; i: number }
  /** Ausgang einer FB-Instanz (z. B. TON.Q, CTU.CV); nur lesbar. */
  | { k: 'inst'; i: number; f: InstanceField }
  /**
   * Feldelement mit variablem Index: Slot `base + idx · stride + off`. `idx` ist schon geprüft und
   * nullbasiert (Befehl `chk`); `len` Anzahl der Elemente zur Sicherheit.
   */
  | { k: 'islot'; base: number; idx: Operand; len: number; stride: number; off: number };

export type InstanceKind =
  | 'TP'
  | 'TON'
  | 'TOF'
  | 'TONR'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'R_TRIG'
  | 'F_TRIG'
  /** Kommunikation: Daten senden (TSEND_C) bzw. empfangen (TRCV_C) */
  | 'TSEND'
  | 'TRCV'
  /** Kommunikation: in den Speicher der Partner-CPU schreiben bzw. daraus lesen */
  | 'PUT'
  | 'GET'
  /** Meldung an das Bedienpanel (Program_Alarm) */
  | 'ALARM';

export type InstanceField =
  'Q' | 'ET' | 'CV' | 'QU' | 'QD' | 'DONE' | 'BUSY' | 'ERROR' | 'STATUS' | 'NDR' | 'Ack_State';

export const TIMER_KINDS: readonly InstanceKind[] = ['TP', 'TON', 'TOF', 'TONR'];
export const COUNTER_KINDS: readonly InstanceKind[] = ['CTU', 'CTD', 'CTUD'];
export const TRIG_KINDS: readonly InstanceKind[] = ['R_TRIG', 'F_TRIG'];

export const INSTANCE_FIELDS: Record<InstanceKind, Partial<Record<InstanceField, DataType>>> = {
  TP: { Q: 'BOOL', ET: 'TIME' },
  TON: { Q: 'BOOL', ET: 'TIME' },
  TOF: { Q: 'BOOL', ET: 'TIME' },
  TONR: { Q: 'BOOL', ET: 'TIME' },
  // QU/QD auch bei CTU/CTD lesbar (IEC_COUNTER-Instanz-DB), das jeweils andere bleibt FALSE
  CTU: { Q: 'BOOL', QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  CTD: { Q: 'BOOL', QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  CTUD: { QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  R_TRIG: { Q: 'BOOL' },
  F_TRIG: { Q: 'BOOL' },
  TSEND: { DONE: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
  TRCV: { NDR: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
  PUT: { DONE: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
  GET: { NDR: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
  ALARM: { Ack_State: 'BOOL' },
};

/** Statuscodes der Kommunikationsbausteine */
export const COMM_STATUS = {
  IDLE: 0x7000,
  SENDING: 0x7001,
  WAITING: 0x7002,
  DONE: 0x0000,
  /** keine Verbindung zu dieser ID */
  NO_PARTNER: 0x80a3,
  /** empfangene Daten passen nicht zur Länge bzw. zu den Datentypen von DATA */
  LENGTH: 0x80b3,
  /** Partner nicht erreichbar: Auftrag nach COMM_TIMEOUT_MS abgebrochen */
  TIMEOUT: 0x80c4,
} as const;

export type UnaryFn = 'not' | 'neg' | 'abs';
export type BinaryFn = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'and' | 'or' | 'xor' | 'shl' | 'shr';
export type CompareFn = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';
export type CallFn =
  | 'limit'
  | 'min'
  | 'max'
  | 'sel'
  | 'in_range'
  | 'out_range'
  | 'norm_x'
  | 'scale_x'
  /** Zeichenketten: len [IN] → INT, concat [IN1, …], left/right [IN, L], mid [IN, L, P],
   * find [IN1, IN2] → INT, delete [IN, L, P], insert [IN1, IN2, P], replace [IN1, IN2, L, P] */
  | 'len'
  | 'concat'
  | 'left'
  | 'right'
  | 'mid'
  | 'find'
  | 'delete'
  | 'insert'
  | 'replace'
  /** Bytes einer Bitfolge tauschen [IN] */
  | 'swap';

export type Instr =
  | { op: 'mov'; dst: Operand; src: Operand }
  /** Typkonvertierung von typeOf(src) nach typeOf(dst). `mode` gilt für REAL → Ganzzahl. */
  | { op: 'conv'; dst: Operand; src: Operand; mode: 'round' | 'trunc' }
  | { op: 'un'; fn: UnaryFn; t: DataType; dst: Operand; a: Operand }
  | { op: 'bin'; fn: BinaryFn; t: DataType; dst: Operand; a: Operand; b: Operand }
  | { op: 'cmp'; fn: CompareFn; t: DataType; dst: Operand; a: Operand; b: Operand }
  /**
   * Funktionen. `t` ist der Typ der Werteingänge:
   * limit [MN, IN, MX], min/max [IN1, IN2, ...], sel [G, IN0, IN1],
   * in_range/out_range [MIN, VAL, MAX], norm_x [MIN, VALUE, MAX] → REAL,
   * scale_x [MIN, VALUE:REAL, MAX] → t.
   */
  | { op: 'fn'; fn: CallFn; t: DataType; dst: Operand; args: Operand[] }
  /** MUX: K wählt einen Eingang; ohne `alt` bleibt dst bei ungültigem K unverändert. */
  | { op: 'mux'; t: DataType; dst: Operand; k: Operand; ins: Operand[]; alt?: Operand }
  /**
   * Systemzeit lesen (RD_SYS_T) in die 8 Elemente einer DTL: YEAR, MONTH, DAY, WEEKDAY,
   * HOUR, MINUTE, SECOND, NANOSECOND
   */
  | { op: 'clock'; dst: Operand[] }
  /**
   * Messpunkt i: mit `src` Wert merken, sonst Zähler erhöhen. Kostet nichts (kein Befehl, keine
   * Energie, kein Zykluszeitbudget) und ändert keinen Programmzustand.
   */
  | { op: 'probe'; i: number; src?: Operand }
  /** GET_ERR_ID: Kennung des letzten Programmierfehlers in diesem OB-Durchlauf (0 = keiner) */
  | { op: 'errid'; dst: Operand }
  /**
   * RUNTIME: Zeit seit dem letzten Aufruf in s (LREAL); `mem` (LREAL) hält den Zeitpunkt.
   * Spielzeit: Zyklusbeginn plus Rechenzeit der bisher ausgeführten Befehle.
   */
  | { op: 'runtime'; dst: Operand; mem: Operand }
  | { op: 'set'; dst: Operand; cond: Operand }
  | { op: 'reset'; dst: Operand; cond: Operand }
  /** Speicherbox mit Merker `q`. SR: Rücksetzen dominant, RS: Setzen dominant. */
  | { op: 'sr'; kind: 'SR' | 'RS'; s: Operand; r: Operand; q: Operand; out?: Operand }
  /** P_TRIG / N_TRIG mit Flankenmerker `mem`. */
  | { op: 'edge'; kind: 'P' | 'N'; clk: Operand; mem: Operand; out: Operand }
  | { op: 'trig'; i: number; clk: Operand }
  | { op: 'tmr'; i: number; in: Operand; pt: Operand; r?: Operand }
  | {
      op: 'ctr';
      i: number;
      cu?: Operand;
      cd?: Operand;
      r?: Operand;
      ld?: Operand;
      pv: Operand;
    }
  /**
   * Kommunikation über die Verbindung `id`: senden bei steigender Flanke von `en` (REQ) bzw.
   * empfangen, solange `en` (EN_R) ansteht. `data`: Elemente von DATA, `types` ihre Datentypen.
   */
  | {
      op: 'comm';
      i: number;
      /** put/get: `data[0]` ist SD_1 bzw. RD_1, `remote` die Merkeradresse der Partner-CPU */
      kind: 'send' | 'recv' | 'put' | 'get';
      remote?: { area: 'M'; byte: number; bit: number; t: DataType };
      en: Operand;
      id: Operand;
      data: Operand[];
      types: DataType[];
    }
  /** Program_Alarm: Flanke an `sig` meldet die Meldung `text` kommend bzw. gehend */
  | { op: 'alarm'; i: number; sig: Operand; text: Operand }
  | { op: 'jmp'; to: number }
  /** Springe, wenn cond FALSE ist. */
  | { op: 'jz'; cond: Operand; to: number }
  /** Springe, wenn cond TRUE ist. */
  | { op: 'jnz'; cond: Operand; to: number }
  /**
   * Feldindex prüfen: liegt `a` außerhalb [lo, hi], ist das ein Programmierfehler (CPU geht in
   * STOP, Meldung `msg`); sonst `dst := a − lo`.
   */
  | { op: 'chk'; dst: Operand; a: Operand; lo: number; hi: number; msg: string };

export type OpCode = Instr['op'];

export interface SlotDecl {
  name: string;
  t: DataType;
  init: Value;
  /** TEMP-Variablen werden zu Beginn jedes OB-Durchlaufs auf `init` gesetzt. */
  temp?: boolean;
  /** remanent: behält den Wert bei Neustart (STOP → RUN, Spannung aus/ein) */
  retain?: boolean;
  /** STRING: Höchstlänge (Standard 254); längere Werte werden abgeschnitten */
  len?: number;
}

export interface InstanceDecl {
  name: string;
  kind: InstanceKind;
}

/**
 * Alarm-OB: eigener Codebereich [start, end) in `IrProgram.code`.
 * - cyclic (OB35): alle `intervalMs` ab `phaseMs`
 * - process (OB40): bei Flanke an einem Eingangsbit der Peripherie
 */
export interface IrTask {
  /**
   * startup: Anlauf-OB (OB100), läuft einmal vor dem ersten Zyklus nach jedem Neustart;
   * Fehler-OBs: timeError (OB80), diagnostic (OB82), rackFailure (OB86), programError (OB121)
   */
  kind:
    'cyclic' | 'process' | 'startup' | 'timeError' | 'diagnostic' | 'rackFailure' | 'programError';
  name: string;
  start: number;
  end: number;
  intervalMs?: number;
  phaseMs?: number;
  input?: { byte: number; bit: number };
  edge?: 'rising' | 'falling';
  /** OB82/OB86: Slot der Startinformation Event_Class (16#39 kommend, 16#38 gehend) */
  eventClass?: number;
  /** Weck-/Prozessalarm: zugeordnetes Teilprozessabbild (1…31) */
  tpa?: number;
}

export interface IrProgram {
  slots: SlotDecl[];
  instances: InstanceDecl[];
  /** Code aller OBs hintereinander; OB1 belegt [0, mainEnd) */
  code: Instr[];
  /** Ende von OB1 (Standard: code.length) */
  mainEnd?: number;
  tasks?: IrTask[];
  /** Messpunkte für Beobachten und Haltepunkte (Befehl `probe`) */
  probes?: ProbeDecl[];
  /**
   * Lokale Fehlerbehandlung (Programm verwendet GET_ERR_ID): Programmierfehler halten die CPU
   * nicht an und rufen keinen OB121; der fehlerhafte Zugriff liefert 0 bzw. schreibt nichts.
   */
  localErrors?: boolean;
}

/** Fehlerkennungen wie GET_ERR_ID (Bereichslängenfehler beim Lesen bzw. Schreiben) */
export const ERR_READ = 0x2522;
export const ERR_WRITE = 0x2523;

/**
 * Messpunkt im Quelltext: `cond` merkt sich den Wert einer Bedingung, `line` zählt, wie oft die
 * Anweisung ausgeführt wurde.
 */
export interface ProbeDecl {
  block: string;
  line: number;
  kind: 'cond' | 'line';
}
