import {
  CATALOG,
  COLORS,
  MATERIALS,
  boundsOf,
  num,
  str,
  zoneOf,
  type Part,
  type PartState,
  type Workpiece,
} from '@zyklus/plant-sim';

/**
 * Schematische Zeichnungen der Anlagenbauteile in mm, Draufsicht und Seitenansicht. Bewusst
 * einfach gehalten: Flächen in Grautönen, Antriebe und Signale farbig.
 */

const C = {
  frame: 'var(--c-zinc)',
  body: 'var(--c-surface3)',
  dark: 'var(--c-bg-deep)',
  line: 'var(--c-line-strong)',
  text: 'var(--c-text-muted)',
  on: 'var(--c-led-green)',
  warn: 'var(--c-led-yellow)',
  red: 'var(--c-red)',
  signal: 'var(--c-signal)',
  analog: 'var(--c-analog)',
  accent: 'var(--c-accent)',
  liquid: '#3B82C4',
};

const LIGHT_HEX: Record<string, string> = {
  gruen: '#3FD98A',
  gelb: '#F4C443',
  rot: '#E5484D',
  weiss: '#F2F3F4',
  blau: '#4C8DF0',
};

export interface ShapeState {
  st?: PartState;
  /** Sensor erkennt gerade (LED, Zone leuchtet) */
  sensed?: boolean | number;
  /** Zeit in ms (Bandmuster) */
  time: number;
  /** Tankfüllstand in % */
  level?: number;
}

// ---------------------------------------------------------------------------------------------
// Draufsicht
// ---------------------------------------------------------------------------------------------

