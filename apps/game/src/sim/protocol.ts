import type {
  DataType,
  Edge,
  InstanceField,
  IrProgram,
  Level,
  RunOptions,
  Solution,
  StopInfo,
  Value,
} from '@zyklus/sim-core';
import type { PartState, WorkpieceSpec, WorkpieceState } from '@zyklus/plant-sim';

/** Lesewunsch der Oberfläche an eine CPU (Kanal-LEDs, Beobachten) */
export type Query =
  | { kind: 'read'; cpu: string; address: string; t?: DataType }
  | { kind: 'image'; cpu: string; address: string; t?: DataType }
  | { kind: 'slot'; cpu: string; name: string }
  | { kind: 'instance'; cpu: string; name: string; field: InstanceField };

export const queryKey = (q: Query): string =>
  q.kind === 'slot'
    ? `slot|${q.cpu}|${q.name}`
    : q.kind === 'instance'
      ? `inst|${q.cpu}|${q.name}|${q.field}`
      : `${q.kind}|${q.cpu}|${q.address}|${q.t ?? ''}`;

/** Befehle vom Hauptthread an den Worker */
export type Command =
  | {
      type: 'init';
      epoch: number;
      level: Level;
      solution: Solution;
      programs: [string, IrProgram][];
      opts: RunOptions;
    }
  /** bis `time` weiterrechnen, höchstens `budgetMs` Rechenzeit, dann Schnappschuss */
  | { type: 'advance'; time: number; budgetMs: number }
  | { type: 'stepCycle'; cpu?: string }
  | { type: 'queries'; queries: Query[] }
  | { type: 'manual'; device: string; value: boolean | number }
  | { type: 'force'; device: string; value: boolean | number | undefined }
  | { type: 'cpuSwitch'; cpu: string; mode: 'RUN' | 'STOP' }
  | { type: 'powerCycle'; cpu: string }
  | { type: 'cpuForce'; cpu: string; address: string; value: Value | undefined }
  | { type: 'breakpoints'; cpu: string; lines: { block: string; line: number }[] }
  | { type: 'clearBreak' }
  | {
      type: 'load';
      programs: [string, IrProgram][];
      keepValues: boolean;
      restart: boolean;
    }
  | {
      type: 'traceVar';
      key: string;
      spec?: { cpu: string; target: { address: string } | { slot: string } };
    }
  | { type: 'modify'; cpu: string; target: { address: string } | { slot: string }; value: Value }
  | { type: 'control'; ref: string; value: boolean | number }
  | { type: 'estop'; ref: string }
  | { type: 'magazine'; ref: string }
  | { type: 'moveWp'; id: number; x: number; y: number; z?: number }
  | { type: 'addWp'; spec: WorkpieceSpec; x: number; y: number; z: number }
  | { type: 'removeWp'; id: number }
  /** Schnappschuss ohne Weiterrechnen (nach Eingriffen im Stillstand) */
  | { type: 'snapshot' };

/** kompaktes Werkstück für die Darstellung */
export type WpTuple = [
  id: number,
  material: WorkpieceSpec['material'],
  color: WorkpieceSpec['color'],
  size: WorkpieceSpec['size'],
  x: number,
  y: number,
  z: number,
  s: number,
  h: number,
  state: WorkpieceState,
  grounded: boolean,
  angle: number,
];

export interface PlantSnapshot {
  time: number;
  spawned: number;
  tally: { free: number; binned: number; lost: number };
  states: [partId: string, state: PartState][];
  sensed: [partId: string, value: boolean | number | undefined][];
  workpieces: WpTuple[];
}

export interface CpuSnapshot {
  id: string;
  mode: 'RUN' | 'STOP';
  stopInfo?: StopInfo;
  load: number;
  forceCount: number;
  probes: Value[];
}

/** Stand des Laufs nach einem Rechenblock */
export interface Snapshot {
  type: 'snapshot';
  /** Laufnummer: Antworten eines alten Laufs werden verworfen */
  epoch: number;
  time: number;
  done: boolean;
  /** neue Flanken je Spur seit dem letzten Schnappschuss */
  traces: [key: string, edges: Edge[]][];
  cpus: CpuSnapshot[];
  forced: [device: string, value: boolean | number][];
  breakHit: { cpu: string; block: string; line: number; time: number } | null;
  /** Antworten auf die Lesewünsche; Fehler als `{ error }` */
  values: [key: string, value: boolean | number | { error: string }][];
  plant?: PlantSnapshot;
}

export interface InitError {
  type: 'error';
  epoch: number;
  message: string;
}

export type Reply = Snapshot | InitError;
