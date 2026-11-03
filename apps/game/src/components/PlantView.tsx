import { tr, type AlarmEntry, type Edge, type Level } from '@zyklus/sim-core';
import { HmiPanel } from './HmiPanel';
import { t } from '../i18n';
import { formatBool, useBoolFormat } from '../state/prefs';

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
  /** Parameter des laufenden Testfalls (z. B. Paketfolge) */
  testParams?: Record<string, unknown>;
  /** Meldungen aller CPUs (Program_Alarm), neueste zuerst */
  alarms?: readonly AlarmEntry[];
}

/** Anzahl steigender Flanken in [from, to] */
function risingEdges(edges: Edge[] | undefined, from: number, to: number): number {
  if (!edges) return 0;
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    const [t0, v] = edges[i]!;
    if (t0 > to) break;
    if (t0 >= from && v === true && (i === 0 || edges[i - 1]![1] !== true)) n++;
  }
  return n;
}

/** Zeitpunkt der letzten steigenden Flanke bis `now` */
function lastRise(edges: Edge[] | undefined, now: number): number | undefined {
  let t: number | undefined;
  for (let i = 0; i < (edges?.length ?? 0); i++) {
    const [t0, v] = edges![i]!;
    if (t0 > now) break;
    if (v === true && (i === 0 || edges![i - 1]![1] !== true)) t = t0;
  }
  return t;
}

