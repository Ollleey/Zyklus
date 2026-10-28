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
  /** Handbetrieb: physikalischer Wert eines Analoggebers */
  analogValue: (device: string) => number;
  onAnalog: (device: string, v: number) => void;
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

export function PlantView({
  level,
  traces,
  now,
  values,
  manual,
  actuated,
  onActuate,
  analogValue,
  onAnalog,
}: Props) {
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
  const analogs = level.devices.filter((d) => d.kind === 'AI');
  const on = (id: string | undefined) => (id ? values.get(id) === true : false);
  const rawTo = (id: string | undefined, raw: boolean | number | undefined) => {
    const a = level.devices.find((d) => d.id === id)?.analog;
    return a ? a.min + (Number(raw ?? 0) / 27648) * (a.max - a.min) : 0;
  };

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
        {type === 'traffic' && (
          <Traffic red={on(param('red'))} yellow={on(param('yellow'))} green={on(param('green'))} />
        )}
        {type === 'counter' && (
          <Counter
            now={now}
            barrier={traces?.get(param('barrier') ?? '')}
            full={on(param('lamp'))}
          />
        )}
        {type === 'stardelta' && (
          <StarDelta main={on(param('main'))} star={on(param('star'))} delta={on(param('delta'))} />
        )}
        {type === 'tank' && (
          <Tank level={num(traces?.get('plant.level'), 50)} pump={on(param('pump'))} />
        )}
        {type === 'heater' && (
          <Heater
            celsius={rawTo(param('sensor'), values.get(param('sensor') ?? ''))}
            raw={Number(values.get(param('sensor') ?? '') ?? 0)}
            heating={on(param('heater'))}
            alarm={on(param('alarm'))}
          />
        )}
        {type === 'flow' && (
          <Flow
            raw={Number(values.get(param('sensor') ?? '') ?? 0)}
            display={Number(values.get(param('display') ?? '') ?? 0)}
            unit={level.devices.find((d) => d.id === param('display'))?.analog?.unit ?? ''}
          />
        )}
      </svg>
      <div className="panel-buttons">
        {inputs.map((d) => {
          const pressed = manual ? actuated(d.id) : false;
          const signal = values.get(d.id) === true;
          const isSwitch = d.role === 'switch';
          return (
            <button
              key={d.id}
              className={`push ${pressed ? 'push-down' : ''} ${d.nc ? 'push-nc' : ''} ${isSwitch ? 'push-switch' : ''}`}
              disabled={!manual}
              title={
                manual
                  ? isSwitch
                    ? 'Klick schaltet um'
                    : 'Gedrückt halten'
                  : 'Im Handbetrieb bedienbar'
              }
              onClick={() => manual && isSwitch && onActuate(d.id, !pressed)}
              onPointerDown={() => manual && !isSwitch && press(d.id)}
              onPointerUp={() => manual && !isSwitch && release(d.id)}
              onPointerLeave={() => manual && !isSwitch && pressed && release(d.id)}
            >
              <span className={`led ${signal ? 'led-on' : ''}`} />
              <span className="push-label">{tr(d.name).replace(/\s*\([^)]*\)$/, '')}</span>
            </button>
          );
        })}
        {manual &&
          analogs
            .filter((d) => !level.plant || level.plant.type !== 'tank' || d.id !== param('sensor'))
            .map((d) => (
              <label key={d.id} className="slider">
                <span>
                  {tr(d.name).replace(/\s*\([^)]*\)$/, '')}: {analogValue(d.id).toFixed(0)}{' '}
                  {d.analog!.unit}
                </span>
                <input
                  type="range"
                  min={d.analog!.min}
                  max={d.analog!.max}
                  step={(d.analog!.max - d.analog!.min) / 200}
                  value={analogValue(d.id)}
                  onChange={(e) => onAnalog(d.id, Number(e.target.value))}
                />
              </label>
            ))}
      </div>
    </div>
  );
}

function num(edges: Edge[] | undefined, fallback: number): number {
  return edges?.length ? Number(edges[edges.length - 1]![1]) : fallback;
}

function Traffic({ red, yellow, green }: { red: boolean; yellow: boolean; green: boolean }) {
  return (
    <g>
      <rect x={172} y={8} width={56} height={134} rx={8} className="frame" />
      <circle cx={200} cy={34} r={16} className={`tl ${red ? 'tl-red' : ''}`} />
      <circle cx={200} cy={75} r={16} className={`tl ${yellow ? 'tl-yellow' : ''}`} />
      <circle cx={200} cy={116} r={16} className={`tl ${green ? 'tl-green' : ''}`} />
    </g>
  );
}

