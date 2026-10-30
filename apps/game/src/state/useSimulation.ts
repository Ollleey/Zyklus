import { useCallback, useEffect, useRef, useState } from 'react';
import { LevelRun, type Level, type Solution } from '@zyklus/sim-core';
import type { SolutionCompileResult } from '@zyklus/levels';

export type SimMode = 'test' | 'manual';

/**
 * Rechenzeit je Bild (ms): startet bei 12 und passt sich an die gemessene Bilddauer an, damit
 * auch bei Fremdlast über 50 Bilder je Sekunde bleiben (Ziel: höchstens 18 ms je Bild).
 */
const BUDGET_MAX_MS = 12;
const BUDGET_MIN_MS = 3;
const FRAME_TARGET_MS = 18;

export interface SimControls {
  run: LevelRun | null;
  mode: SimMode;
  testIdx: number;
  seed: number;
  running: boolean;
  speed: number;
  /** ändert sich bei jedem dargestellten Schritt (für Neuzeichnen) */
  frame: number;
  ready: boolean;
  setMode: (m: SimMode) => void;
  select: (testIdx: number, seed: number) => void;
  play: () => void;
  pause: () => void;
  step: () => void;
  reset: () => void;
  setSpeed: (s: number) => void;
  setManual: (device: string, v: boolean | number) => void;
  /** laufenden Versuch holen bzw. anlegen (Bedienung in der Anlage vor dem Start) */
  ensureRun: () => LevelRun | null;
  /** Bild neu zeichnen (nach Eingriffen ohne laufende Simulation) */
  redraw: () => void;
}

/** Steuert einen schrittweisen Simulationslauf im Browser (Echtzeit × Faktor). */
export function useSimulation(
  level: Level,
  solution: Solution,
  compiled: SolutionCompileResult,
  initialMode: SimMode = 'test',
): SimControls {
  const runRef = useRef<LevelRun | null>(null);
  const [mode, setModeState] = useState<SimMode>(initialMode);
  const [testIdx, setTestIdx] = useState(0);
  const [seed, setSeed] = useState(level.tests[0]?.seeds[0] ?? 1);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const ready = compiled.ok;

  const create = useCallback((): LevelRun | null => {
    if (!compiled.ok) return null;
    try {
      const test = mode === 'test' ? level.tests[testIdx] : undefined;
      return new LevelRun(level, solution, compiled.programs, { test, seed });
    } catch {
      return null;
    }
  }, [compiled, level, solution, mode, testIdx, seed]);

  // Änderungen an Aufbau, Programm oder Testauswahl beenden den laufenden Versuch
  useEffect(() => {
    runRef.current = null;
    setRunning(false);
    setFrame((f) => f + 1);
  }, [create]);

  const ensure = () => {
    if (!runRef.current || (runRef.current.done && mode === 'test')) runRef.current = create();
    return runRef.current;
  };

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let budget = BUDGET_MAX_MS;
    let id = 0;
    const loop = (now: number) => {
      const run = runRef.current;
      if (!run) return;
      const frame = now - last;
      const dt = Math.min(100, frame);
      last = now;
      // Bild zu lang: weniger rechnen; Luft vorhanden: langsam wieder mehr
      if (frame > FRAME_TARGET_MS) budget = Math.max(BUDGET_MIN_MS, budget * 0.8);
      else budget = Math.min(BUDGET_MAX_MS, budget + 0.25);
      // Rechenzeit je Bild begrenzen: unter Volllast läuft die Simulation langsamer als
      // eingestellt, die Darstellung bleibt flüssig
      const target = run.time + Math.max(1, Math.round(dt * speed)) - 1;
      const start = performance.now();
      while (run.time <= target && !run.done && performance.now() - start < budget) {
        run.runTo(Math.min(target, run.time + 25));
      }
      setFrame((f) => f + 1);
      if (run.done) {
        setRunning(false);
        return;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [running, speed]);

  return {
    run: runRef.current,
    mode,
    testIdx,
    seed,
    running,
    speed,
    frame,
    ready,
    setMode: (m) => setModeState(m),
    select: (i, s) => {
      setModeState('test');
      setTestIdx(i);
      setSeed(s);
    },
    play: () => {
      if (ensure()) setRunning(true);
    },
    pause: () => setRunning(false),
    step: () => {
      setRunning(false);
      ensure()?.stepCycle();
      setFrame((f) => f + 1);
    },
    reset: () => {
      setRunning(false);
      runRef.current = null;
      setFrame((f) => f + 1);
    },
    setSpeed,
    setManual: (device, v) => {
      const run = ensure();
      run?.setManual(device, v);
      setFrame((f) => f + 1);
    },
    ensureRun: ensure,
    redraw: () => setFrame((f) => f + 1),
  };
}
