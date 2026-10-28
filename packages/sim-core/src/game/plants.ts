import type { Value } from '../types';
import type { Edge, Level, TestCase } from './level';
import { valueAt } from './signals';

/**
 * Dynamisches Anlagenmodell: liefert physikalische Werte für Eingangsgeräte und rechnet mit den
 * Ausgängen der Steuerung weiter. Zeitschritt 1 ms, deterministisch.
 */
export interface Plant {
  /** physikalische Werte der Messgeräte zum aktuellen Zeitpunkt */
  inputs(): Record<string, number | boolean>;
  /** einen Zeitschritt (1 ms) mit den Ausgangswerten (nach Relaisverzögerung) weiterrechnen */
  step(t: number, outputs: Record<string, Value>): void;
  /** Zustandsgrößen für Kriterien und Darstellung (`plant.<name>`) */
  state(): Record<string, number>;
}

type Params = Record<string, unknown>;

/**
 * Tank mit Zulaufpumpe und veränderlichem Ablauf (Angaben in % Füllstand je Sekunde).
 * params: sensor, pump, inflow, level0, outflow (Edge[] in %/s)
 */
class Tank implements Plant {
  private level: number;
  private readonly sensor: string;
  private readonly pump: string;
  private readonly inflow: number;
  private readonly outflow: Edge[];

  constructor(p: Params) {
    this.sensor = String(p.sensor);
    this.pump = String(p.pump);
    this.inflow = Number(p.inflow ?? 10);
    this.level = Number(p.level0 ?? 50);
    this.outflow = (p.outflow as Edge[]) ?? [[0, 4]];
  }

  inputs() {
    return { [this.sensor]: this.level };
  }

  step(t: number, outputs: Record<string, Value>) {
    const q =
      (outputs[this.pump] === true ? this.inflow : 0) - (valueAt(this.outflow, t, 0) as number);
    this.level = Math.min(100, Math.max(0, this.level + q / 1000));
  }

  state() {
    return { level: Math.round(this.level * 100) / 100 };
  }
}

const MODELS: Record<string, (p: Params) => Plant> = {
  tank: (p) => new Tank(p),
};

/** Anlagenmodell zu einem Level (Testparameter überschreiben Levelparameter), sonst undefined. */
export function createPlant(level: Level, test?: TestCase): Plant | undefined {
  const type = level.plant?.type;
  const make = type ? MODELS[type] : undefined;
  return make?.({ ...(level.plant?.params ?? {}), ...(test?.plant ?? {}) });
}
