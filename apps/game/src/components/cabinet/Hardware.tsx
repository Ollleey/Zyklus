import {
  RANGE_LABEL,
  tr,
  type AnalogRange,
  type ChannelKind,
  type DiagEntry,
  type ModuleType,
} from '@zyklus/sim-core';
import { G, colX, terminalPos, type Layout } from './geometry';

/** Gemeinsame SVG-Definitionen: Materialien, Leuchten, Muster. Einmal je Schrank. */
export function HardwareDefs() {
  return (
    <defs>
      {/* Montageplatte: verzinkt, leicht fleckig */}
      <linearGradient id="hw-zinc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#C9CED2" />
        <stop offset="0.45" stopColor="#B9BFC4" />
        <stop offset="1" stopColor="#A9B0B6" />
      </linearGradient>
      <filter id="hw-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.38  0 0 0 0 0.4  0 0 0 0.22 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      {/* Hutschiene: Lichtkante oben, Schatten in der Mitte */}
      <linearGradient id="hw-rail" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#EEF1F3" />
        <stop offset="0.06" stopColor="#B8BEC3" />
        <stop offset="0.16" stopColor="#9EA5AB" />
        <stop offset="0.17" stopColor="#7D858C" />
        <stop offset="0.5" stopColor="#8D949A" />
        <stop offset="0.83" stopColor="#7D858C" />
        <stop offset="0.84" stopColor="#A3AAB0" />
        <stop offset="1" stopColor="#8A9197" />
      </linearGradient>
      <pattern id="hw-rail-slots" width="25" height={G.rail.h} patternUnits="userSpaceOnUse">
        <rect x="5" y={G.rail.h / 2 - 2.6} width="15" height="5.2" rx="2.6" fill="#4E555C" />
        <rect x="5" y={G.rail.h / 2 + 1.8} width="15" height="0.8" rx="0.4" fill="#C6CCD1" />
      </pattern>
      {/* Verdrahtungskanal: Schlitze zwischen Fingern */}
      <pattern id="hw-duct-slots" width="7" height="10" patternUnits="userSpaceOnUse">
        <rect width="7" height="10" fill="#9AA1A7" />
        <rect x="2.2" y="0" width="2.6" height="10" fill="#5F666C" />
      </pattern>
      <linearGradient id="hw-housing" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3A4047" />
        <stop offset="0.08" stopColor="#30353B" />
        <stop offset="0.92" stopColor="#2A2F35" />
        <stop offset="1" stopColor="#202428" />
      </linearGradient>
      <linearGradient id="hw-io" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#E2E5E8" />
        <stop offset="0.5" stopColor="#D5D9DD" />
        <stop offset="1" stopColor="#BFC4C9" />
      </linearGradient>
      <filter id="hw-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="1.1" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="hw-shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.4" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

export function Plate({ l }: { l: Layout }) {
  return (
    <g className="hw-plate">
      <rect x={l.plateX} y={0} width={l.plateW} height={l.plateH} rx={1.5} fill="url(#hw-zinc)" />
      <rect
        x={l.plateX}
        y={0}
        width={l.plateW}
        height={l.plateH}
        rx={1.5}
        fill="#fff"
        filter="url(#hw-grain)"
      />
      {/* Befestigungslöcher in den Ecken */}
      {[
        [l.plateX + 4, 4],
        [l.plateX + l.plateW - 4, 4],
        [l.plateX + 4, l.plateH - 4],
        [l.plateX + l.plateW - 4, l.plateH - 4],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="#6E767D" />
      ))}
    </g>
  );
}

export function Rail({ l }: { l: Layout }) {
  return (
    <g className="hw-rail">
      <rect
        x={l.railX - 6}
        y={G.rail.y}
        width={l.railW + 12}
        height={G.rail.h}
        fill="url(#hw-rail)"
      />
      <rect
        x={l.railX - 6}
        y={G.rail.y}
        width={l.railW + 12}
        height={G.rail.h}
        fill="url(#hw-rail-slots)"
      />
      <rect x={l.railX - 6} y={G.rail.y} width={l.railW + 12} height={0.5} fill="#FAFCFD" />
    </g>
  );
}

/**
 * Verdrahtungskanal von vorn: Unterteil (hinter den Leitungen) und Deckel mit Fingern an beiden
 * Kanten (vor den Leitungen). Leitungen verschwinden unter dem Deckel und kommen durch die Schlitze
 * heraus. `load` je Spalte markiert Überfüllung, das Schild zeigt die höchste Belegung.
 */
export function Duct({
  l,
  y,
  h,
  layer,
  load,
  capacity,
  label,
}: {
  l: Layout;
  y: number;
  h: number;
  layer: 'base' | 'cover';
  load?: number[];
  capacity?: number;
  label: string;
}) {
  const x = l.railX - 4;
  const w = l.railW + 8;
  if (layer === 'base') {
    return <rect x={x} y={y} width={w} height={h} rx={1} fill="#4E555B" filter="url(#hw-shadow)" />;
  }
  const max = load?.length ? Math.max(...load) : 0;
  const over = capacity !== undefined && max > capacity;
  const finger = 4;
  return (
    <g className="hw-duct">
      <rect x={x} y={y} width={w} height={finger} fill="url(#hw-duct-slots)" />
      <rect x={x} y={y + h - finger} width={w} height={finger} fill="url(#hw-duct-slots)" />
      {/* Deckel */}
      <rect
        x={x - 0.5}
        y={y + finger - 0.6}
        width={w + 1}
        height={h - 2 * finger + 1.2}
        rx={0.8}
        fill="#A9B0B6"
      />
      <rect x={x - 0.5} y={y + finger - 0.6} width={w + 1} height={0.6} fill="#D7DCE0" />
      <rect x={x - 0.5} y={y + h - finger} width={w + 1} height={0.6} fill="#80878D" />
      {load?.map((n, c) =>
        capacity !== undefined && n > capacity ? (
          <rect key={c} x={colX(l, c)} y={y} width={G.te} height={h} className="hw-duct-over" />
        ) : null,
      )}
      <g transform={`translate(${x + w - 3}, ${y + h / 2})`}>
        <rect
          x={-36}
          y={-3.4}
          width={36}
          height={6.8}
          rx={1}
          className={`hw-duct-tag ${over ? 'hw-duct-tag-over' : ''}`}
        />
        <text x={-2} y={1.4} className="hw-duct-text">
          {capacity !== undefined ? `${label} ${max}/${capacity}` : label}
        </text>
      </g>
    </g>
  );
}

export function WallPart({ l, from, to }: { l: Layout; from: number; to: number }) {
  const x = colX(l, from);
  const w = (to - from) * G.te;
  return (
    <g className="hw-wall">
      <rect x={x + 1} y={-2} width={w - 2} height={l.plateH + 4} fill="#5B5246" />
      <rect x={x + 1} y={-2} width={1.2} height={l.plateH + 4} fill="#7E7466" />
      {Array.from({ length: Math.floor(l.plateH / 12) }, (_, i) => (
        <line
          key={i}
          x1={x + 2}
          x2={x + w - 2}
          y1={i * 12 + 4}
          y2={i * 12 + 10}
          stroke="#E07B5F"
          strokeWidth={1.2}
        />
      ))}
      <text
        x={x + w / 2}
        y={l.plateH / 2}
        className="hw-wall-text"
        transform={`rotate(-90 ${x + w / 2} ${l.plateH / 2})`}
      >
        Trennwand
      </text>
    </g>
  );
}

export interface CpuStatus {
  mode: 'RUN' | 'STOP';
  error: boolean;
  load: number;
  /** Forceaufträge aktiv (MAINT-LED gelb) */
  force?: boolean;
  /** anstehende Diagnose (ERROR-LED) */
  diag?: boolean;
  /** Diagnosepuffer, neueste zuerst */
  diagnostics?: readonly DiagEntry[];
}

const Led = ({
  x,
  y,
  on,
  color,
  label,
  r = 1.25,
}: {
  x: number;
  y: number;
  on: boolean;
  color: string;
  label?: string;
  r?: number;
}) => (
  <g>
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={on ? color : '#1A1D21'}
      stroke={on ? color : '#4A5057'}
      strokeWidth={0.3}
      filter={on ? 'url(#hw-glow)' : undefined}
    />
    {label && (
      <text x={x + 2.4} y={y + 1} className="hw-label-dark">
        {label}
      </text>
    )}
  </g>
);

const LED = { green: '#3FD98A', yellow: '#F4C443', red: '#E5484D', off: '#1A1D21' };

/** Kompakt-CPU: Lüftungsschlitze, Fronttür, Status-LEDs, Typschild, Schalter, Karte, RJ45. */
export function CpuFront({
  l,
  x,
  t,
  id,
  status,
  powered,
  canSwitch,
  onSwitch,
}: {
  l: Layout;
  x: number;
  t: ModuleType;
  id: string;
  status?: CpuStatus;
  powered: boolean;
  canSwitch: boolean;
  /** RESTART: Spannung aus und wieder ein (Neustart, OB100) */
  onSwitch?: (mode: 'RUN' | 'STOP' | 'RESTART') => void;
}) {
  const left = colX(l, x) + G.gap / 2;
  const w = t.width * G.te - G.gap;
  const y = G.module.y;
  const h = G.module.h;
  const run = powered && status?.mode === 'RUN';
  const stop = powered && status?.mode === 'STOP';
  const err = powered && (!!status?.error || !!status?.diag);
  const switchRun = status ? status.mode === 'RUN' : true;
  return (
    <g className="hw-cpu">
      <rect x={left} y={y} width={w} height={h} rx={2.4} fill="url(#hw-housing)" />
      {/* Lüftungsschlitze */}
      {Array.from({ length: Math.floor((w - 12) / 3) }, (_, i) => (
        <rect
          key={i}
          x={left + 6 + i * 3}
          y={y + 2.2}
          width={1.6}
          height={5}
          rx={0.6}
          fill="#15181B"
        />
      ))}
      {/* Fronttür */}
      <rect
        x={left + 3}
        y={y + 10}
        width={w - 6}
        height={h - 26}
        rx={1.6}
        fill="none"
        stroke="#454C54"
        strokeWidth={0.5}
      />
      <rect x={left + w - 5.2} y={y + h / 2 - 12} width={1.2} height={14} rx={0.6} fill="#454C54" />
      {/* Status-LEDs */}
      <Led x={left + 7} y={y + 17} on={run} color={LED.green} label="RUN" />
      <Led x={left + 7} y={y + 23.5} on={stop} color={LED.yellow} label="STOP" />
      <Led x={left + 7} y={y + 30} on={err} color={LED.red} label="ERROR" />
      <Led
        x={left + 7}
        y={y + 36.5}
        on={powered && !!status?.force}
        color={LED.yellow}
        label="MAINT"
      />
      {/* Typschild / Anzeige */}
      <rect x={left + 26} y={y + 13} width={w - 34} height={27} rx={1} fill="#0F1A1E" />
      <text x={left + 28.5} y={y + 19.5} className="hw-display hw-display-strong">
        {tr(t.name)}
      </text>
      <text x={left + 28.5} y={y + 26} className="hw-display">
        {id} · {t.cpu!.cycleMs} ms
      </text>
      <text x={left + 28.5} y={y + 32.5} className="hw-display">
        {powered && status ? `Last ${Math.round(status.load * 100)} %` : 'aus'}
      </text>
      <text x={left + 28.5} y={y + 38} className="hw-display hw-display-dim">
        {t.cpu!.processInterrupt ? 'Weck- und Prozessalarm' : 'nur OB1'}
      </text>
      {/* Betriebsartenschalter */}
      <g
        className={`hw-switch ${canSwitch ? 'hw-switch-live' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (canSwitch && onSwitch) onSwitch(switchRun ? 'STOP' : 'RUN');
        }}
      >
        <title>
          {canSwitch ? 'Betriebsart umschalten' : 'Betriebsartenschalter (nur im Sandkasten)'}
        </title>
        <rect x={left + 4.5} y={y + 46} width={14} height={20} rx={1.2} fill="#1C2024" />
        <rect
          x={left + 7.5}
          y={switchRun ? y + 48 : y + 56}
          width={8}
          height={8}
          rx={1}
          fill="#B9BFC4"
        />
        <text x={left + 20.5} y={y + 51} className="hw-label-dark">
          RUN
        </text>
        <text x={left + 20.5} y={y + 64} className="hw-label-dark">
          STOP
        </text>
      </g>
      {/* Netztaster: Spannung aus/ein (nur im Sandkasten) */}
      {canSwitch && (
        <g
          className="hw-switch hw-switch-live"
          onClick={(e) => {
            e.stopPropagation();
            onSwitch?.('RESTART');
          }}
        >
          <title>Spannung aus und wieder ein (Neustart, Anlauf-OB)</title>
          <rect x={left + 4.5} y={y + 70} width={14} height={8} rx={1.2} fill="#1C2024" />
          <text x={left + 7.2} y={y + 75.8} className="hw-label-dark">
            ⏻
          </text>
          <text x={left + 20.5} y={y + 75.8} className="hw-label-dark">
            Neustart
          </text>
        </g>
      )}
      {/* Speicherkarte */}
      <rect x={left + 36} y={y + 50} width={22} height={3} rx={0.8} fill="#111417" />
      <text x={left + 36} y={y + 58} className="hw-label-dark">
        Speicherkarte
      </text>
      {/* RJ45 mit Link-LED */}
      <g transform={`translate(${left + w - 22}, ${y + h - 28})`}>
        <rect width={14} height={12} rx={1} fill="#121417" stroke="#5A6168" strokeWidth={0.4} />
        <rect x={3} y={3} width={8} height={6} fill="#2A2E33" />
        <Led x={2.4} y={-2.4} r={0.9} on={powered} color={LED.green} />
        <text x={5} y={-1.4} className="hw-label-dark">
          X1
        </text>
      </g>
      <text x={left + 4} y={y + h - 5} className="hw-label-dark">
        24 V DC
      </text>
    </g>
  );
}

/** Abgekürzter Symbolname für den Beschriftungsstreifen */
const abbrev = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Kanäle je Spalte des Beschriftungsstreifens (mehr als 8 Kanäle: zwei Spalten) */
export const stripRows = (channels: number) => (channels > 8 ? Math.ceil(channels / 2) : channels);

/**
 * Schmale E/A-Baugruppe (auch das E/A-Feld einer Kompakt-CPU): Typstreifen, Beschriftungsstreifen
 * mit LED, Adresse und Symbol je Kanal, bei Analogkanälen Balken, Fehler-LED und Messbereich,
 * Federzugklemmen unten.
 */
export function IoFront({
  l,
  x,
  t,
  id,
  kinds,
  ranges,
  addresses,
  symbols,
  states,
  wired,
  targetKind,
  onChannel,
  selectedChannel,
  onHoverChannel,
  hotChannel,
  title,
}: {
  l: Layout;
  x: number;
  t: ModuleType;
  id: string;
  /** Kanalart je Kanal */
  kinds: (ChannelKind | undefined)[];
  /** Messbereich je Kanal (nur Analog) */
  ranges: (AnalogRange | undefined)[];
  addresses: (string | undefined)[];
  symbols: (string | undefined)[];
  states: (boolean | number | undefined)[];
  wired: boolean[];
  /** Klemmen dieser Kanalart nehmen gerade eine Leitung an */
  targetKind?: ChannelKind;
  onChannel: (ch: number) => void;
  selectedChannel?: number;
  onHoverChannel?: (ch: number | null) => void;
  /** Klemme, deren Leitung gerade hervorgehoben ist */
  hotChannel?: number;
  /** Beschriftung oben statt des Typnamens */
  title?: string;
}) {
  const left = colX(l, x) + G.gap / 2;
  const w = t.width * G.te - G.gap;
  const y = G.module.y;
  const h = G.module.h;
  const kind = t.kind;
  const stripe =
    kind === 'di' || kind === 'ai'
      ? '#3CC8DC'
      : kind === 'cp'
        ? '#8E63CF'
        : kind === 'im'
          ? '#4FB286'
          : kind === 'rel'
            ? '#E07B5F'
            : kind === 'dio' || kind === 'cpu'
              ? '#9AA4AE'
              : '#F4C443';
  const rows = t.channels;
  const perCol = stripRows(rows);
  const cols = rows > perCol ? 2 : 1;
  const colW = (w - 1.6) / cols;
  const rowH = perCol ? Math.min(6.4, 52 / perCol) : 0;
  const narrow = colW < 16;
  const symChars = narrow ? 8 : 11;
  const termTop = y + h - 46;
  return (
    <g className="hw-io">
      <rect x={left} y={y} width={w} height={h} rx={1.6} fill="url(#hw-housing)" />
      {/* Lüftungsschlitze wie an der CPU */}
      {Array.from({ length: Math.max(1, Math.floor((w - 3) / 3)) }, (_, i) => (
        <rect
          key={i}
          x={left + 1.8 + i * 3}
          y={y + 1.2}
          width={1.4}
          height={2.6}
          rx={0.5}
          fill="#15181B"
        />
      ))}
      {/* Kennfarbe der Baugruppe */}
      <rect x={left + 0.8} y={y + 4.4} width={w - 1.6} height={0.9} rx={0.4} fill={stripe} />
      {/* Klemmenblock */}
      {rows > 0 && (
        <g>
          <rect
            x={left + 0.5}
            y={termTop}
            width={w - 1}
            height={h - (termTop - y) - 0.6}
            rx={1}
            fill="#3A4047"
          />
          <rect x={left + 0.5} y={termTop} width={w - 1} height={0.5} fill="#596169" />
        </g>
      )}
      {/* Anzeige wie an der CPU: Typ und Kennung */}
      <rect
        x={left + 0.9}
        y={y + 6}
        width={w - 1.8}
        height={10.6}
        rx={0.6}
        fill="#0F1A1E"
        stroke="#26373C"
        strokeWidth={0.3}
      />
      <text x={left + w / 2} y={y + 10.3} className="hw-name">
        {title ?? tr(t.name)}
      </text>
      <text x={left + w / 2} y={y + 14.6} className={`hw-sub ${t.alarms ? 'hw-sub-accent' : ''}`}>
        {t.alarms ? `${id} · Alarm` : id}
      </text>
      {/* Beschriftungsstreifen */}
      {rows > 0 &&
        Array.from({ length: cols }, (_, col) => (
          <rect
            key={`strip${col}`}
            x={left + 0.8 + col * colW + 3}
            y={y + 17.5}
            width={colW - 3.4}
            height={perCol * rowH + 1.5}
            rx={0.6}
            fill="#0F1A1E"
            stroke="#26373C"
            strokeWidth={0.3}
          />
        ))}
      {Array.from({ length: rows }, (_, ch) => {
        const col = Math.floor(ch / perCol);
        const cx0 = left + 0.8 + col * colW;
        const cy = y + 18.6 + (ch % perCol) * rowH + rowH / 2;
        const v = states[ch];
        const k = kinds[ch];
        const analog = k === 'AI' || k === 'AO';
        const raw = Number(v ?? 0);
        const fault = analog && v !== undefined && (raw >= 32767 || raw <= -32768);
        const addr = addresses[ch]?.replace('%', '') ?? `${ch}`;
        const sym = symbols[ch];
        const second = sym ?? (analog && ranges[ch] ? RANGE_LABEL[ranges[ch]!] : undefined);
        const tx = cx0 + 3.8;
        return (
          <g key={ch}>
            {analog ? (
              <Led x={cx0 + 1.5} y={cy} r={0.85} on={fault} color={LED.red} />
            ) : (
              <Led x={cx0 + 1.5} y={cy} r={0.95} on={v === true} color={LED.green} />
            )}
            <text x={tx} y={second ? cy - 0.4 : cy + 0.9} className="hw-addr">
              {addr}
            </text>
            {analog && (
              <g>
                <rect x={cx0 + colW - 4.6} y={cy - 2.2} width={3.6} height={1.1} fill="#1E3036" />
                <rect
                  x={cx0 + colW - 4.6}
                  y={cy - 2.2}
                  width={Math.max(0, Math.min(1, raw / 27648)) * 3.6}
                  height={1.1}
                  fill={fault ? '#E5484D' : '#7FE0C8'}
                />
              </g>
            )}
            {second && (
              <text x={tx} y={cy + 2.3} className="hw-sym hw-sym-under">
                <title>
                  {sym ?? ''}
                  {analog && ranges[ch] ? ` · Messbereich ${RANGE_LABEL[ranges[ch]!]}` : ''}
                </title>
                {abbrev(second, symChars)}
              </text>
            )}
          </g>
        );
      })}
      {/* Federzugklemmen */}
      {Array.from({ length: rows }, (_, ch) => {
        const p = terminalPos(l, { x }, t.width, rows, ch);
        const k = kinds[ch];
        const analog = k === 'AI' || k === 'AO';
        return (
          <g
            key={`t${ch}`}
            className={`hw-terminal ${targetKind && targetKind === k ? 'hw-terminal-target' : ''} ${selectedChannel === ch ? 'hw-terminal-sel' : ''} ${hotChannel === ch ? 'hw-terminal-hot' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onChannel(ch);
            }}
            onMouseEnter={() => onHoverChannel?.(ch)}
            onMouseLeave={() => onHoverChannel?.(null)}
          >
            <title>
              Klemme {ch + 1}
              {k ? ` · ${k}` : ''}
              {addresses[ch] ? ` · ${addresses[ch]}` : ''}
              {symbols[ch] ? ` · ${symbols[ch]}` : ''}
            </title>
            <rect
              x={p.x - 3.4}
              y={p.y - 7.6}
              width={6.8}
              height={9.6}
              rx={0.8}
              className="hw-terminal-hit"
            />
            <rect x={p.x - 1.4} y={p.y - 7} width={2.8} height={3.6} rx={0.5} fill="#F08A1C" />
            <circle
              cx={p.x}
              cy={p.y}
              r={1.2}
              fill={wired[ch] ? '#2A2F35' : '#121417'}
              stroke="#6E767E"
              strokeWidth={0.3}
            />
            {wired[ch] && (
              <g className="hw-ferrule">
                <rect
                  x={p.x - 0.65}
                  y={p.y + 0.9}
                  width={1.3}
                  height={1.5}
                  rx={0.2}
                  fill="#C7CCD1"
                />
                <rect
                  x={p.x - 0.75}
                  y={p.y + 2.3}
                  width={1.5}
                  height={0.9}
                  rx={0.2}
                  fill={analog ? '#8E63CF' : '#2D5FAE'}
                />
              </g>
            )}
            <text x={p.x + 2.4} y={p.y - 3.6} className="hw-term-no">
              {ch + 1}
            </text>
          </g>
        );
      })}
      {kind === 'im' && (
        <g>
          <text x={left + w / 2} y={y + 24} className="hw-sub">
            PN
          </text>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${left + w / 2 - 7}, ${y + 34 + i * 18})`}>
              <rect
                width={14}
                height={12}
                rx={1}
                fill="#121417"
                stroke="#4FB286"
                strokeWidth={0.4}
              />
              <rect x={3} y={3} width={8} height={6} fill="#2A2E33" />
            </g>
          ))}
        </g>
      )}
      {kind === 'cp' && (
        <g>
          <text x={left + w / 2} y={y + 24} className="hw-sub">
            QW100 → IW100
          </text>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${left + w / 2 - 7}, ${y + 34 + i * 18})`}>
              <rect
                width={14}
                height={12}
                rx={1}
                fill="#121417"
                stroke="#5A6168"
                strokeWidth={0.4}
              />
              <rect x={3} y={3} width={8} height={6} fill="#2A2E33" />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
