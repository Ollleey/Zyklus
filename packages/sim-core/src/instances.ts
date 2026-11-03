import type { InstanceKind } from './ir';
import { INT_MAX, INT_MIN } from './types';

/**
 * Zustand einer FB-Instanz (Instanz-DB). Ein gemeinsamer Datensatz für alle Arten hält
 * Lesen per Feldname (`Q`, `ET`, `CV`, …) einfach; nicht benutzte Felder bleiben 0/false.
 */
export interface InstanceState {
  kind: InstanceKind;
  Q: boolean;
  ET: number;
  CV: number;
  QU: boolean;
  QD: boolean;
  /** Kommunikation (TSEND/TRCV) */
  DONE: boolean;
  BUSY: boolean;
  ERROR: boolean;
  NDR: boolean;
  STATUS: number;
  /** Program_Alarm: Meldung quittiert (bzw. keine unquittierte) */
  Ack_State: boolean;
  /** letzter Wert von IN / CU / CLK (Flankenerkennung) */
  m1: boolean;
  /** letzter Wert von CD */
  m2: boolean;
  /** TP: 0 = bereit, 1 = Impuls läuft, 2 = Impuls beendet (wartet auf IN = 0); sonst: läuft */
  phase: number;
  start: number;
  last: number;
}

export function createInstance(kind: InstanceKind): InstanceState {
  return {
    kind,
    Q: false,
    ET: 0,
    CV: 0,
    QU: false,
    QD: false,
    DONE: false,
    BUSY: false,
    ERROR: false,
    NDR: false,
    STATUS: 0x7000,
    Ack_State: true,
    m1: false,
    m2: false,
    phase: 0,
    start: 0,
    last: 0,
  };
}

/**
 * IEC-Zeitglieder. `now` ist der Zeitstempel des Zyklusbeginns in ms, d. h. alle Timer
 * eines Zyklus sehen dieselbe Zeit. Negative PT werden wie 0 behandelt.
 */
export function evalTimer(
  s: InstanceState,
  IN: boolean,
  ptRaw: number,
  now: number,
  R = false,
): void {
  const PT = Math.max(0, ptRaw);
  switch (s.kind) {
    case 'TP': {
      if (s.phase === 0 && IN && !s.m1) {
        s.phase = 1;
        s.start = now;
      }
      if (s.phase === 1) {
        const el = now - s.start;
        if (el >= PT) {
          s.phase = 2;
          s.ET = PT;
          s.Q = false;
        } else {
          s.ET = el;
          s.Q = true;
        }
      }
      if (s.phase === 2 && !IN) s.phase = 0;
      if (s.phase === 0) {
        s.ET = 0;
        s.Q = false;
      }
      break;
    }
    case 'TON': {
      if (!IN) {
        s.phase = 0;
        s.ET = 0;
        s.Q = false;
        break;
      }
      if (s.phase === 0) {
        s.phase = 1;
        s.start = now;
      }
      const el = now - s.start;
      s.ET = Math.min(el, PT);
      s.Q = el >= PT;
      break;
    }
    case 'TOF': {
      if (IN) {
        s.phase = 0;
        s.ET = 0;
        s.Q = true;
        break;
      }
      if (s.m1) {
        s.phase = 1;
        s.start = now;
      }
      if (s.phase === 1) {
        const el = now - s.start;
        if (el >= PT) {
          s.phase = 0;
          s.ET = PT;
          s.Q = false;
        } else {
          s.ET = el;
          s.Q = true;
        }
      }
      break;
    }
    case 'TONR': {
      if (R) {
        s.phase = 0;
        s.ET = 0;
        s.Q = false;
        break;
      }
      if (IN) {
        if (s.phase === 0) s.phase = 1;
        else s.ET = Math.min(s.ET + (now - s.last), Math.max(s.ET, PT));
        s.last = now;
      } else {
        s.phase = 0;
      }
      s.Q = s.ET >= PT && (s.ET > 0 || IN);
      break;
    }
    default:
      throw new Error(`${s.kind} ist kein Zeitglied`);
  }
  s.m1 = IN;
}

export interface CounterInputs {
  cu: boolean;
  cd: boolean;
  r: boolean;
  ld: boolean;
  pv: number;
}

/** IEC-Zähler auf INT. Zählt an steigenden Flanken von CU/CD, bleibt an den INT-Grenzen stehen. */
export function evalCounter(s: InstanceState, x: CounterInputs): void {
  const up = x.cu && !s.m1;
  const down = x.cd && !s.m2;
  s.m1 = x.cu;
  s.m2 = x.cd;
  switch (s.kind) {
    case 'CTU':
      if (x.r) s.CV = 0;
      else if (up && s.CV < INT_MAX) s.CV++;
      s.Q = s.CV >= x.pv;
      // im IEC_COUNTER-DB heißt der Ausgang von CTU „QU“
      s.QU = s.Q;
      break;
    case 'CTD':
      if (x.ld) s.CV = x.pv;
      else if (down && s.CV > INT_MIN) s.CV--;
      s.Q = s.CV <= 0;
      s.QD = s.Q;
      break;
    case 'CTUD':
      if (x.r) s.CV = 0;
      else if (x.ld) s.CV = x.pv;
      else if (up && !down && s.CV < INT_MAX) s.CV++;
      else if (down && !up && s.CV > INT_MIN) s.CV--;
      s.QU = s.CV >= x.pv;
      s.QD = s.CV <= 0;
      break;
    default:
      throw new Error(`${s.kind} ist kein Zähler`);
  }
}

export function evalTrig(s: InstanceState, clk: boolean): void {
  if (s.kind === 'R_TRIG') s.Q = clk && !s.m1;
  else if (s.kind === 'F_TRIG') s.Q = !clk && s.m1;
  else throw new Error(`${s.kind} ist keine Flankenauswertung`);
  s.m1 = clk;
}
