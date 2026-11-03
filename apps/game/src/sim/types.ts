import type {
  DataType,
  DiagEntry,
  Edge,
  InstanceField,
  IrProgram,
  StopInfo,
  Value,
} from '@zyklus/sim-core';
import type { PlantView } from '@zyklus/plant-sim';

/** Was die Oberfläche von einer CPU im Lauf liest */
export interface CpuView {
  readonly mode: 'RUN' | 'STOP';
  readonly stopInfo?: StopInfo;
  readonly load: number;
  /** aktive Forceaufträge (MAINT-LED) */
  readonly forceCount: number;
  /** Messpunkte des Programms (Bedingungen, Durchläufe) */
  readonly probes: readonly Value[];
  /** anstehende Diagnosen (ERROR-LED) und Diagnosepuffer (neueste zuerst) */
  readonly diagActive: number;
  readonly diagnostics: readonly DiagEntry[];
  read(address: string, t?: DataType): Value;
  readImage(address: string, t?: DataType): Value;
  readSlot(name: string): Value;
  readInstance(name: string, field: InstanceField): Value;
}

/**
 * Was die Oberfläche von einem Simulationslauf braucht. `LevelRun` erfüllt das direkt, `RemoteRun`
 * spiegelt einen Lauf im Web Worker.
 */
export interface RunView {
  readonly time: number;
  readonly done: boolean;
  readonly traces: Map<string, Edge[]>;
  readonly cpus: Map<string, CpuView>;
  readonly plant?: unknown;
  readonly forcedIds: string[];
  forced(deviceId: string): boolean | number | undefined;
  force(deviceId: string, value: boolean | number | undefined): void;
  isActuated(deviceId: string): boolean | number;
  setManual(deviceId: string, value: boolean | number): void;
  setCpuSwitch(cpuId: string, mode: 'RUN' | 'STOP'): void;
  /** Spannung aus und wieder ein (Neustart) */
  powerCycle(cpuId: string): void;
  /** Forceauftrag an einer E/A-Adresse (`undefined` hebt auf) */
  setForce(cpuId: string, address: string, value: Value | undefined): void;
  /** Trace: Programmvariable als Spur `key` aufzeichnen (`undefined` beendet) */
  traceVariable(
    key: string,
    spec: { cpu: string; target: { address: string } | { slot: string } } | undefined,
  ): void;
  /** erreichter Haltepunkt (die Simulation hält an) */
  readonly breakHit: { cpu: string; block: string; line: number; time: number } | null;
  setBreakpoints(cpuId: string, lines: { block: string; line: number }[]): void;
  clearBreak(): void;
  /** geänderte Programme laden (in RUN bzw. mit STOP) */
  load(programs: Map<string, IrProgram>, opts: { keepValues: boolean; restart: boolean }): void;
  /** Steuern: Wert einmalig schreiben */
  modify(cpuId: string, target: { address: string } | { slot: string }, value: Value): void;
}

/** Anlage des Sandkastens im Lauf (direkt oder gespiegelt) */
export function plantOf(run: RunView | null | undefined): PlantView | null {
  const p = run?.plant as PlantView | undefined;
  return p && typeof p === 'object' && 'world' in p ? p : null;
}
