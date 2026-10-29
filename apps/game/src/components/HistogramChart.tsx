import { useMemo } from 'react';
import { betterThan, fakeDistribution, histogram, type MetricKey } from '@zyklus/sim-core';

const W = 220;
const H = 96;
const PAD = 14;

interface Props {
  levelId: string;
  metric: MetricKey;
  label: string;
  par: number;
  value: number;
  best?: number;
}

/** Häufigkeitsverteilung anderer Lösungen (lokal erzeugt) mit eigenem Wert und Bestwert. */
export function HistogramChart({ levelId, metric, label, par, value, best }: Props) {
  const values = useMemo(() => fakeDistribution(levelId, metric, par), [levelId, metric, par]);
  const h = useMemo(
    () => histogram(values, 14, [value, ...(best !== undefined ? [best] : [])]),
    [values, value, best],
  );
  const peak = Math.max(...h.bins.map((b) => b.count), 1);
  const xOf = (v: number) => PAD + ((v - h.min) / (h.max - h.min || 1)) * (W - 2 * PAD);
  const bw = (W - 2 * PAD) / h.bins.length;
  const share = Math.round(betterThan(values, value) * 100);

  return (
    <figure className="histo">
      <figcaption>
        <span className="histo-label">{label}</span>
        <span className="histo-value">{value}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: besser als ${share} % der Lösungen`}
      >
        {h.bins.map((b, i) => {
          const bh = (b.count / peak) * (H - 30);
          const mine = value >= b.from && value < b.to;
          return (
            <rect
              key={i}
              x={PAD + i * bw + 1}
              y={H - 18 - bh}
              width={bw - 2}
              height={bh}
              className={`histo-bar ${mine ? 'histo-bar-mine' : ''}`}
            />
          );
        })}
        <line x1={PAD} x2={W - PAD} y1={H - 18} y2={H - 18} className="histo-axis" />
        {best !== undefined && best !== value && (
          <line x1={xOf(best)} x2={xOf(best)} y1={6} y2={H - 18} className="histo-best">
            <title>Bestwert {best}</title>
          </line>
        )}
        <line x1={xOf(value)} x2={xOf(value)} y1={4} y2={H - 18} className="histo-mine" />
        <text x={PAD} y={H - 4} className="histo-tick">
          {Math.round(h.min)}
        </text>
        <text x={W - PAD} y={H - 4} className="histo-tick histo-tick-end">
          {Math.round(h.max)}
        </text>
      </svg>
      <div className="histo-share">besser als {share} % · weniger ist besser</div>
    </figure>
  );
}
