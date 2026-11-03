import { tx } from '../i18n';

/** Englische Beschreibungen der FUP/KOP-Boxen (deutsch steht im Katalog von @zyklus/fup-model) */
const BOX_EN: Record<string, string> = {
  AND: 'AND: output 1 if all inputs are 1.',
  OR: 'OR: output 1 if at least one input is 1.',
  XOR: 'EXCLUSIVE OR: output 1 with an odd number of set inputs.',
  ASSIGN: 'Assignment: writes the result of the logic operation to the operand.',
  SET: 'Set: operand becomes 1 while the input is 1; otherwise unchanged.',
  RESET: 'Reset: operand becomes 0 while the input is 1.',
  SR: 'Set/reset flip-flop, reset dominant.',
  RS: 'Reset/set flip-flop, set dominant.',
  P_TRIG: 'Rising edge: Q is 1 for one cycle when CLK changes from 0 to 1.',
  N_TRIG: 'Falling edge: Q is 1 for one cycle when CLK changes from 1 to 0.',
  R_TRIG: 'Rising edge with instance DB.',
  F_TRIG: 'Falling edge with instance DB.',
  TSEND_C:
    'Send data: a rising edge at REQ sends DATA over connection ID; DONE for one call when it has arrived.',
  TRCV_C: 'Receive data: while EN_R = 1, an arrived message lands in DATA; NDR for one call.',
  PUT: 'Write to the partner CPU: a rising edge at REQ writes SD_1 to the memory address ADDR_1 of the partner CPU.',
  GET: 'Read from the partner CPU: a rising edge at REQ reads ADDR_1 of the partner CPU into RD_1.',
  TP: 'Pulse: Q is 1 for the duration PT after a rising edge at IN.',
  TON: 'On-delay: Q is set PT after IN = 1.',
  TOF: 'Off-delay: Q drops PT after IN = 0.',
  TONR: 'Retentive on-delay, reset with R.',
  CTU: 'Up counter: counts rising edges at CU, Q = CV ≥ PV.',
  CTD: 'Down counter: LD loads PV, Q = CV ≤ 0.',
  CTUD: 'Up/down counter.',
  CMP_EQ: 'Compare for equal.',
  CMP_NE: 'Compare for not equal.',
  CMP_GT: 'Compare for greater.',
  CMP_GE: 'Compare for greater or equal.',
  CMP_LT: 'Compare for less.',
  CMP_LE: 'Compare for less or equal.',
  IN_RANGE: 'Value lies within MIN … MAX.',
  OUT_RANGE: 'Value lies outside MIN … MAX.',
  ADD: 'Add.',
  SUB: 'Subtract: OUT = IN1 − IN2.',
  MUL: 'Multiply.',
  DIV: 'Divide: OUT = IN1 / IN2.',
  MOD: 'Remainder of division.',
  ABS: 'Absolute value.',
  LIMIT: 'Limit to MN … MX.',
  MIN: 'Smallest value.',
  MAX: 'Largest value.',
  NORM_X: 'Normalize to 0.0 … 1.0.',
  SCALE_X: 'Scale from 0.0 … 1.0 to MIN … MAX.',
  MOVE: 'Move a value.',
  CONV: 'Convert to the data type of the output.',
  SEL: 'Select: G = 0 → IN0, G = 1 → IN1.',
  MUX: 'Multiplex: K selects the input, otherwise ELSE.',
  SHL: 'Shift left.',
  SHR: 'Shift right.',
};

/** Beschreibung einer Box in der Anzeigesprache */
export function boxDescription(type: string, de: string): string {
  return BOX_EN[type] ? tx(de, BOX_EN[type]) : de;
}
