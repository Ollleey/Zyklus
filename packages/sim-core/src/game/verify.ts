import type { IrProgram } from '../ir';
import type { Solution } from './board';
import type { Edge, Level } from './level';
import { LevelRun } from './run';
import { valueAt } from './signals';

export interface TraceCheck {
  ok: boolean;
  /** Zeitbereiche [von, bis) mit Abweichung außerhalb der Toleranz */
  mismatches: [number, number][];
  expectedEdges: number;
  actualEdges: number;
}

/**
 * Vergleicht Ist- mit Soll-Verlauf. Abweichungen innerhalb ±tol um eine Soll-Flanke zählen nicht
 * (Abtastung im Zyklusraster). Zusätzlich muss die Zahl der Schaltvorgänge stimmen – sonst würden
 * kurze Fehlimpulse (z. B. durch Prellen) innerhalb des Toleranzfensters unbemerkt bleiben.
 */
export function compareTrace(
  expected: Edge[],
  actual: Edge[],
  durationMs: number,
  tol: number,
): TraceCheck {
  const initial = typeof expected[0]?.[1] === 'number' ? 0 : false;
  /** Zeitpunkte echter Wertänderungen */
  const changes = (edges: Edge[]) =>
    edges.filter((e, i) => e[1] !== (i ? edges[i - 1]![1] : initial)).map((e) => e[0]);
  const edgeTimes = changes(expected);
  const mismatches: [number, number][] = [];
  let open: number | undefined;
  for (let t = 0; t < durationMs; t++) {
    const bad =
      valueAt(expected, t, initial) !== valueAt(actual, t, initial) &&
      !edgeTimes.some((te) => Math.abs(t - te) <= tol);
    if (bad && open === undefined) open = t;
    if (!bad && open !== undefined) {
      mismatches.push([open, t]);
      open = undefined;
    }
  }
  if (open !== undefined) mismatches.push([open, durationMs]);
  const expectedEdges = edgeTimes.length;
  const actualEdges = changes(actual).length;
  return {
    ok: mismatches.length === 0 && expectedEdges === actualEdges,
    mismatches,
    expectedEdges,
    actualEdges,
  };
}

export interface RunResult {
  testId: string;
  seed: number;
  passed: boolean;
  checks: Record<string, TraceCheck>;
  /** Meldung, falls eine CPU in STOP gegangen ist */
  stop?: string;
  energy: number;
  traces: Record<string, Edge[]>;
}

export interface Verification {
  passed: boolean;
  runs: RunResult[];
  metrics: {
    cost: number;
    /** durchschnittliche Energie je Testlauf */
    energy: number;
    size: number;
  };
}

/** Führt alle Testfälle mit allen Seeds aus und prüft gegen die Soll-Verläufe. */
export function verifySolution(
  level: Level,
  solution: Solution,
  programs: Map<string, IrProgram>,
  size: number,
): Verification {
  const runs: RunResult[] = [];
  let cost = 0;
  for (const test of level.tests) {
    for (const seed of test.seeds) {
      const run = new LevelRun(level, solution, programs, { test, seed });
      cost = run.analysis.cost;
      run.runToEnd();
      const checks: Record<string, TraceCheck> = {};
      for (const [dev, expected] of Object.entries(test.expect)) {
        checks[dev] = compareTrace(
          expected,
          run.traces.get(dev)!,
          test.durationMs,
          level.toleranceMs,
        );
      }
      const stopped = [...run.cpus.values()].find((c) => c.mode === 'STOP');
      runs.push({
        testId: test.id,
        seed,
        passed: !stopped && Object.values(checks).every((c) => c.ok),
        checks,
        stop: stopped?.stopInfo?.message,
        energy: run.sim.metrics().energy,
        traces: Object.fromEntries(run.traces),
      });
    }
  }
  const energy = runs.length ? Math.round(runs.reduce((s, r) => s + r.energy, 0) / runs.length) : 0;
  return { passed: runs.every((r) => r.passed), runs, metrics: { cost, energy, size } };
}