/** Bauteil in der Draufsicht, Ursprung in der Mitte, +x in Förderrichtung */
export function PartTop({ part, s }: { part: Part; s: ShapeState }) {
  const size = CATALOG[part.type].size(part.params);
  const { l, w } = size;
  const st = s.st;
  const q = part.params;
  const body = (
    <rect x={-l / 2} y={-w / 2} width={l} height={w} rx={2} fill={C.body} stroke={C.line} />
  );
  switch (part.type) {
    case 'belt': {
      const sp = st?.speed ?? 0;
      const off = ((((s.time / 1000) * sp) % 40) + 40) % 40;
      const marks = [];
      for (let u = -l / 2 + off; u < l / 2; u += 40) marks.push(u);
      return (
        <g>
          <rect
            x={-l / 2}
            y={-w / 2}
            width={l}
            height={w}
            rx={w / 2 > 20 ? 6 : 2}
            fill={C.dark}
            stroke={C.frame}
            strokeWidth={2}
          />
          {marks.map((u) => (
            <path
              key={u}
              d={`M${u - 6} ${-w / 2 + 8} L${u} 0 L${u - 6} ${w / 2 - 8}`}
              fill="none"
              stroke={C.line}
              strokeWidth={2}
            />
          ))}
          <circle
            cx={l / 2 - 12}
            cy={w / 2 + 10}
            r={6}
            fill={st?.on ? C.on : C.body}
            stroke={C.line}
          />
        </g>
      );
    }
    case 'rollers': {
      const lines = [];
      for (let u = -l / 2 + 12; u < l / 2; u += 25) lines.push(u);
      return (
        <g>
          {body}
          {lines.map((u) => (
            <line
              key={u}
              x1={u}
              x2={u}
              y1={-w / 2 + 3}
              y2={w / 2 - 3}
              stroke={C.frame}
              strokeWidth={6}
              strokeLinecap="round"
            />
          ))}
        </g>
      );
    }
    case 'curve': {
      const R = num(q, 'radius', 200);
      const W = num(q, 'width', 80);
      const cx = -R / 2;
      const cy = R / 2;
      return (
        <path
          d={`M${cx} ${cy - R} A${R} ${R} 0 0 1 ${cx + R} ${cy} L${cx + R - W} ${cy} A${R - W} ${R - W} 0 0 0 ${cx} ${cy - (R - W)} Z`}
          fill={C.dark}
          stroke={st?.on ? C.on : C.frame}
          strokeWidth={2}
        />
      );
    }
    case 'magazine':
      return (
        <g>
          {body}
          <rect x={-28} y={-28} width={56} height={56} fill={C.dark} stroke={C.frame} />
          <path d={`M${l / 2 - 4} -10 L${l / 2 + 6} 0 L${l / 2 - 4} 10`} fill={C.accent} />
        </g>
      );
    case 'chute':
      return (
        <g>
          <rect x={-l / 2} y={-w / 2} width={l} height={w} fill="url(#chute)" stroke={C.frame} />
          <path
            d={`M${-l / 2 + 10} 0 L${l / 2 - 14} 0 M${l / 2 - 24} -8 L${l / 2 - 14} 0 L${l / 2 - 24} 8`}
            stroke={C.line}
            strokeWidth={2}
            fill="none"
          />
        </g>
      );
    case 'bin':
      return (
        <g>
          <rect
            x={-l / 2}
            y={-w / 2}
            width={l}
            height={w}
            fill={C.dark}
            stroke={C.frame}
            strokeWidth={6}
          />
          <text
            x={0}
            y={6}
            textAnchor="middle"
            fontSize={22}
            fill={C.text}
            fontFamily="var(--font-mono)"
          >
            {st?.total ?? 0}
          </text>
        </g>
      );
    case 'diverter': {
      const side = str(q, 'side', 'links') === 'links' ? -1 : 1;
      const on = st?.on;
      return (
        <g>
          <rect
            x={-l / 2}
            y={-w / 2}
            width={l}
            height={w}
            fill="none"
            stroke={C.line}
            strokeDasharray="6 4"
          />
          <line
            x1={-l / 2}
            y1={(-side * w) / 2}
            x2={on ? l / 2 : l / 2 - 8}
            y2={on ? (side * w) / 2 : (-side * w) / 2 + 4}
            stroke={on ? C.accent : C.frame}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </g>
      );
    }
    case 'turntable': {
      const r = num(q, 'diameter', 140) / 2;
      return (
        <g>
          <circle r={r} fill={C.body} stroke={C.frame} strokeWidth={2} />
          <g transform={`rotate(${st?.angle ?? 0})`}>
            <line x1={0} y1={0} x2={r - 8} y2={0} stroke={C.accent} strokeWidth={4} />
            <circle r={6} fill={C.frame} />
          </g>
        </g>
      );
    }
    case 'lift':
      return (
        <g>
          <rect
            x={-l / 2}
            y={-w / 2}
            width={l}
            height={w}
            fill={C.body}
            stroke={(st?.pos ?? 0) > 0.5 ? C.accent : C.frame}
            strokeWidth={2}
          />
          <path
            d={`M${-l / 2} ${-w / 2} L${l / 2} ${w / 2} M${-l / 2} ${w / 2} L${l / 2} ${-w / 2}`}
            stroke={C.line}
          />
        </g>
      );
    case 'stopper':
      return (
        <rect
          x={-l / 2}
          y={-w / 2}
          width={l}
          height={w}
          fill={st?.on !== false ? C.red : 'none'}
          stroke={C.red}
          strokeDasharray={st?.on === false ? '4 3' : undefined}
        />
      );
    case 'tank': {
      const r = num(q, 'diameter', 200) / 2;
      const lv = (s.level ?? num(q, 'level0')) / 100;
      return (
        <g>
          <circle r={r} fill={C.dark} stroke={C.frame} strokeWidth={4} />
          <circle r={Math.max(0, r - 4)} fill={C.liquid} opacity={0.15 + 0.6 * lv} />
          <text
            x={0}
            y={8}
            textAnchor="middle"
            fontSize={24}
            fill="#fff"
            fontFamily="var(--font-mono)"
          >
            {Math.round(lv * 100)} %
          </text>
        </g>
      );
    }
    case 'pipe':
      return (
        <rect
          x={-l / 2}
          y={-8}
          width={l}
          height={16}
          rx={8}
          fill={C.body}
          stroke={C.liquid}
          strokeWidth={2}
        />
      );
    case 'cylinder': {
      const stroke = num(q, 'stroke', 80);
      const pos = st?.pos ?? 0;
      const rod = 30 + pos * stroke;
      return (
        <g>
          <rect x={-30} y={-15} width={60} height={30} rx={4} fill={C.frame} stroke={C.line} />
          <rect x={30} y={-4} width={rod - 30} height={8} fill={C.frame} />
          <rect x={rod} y={-20} width={8} height={40} fill={C.accent} />
          <circle cx={-18} cy={0} r={5} fill={st?.on ? C.on : C.body} />
        </g>
      );
    }
    case 'pump':
      return (
        <g>
          <circle r={28} fill={C.body} stroke={C.frame} strokeWidth={2} />
          <path d="M-12 -14 L16 0 L-12 14 Z" fill={st?.on ? C.on : C.line} />
        </g>
      );
    case 'valve':
      return (
        <g>
          <path
            d="M-18 -12 L18 12 L18 -12 L-18 12 Z"
            fill={st?.on ? C.on : C.body}
            stroke={C.frame}
            strokeWidth={2}
          />
        </g>
      );
    case 'lamp': {
      const hex = LIGHT_HEX[str(q, 'color', 'gruen')] ?? C.on;
      return (
        <g>
          {st?.on && <circle r={18} fill={hex} opacity={0.3} />}
          <circle r={11} fill={st?.on ? hex : C.dark} stroke={hex} strokeWidth={2} />
        </g>
      );
    }
    case 'horn':
      return (
        <path
          d="M-14 -8 L0 -8 L14 -15 L14 15 L0 8 L-14 8 Z"
          fill={st?.on ? C.warn : C.body}
          stroke={C.frame}
        />
      );
    case 'traffic': {
      const lights = st?.lights ?? [false, false, false];
      return (
        <g>
          <rect x={-15} y={-15} width={30} height={30} rx={4} fill={C.dark} stroke={C.frame} />
          {(['rot', 'gelb', 'gruen'] as const).map((c, i) => (
            <circle key={c} cx={-9 + i * 9} cy={0} r={4} fill={lights[i] ? LIGHT_HEX[c] : C.body} />
          ))}
        </g>
      );
    }
    case 'button': {
      const hex = LIGHT_HEX[str(q, 'color', 'gruen')] ?? C.on;
      const down = (st?.control ?? 0) >= 1;
      return (
        <g>
          <circle r={15} fill={C.body} stroke={C.frame} />
          <circle r={down ? 9 : 11} fill={hex} stroke={C.dark} />
        </g>
      );
    }
    case 'switch': {
      const on = (st?.control ?? 0) >= 1;
      return (
        <g>
          <rect x={-15} y={-15} width={30} height={30} rx={3} fill={C.body} stroke={C.frame} />
          <rect x={-5} y={on ? -12 : 0} width={10} height={12} rx={2} fill={on ? C.on : C.line} />
        </g>
      );
    }
    case 'estop': {
      const down = (st?.control ?? 0) >= 1;
      return (
        <g>
          <circle r={20} fill={C.warn} />
          <circle r={down ? 11 : 14} fill={C.red} stroke={C.dark} />
        </g>
      );
    }
    case 'selector': {
      const pos = st?.control ?? 0;
      const angle = pos === 1 ? -45 : pos === 2 ? 45 : 0;
      return (
        <g>
          <circle r={15} fill={C.body} stroke={C.frame} />
          <rect
            x={-3}
            y={-12}
            width={6}
            height={24}
            rx={2}
            fill={C.dark}
            transform={`rotate(${angle})`}
          />
        </g>
      );
    }
    case 'poti': {
      const v = st?.control ?? 0;
      return (
        <g>
          <circle r={15} fill={C.body} stroke={C.frame} />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-11}
            stroke={C.analog}
            strokeWidth={3}
            transform={`rotate(${-135 + 2.7 * v})`}
          />
        </g>
      );
    }
    case 'loadcell':
      return (
        <g>
          {body}
          <rect
            x={-l / 2 + 6}
            y={-w / 2 + 6}
            width={l - 12}
            height={w - 12}
            fill="none"
            stroke={C.analog}
            strokeDasharray="4 3"
          />
        </g>
      );
    default:
      return <SensorTop part={part} s={s} />;
  }
}

