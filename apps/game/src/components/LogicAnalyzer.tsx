import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  compareTrace,
  tr,
  valueAt,
  type Edge,
  type Level,
  type LevelRun,
  type TestCase,
} from '@zyklus/sim-core';

const LABEL_W = 170;
const ROW_H = 30;
const ANALOG_H = 56;

interface Row {
  key: string;
  label: string;
  analog: boolean;
  kind: string;
  range: [number, number];
}

/** Breite des Containers in Pixeln (damit Text nicht verzerrt wird). */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e!.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Props {
  level: Level;
  run: LevelRun | null;
  test?: TestCase;
}

/** Zeitdiagramm: Soll grau, Ist farbig, Abweichungen rot. */
export function LogicAnalyzer({ level, run, test }: Props) {
  const [box, W] = useWidth<HTMLDivElement>();
  const now = run?.time ?? 0;
  const t0 = test ? 0 : Math.max(0, now - 5000);
  const t1 = test ? test.durationMs : Math.max(5000, now);
  const xOf = (t: number) => LABEL_W + ((t - t0) / (t1 - t0)) * (W - LABEL_W - 10);
  // Eingänge oben, Ausgänge unten, danach Zustandsgrößen der Anlage
  const isInput = (k: string) => k === 'DI' || k === 'AI';
  const plantRows = [...(run?.traces.keys() ?? [])].filter((k) => k.startsWith('plant.'));
  const rows: Row[] = [
    ...level.devices.filter((d) => isInput(d.kind)),
    ...level.devices.filter((d) => !isInput(d.kind)),
  ].map((d) => ({
    key: d.id,
    label: `${d.id} ${tr(d.name).replace(/\s*\([^)]*\)$/, '')}`,
    analog: d.kind === 'AI' || d.kind === 'AO',
    kind: d.kind.toLowerCase(),
    range: [-4864, 32767] as [number, number],
  }));
  for (const k of plantRows) {
    rows.push({
      key: k,
      label: `Anlage: ${k.slice(6)}`,
      analog: true,
      kind: 'plant',
      range: [0, 100],
    });
  }
  const rowY: number[] = [];
  let height = 0;
  for (const r of rows) {
    rowY.push(height);
    height += r.analog ? ANALOG_H : ROW_H;
  }
  height += 26;

  /** Analogverlauf als Linie, ein Punkt je Pixel */
  const line = (edges: Edge[], until: number, y: number, range: [number, number]) => {
    if (!edges.length) return '';
    const [lo, hi] = range;
    const yOf = (v: number) =>
      y + ANALOG_H - 6 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (ANALOG_H - 12);
    const end = Math.min(until, t1);
    const pts: string[] = [];
    for (let px = xOf(t0); px <= xOf(end); px += 1) {
      const t = t0 + ((px - LABEL_W) / (W - LABEL_W - 10)) * (t1 - t0);
      pts.push(`${px.toFixed(1)},${yOf(Number(valueAt(edges, t, 0))).toFixed(1)}`);
    }
    return pts.length ? `M${pts.join(' L')}` : '';
  };

  const step = (edges: Edge[], until: number, y: number) => {
    const hi = y + 6;
    const lo = y + ROW_H - 8;
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
  const unit = span > 4000 ? 1000 : span > 1500 ? 500 : span > 600 ? 200 : 100;
  for (let t = Math.ceil(t0 / unit) * unit; t <= t1; t += unit) ticks.push(t);

  return (
    <div ref={box} className="analyzer-box">
      <svg
        className="analyzer"
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label="Zeitdiagramm"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} x2={xOf(t)} y1={0} y2={height - 18} className="grid" />
            <text x={xOf(t)} y={height - 4} className="tick">
              {t >= 1000 ? `${t / 1000} s` : `${t} ms`}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = rowY[i]!;
          const actual = run?.traces.get(r.key) ?? [];
          if (r.analog) {
            const truth = run?.traces.get(`true.${r.key}`);
            return (
              <g key={r.key}>
                <rect
                  x={0}
                  y={y}
                  width={W}
                  height={ANALOG_H}
                  className={i % 2 ? 'row-odd' : 'row-even'}
                />
                <text x={8} y={y + 19} className="row-label">
                  {r.label}
                </text>
                <text x={8} y={y + 34} className="row-value">
                  {actual.length
                    ? Number(actual[actual.length - 1]![1]).toFixed(r.kind === 'plant' ? 1 : 0)
                    : ''}
                </text>
                {truth && (
                  <path d={line(truth, now, y, r.range)} className="trace-expected trace-truth" />
                )}
                <path d={line(actual, now, y, r.range)} className={`trace trace-${r.kind}`} />
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
              <rect
                x={0}
                y={y}
                width={W}
                height={ROW_H}
                className={i % 2 ? 'row-odd' : 'row-even'}
              />
              <text x={8} y={y + 19} className="row-label">
                {r.label}
              </text>
              {check?.mismatches.map(([a, b], k) => (
                <rect
                  key={k}
                  x={xOf(a)}
                  y={y + 2}
                  width={Math.max(2, xOf(b) - xOf(a))}
                  height={ROW_H - 4}
                  className="mismatch"
                />
              ))}
              {expected && <path d={step(expected, t1, y)} className="trace-expected" />}
              <path d={step(actual, now, y)} className={`trace trace-${r.kind}`} />
            </g>
          );
        })}
        {run && now >= t0 && (
          <line
            x1={xOf(Math.min(now, t1))}
            x2={xOf(Math.min(now, t1))}
            y1={0}
            y2={height - 18}
            className="cursor"
          />
        )}
      </svg>
    </div>
  );
}
