import { tr, type Device } from '@zyklus/sim-core';

/**
 * Feldgeräte am Schrankrand als Schaltzeichen-nahe Symbole (12 × 12 mm) mit Kennzeichnung wie im
 * Schaltplan. `on`: elektrischer Zustand (bei Eingängen das Signal, bei Ausgängen der Kontakt).
 */
export function DeviceSymbol({ d, on, x, y }: { d: Device; on: boolean; x: number; y: number }) {
  const name = tr(d.name);
  const cx = x + 6;
  const cy = y;
  switch (d.role) {
    case 'button': {
      const estop = /not-?halt/i.test(name);
      const red = d.nc || /stopp|stop|halt/i.test(name);
      if (estop) {
        return (
          <g className="dev-sym">
            <circle cx={cx} cy={cy} r={5.6} fill="#F4C443" stroke="#8a6d16" strokeWidth={0.3} />
            <circle cx={cx} cy={cy} r={4} fill="#C9302C" stroke="#7a1b18" strokeWidth={0.3} />
            <ellipse cx={cx - 1.2} cy={cy - 1.4} rx={1.6} ry={0.9} fill="#E8706B" />
          </g>
        );
      }
      return (
        <g className="dev-sym">
          <circle cx={cx} cy={cy} r={5.4} fill="#2A2F35" stroke="#5A626A" strokeWidth={0.4} />
          <circle
            cx={cx}
            cy={cy}
            r={3.6}
            fill={red ? '#C9302C' : '#2E9E5B'}
            stroke={on ? '#E4E7EA' : 'none'}
            strokeWidth={0.5}
          />
          <ellipse cx={cx - 1} cy={cy - 1.2} rx={1.3} ry={0.7} fill="#fff" opacity={0.35} />
        </g>
      );
    }
    case 'switch':
      return (
        <g className="dev-sym">
          <circle cx={cx} cy={cy} r={5.4} fill="#2A2F35" stroke="#5A626A" strokeWidth={0.4} />
          <rect
            x={cx - 1.1}
            y={cy - 4.4}
            width={2.2}
            height={8.8}
            rx={1}
            fill="#C9CED3"
            transform={`rotate(${on ? 40 : -40} ${cx} ${cy})`}
          />
          <text x={cx - 5.2} y={cy - 4.6} className="dev-tiny">
            0
          </text>
          <text x={cx + 3.8} y={cy - 4.6} className="dev-tiny">
            1
          </text>
        </g>
      );
    case 'sensor':
      if (d.kind === 'AI') {
        return (
          <g className="dev-sym">
            <rect
              x={x}
              y={cy - 5.5}
              width={12}
              height={11}
              rx={1.4}
              fill="#2A2F35"
              stroke="#8E63CF"
              strokeWidth={0.5}
            />
            <path
              d={`M${x + 2},${cy + 2.5} q2.5,-6 4,-2 t4,-2`}
              fill="none"
              stroke="#B79BE6"
              strokeWidth={0.6}
            />
            <text x={cx} y={cy + 4.4} className="dev-tiny dev-center">
              {d.analog ? `${d.analog.min}–${d.analog.max} ${d.analog.unit}` : 'analog'}
            </text>
          </g>
        );
      }
      if (/lichtschranke/i.test(name)) {
        return (
          <g className="dev-sym">
            <rect
              x={x}
              y={cy - 4}
              width={4}
              height={8}
              rx={0.8}
              fill="#2A2F35"
              stroke="#5A626A"
              strokeWidth={0.4}
            />
            <rect
              x={x + 8}
              y={cy - 4}
              width={4}
              height={8}
              rx={0.8}
              fill="#2A2F35"
              stroke="#5A626A"
              strokeWidth={0.4}
            />
            <line
              x1={x + 4}
              x2={x + 8}
              y1={cy}
              y2={cy}
              stroke={on ? '#E5484D' : '#7A3133'}
              strokeWidth={0.7}
              strokeDasharray={on ? undefined : '0.8 0.6'}
            />
          </g>
        );
      }
      // Näherungs- oder Endlagenschalter
      return (
        <g className="dev-sym">
          <rect x={x + 1} y={cy - 2.6} width={8} height={5.2} rx={0.8} fill="#9AA1A7" />
          <rect
            x={x + 9}
            y={cy - 2}
            width={2.4}
            height={4}
            rx={0.6}
            fill={on ? '#F4C443' : '#3A4047'}
          />
          <line
            x1={x + 2.4}
            x2={x + 7.6}
            y1={cy - 2.6}
            y2={cy - 2.6}
            stroke="#C9CED3"
            strokeWidth={0.4}
          />
        </g>
      );
    case 'lamp':
      return (
        <g className="dev-sym">
          {on && <circle cx={cx} cy={cy} r={6.4} fill="#F4C443" opacity={0.25} />}
          <circle
            cx={cx}
            cy={cy}
            r={5}
            fill={on ? '#F4C443' : '#2A2F35'}
            stroke="#8a929a"
            strokeWidth={0.4}
          />
          <path
            d={`M${cx - 3.5},${cy - 3.5} L${cx + 3.5},${cy + 3.5} M${cx + 3.5},${cy - 3.5} L${cx - 3.5},${cy + 3.5}`}
            stroke={on ? '#5a4508' : '#8a929a'}
            strokeWidth={0.5}
          />
        </g>
      );
    case 'motor':
      return (
        <g className="dev-sym">
          <circle
            cx={cx}
            cy={cy}
            r={5.4}
            fill="#2A2F35"
            stroke={on ? '#3FD98A' : '#8a929a'}
            strokeWidth={on ? 0.9 : 0.5}
          />
          <text x={cx} y={cy + 1.2} className="dev-motor">
            M
          </text>
          <text x={cx} y={cy + 4.2} className="dev-tiny dev-center">
            {d.power ? '3~' : '24 V'}
          </text>
        </g>
      );
    case 'valve':
      return (
        <g className="dev-sym">
          <path
            d={`M${x + 1},${cy - 3} L${x + 6},${cy} L${x + 1},${cy + 3} Z M${x + 11},${cy - 3} L${x + 6},${cy} L${x + 11},${cy + 3} Z`}
            fill={on ? '#5f93e0' : '#2A2F35'}
            stroke="#8a929a"
            strokeWidth={0.4}
          />
          <rect
            x={x + 4}
            y={cy - 6}
            width={4}
            height={3}
            fill={on ? '#F4C443' : '#3A4047'}
            stroke="#8a929a"
            strokeWidth={0.3}
          />
        </g>
      );
    default:
      // Stellglied: analoger oder digitaler Aktor
      return (
        <g className="dev-sym">
          <rect
            x={x}
            y={cy - 5}
            width={12}
            height={10}
            rx={1.2}
            fill="#2A2F35"
            stroke={d.kind === 'AO' ? '#8E63CF' : on ? '#F4C443' : '#8a929a'}
            strokeWidth={0.5}
          />
          <path d={`M${x + 3},${cy + 3} L${x + 9},${cy - 3}`} stroke="#C9CED3" strokeWidth={0.6} />
          <path
            d={`M${x + 7},${cy - 3} L${x + 9},${cy - 3} L${x + 9},${cy - 1}`}
            fill="none"
            stroke="#C9CED3"
            strokeWidth={0.6}
          />
        </g>
      );
  }
}

/** Signalart unter der Kennzeichnung */
export function signalLabel(d: Device): string {
  const parts: string[] = [d.kind];
  if (d.nc) parts.push('Öffner');
  if (d.power) parts.push('Leistung');
  if (d.analog) parts.push(`${d.analog.min}…${d.analog.max} ${d.analog.unit}`);
  return parts.join(', ');
}
