import type { Instr } from '../ir';
import { isBitwiseType, isRealType, type DataType } from '../types';

/**
 * Energie-Gewichte je ausgeführtem IR-Befehl. Zentral hier, damit sie sich balancieren lassen.
 * Bitlogik/Transfer 1 · Ganzzahl-Arithmetik/Vergleich 2 · Timer/Zähler/Flanken 3 · REAL/Skalierung 4
 */
export const ENERGY = {
  bit: 1,
  move: 1,
  jump: 1,
  integer: 2,
  stateful: 3,
  real: 4,
} as const;

function byType(t: DataType): number {
  if (isRealType(t)) return ENERGY.real;
  if (isBitwiseType(t)) return ENERGY.bit;
  return ENERGY.integer;
}

export function energyOf(ins: Instr): number {
  switch (ins.op) {
    case 'mov':
      return ENERGY.move;
    case 'conv':
      return ENERGY.integer;
    case 'un':
    case 'bin':
    case 'cmp':
    case 'mux':
      return byType(ins.t);
    case 'fn':
      return ins.fn === 'norm_x' || ins.fn === 'scale_x'
        ? ENERGY.real
        : Math.max(ENERGY.integer, byType(ins.t));
    case 'set':
    case 'reset':
    case 'sr':
      return ENERGY.bit;
    case 'edge':
    case 'trig':
    case 'tmr':
    case 'ctr':
      return ENERGY.stateful;
    case 'jmp':
    case 'jz':
    case 'jnz':
      return ENERGY.jump;
    case 'chk':
      return ENERGY.integer;
    case 'clock':
      return ENERGY.stateful;
    case 'probe':
      return 0;
    case 'errid':
      return ENERGY.move;
    case 'runtime':
      return ENERGY.real;
    case 'comm':
      return ENERGY.stateful;
  }
}
