import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LevelRun,
  loadCompatible,
  type IrProgram,
  type Level,
  type Solution,
} from '@zyklus/sim-core';
import type { SolutionCompileResult } from '@zyklus/levels';
import { RemoteRun, type Channel } from '../sim/remote';
import type { RunView } from '../sim/types';
import { workerChannel } from '../sim/worker';

export type SimMode = 'test' | 'manual';

/**
 * Rechenzeit je Bild (ms): startet bei 12 und passt sich an die gemessene Bilddauer an, damit
 * auch bei Fremdlast über 50 Bilder je Sekunde bleiben (Ziel: höchstens 18 ms je Bild).
 */
const BUDGET_MAX_MS = 12;
const BUDGET_MIN_MS = 3;
const FRAME_TARGET_MS = 18;
/** Rechenzeit je Block im Worker: blockiert die Darstellung nicht */
const WORKER_BUDGET_MS = 30;

export interface SimControls {
  run: RunView | null;
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
  ensureRun: () => RunView | null;
  /** Bild neu zeichnen (nach Eingriffen ohne laufende Simulation) */
  redraw: () => void;
  /**
   * Programm geändert, der Versuch läuft noch mit dem geladenen Stand (nur Handbetrieb):
   * `loadable` mit Angabe, ob Laden in RUN geht; `broken`: Änderung übersetzt nicht
   */
  pending: { loadable: true; inRun: boolean; reason?: string } | { loadable: false } | null;
  /** geänderte Programme laden */
  load: (opts: { keepValues: boolean; restart: boolean }) => void;
}

const programsKey = (m: Map<string, IrProgram>) => JSON.stringify([...m]);

/**
 * Steuert einen schrittweisen Simulationslauf im Browser (Echtzeit × Faktor). Mit `worker` rechnet
 * ein Web Worker (Sandkasten); ohne Worker-Unterstützung im Hauptthread wie in den Aufträgen.
 */
export function useSimulation(
  level: Level,
  solution: Solution,
  compiled: SolutionCompileResult,
  initialMode: SimMode = 'test',
  worker = false,
): SimControls {
  const runRef = useRef<LevelRun | RemoteRun | null>(null);
  const channelRef = useRef<(Channel & { close: () => void }) | null | undefined>(undefined);
  const [mode, setModeState] = useState<SimMode>(initialMode);
  const [testIdx, setTestIdx] = useState(0);
  const [seed, setSeed] = useState(level.tests[0]?.seeds[0] ?? 1);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const ready = compiled.ok;

  /** Worker-Kanal, einmal je Arbeitsplatz; Antworten gehen an den aktuellen Lauf */
  const channel = () => {
    if (!worker) return null;
    if (channelRef.current === undefined) {
      channelRef.current = workerChannel();
      channelRef.current?.onReply((r) => {
        const run = runRef.current;
        if (run instanceof RemoteRun) run.receive(r);
      });
    }
    return channelRef.current;
  };
  useEffect(() => () => channelRef.current?.close(), []);

  const create = useCallback((): LevelRun | RemoteRun | null => {
    if (!compiled.ok) return null;
    const test = mode === 'test' ? level.tests[testIdx] : undefined;
    const ch = channel();
    if (ch) {
      const r = new RemoteRun(ch, level, solution, compiled.programs, { test, seed });
      r.onUpdate(() => setFrame((f) => f + 1));
      return r;
    }
    try {
      return new LevelRun(level, solution, compiled.programs, { test, seed });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, level, solution, mode, testIdx, seed]);

  // Stand des laufenden Versuchs: geladene Programme, Aufbau, Testauswahl
  const loadedRef = useRef<{ programs: Map<string, IrProgram>; hw: string; ctx: string } | null>(
    null,
  );
  const [pending, setPending] = useState<SimControls['pending']>(null);
  const pendingPrograms = useRef<Map<string, IrProgram> | null>(null);
  const hw = JSON.stringify([solution.modules, solution.wires]);
  const ctx = `${mode}|${testIdx}|${seed}`;

  // Änderungen an Aufbau oder Testauswahl beenden den laufenden Versuch; im Handbetrieb läuft
  // nach einer Programmänderung der geladene Stand weiter, bis „Laden“ gewählt wird (wie in TIA)
  useEffect(() => {
    const loaded = loadedRef.current;
    if (runRef.current && mode === 'manual' && loaded && loaded.hw === hw && loaded.ctx === ctx) {
      if (!compiled.ok) {
        setPending({ loadable: false });
        return;
      }
      if (programsKey(compiled.programs) === programsKey(loaded.programs)) {
        setPending(null);
        return;
      }
      let inRun = true;
      let reason: string | undefined;
      for (const [id, p] of compiled.programs) {
        const before = loaded.programs.get(id);
        const r = before ? loadCompatible(before, p) : { ok: false as const, reason: 'neue CPU' };
        if (!r.ok) {
          inRun = false;
          reason = r.reason;
        }
      }
      pendingPrograms.current = compiled.programs;
      setPending({ loadable: true, inRun, reason });
      return;
    }
    runRef.current = null;
    loadedRef.current = null;
    setPending(null);
    setRunning(false);
    setFrame((f) => f + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create]);

  const ensure = () => {
    if (!runRef.current || (runRef.current.done && mode === 'test')) {
      runRef.current = create();
      loadedRef.current = runRef.current ? { programs: compiled.programs, hw, ctx } : null;
      setPending(null);
    }
    return runRef.current;
  };

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let budget = BUDGET_MAX_MS;
    let id = 0;
    // Worker: Wandzeit seit dem letzten Auftrag, damit Wartezeit nicht verloren geht
    let lastSent = performance.now();
    const loop = (now: number) => {
      const run = runRef.current;
      if (!run) return;
      if (run instanceof RemoteRun) {
        if (run.error || run.done) {
          setRunning(false);
          return;
        }
        if (!run.busy) {
          const dt = Math.min(100, now - lastSent);
          lastSent = now;
          run.advance(run.time + Math.max(1, Math.round(dt * speed)) - 1, WORKER_BUDGET_MS);
        }
        id = requestAnimationFrame(loop);
        return;
      }
      const frameMs = now - last;
      const dt = Math.min(100, frameMs);
      last = now;
      // Bild zu lang: weniger rechnen; Luft vorhanden: langsam wieder mehr
      if (frameMs > FRAME_TARGET_MS) budget = Math.max(BUDGET_MIN_MS, budget * 0.8);
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
      loadedRef.current = null;
      pendingPrograms.current = null;
      setPending(null);
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
    pending,
    load: (opts) => {
      const run = runRef.current;
      const programs = pendingPrograms.current;
      if (!run || !programs || !loadedRef.current) return;
      run.load(programs, opts);
      loadedRef.current = { ...loadedRef.current, programs };
      pendingPrograms.current = null;
      setPending(null);
      setFrame((f) => f + 1);
    },
  };
}