/** Integral eines Zahlenverlaufs bis `now` (Wert · ms), z. B. zurückgelegter Weg aus der Frequenz */
function integral(edges: Edge[] | undefined, now: number): number {
  if (!edges) return 0;
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    const [t0, v] = edges[i]!;
    if (t0 > now) break;
    const t1 = Math.min(edges[i + 1]?.[0] ?? now, now);
    total += Number(v) * (t1 - t0);
  }
  return total;
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
  testParams,
  alarms = [],
}: Props) {
  const boolFormat = useBoolFormat();
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
  // Sensoren, die das Anlagenmodell liefert, sind im Handbetrieb nicht bedienbar
  const sub = (group: string, k: string) =>
    (level.plant?.params?.[group] as Record<string, string> | undefined)?.[k];
  const plantKeys: Record<string, string[]> = {
    tank: ['sensor'],
    drive: ['feedback'],
    drill: ['up', 'down', 'clamped'],
    sorter: ['measure', 'height', 'gate'],
    thermal: ['sensor'],
  };
  const fromPlant = new Set((plantKeys[type ?? ''] ?? []).map((k) => param(k)));
  if (type === 'tanks') for (const g of ['a', 'b']) fromPlant.add(sub(g, 'sensor'));
  const inputs = level.devices.filter((d) => d.kind === 'DI' && !d.hmi && !fromPlant.has(d.id));
  const analogs = level.devices.filter((d) => d.kind === 'AI' && !d.hmi);
  const hmi = level.devices.filter((d) => d.hmi);
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
        {type === 'tanks' && (
          <>
            <g transform="translate(-85 0)">
              <Tank
                level={num(traces?.get('plant.levelA'), 50)}
                pump={on(sub('a', 'pump'))}
                label={sub('a', 'pump')}
              />
            </g>
            <g transform="translate(95 0)">
              <Tank
                level={num(traces?.get('plant.levelB'), 50)}
                pump={on(sub('b', 'pump'))}
                label={sub('b', 'pump')}
              />
            </g>
          </>
        )}
        {type === 'drive' && (
          <DriveView
            offset={integral(traces?.get('plant.freq'), now) * 0.004}
            freq={num(traces?.get('plant.freq'), 0)}
            enabled={on(param('enable'))}
            overload={num(traces?.get('plant.overload'), 0)}
          />
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
        {type === 'panel' && (
          <Panel
            outputs={level.devices
              .filter((d) => d.kind === 'DO' || d.kind === 'AO')
              .map((d) => ({
                id: d.id,
                analog: d.kind === 'AO',
                value: d.kind === 'AO' ? rawTo(d.id, values.get(d.id)) : on(d.id),
              }))}
          />
        )}
        {type === 'drill' && (
          <Drill
            pos={num(traces?.get('plant.pos'), 0)}
            clamp={num(traces?.get('plant.clamp'), 0)}
            holes={num(traces?.get('plant.holes'), 0)}
            bad={num(traces?.get('plant.bad'), 0)}
            damage={num(traces?.get('plant.damage'), 0) > 0}
            motor={on(param('motor'))}
          />
        )}
        {type === 'sorter' && (
          <Sorter
            now={now}
            packages={
              ((testParams?.packages ?? level.plant?.params?.packages) as [number, number][]) ?? []
            }
            travel={Number(level.plant?.params?.travelMs ?? 900)}
            length={Number(level.plant?.params?.lengthMs ?? 250)}
            diverter={on(param('diverter'))}
            sorted={num(traces?.get('plant.sorted'), 0)}
            wrong={num(traces?.get('plant.wrong'), 0)}
          />
        )}
        {type === 'axis' && (
          <AxisView
            pos={num(traces?.get('plant.pos'), 0)}
            length={Number(level.plant?.params?.length ?? 1000)}
            targets={(level.plant?.params?.targets as number[] | undefined) ?? []}
            fast={on(param('motor'))}
            slow={on(param('creep'))}
            back={on(param('back'))}
          />
        )}
        {type === 'thermal' && (
          <Thermal
            temp={num(traces?.get('plant.temp'), 20)}
            heat={num(traces?.get('plant.heat'), 0)}
            setpoint={rawTo(param('setpoint'), values.get(param('setpoint') ?? ''))}
          />
        )}
        {type === 'pwm' && (
          <Pwm
            on={on(param('heater'))}
            duty={
              (onTime(traces?.get(param('heater') ?? ''), now) -
                onTime(traces?.get(param('heater') ?? ''), Math.max(0, now - 1000))) /
              Math.min(1000, Math.max(1, now))
            }
            setpoint={rawTo(param('setpoint'), values.get(param('setpoint') ?? ''))}
          />
        )}
        {type === 'pumphouse' && (
          <PumpHouse
            pump={on(param('pump'))}
            run={on(param('run'))}
            fault={on(param('fault'))}
            tripped={values.get(param('protection') ?? '') === false}
          />
        )}
        {type === 'filler' && (
          <Filler
            valve={on(param('valve'))}
            count={(() => {
              const start = lastRise(traces?.get(param('valve') ?? ''), now);
              return start === undefined
                ? 0
                : risingEdges(traces?.get(param('pulses') ?? ''), start, now);
            })()}
            target={Number(level.plant?.params?.target ?? 120)}
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
              <span className="push-collar" aria-hidden="true">
                <span className="push-cap" />
              </span>
              <span className="push-text">
                <span className="push-label">{tr(d.name).replace(/\s*\([^)]*\)$/, '')}</span>
                <span className="push-signal">
                  <span className={`led ${signal ? 'led-on' : ''}`} />
                  {d.id}
                  {d.nc ? ' · Öffner' : ''} = {formatBool(signal, boolFormat)}
                </span>
              </span>
            </button>
          );
        })}
        {manual &&
          analogs
            .filter((d) => !fromPlant.has(d.id))
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
      {(hmi.length > 0 || alarms.length > 0) && (
        <HmiPanel
          devices={hmi}
          values={values}
          manual={manual}
          actuated={actuated}
          onActuate={onActuate}
          analogValue={analogValue}
          onAnalog={onAnalog}
          alarms={alarms}
        />
      )}
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

function Tank({ level, pump, label = 'P1' }: { level: number; pump: boolean; label?: string }) {
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
        {label}
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

/** Sandkasten: alle Ausgänge als Leuchtmelder bzw. Zeigerinstrument */
function Panel({
  outputs,
}: {
  outputs: { id: string; analog: boolean; value: boolean | number }[];
}) {
  const step = 380 / Math.max(1, outputs.length);
  return (
    <g>
      {outputs.map((o, i) => {
        const cx = 10 + step * (i + 0.5);
        if (!o.analog) {
          return (
            <g key={o.id}>
              <circle cx={cx} cy={60} r={18} className={`bulb ${o.value ? 'bulb-on' : ''}`} />
              <text x={cx} y={104} className="plant-label">
                {o.id}
              </text>
            </g>
          );
        }
        const v = Math.max(0, Math.min(100, Number(o.value)));
        const a = Math.PI * (1 - v / 100);
        return (
          <g key={o.id}>
            <path d={`M${cx - 30},80 a30,30 0 0 1 60,0`} className="gauge" />
            <line
              x1={cx}
              y1={80}
              x2={cx + 26 * Math.cos(a)}
              y2={80 - 26 * Math.sin(a)}
              className="flap"
            />
            <text x={cx} y={104} className="plant-label">
              {o.id} {v.toFixed(0)} %
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Bohrständer: Spannbacke, Pinole mit Bohrer, Werkstück; Tiefe 0…100 */
function Drill(p: {
  pos: number;
  clamp: number;
  holes: number;
  bad: number;
  damage: boolean;
  motor: boolean;
}) {
  const y = 24 + (p.pos / 100) * 56;
  return (
    <g>
      <rect x={60} y={8} width={14} height={132} className="frame" />
      <rect x={60} y={8} width={110} height={12} className="frame" />
      <rect x={128} y={20} width={24} height={y - 12} className="rod" />
      <rect
        x={122}
        y={y + 6}
        width={36}
        height={18}
        rx={3}
        className={`motor ${p.motor ? 'motor-on' : ''}`}
      />
      <path
        d={`M136,${y + 24} h8 l-4,${26} z`}
        className={`bit ${p.motor ? 'bit-on' : ''} ${p.damage ? 'bit-broken' : ''}`}
      />
      <rect x={100} y={104} width={80} height={24} className="workpiece" />
      <rect x={70 + p.clamp * 24} y={102} width={8} height={28} className="jaw" />
      <rect x={60} y={128} width={160} height={10} className="anvil" />
      <text x={290} y={40} className="plant-label">
        Bohrungen {p.holes}
      </text>
      <text x={290} y={60} className={`plant-label ${p.bad ? 'plant-warn' : ''}`}>
        unsauber {p.bad}
      </text>
      {p.damage && (
        <text x={290} y={90} className="plant-label plant-alarm">
          SCHADEN
        </text>
      )}
      <text x={290} y={120} className="plant-label">
        Tiefe {p.pos.toFixed(0)} %
      </text>
    </g>
  );
}

/** Sortierband: Pakete laufen von der Messstelle zur Weiche */
function Sorter(p: {
  now: number;
  packages: [number, number][];
  travel: number;
  length: number;
  diverter: boolean;
  sorted: number;
  wrong: number;
}) {
  const x0 = 60;
  const xGate = 280;
  const pxPerMs = (xGate - x0) / p.travel;
  return (
    <g>
      <rect x={20} y={96} width={300} height={14} rx={7} className="belt" />
      <line x1={x0} y1={30} x2={x0} y2={94} className="beam" />
      <line x1={xGate} y1={30} x2={xGate} y2={94} className="beam" />
      <text x={x0} y={24} className="plant-label">
        B1
      </text>
      <text x={xGate} y={24} className="plant-label">
        B3
      </text>
      {p.packages.map(([t0, h], i) => {
        const x = x0 + (p.now - t0) * pxPerMs;
        if (x < 10 || x > 340) return null;
        const hh = Math.max(10, (h / 200) * 56);
        const w = p.length * pxPerMs;
        return (
          <rect
            key={i}
            x={x}
            y={96 - hh}
            width={w}
            height={hh}
            rx={3}
            className={`crate ${h > 120 ? 'crate-high' : ''}`}
          />
        );
      })}
      <line
        x1={330}
        y1={103}
        x2={p.diverter ? 380 : 390}
        y2={p.diverter ? 70 : 103}
        className="flap"
      />
      <text x={360} y={136} className="plant-label">
        ✓ {p.sorted} · ✗ {p.wrong}
      </text>
    </g>
  );
}

function Thermal({ temp, heat, setpoint }: { temp: number; heat: number; setpoint: number }) {
  const scale = (c: number) => 124 - Math.max(0, Math.min(1, c / 200)) * 104;
  return (
    <g>
      <rect x={60} y={20} width={20} height={104} rx={10} className="thermo" />
      <rect
        x={64}
        y={scale(temp)}
        width={12}
        height={124 - scale(temp)}
        rx={6}
        className="thermo-fill"
      />
      <line x1={52} x2={88} y1={scale(setpoint)} y2={scale(setpoint)} className="mark" />
      <text x={70} y={142} className="plant-label">
        {temp.toFixed(1)} °C
      </text>
      <text x={100} y={scale(setpoint) + 4} className="plant-label plant-left">
        Soll {setpoint.toFixed(0)}
      </text>
      <rect x={170} y={30} width={140} height={90} rx={6} className="oven" />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${190 + i * 30},110 q8,-12 0,-24 q-8,-12 0,-24`}
          className={`coil ${heat > 0.5 ? 'coil-on' : ''}`}
          style={{ opacity: 0.35 + (0.65 * heat) / 100 }}
        />
      ))}
      <rect x={170} y={128} width={140} height={8} className="bar-bg" />
      <rect x={170} y={128} width={(140 * heat) / 100} height={8} className="bar-display" />
      <text x={350} y={80} className="plant-label">
        {heat.toFixed(0)} %
      </text>
    </g>
  );
}

function Pwm({ on, duty, setpoint }: { on: boolean; duty: number; setpoint: number }) {
  return (
    <g>
      <rect
        x={60}
        y={60}
        width={200}
        height={30}
        rx={15}
        className={`band ${on ? 'band-on' : ''}`}
      />
      <text x={160} y={50} className="plant-label">
        Heizband {on ? 'ein' : 'aus'}
      </text>
      <rect x={60} y={112} width={200} height={8} className="bar-bg" />
      <rect x={60} y={112} width={200 * Math.min(1, duty)} height={8} className="bar-display" />
      <line x1={60 + 2 * setpoint} x2={60 + 2 * setpoint} y1={106} y2={126} className="mark" />
      <text x={330} y={70} className="plant-label">
        Soll {setpoint.toFixed(0)} %
      </text>
      <text x={330} y={120} className="plant-label">
        Ist {(duty * 100).toFixed(0)} %
      </text>
    </g>
  );
}

function PumpHouse(p: { pump: boolean; run: boolean; fault: boolean; tripped: boolean }) {
  return (
    <g>
      <rect x={20} y={20} width={150} height={110} rx={4} className="room" />
      <text x={95} y={38} className="plant-label">
        Leitwarte
      </text>
      <circle cx={70} cy={80} r={14} className={`bulb ${p.run ? 'bulb-on' : ''}`} />
      <text x={70} y={110} className="plant-label">
        Betrieb
      </text>
      <circle cx={125} cy={80} r={14} className={`bulb ${p.fault ? 'bulb-alarm' : ''}`} />
      <text x={125} y={110} className="plant-label">
        Störung
      </text>
      <rect x={186} y={10} width={12} height={130} className="wall-body" />
      <rect x={214} y={20} width={166} height={110} rx={4} className="room" />
      <text x={297} y={38} className="plant-label">
        Pumpenhaus
      </text>
      <circle cx={297} cy={78} r={22} className={`motor-round ${p.pump ? 'motor-on' : ''}`} />
      <text x={297} y={82} className="plant-label">
        K1
      </text>
      <text x={297} y={124} className={`plant-label ${p.tripped ? 'plant-alarm' : ''}`}>
        {p.tripped ? 'ausgelöst' : 'Motorschutz'}
      </text>
      <path d="M192,120 v14" className="bus-link" />
    </g>
  );
}

function Filler({ valve, count, target }: { valve: boolean; count: number; target: number }) {
  const fill = Math.min(1.08, count / target);
  return (
    <g>
      <rect
        x={180}
        y={8}
        width={40}
        height={18}
        rx={3}
        className={`valve ${valve ? 'valve-on' : ''}`}
      />
      {valve && <rect x={196} y={26} width={8} height={30} className="water" />}
      <path d="M170,60 h60 v74 h-60 z" className="bottle" />
      <rect
        x={172}
        y={132 - 72 * Math.min(1, fill)}
        width={56}
        height={72 * Math.min(1, fill)}
        className="water"
      />
      {fill > 1 && (
        <text x={200} y={54} className="plant-label plant-alarm">
          ÜBERLAUF
        </text>
      )}
      <text x={300} y={70} className="plant-label">
        {count} / {target}
      </text>
      <text x={300} y={90} className="plant-label">
        Impulse
      </text>
    </g>
  );
}

/** Förderband am Umrichter: Geschwindigkeit aus der Frequenz, Freigabe, Überlastungen */
function DriveView({
  offset,
  freq,
  enabled,
  overload,
}: {
  offset: number;
  freq: number;
  enabled: boolean;
  overload: number;
}) {
  return (
    <g>
      <Conveyor offset={offset} on={freq > 0.5} />
      <rect x={20} y={14} width={110} height={40} rx={4} className="display" />
      <text x={75} y={42} className="display-text">
        {freq.toFixed(1)} Hz
      </text>
      <circle cx={300} cy={30} r={9} className={`bulb ${enabled ? 'bulb-on' : ''}`} />
      <text x={318} y={34} className="plant-label plant-left">
        Freigabe
      </text>
      {overload > 0 && (
        <text x={200} y={30} className="plant-label plant-alarm">
          {overload}× gekippt
        </text>
      )}
    </g>
  );
}

/** Positionierachse: Schlitten auf der Führung, Zielmarken, Positionsanzeige */
function AxisView({
  pos,
  length,
  targets,
  fast,
  slow,
  back,
}: {
  pos: number;
  length: number;
  targets: number[];
  fast: boolean;
  slow: boolean;
  back: boolean;
}) {
  const x = (mm: number) => 30 + (Math.max(0, Math.min(length, mm)) / length) * 340;
  return (
    <g>
      <rect x={20} y={88} width={360} height={8} rx={2} className="ceiling" />
      {targets.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={70} x2={x(t)} y2={104} className="cord" />
          <text x={x(t)} y={118} className="plant-label">
            {t}
          </text>
        </g>
      ))}
      <rect
        x={x(pos) - 14}
        y={66}
        width={28}
        height={22}
        rx={3}
        className={`bulb ${fast || slow ? 'bulb-on' : ''}`}
      />
      <rect x={20} y={14} width={130} height={40} rx={4} className="display" />
      <text x={85} y={42} className="display-text">
        {pos.toFixed(1)} mm
      </text>
      <text x={300} y={34} className="plant-label">
        {fast ? 'Eilgang' : slow ? 'Schleichgang' : 'steht'}
        {(fast || slow) && back ? ' ←' : fast || slow ? ' →' : ''}
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
