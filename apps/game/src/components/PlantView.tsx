import { tr, type Edge, type Level } from '@zyklus/sim-core';
import { t } from '../i18n';

interface Props {
  level: Level;
  traces: Map<string, Edge[]> | undefined;
  now: number;
  values: Map<string, boolean | number>;
  manual: boolean;
  actuated: (device: string) => boolean;
  onActuate: (device: string, v: boolean) => void;
}

/** Zeit (ms), die ein Signal bis `now` auf TRUE war. */
function onTime(edges: Edge[] | undefined, now: number): number {
  if (!edges) return 0;
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    const [t0, v] = edges[i]!;
    if (t0 > now) break;
    const t1 = Math.min(edges[i + 1]?.[0] ?? now, now);
    if (v === true) total += t1 - t0;
  }
  return total;
}

/** Position 0…1 eines Antriebs, der bei TRUE mit `rate` (1/ms) ausfährt und sonst einfährt. */
function travel(edges: Edge[] | undefined, now: number, rate: number): number {
  if (!edges) return 0;
  let pos = 0;
  for (let i = 0; i < edges.length; i++) {
    const [t0, v] = edges[i]!;
    if (t0 > now) break;
    const t1 = Math.min(edges[i + 1]?.[0] ?? now, now);
    pos = Math.min(1, Math.max(0, pos + (v === true ? 1 : -1) * (t1 - t0) * rate));
  }
  return pos;
}

/** Ein kurzer Klick hält den Taster mindestens so lange gedrückt (sonst sieht ihn kein Zyklus). */
const MIN_HOLD_MS = 150;
const pressedAt = new Map<string, number>();

export function PlantView({ level, traces, now, values, manual, actuated, onActuate }: Props) {
  const press = (id: string) => {
    pressedAt.set(id, performance.now());
    onActuate(id, true);
  };
  const release = (id: string) => {
    const held = performance.now() - (pressedAt.get(id) ?? 0);
    setTimeout(() => onActuate(id, false), Math.max(0, MIN_HOLD_MS - held));
  };
  const type = level.plant?.type;
  const param = (k: string) => level.plant?.params?.[k] as string | undefined;
  const inputs = level.devices.filter((d) => d.kind === 'DI');

  return (
    <div className="plant">
      <svg viewBox="0 0 400 150" className="plant-svg" role="img" aria-label={t('plant.title')}>
        {type === 'conveyor' && (
          <Conveyor
            offset={onTime(traces?.get(param('motor') ?? ''), now) * 0.06}
            on={values.get(param('motor') ?? '') === true}
          />
        )}
        {type === 'press' && (
          <Press
            pos={travel(traces?.get(param('valve') ?? ''), now, 1 / 250)}
            on={values.get(param('valve') ?? '') === true}
          />
        )}
        {type === 'lamp' && <Lamp on={values.get(param('lamp') ?? '') === true} />}
      </svg>
      <div className="panel-buttons">
        {inputs.map((d) => {
          const pressed = manual ? actuated(d.id) : false;
          const signal = values.get(d.id) === true;
          return (
            <button
              key={d.id}
              className={`push ${pressed ? 'push-down' : ''} ${d.nc ? 'push-nc' : ''}`}
              disabled={!manual}
              title={manual ? 'Gedrückt halten' : 'Im Handbetrieb bedienbar'}
              onPointerDown={() => manual && press(d.id)}
              onPointerUp={() => manual && release(d.id)}
              onPointerLeave={() => manual && pressed && release(d.id)}
            >
              <span className={`led ${signal ? 'led-on' : ''}`} />
              <span className="push-label">{tr(d.name).replace(/\s*\([^)]*\)$/, '')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Conveyor({ offset, on }: { offset: number; on: boolean }) {
  const len = 300;
  return (
    <g>
      <rect x={50} y={90} width={len} height={16} rx={8} className="belt" />
      {Array.from({ length: 16 }, (_, i) => {
        const x = 50 + ((((i * 20 + offset) % len) + len) % len);
        return <line key={i} x1={x} x2={x} y1={92} y2={104} className="belt-stripe" />;
      })}
      {[0, 1, 2].map((i) => {
        const x = 50 + (((i * 110 + offset) % (len + 60)) - 30);
        return x > 30 && x < 340 ? (
          <rect key={i} x={x} y={62} width={34} height={28} rx={3} className="crate" />
        ) : null;
      })}
      <circle cx={58} cy={98} r={10} className="roller" />
      <circle cx={342} cy={98} r={10} className="roller" />
      <rect x={160} y={112} width={80} height={24} rx={3} className="motor" />
      <text x={200} y={128} className={`plant-label ${on ? 'plant-on' : ''}`}>
        M1 {on ? 'läuft' : 'steht'}
      </text>
    </g>
  );
}

function Press({ pos, on }: { pos: number; on: boolean }) {
  return (
    <g>
      <rect x={130} y={10} width={140} height={18} className="frame" />
      <rect x={130} y={28} width={12} height={110} className="frame" />
      <rect x={258} y={28} width={12} height={110} className="frame" />
      <rect x={180} y={28} width={40} height={20 + pos * 55} className="rod" />
      <rect
        x={165}
        y={48 + pos * 55}
        width={70}
        height={16}
        className={`stamp ${on ? 'stamp-on' : ''}`}
      />
      <rect x={155} y={124} width={90} height={14} className="anvil" />
      <text x={200} y={146} className={`plant-label ${on ? 'plant-on' : ''}`}>
        Y1 {on ? 'fährt' : 'oben'}
      </text>
    </g>
  );
}

function Lamp({ on }: { on: boolean }) {
  return (
    <g>
      {on && <circle cx={200} cy={62} r={52} className="glow" />}
      <rect x={110} y={14} width={180} height={6} className="ceiling" />
      <line x1={200} y1={20} x2={200} y2={40} className="cord" />
      <circle cx={200} cy={62} r={22} className={`bulb ${on ? 'bulb-on' : ''}`} />
      <text x={200} y={132} className={`plant-label ${on ? 'plant-on' : ''}`}>
        H1 {on ? 'an' : 'aus'}
      </text>
    </g>
  );
}