/** Teile fahren durch die Lichtschranke; jede Unterbrechung ist ein Teil auf dem Band. */
function Counter({ now, barrier, full }: { now: number; barrier?: Edge[]; full: boolean }) {
  const blocked = barrier?.length ? barrier[barrier.length - 1]![1] === true : false;
  const offset = (now * 0.08) % 60;
  return (
    <g>
      <rect x={20} y={70} width={260} height={14} rx={7} className="belt" />
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          x1={30 + ((i * 45 + offset) % 250)}
          x2={30 + ((i * 45 + offset) % 250)}
          y1={72}
          y2={82}
          className="belt-stripe"
        />
      ))}
      {blocked && <rect x={186} y={46} width={24} height={24} rx={3} className="crate" />}
      <line x1={198} y1={20} x2={198} y2={68} className={`beam ${blocked ? 'beam-cut' : ''}`} />
      <rect x={190} y={12} width={16} height={10} className="frame" />
      <rect x={300} y={78} width={80} height={56} className="box" />
      <text x={340} y={110} className={`plant-label ${full ? 'plant-on' : ''}`}>
        {full ? 'VOLL' : 'Karton'}
      </text>
      <circle cx={360} cy={40} r={12} className={`bulb ${full ? 'bulb-on' : ''}`} />
    </g>
  );
}

function StarDelta({ main, star, delta }: { main: boolean; star: boolean; delta: boolean }) {
  const both = star && delta;
  const k = (x: number, label: string, onState: boolean) => (
    <g>
      <rect
        x={x}
        y={20}
        width={60}
        height={40}
        rx={4}
        className={`contactor ${onState ? 'contactor-on' : ''}`}
      />
      <text x={x + 30} y={45} className="plant-label">
        {label}
      </text>
    </g>
  );
  return (
    <g>
      {k(50, 'K1 Netz', main)}
      {k(170, 'K2 Stern', star)}
      {k(290, 'K3 Dreieck', delta)}
      <circle
        cx={200}
        cy={105}
        r={28}
        className={`motor-round ${main && (star || delta) ? 'motor-on' : ''}`}
      />
      <text x={200} y={110} className="plant-label">
        {both ? 'KURZSCHLUSS' : main && star ? 'Stern' : main && delta ? 'Dreieck' : 'aus'}
      </text>
    </g>
  );
}

function Tank({ level, pump }: { level: number; pump: boolean }) {
  const h = 110;
  const fill = (h * Math.max(0, Math.min(100, level))) / 100;
  return (
    <g>
      <rect x={150} y={20} width={100} height={h} className="tank" />
      <rect x={151} y={20 + h - fill} width={98} height={fill} className="water" />
      <line x1={145} x2={255} y1={20 + h * 0.2} y2={20 + h * 0.2} className="mark" />
      <line x1={145} x2={255} y1={20 + h * 0.6} y2={20 + h * 0.6} className="mark" />
      <text x={262} y={20 + h * 0.2 + 4} className="plant-label plant-left">
        80 %
      </text>
      <text x={262} y={20 + h * 0.6 + 4} className="plant-label plant-left">
        40 %
      </text>
      <text x={200} y={14} className="plant-label">
        {level.toFixed(1)} %
      </text>
      <circle cx={90} cy={110} r={18} className={`motor-round ${pump ? 'motor-on' : ''}`} />
      <text x={90} y={114} className="plant-label">
        P1
      </text>
      <line x1={108} y1={110} x2={150} y2={110} className={`pipe ${pump ? 'pipe-on' : ''}`} />
    </g>
  );
}

function Heater({
  celsius,
  raw,
  heating,
  alarm,
}: {
  celsius: number;
  raw: number;
  heating: boolean;
  alarm: boolean;
}) {
  const broken = raw > 32511 || raw < -4864;
  const h = Math.max(0, Math.min(1, celsius / 150)) * 100;
  return (
    <g>
      <rect x={60} y={20} width={20} height={104} rx={10} className="thermo" />
      {!broken && <rect x={64} y={120 - h} width={12} height={h} rx={6} className="thermo-fill" />}
      <text x={70} y={142} className="plant-label">
        {broken ? 'Fehler' : `${celsius.toFixed(1)} °C`}
      </text>
      <rect x={150} y={30} width={140} height={90} rx={6} className="oven" />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${170 + i * 30},110 q8,-12 0,-24 q-8,-12 0,-24`}
          className={`coil ${heating ? 'coil-on' : ''}`}
        />
      ))}
      <circle cx={340} cy={50} r={14} className={`bulb ${alarm ? 'bulb-alarm' : ''}`} />
      <text x={340} y={82} className="plant-label">
        Störung
      </text>
    </g>
  );
}

function Flow({ raw, display, unit }: { raw: number; display: number; unit: string }) {
  const pct = (r: number) => Math.max(0, Math.min(1, r / 27648));
  return (
    <g>
      <rect x={30} y={60} width={200} height={20} className="pipe-body" />
      <text x={130} y={52} className="plant-label">
        Messwert {((raw / 27648) * 100).toFixed(1)} {unit}
      </text>
      <rect x={260} y={30} width={110} height={80} rx={6} className="display" />
      <text x={315} y={78} className="display-text">
        {((display / 27648) * 100).toFixed(1)}
      </text>
      <text x={315} y={98} className="plant-label">
        {unit}
      </text>
      <rect x={40} y={100} width={180} height={8} className="bar-bg" />
      <rect x={40} y={100} width={180 * pct(raw)} height={8} className="bar-raw" />
      <rect x={40} y={112} width={180} height={8} className="bar-bg" />
      <rect x={40} y={112} width={180 * pct(display)} height={8} className="bar-display" />
    </g>
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
