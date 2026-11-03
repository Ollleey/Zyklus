import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { tx } from '../i18n';
import { compareTrace, tr, valueAt, type Edge, type Level, type TestCase } from '@zyklus/sim-core';
import type { RunView } from '../sim/types';
import { formatValue, useBoolFormat } from '../state/prefs';

const LABEL_W = 190;
const RIGHT = 12;
const AXIS_H = 22;

interface Row {
  key: string;
  label: string;
  analog: boolean;
  kind: 'di' | 'do' | 'ai' | 'ao' | 'plant';
  /** Wertebereich der Achse; bei Anlagenwerten aus den Daten */
  range?: [number, number];
}

/** Größe des Containers in Pixeln (damit Text nicht verzerrt wird). */
function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 800, h: 240 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({
        w: Math.max(320, Math.floor(e!.contentRect.width)),
        h: Math.max(120, Math.floor(e!.contentRect.height)),
      }),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Bereich mit etwas Luft, damit flache Verläufe nicht am Rand kleben */
function dataRange(edges: Edge[]): [number, number] {
  let lo = 0;
  let hi = 1;
  for (const [, v] of edges) {
    const n = Number(v);
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  const pad = (hi - lo) * 0.08;
  return [lo - (lo < 0 ? pad : 0), hi + pad];
}

const fmtT = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 2 : 0)} s` : `${t} ms`);

interface Props {
  level: Level;
  run: RunView | null;
  test?: TestCase;
  /** nur diese Spuren zeigen (Geräte-ids bzw. `plant.<größe>`), Reihenfolge wie angegeben */
  signals?: string[];
  /** Trace: Operand einer Programmvariablen auflösen (erste CPU) */
  resolveVariable?: (
    text: string,
  ) => { cpu: string; target: { address: string } | { slot: string } } | { error: string };
}

type TriggerCond = 'rise' | 'fall' | 'eq' | 'gt' | 'lt';

export interface TraceConfig {
  signal: string;
  cond: TriggerCond;
  value: number;
  pre: number;
  post: number;
}

const COND_LABEL: Record<TriggerCond, string> = {
  rise: tx('steigende Flanke', 'rising edge'),
  fall: tx('fallende Flanke', 'falling edge'),
  eq: tx('Wert =', 'value ='),
  gt: tx('Wert >', 'value >'),
  lt: tx('Wert <', 'value <'),
};

/** Erster Zeitpunkt ab `from`, an dem die Triggerbedingung zutrifft */
export function findTrigger(edges: Edge[], c: TraceConfig, from: number): number | undefined {
  let prev: Edge[1] | undefined = valueAt(edges, from - 1, false);
  for (const [t, v] of edges) {
    if (t < from) continue;
    const n = Number(v);
    const hit =
      c.cond === 'rise'
        ? !!v && !prev
        : c.cond === 'fall'
          ? !v && !!prev
          : c.cond === 'eq'
            ? n === c.value
            : c.cond === 'gt'
              ? n > c.value
              : n < c.value;
    if (hit) return t;
    prev = v;
  }
  return undefined;
}

/**
 * Zeitdiagramm wie ein Logikanalysator: Ist kräftig (Bool cyan, Analog violett), Soll gestrichelt
 * dahinter, Abweichungen rot schraffiert. Der Zeiger zeigt Zeit und alle Werte; Klick heftet ihn
 * an, Klick auf eine Abweichung springt an deren Anfang.
 */
export function LogicAnalyzer({ level, run, test, signals, resolveVariable }: Props) {
  const [box, size] = useSize<HTMLDivElement>();
  const boolFormat = useBoolFormat();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [pinT, setPinT] = useState<number | null>(null);
  const now = run?.time ?? 0;

  // Trace: Variablen, ausgeblendete Spuren, Trigger
  const [vars, setVars] = useState<string[]>([]);
  const [varText, setVarText] = useState('');
  const [varError, setVarError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [trig, setTrig] = useState<TraceConfig>({
    signal: '',
    cond: 'rise',
    value: 0,
    pre: 500,
    post: 2000,
  });
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [hitAt, setHitAt] = useState<number | null>(null);
  useEffect(() => {
    setArmedAt(null);
    setHitAt(null);
  }, [run, test]);
  const varKey = vars.join('|');
  useEffect(() => {
    if (!run || !resolveVariable) return;
    for (const v of vars) {
      const spec = resolveVariable(v);
      run.traceVariable(`var.${v}`, 'error' in spec ? undefined : spec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, varKey]);
  const triggerEdges = trig.signal ? run?.traces.get(trig.signal) : undefined;
  const found =
    armedAt !== null && hitAt === null && triggerEdges
      ? findTrigger(triggerEdges, trig, armedAt)
      : undefined;
  useEffect(() => {
    if (found !== undefined) setHitAt(found);
  }, [found]);

  const t0 = hitAt !== null ? Math.max(0, hitAt - trig.pre) : test ? 0 : Math.max(0, now - 5000);
  const t1 =
    hitAt !== null
      ? Math.max(hitAt + trig.post, t0 + 100)
      : test
        ? test.durationMs
        : Math.max(5000, now);
  const W = size.w;
  const plotW = W - LABEL_W - RIGHT;
  const xOf = (t: number) => LABEL_W + ((t - t0) / (t1 - t0)) * plotW;
  const tOf = (x: number) => t0 + ((x - LABEL_W) / plotW) * (t1 - t0);

  useEffect(() => setPinT(null), [run, test]);

  const traceKeys = [...(run?.traces.keys() ?? [])].filter((k) => k.startsWith('plant.')).join();
  const rows = useMemo(() => {
    const isInput = (k: string) => k === 'DI' || k === 'AI';
    const out: Row[] = [
      ...level.devices.filter((d) => isInput(d.kind)),
      ...level.devices.filter((d) => !isInput(d.kind)),
    ].map((d) => ({
      key: d.id,
      label: `${d.label ?? d.id} ${tr(d.name).replace(/\s*\([^)]*\)$/, '')}`,
      analog: d.kind === 'AI' || d.kind === 'AO',
      kind: d.kind.toLowerCase() as Row['kind'],
      range: [0, 27648] as [number, number],
    }));
    for (const k of traceKeys ? traceKeys.split(',') : []) {
      out.push({ key: k, label: `${tx('Anlage', 'Plant')}: ${k.slice(6)}`, analog: true, kind: 'plant' });
    }
    if (!signals) return out;
    const byKey = new Map(out.map((r) => [r.key, r]));
    return signals.map((k) => byKey.get(k)).filter((r): r is Row => !!r);
  }, [level, traceKeys, signals]);
  // Programmvariablen: Bool als Stufe, Zahlen als Linie (Art aus dem ersten Wert)
  const varRows: Row[] = vars.map((v) => {
    const first = run?.traces.get(`var.${v}`)?.[0]?.[1];
    return { key: `var.${v}`, label: v, analog: typeof first === 'number', kind: 'plant' };
  });
  const allRows = [...rows, ...varRows];
  const shownRows = allRows.filter((r) => !hidden.has(r.key));

  // Spurhöhe so, dass das Diagramm den Bereich füllt (Analogspuren doppelt so hoch)
  const units = shownRows.reduce((n, r) => n + (r.analog ? 2 : 1), 0) || 1;
  const rowH = Math.max(18, Math.min(64, Math.floor((size.h - AXIS_H - 2) / units)));
  const rowY: number[] = [];
  let height = 0;
  for (const r of shownRows) {
    rowY.push(height);
    height += r.analog ? rowH * 2 : rowH;
  }
  const plotBottom = height;
  height += AXIS_H;

  const cursorT = pinT ?? hoverT;

  /** Analogverlauf als Linie */
  const line = (edges: Edge[], until: number, y: number, h: number, range: [number, number]) => {
    if (!edges.length) return '';
    const [lo, hi] = range;
    const yOf = (v: number) =>
      y + h - 4 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (h - 8);
    const end = Math.min(until, t1);
    const pts: string[] = [];
    for (let px = xOf(t0); px <= xOf(end); px += 1.5) {
      pts.push(`${px.toFixed(1)},${yOf(Number(valueAt(edges, tOf(px), 0))).toFixed(1)}`);
    }
    return pts.length ? `M${pts.join(' L')}` : '';
  };

  const step = (edges: Edge[], until: number, y: number, h: number) => {
    const hi = y + 5;
    const lo = y + h - 6;
    const visible = edges.filter((e) => e[0] <= until);
    let d = `M${xOf(t0)},${valueAt(visible, t0) ? hi : lo}`;
    for (const [t, v] of visible) {
      if (t < t0) continue;
      d += ` H${xOf(t)} V${v ? hi : lo}`;
    }
    d += ` H${xOf(Math.min(until, t1))}`;
    return d;
  };

  const ticks: number[] = [];
  const span = t1 - t0;
  const unit =
    span > 20000 ? 5000 : span > 8000 ? 2000 : span > 4000 ? 1000 : span > 1500 ? 500 : 200;
  for (let t = Math.ceil(t0 / unit) * unit; t <= t1; t += unit) ticks.push(t);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHoverT(x >= LABEL_W && x <= W - RIGHT ? Math.round(tOf(x)) : null);
  };

  const addVar = () => {
    const text = varText.trim();
    if (!text || vars.includes(text)) return;
    const r = resolveVariable?.(text);
    if (!r || 'error' in r) {
      setVarError(r && 'error' in r ? r.error : tx('nicht möglich', 'not possible'));
      return;
    }
    setVarError('');
    setVars([...vars, text]);
    setVarText('');
  };
  const status =
    hitAt !== null
      ? `${tx('ausgelöst bei', 'triggered at')} ${fmtT(hitAt)}${now < hitAt + trig.post ? tx(' – Nachlauf läuft', ' – post-trigger running') : ''}`
      : armedAt !== null
        ? 'wartet auf Trigger …'
        : '';

  return (
    <div className="analyzer-wrap">
      <div className="trace-bar">
        <details className="trace-signals">
          <summary>
            {tx('Signale', 'Signals')} ({shownRows.length}/{allRows.length})
          </summary>
          <div className="trace-pop">
            {allRows.map((r) => (
              <label key={r.key}>
                <input
                  type="checkbox"
                  checked={!hidden.has(r.key)}
                  onChange={(e) => {
                    const n = new Set(hidden);
                    if (e.target.checked) n.delete(r.key);
                    else n.add(r.key);
                    setHidden(n);
                  }}
                />{' '}
                {r.label}
                {r.key.startsWith('var.') && (
                  <button
                    className="icon-btn"
                    title="Variable entfernen"
                    onClick={(e) => {
                      e.preventDefault();
                      run?.traceVariable(r.key, undefined);
                      setVars(vars.filter((x) => `var.${x}` !== r.key));
                    }}
                  >
                    ✕
                  </button>
                )}
              </label>
            ))}
            {resolveVariable && (
              <div className="trace-addvar">
                <input
                  value={varText}
                  placeholder={tx('+ Variable, z. B. "Daten".Wert', '+ variable, e.g. "Daten".Wert')}
                  onChange={(e) => setVarText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addVar()}
                  spellCheck={false}
                />
                <button className="btn btn-small" onClick={addVar}>
                  +
                </button>
                {varError && <span className="trace-error">{varError}</span>}
              </div>
            )}
          </div>
        </details>
        <span className="trace-label">Trigger</span>
        <select
          value={trig.signal}
          onChange={(e) => setTrig({ ...trig, signal: e.target.value })}
          aria-label="Triggersignal"
        >
          <option value="">–</option>
          {allRows.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={trig.cond}
          onChange={(e) => setTrig({ ...trig, cond: e.target.value as TriggerCond })}
          aria-label="Triggerbedingung"
        >
          {(Object.keys(COND_LABEL) as TriggerCond[]).map((c) => (
            <option key={c} value={c}>
              {COND_LABEL[c]}
            </option>
          ))}
        </select>
        {(trig.cond === 'eq' || trig.cond === 'gt' || trig.cond === 'lt') && (
          <input
            type="number"
            className="trace-num"
            value={trig.value}
            onChange={(e) => setTrig({ ...trig, value: Number(e.target.value) || 0 })}
            aria-label="Vergleichswert"
          />
        )}
        <label className="trace-label">
          {tx('Vorlauf', 'Pre-trigger')}{' '}
          <input
            type="number"
            className="trace-num"
            min={0}
            step={100}
            value={trig.pre}
            onChange={(e) => setTrig({ ...trig, pre: Math.max(0, Number(e.target.value) || 0) })}
          />{' '}
          ms
        </label>
        <label className="trace-label">
          {tx('Nachlauf', 'Post-trigger')}{' '}
          <input
            type="number"
            className="trace-num"
            min={100}
            step={100}
            value={trig.post}
            onChange={(e) =>
              setTrig({ ...trig, post: Math.max(100, Number(e.target.value) || 100) })
            }
          />{' '}
          ms
        </label>
        {armedAt === null && hitAt === null ? (
          <button
            className="btn btn-small"
            disabled={!trig.signal || !run}
            onClick={() => setArmedAt(now)}
            title="Ab jetzt auf den Trigger warten"
          >
            ● {tx('Scharf schalten', 'Arm')}
          </button>
        ) : (
          <button
            className="btn btn-small"
            onClick={() => {
              setArmedAt(null);
              setHitAt(null);
            }}
          >
            ■ Freigeben
          </button>
        )}
        {status && <span className="trace-status">{status}</span>}
      </div>
      <div ref={box} className="analyzer-box">
        <svg
          className="analyzer"
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label="Zeitdiagramm"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverT(null)}
          onClick={() => setPinT(pinT === null && hoverT !== null ? hoverT : null)}
        >
          <defs>
            <pattern id="la-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="rgba(229, 72, 77, 0.18)" />
              <path d="M0,6 L6,0" stroke="rgba(229, 72, 77, 0.8)" strokeWidth="1.2" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={xOf(t)} x2={xOf(t)} y1={0} y2={plotBottom} className="grid" />
              <text x={xOf(t)} y={height - 7} className="tick">
                {fmtT(t)}
              </text>
            </g>
          ))}
          {shownRows.map((r, i) => {
            const y = rowY[i]!;
            const h = r.analog ? rowH * 2 : rowH;
            const actual = run?.traces.get(r.key) ?? [];
            const v = actual.length
              ? valueAt(actual, cursorT ?? now, r.analog ? 0 : false)
              : undefined;
            const shown = formatValue(v, boolFormat, r.kind === 'plant' ? 1 : 0);
            const ly = r.analog ? y + 17 : y + h / 2 + 4;
            const head = (
              <>
                <rect x={0} y={y} width={W} height={h} className={i % 2 ? 'row-odd' : 'row-even'} />
                <text x={10} y={ly} className="row-label">
                  {r.label}
                </text>
                <text x={LABEL_W - 10} y={ly} className="row-value">
                  {shown}
                </text>
              </>
            );
            if (r.analog) {
              const truth = run?.traces.get(`true.${r.key}`);
              const range = r.range ?? dataRange(actual);
              return (
                <g key={r.key}>
                  {head}
                  <text x={LABEL_W - 10} y={y + h - 4} className="row-axis">
                    {Math.round(range[0])} … {Math.round(range[1])}
                  </text>
                  {truth && (
                    <path
                      d={line(truth, now, y, h, range)}
                      className="trace-expected trace-truth"
                    />
                  )}
                  <path
                    d={line(actual, now, y, h, range)}
                    className={`trace trace-analog ${r.kind === 'plant' ? 'trace-plant' : ''}`}
                  />
                </g>
              );
            }
            const expected = test?.expect?.[r.key];
            const check =
              expected && run && now > 0
                ? compareTrace(expected, actual, Math.min(now, t1), level.toleranceMs)
                : undefined;
            return (
              <g key={r.key}>
                {head}
                {expected && <path d={step(expected, t1, y, h)} className="trace-expected" />}
                <path d={step(actual, now, y, h)} className="trace trace-bool" />
                {check?.mismatches.map(([a, b], k) => (
                  <rect
                    key={k}
                    x={xOf(a)}
                    y={y + 1}
                    width={Math.max(3, xOf(b) - xOf(a))}
                    height={h - 2}
                    className="mismatch"
                    fill="url(#la-hatch)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinT(a);
                    }}
                  >
                    <title>
                      Abweichung {fmtT(a)} – {fmtT(b)} (Klick: Zeiger dorthin)
                    </title>
                  </rect>
                ))}
              </g>
            );
          })}
          {hitAt !== null && (
            <line x1={xOf(hitAt)} x2={xOf(hitAt)} y1={0} y2={plotBottom} className="trigger-line" />
          )}
          {run && now >= t0 && now <= t1 && (
            <line x1={xOf(now)} x2={xOf(now)} y1={0} y2={plotBottom} className="cursor-now" />
          )}
          {cursorT !== null && (
            <g className={`cursor ${pinT !== null ? 'cursor-pinned' : ''}`}>
              <line x1={xOf(cursorT)} x2={xOf(cursorT)} y1={0} y2={plotBottom} />
              <rect x={xOf(cursorT) - 34} y={plotBottom + 3} width={68} height={16} rx={3} />
              <text x={xOf(cursorT)} y={plotBottom + 15}>
                {fmtT(cursorT)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