const SENSOR_COLOR: Partial<Record<Part['type'], string>> = {
  inductive: '#7C8C9C',
  capacitive: '#4F7FA8',
  diffuse: '#9C7A3C',
  thrubeam: '#9C5A3C',
  retro: '#9C5A3C',
  color: '#8E63CF',
  ultrasonic: '#3C8C7A',
  limit: '#6A6F75',
  reed: '#6A6F75',
  level: '#3B82C4',
  levelswitch: '#3B82C4',
};

function SensorTop({ part, s }: { part: Part; s: ShapeState }) {
  const size = CATALOG[part.type].size(part.params);
  const on =
    s.sensed === true || (typeof s.sensed === 'number' && part.type === 'color' && s.sensed > 0);
  return (
    <g>
      <rect
        x={-size.l / 2}
        y={-size.w / 2}
        width={size.l}
        height={size.w}
        rx={3}
        fill={SENSOR_COLOR[part.type] ?? C.body}
        stroke={C.line}
      />
      {part.type === 'limit' && <circle cx={size.l / 2 + 4} cy={0} r={4} fill={C.frame} />}
      <circle cx={-size.l / 2 + 5} cy={0} r={3} fill={on ? C.warn : C.dark} />
    </g>
  );
}

/** Erfassungszone eines Sensors in Weltkoordinaten (halbtransparent, leuchtet bei Erkennung) */
export function SensorZone({ part, active }: { part: Part; active: boolean }) {
  const z = zoneOf(part);
  if (z.kind === 'none') return null;
  const fill = active ? 'rgba(244,196,67,0.35)' : 'rgba(60,200,220,0.12)';
  const stroke = active ? 'rgba(244,196,67,0.9)' : 'rgba(60,200,220,0.5)';
  if (z.kind === 'down') {
    return (
      <circle
        cx={z.from.x}
        cy={z.from.y}
        r={z.half}
        fill={fill}
        stroke={stroke}
        strokeDasharray="3 2"
      />
    );
  }
  if (z.kind === 'beam') {
    return (
      <g>
        <line
          x1={z.from.x}
          y1={z.from.y}
          x2={z.to.x}
          y2={z.to.y}
          stroke={active ? stroke : 'rgba(229,72,77,0.7)'}
          strokeWidth={2}
          strokeDasharray={active ? '5 4' : undefined}
        />
        <circle cx={z.to.x} cy={z.to.y} r={6} fill="none" stroke={C.line} strokeWidth={2} />
      </g>
    );
  }
  // Kegel bzw. Kontaktzone als Trapez von der Fläche weg
  const dx = z.to.x - z.from.x;
  const dy = z.to.y - z.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const h0 = z.half * 0.6;
  const h1 = z.kind === 'contact' ? z.half : z.half;
  const pts = [
    [z.from.x + nx * h0, z.from.y + ny * h0],
    [z.to.x + nx * h1, z.to.y + ny * h1],
    [z.to.x - nx * h1, z.to.y - ny * h1],
    [z.from.x - nx * h0, z.from.y - ny * h0],
  ];
  return (
    <polygon
      points={pts.map((p) => p.join(',')).join(' ')}
      fill={fill}
      stroke={stroke}
      strokeWidth={0.8}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Seitenansicht (x waagrecht, z nach oben; Zeichenkoordinate y = −z)
// ---------------------------------------------------------------------------------------------

export function PartSide({ part, s }: { part: Part; s: ShapeState }) {
  const b = boundsOf(part);
  const x0 = b.rect.x0;
  const x1 = b.rect.x1;
  const wdt = x1 - x0;
  const st = s.st;
  const q = part.params;
  const legs = (top: number) => (
    <g stroke={C.line} strokeWidth={4}>
      <line x1={x0 + 10} x2={x0 + 10} y1={-top} y2={0} />
      <line x1={x1 - 10} x2={x1 - 10} y1={-top} y2={0} />
    </g>
  );
  switch (part.type) {
    case 'belt':
    case 'rollers':
    case 'curve':
    case 'turntable':
    case 'loadcell':
      return (
        <g>
          {legs(b.z0)}
          <rect
            x={x0}
            y={-b.z1}
            width={wdt}
            height={b.z1 - b.z0}
            rx={part.type === 'belt' ? 8 : 2}
            fill={part.type === 'belt' ? C.dark : C.body}
            stroke={st?.on ? C.on : C.frame}
            strokeWidth={2}
          />
        </g>
      );
    case 'lift': {
      const top = part.z + (st?.pos ?? 0) * num(q, 'stroke', 80);
      return (
        <g>
          <rect x={x0 + wdt / 2 - 8} y={-top} width={16} height={top} fill={C.line} />
          <rect
            x={x0}
            y={-top}
            width={wdt}
            height={12}
            fill={C.body}
            stroke={C.frame}
            strokeWidth={2}
          />
        </g>
      );
    }
    case 'chute': {
      const drop = num(q, 'drop', 100);
      const fwd = part.rot === 0 ? 1 : part.rot === 180 ? -1 : 0;
      const hiX = fwd >= 0 ? x0 : x1;
      const loX = fwd >= 0 ? x1 : x0;
      const hi = fwd === 0 ? part.z + drop / 2 : part.z + drop;
      const lo = fwd === 0 ? part.z + drop / 2 : part.z;
      return (
        <g>
          <polygon
            points={`${hiX},${-hi} ${loX},${-lo} ${loX},${-lo + 10} ${hiX},${-hi + 10}`}
            fill={C.body}
            stroke={C.frame}
            strokeWidth={2}
          />
          {legs(lo)}
        </g>
      );
    }
    case 'bin':
      return (
        <path
          d={`M${x0} ${-b.z1} L${x0} ${-b.z0} L${x1} ${-b.z0} L${x1} ${-b.z1}`}
          fill={C.dark}
          stroke={C.frame}
          strokeWidth={6}
        />
      );
    case 'tank': {
      const h = num(q, 'height', 300);
      const lv = (s.level ?? num(q, 'level0')) / 100;
      return (
        <g>
          <rect
            x={x0}
            y={-(part.z + h)}
            width={wdt}
            height={h}
            fill={C.dark}
            stroke={C.frame}
            strokeWidth={4}
          />
          <rect
            x={x0 + 3}
            y={-(part.z + h * lv)}
            width={wdt - 6}
            height={h * lv}
            fill={C.liquid}
            opacity={0.75}
          />
        </g>
      );
    }
    case 'cylinder': {
      const along = part.rot === 0 || part.rot === 180;
      if (!along)
        return (
          <rect
            x={x0}
            y={-b.z1}
            width={wdt}
            height={b.z1 - b.z0}
            rx={4}
            fill={C.frame}
            stroke={C.line}
          />
        );
      const dir = part.rot === 0 ? 1 : -1;
      const rod = 30 + (st?.pos ?? 0) * num(q, 'stroke', 80);
      const cx = part.x;
      const mid = -(part.z + 15);
      return (
        <g>
          <rect
            x={cx - 30}
            y={-(part.z + 30)}
            width={60}
            height={30}
            rx={4}
            fill={C.frame}
            stroke={C.line}
          />
          <line
            x1={cx + dir * 30}
            x2={cx + dir * rod}
            y1={mid}
            y2={mid}
            stroke={C.frame}
            strokeWidth={8}
          />
          <rect
            x={dir > 0 ? cx + rod : cx - rod - 8}
            y={-(part.z + 30)}
            width={8}
            height={30}
            fill={C.accent}
          />
        </g>
      );
    }
    case 'stopper':
      return (
        <rect
          x={x0}
          y={-b.z1}
          width={Math.max(wdt, 6)}
          height={b.z1 - b.z0}
          fill={st?.on !== false ? C.red : 'none'}
          stroke={C.red}
        />
      );
    case 'magazine':
      return (
        <g>
          <rect
            x={x0}
            y={-b.z1}
            width={wdt}
            height={b.z1 - b.z0}
            fill={C.body}
            stroke={C.frame}
            strokeWidth={2}
          />
          <rect
            x={x0 + 12}
            y={-b.z1 + 4}
            width={wdt - 24}
            height={b.z1 - b.z0 - 48}
            fill={C.dark}
          />
        </g>
      );
    default: {
      const sensor = CATALOG[part.type].category === 'sensor';
      const on = s.sensed === true;
      return (
        <g>
          <rect
            x={x0}
            y={-b.z1}
            width={Math.max(wdt, 4)}
            height={b.z1 - b.z0}
            rx={3}
            fill={sensor ? (SENSOR_COLOR[part.type] ?? C.body) : C.body}
            stroke={C.line}
          />
          {sensor && <circle cx={x0 + 5} cy={-b.z1 + 5} r={3} fill={on ? C.warn : C.dark} />}
          {st?.on && part.type === 'lamp' && (
            <circle cx={(x0 + x1) / 2} cy={-(b.z0 + b.z1) / 2} r={10} fill={C.on} opacity={0.6} />
          )}
        </g>
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Werkstücke
// ---------------------------------------------------------------------------------------------

function wpFill(w: Pick<Workpiece, 'spec'>) {
  return COLORS[w.spec.color].hex;
}

export function WorkpieceTop({
  w,
  selected,
}: {
  w: Pick<Workpiece, 'spec' | 'x' | 'y' | 's'>;
  selected?: boolean;
}) {
  const m = MATERIALS[w.spec.material];
  const h = w.s / 2;
  return (
    <g transform={`translate(${w.x} ${w.y})`}>
      <rect
        x={-h}
        y={-h}
        width={w.s}
        height={w.s}
        rx={m.metal ? 2 : 4}
        fill={wpFill(w)}
        fillOpacity={m.transparent ? 0.35 : 1}
        stroke={selected ? 'var(--c-select)' : m.metal ? '#ffffff' : 'rgba(0,0,0,0.5)'}
        strokeWidth={selected ? 3 : m.metal ? 1.5 : 1}
      />
      {m.id === 'holz' && (
        <path
          d={`M${-h + 5} ${-h / 3} Q0 ${-h / 2} ${h - 5} ${-h / 4} M${-h + 5} ${h / 3} Q0 ${h / 5} ${h - 5} ${h / 3}`}
          stroke="rgba(0,0,0,0.25)"
          fill="none"
        />
      )}
      {m.metal && (
        <rect x={-h + 4} y={-h + 4} width={w.s / 3} height={3} fill="rgba(255,255,255,0.6)" />
      )}
    </g>
  );
}

export function WorkpieceSide({ w }: { w: Pick<Workpiece, 'spec' | 'x' | 'z' | 's' | 'h'> }) {
  const m = MATERIALS[w.spec.material];
  return (
    <rect
      x={w.x - w.s / 2}
      y={-(w.z + w.h)}
      width={w.s}
      height={w.h}
      rx={2}
      fill={wpFill(w)}
      fillOpacity={m.transparent ? 0.35 : 1}
      stroke={m.metal ? '#ffffff' : 'rgba(0,0,0,0.5)'}
    />
  );
}

/** gemeinsame SVG-Definitionen */
export function PlantDefs() {
  return (
    <defs>
      <linearGradient id="chute" x1="0" x2="1">
        <stop offset="0" stopColor="#5A626C" />
        <stop offset="1" stopColor="#3A4048" />
      </linearGradient>
    </defs>
  );
}
