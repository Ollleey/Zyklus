import type { DataType, InstanceField, InstanceKind } from '@zyklus/sim-core';

/**
 * Systembausteine (IEC-Zeiten, -Zähler, Flankenauswertung) und ihre Instanztypen wie in TIA.
 * Ein Instanz-DB ist entweder fest typisiert (TON_TIME, CTU_INT, R_TRIG …) und wird mit
 * "DB"(…) aufgerufen, oder generisch (IEC_TIMER, IEC_COUNTER) und wird mit "DB".TON(…) aufgerufen.
 */

export type InstanceType =
  { generic: false; kind: InstanceKind } | { generic: true; family: 'timer' | 'counter' };

const TYPED: Record<string, InstanceKind> = {
  TP_TIME: 'TP',
  TON_TIME: 'TON',
  TOF_TIME: 'TOF',
  TONR_TIME: 'TONR',
  CTU_INT: 'CTU',
  CTD_INT: 'CTD',
  CTUD_INT: 'CTUD',
  R_TRIG: 'R_TRIG',
  F_TRIG: 'F_TRIG',
  // TIA akzeptiert in der Schnittstelle auch die Anweisungsnamen
  TP: 'TP',
  TON: 'TON',
  TOF: 'TOF',
  TONR: 'TONR',
  CTU: 'CTU',
  CTD: 'CTD',
  CTUD: 'CTUD',
  // Kommunikation mit einer anderen CPU
  TSEND_C: 'TSEND',
  TRCV_C: 'TRCV',
};

export function instanceType(typeName: string): InstanceType | undefined {
  const u = typeName.toUpperCase();
  if (u === 'IEC_TIMER') return { generic: true, family: 'timer' };
  if (u === 'IEC_COUNTER') return { generic: true, family: 'counter' };
  const kind = TYPED[u];
  return kind ? { generic: false, kind } : undefined;
}

export const TIMER_METHODS: readonly InstanceKind[] = ['TP', 'TON', 'TOF', 'TONR'];
export const COUNTER_METHODS: readonly InstanceKind[] = ['CTU', 'CTD', 'CTUD'];

export function methodFamily(name: string): 'timer' | 'counter' | undefined {
  const u = name.toUpperCase() as InstanceKind;
  if (TIMER_METHODS.includes(u)) return 'timer';
  if (COUNTER_METHODS.includes(u)) return 'counter';
  return undefined;
}

/** Eingänge der Anweisungen: [Name, Typ, Pflicht] */
export const FB_INPUTS: Record<InstanceKind, [string, DataType, boolean][]> = {
  TP: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TON: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TOF: [
    ['IN', 'BOOL', true],
    ['PT', 'TIME', true],
  ],
  TONR: [
    ['IN', 'BOOL', true],
    ['R', 'BOOL', false],
    ['PT', 'TIME', true],
  ],
  CTU: [
    ['CU', 'BOOL', true],
    ['R', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  CTD: [
    ['CD', 'BOOL', true],
    ['LD', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  CTUD: [
    ['CU', 'BOOL', true],
    ['CD', 'BOOL', true],
    ['R', 'BOOL', false],
    ['LD', 'BOOL', false],
    ['PV', 'INT', true],
  ],
  R_TRIG: [['CLK', 'BOOL', true]],
  F_TRIG: [['CLK', 'BOOL', true]],
  // DATA (beliebige Variable) behandelt der Compiler gesondert
  TSEND: [
    ['REQ', 'BOOL', true],
    ['ID', 'INT', true],
  ],
  TRCV: [
    ['EN_R', 'BOOL', true],
    ['ID', 'INT', true],
  ],
};

/** Ausgänge beim Aufruf (Q => …). */
export const FB_OUTPUTS: Record<InstanceKind, Record<string, DataType>> = {
  TP: { Q: 'BOOL', ET: 'TIME' },
  TON: { Q: 'BOOL', ET: 'TIME' },
  TOF: { Q: 'BOOL', ET: 'TIME' },
  TONR: { Q: 'BOOL', ET: 'TIME' },
  CTU: { Q: 'BOOL', CV: 'INT' },
  CTD: { Q: 'BOOL', CV: 'INT' },
  CTUD: { QU: 'BOOL', QD: 'BOOL', CV: 'INT' },
  R_TRIG: { Q: 'BOOL' },
  F_TRIG: { Q: 'BOOL' },
  TSEND: { DONE: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
  TRCV: { NDR: 'BOOL', BUSY: 'BOOL', ERROR: 'BOOL', STATUS: 'WORD' },
};

/** Anweisungen mit Datenbereich DATA (Kommunikation) */
export const COMM_KINDS: readonly InstanceKind[] = ['TSEND', 'TRCV'];

/**
 * Lesbare Elemente eines Instanz-DBs → Feld im Instanzzustand.
 * IEC_COUNTER kennt kein „Q“, sondern QU/QD (wie in TIA).
 */
export function instanceMembers(
  t: InstanceType,
  kind: InstanceKind,
): Record<string, [InstanceField, DataType]> {
  if (t.generic && t.family === 'counter') {
    return { QU: ['QU', 'BOOL'], QD: ['QD', 'BOOL'], CV: ['CV', 'INT'] };
  }
  const out: Record<string, [InstanceField, DataType]> = {};
  for (const [name, type] of Object.entries(FB_OUTPUTS[kind])) {
    out[name] = [name as 'Q', type];
  }
  return out;
}
