import type { WorkpieceSpec } from './materials';
import type { Part } from './model';
import type { PartState, Workpiece } from './world';

/**
 * Was die Oberfläche von einer laufenden Anlage braucht. `SandboxPlant` erfüllt das direkt; im
 * Web Worker spiegelt eine Fernansicht den Stand und leitet Eingriffe als Befehle weiter.
 */
export interface WorldView {
  readonly parts: readonly Part[];
  readonly workpieces: readonly Workpiece[];
  readonly time: number;
  readonly spawned: number;
  st(p: Part): PartState;
  find(ref: string): Part | undefined;
  levelOf(tank: Part): number;
  remaining(p: Part): number;
  tally(): { free: number; binned: number; lost: number };
  topAt(x: number, y: number): number;
  releaseEstop(ref: string): void;
  triggerMagazine(ref: string): boolean;
  moveWorkpiece(id: number, x: number, y: number, z?: number): void;
  addWorkpiece(spec: WorkpieceSpec, x: number, y: number, z: number): unknown;
  removeWorkpiece(id: number): void;
}

export interface PlantView {
  readonly world: WorldView;
  sensed(partId: string): boolean | number | undefined;
  setControl(ref: string, value: number | boolean): void;
}
