import type { IrProgram } from '../ir';
import type { Solution } from './board';
import { probeKey, type Check, type Edge, type Level } from './level';
import type { Text } from './text';
import type { Value } from '../types';
import { LevelRun, type RunOptions } from './run';
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
  /** Ergebnisse der Kriterien (Bereich, Verriegelung, …) */
  criteria: CriterionResult[];
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
    /** nur Bestandsanlage: geänderte Zeilen */
    changes?: number;
  };
}

export interface CriterionResult {
  name: Text;
  ok: boolean;
  /** Erläuterung bei Verletzung, z. B. „bei 2.31 s: 87.4“ */
  detail?: string;
}

const sec = (t: number) => `${(t / 1000).toFixed(2)} s`;

/** Prüft ein Kriterium über den aufgezeichneten Verläufen (Auflösung 1 ms). */
export function evaluateCheck(
  c: Check,
  traces: Record<string, Edge[]>,
  durationMs: number,
  probes: Map<string, Value | undefined> = new Map(),
): CriterionResult {
  const at = (sig: string, t: number) => valueAt(traces[sig] ?? [], t, false);
  const num = (sig: string, t: number) => Number(at(sig, t));
  const from = 'from' in c && c.from !== undefined ? c.from : 0;
  const to = Math.min(durationMs, 'to' in c && c.to !== undefined ? c.to : durationMs);
  const fail = (detail: string): CriterionResult => ({ name: c.name, ok: false, detail });

  switch (c.kind) {
    case 'value': {
      const key = probeKey(c);
      if (!probes.has(key)) return fail(`Variable ${c.variable} nicht gefunden`);
      const v = probes.get(key);
      const show = (x: Value | undefined) => (typeof x === 'string' ? `'${x}'` : String(x));
      if (v !== c.value)
        return fail(`bei ${sec(c.at)}: ${c.variable} = ${show(v)} statt ${show(c.value)}`);
      break;
    }
    case 'always':
      for (let t = from; t < to; t++) {
        if (at(c.signal, t) !== c.value)
          return fail(`bei ${sec(t)} ist ${c.signal} = ${at(c.signal, t) ? 1 : 0}`);
      }
      break;
    case 'range':
      for (let t = from; t < to; t++) {
        const v = num(c.signal, t);
        if (v < c.min || v > c.max) return fail(`bei ${sec(t)}: ${Math.round(v * 100) / 100}`);
      }
      break;
    case 'exclusive':
      for (let t = from; t < to; t++) {
        const on = c.signals.filter((s) => at(s, t) === true);
        if (on.length > 1) return fail(`bei ${sec(t)} gleichzeitig: ${on.join(', ')}`);
      }
      break;
    case 'maxChanges': {
      const edges = (traces[c.signal] ?? []).filter(
        (e, i, all) => i > 0 && e[1] !== all[i - 1]![1] && e[0] >= from && e[0] < to,
      );
      if (edges.length > c.max) return fail(`${edges.length} Schaltvorgänge (erlaubt ${c.max})`);
      break;
    }
    case 'duty': {
      const p = c.periodMs;
      const changes = c.duty.map(([t]) => t).filter((t) => t > 0);
      for (let w = from; w + p <= to; w += p) {
        // ein Fenster nach jeder Sollwertänderung einschwingen lassen
        if (changes.some((tc) => tc > w - p && tc < w + p)) continue;
        const want = Number(valueAt(c.duty, w, 0));
        let on = 0;
        for (let t = w; t < w + p; t++) if (at(c.signal, t) === true) on++;
        const got = (on / p) * 100;
        if (Math.abs(got - want) > c.tolerance) {
          return fail(`Fenster ab ${sec(w)}: ${Math.round(got * 10) / 10} % statt ${want} %`);
        }
      }
      break;
    }
    case 'track':
      for (let t = from; t < to; t++) {
        const d = num(c.signal, t) - num(c.reference, t);
        if (Math.abs(d) > c.tolerance) return fail(`bei ${sec(t)} Abweichung ${Math.round(d)}`);
      }
      break;
  }
  return { name: c.name, ok: true };
}

/** Führt alle Testfälle mit allen Seeds aus und prüft gegen Soll-Verläufe und Kriterien. */
export function verifySolution(
  level: Level,
  solution: Solution,
  programs: Map<string, IrProgram>,
  size: number,
  forces?: RunOptions['forces'],
  /** Bestandsanlage: geänderte Zeilen gegenüber dem gelieferten Programm */
  changes?: number,
): Verification {
  const forced = Object.values(forces ?? {}).some((l) => l.length > 0);
  const runs: RunResult[] = [];
  let cost = 0;
  for (const test of level.tests) {
    for (const seed of test.seeds) {
      const run = new LevelRun(level, solution, programs, { test, seed, forces });
      cost = run.analysis.cost;
      run.runToEnd();
      const checks: Record<string, TraceCheck> = {};
      const traces = Object.fromEntries(run.traces);
      const criteria = (test.checks ?? []).map((c) =>
        evaluateCheck(c, traces, test.durationMs, run.probes),
      );
      // wie an der Anlage: mit aktiven Forceaufträgen wird nicht abgenommen
      if (forced) criteria.push({ name: { de: 'Keine Forceaufträge aktiv' }, ok: false });
      for (const [dev, expected] of Object.entries(test.expect ?? {})) {
        checks[dev] = compareTrace(
          expected,
          run.traces.get(dev)!,
          test.durationMs,
          level.toleranceMs,
        );
      }
      const stopped = [...run.cpus.values()].find(
        (c) => c.mode === 'STOP' && c.stopInfo?.reason !== 'POWER',
      );
      runs.push({
        testId: test.id,
        seed,
        passed: !stopped && Object.values(checks).every((c) => c.ok) && criteria.every((c) => c.ok),
        checks,
        criteria,
        stop: stopped?.stopInfo?.message,
        energy: run.sim.metrics().energy,
        traces,
      });
    }
  }
  const energy = runs.length ? Math.round(runs.reduce((s, r) => s + r.energy, 0) / runs.length) : 0;
  return {
    passed: runs.every((r) => r.passed),
    runs,
    metrics: { cost, energy, size, ...(level.given ? { changes: changes ?? 0 } : {}) },
  };
}
