import {
  COLORS,
  MATERIALS,
  SIZES,
  connectionsOf,
  faultsOf,
  ruleText,
  ruleTextEn,
  type ColorId,
  type Layout,
  type MaterialId,
  type Part,
  type Rule,
  type ScenarioEvent,
  type ScenarioEventKind,
  type SizeId,
} from '@zyklus/plant-sim';
import { EVENT_KINDS } from '@zyklus/plant-sim';
import { language, t, tx } from '../../i18n';

/**
 * Bausteine für Szenarien und das Veröffentlichen: Zeitleiste, Ereignisliste und Regeln.
 * Alle Zeiten werden in Sekunden eingegeben und in ms gespeichert.
 */

const CONTROL_TYPES = ['button', 'switch', 'estop', 'selector', 'poti'];
const DROP_TYPES = ['belt', 'rollers', 'curve', 'chute', 'turntable', 'lift', 'diverter', 'bin'];

export const RULE_KINDS: Rule['kind'][] = [
  'sorted',
  'noLoss',
  'minIn',
  'tankRange',
  'exclusive',
  'neverOn',
  'offFrom',
  'onBetween',
];

/** Bauteile und Ausgänge, auf die Ereignisse und Regeln verweisen können */
export function refsOf(layout: Layout) {
  const byType = (types: string[]) => layout.parts.filter((p) => types.includes(p.type));
  return {
    controls: byType(CONTROL_TYPES),
    faulty: layout.parts.filter((p) => faultsOf(p.type).length > 0),
    drops: byType(DROP_TYPES),
    magazines: byType(['magazine']),
    tanks: byType(['tank']),
    bins: byType(['bin']).map((p) => p.tag),
    tankTags: byType(['tank']).map((p) => p.tag),
    outputs: connectionsOf(layout)
      .filter((c) => c.device.kind === 'DO')
      .map((c) => c.device.label!),
  };
}

type Refs = ReturnType<typeof refsOf>;

const FAULT_EN: Record<string, string> = {
  dauer0: 'Sensor defective: always 0',
  dauer1: 'Sensor defective: always 1',
  klemmt: 'jammed',
  blockiert: 'belt blocked',
  drahtbruch: 'wire break',
};
const MATERIAL_EN: Record<string, string> = {
  stahl: 'Steel',
  aluminium: 'Aluminium',
  messing: 'Brass',
  holz: 'Wood',
  kunststoff: 'Plastic',
  glas: 'Glass',
};
const COLOR_EN: Record<string, string> = {
  rot: 'Red',
  blau: 'Blue',
  schwarz: 'Black',
  silber: 'Silver',
  weiss: 'White',
  natur: 'Natural',
};
const SIZE_EN: Record<string, string> = { klein: 'small', mittel: 'medium', gross: 'large' };

export const faultLabel = (key: string, de: string) =>
  language() === 'en' ? (FAULT_EN[key] ?? de) : de;
export const ruleLabel = (r: Rule) => (language() === 'en' ? ruleTextEn(r) : ruleText(r));

export function defaultRule(kind: Rule['kind'], refs: Refs): Rule {
  const out = refs.outputs;
  switch (kind) {
    case 'minIn':
      return { kind, bin: refs.bins[0] ?? '', n: 5 };
    case 'tankRange':
      return { kind, tank: refs.tankTags[0] ?? '', min: 30, max: 80, fromMs: 20000 };
    case 'exclusive':
      return { kind, a: out[0] ?? '', b: out[1] ?? out[0] ?? '' };
    case 'neverOn':
      return { kind, output: out[0] ?? '' };
    case 'offFrom':
      return { kind, output: out[0] ?? '', fromMs: 10000 };
    case 'onBetween':
      return { kind, output: out[0] ?? '', fromMs: 10000, toMs: 15000 };
    default:
      return { kind } as Rule;
  }
}

export function defaultEvent(kind: ScenarioEventKind, at: number, refs: Refs): ScenarioEvent {
  switch (kind) {
    case 'control': {
      const p = refs.controls[0];
      return {
        kind,
        at,
        ref: p?.tag ?? '',
        value: p?.type === 'selector' ? 2 : p?.type === 'poti' ? 50 : true,
      };
    }
    case 'fault': {
      const p = refs.faulty[0];
      return { kind, at, ref: p?.tag ?? '', fault: p ? faultsOf(p.type)[0]![0] : '' };
    }
    case 'power':
      return { kind, at, until: at + 1000 };
    case 'workpiece':
      return {
        kind,
        at,
        ref: refs.drops[0]?.tag ?? '',
        spec: { material: 'stahl', color: 'silber', size: 'mittel' },
      };
    case 'magazine':
      return { kind, at, ref: refs.magazines[0]?.tag ?? '' };
    case 'tank':
      return { kind, at, ref: refs.tanks[0]?.tag ?? '', level: 50 };
  }
}

/** welche Ereignisarten mit dieser Anlage möglich sind */
export function possibleKinds(refs: Refs): ScenarioEventKind[] {
  return EVENT_KINDS.filter(
    (k) =>
      k === 'power' ||
      (k === 'control' && refs.controls.length) ||
      (k === 'fault' && refs.faulty.length) ||
      (k === 'workpiece' && refs.drops.length) ||
      (k === 'magazine' && refs.magazines.length) ||
      (k === 'tank' && refs.tanks.length),
  );
}

const sec = (ms: number) => Math.round(ms) / 1000;
const ms = (s: string) => Math.max(0, Math.round((Number(s.replace(',', '.')) || 0) * 1000));

function Seconds({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (ms: number) => void;
  label: string;
}) {
  return (
    <input
      className="sz-sec"
      type="number"
      min={0}
      step={0.1}
      value={sec(value)}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(ms(e.target.value))}
    />
  );
}

function PartSelect({
  parts,
  value,
  onChange,
}: {
  parts: Part[];
  value: string;
  onChange: (tag: string) => void;
}) {
  const known = parts.some((p) => p.tag === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!known}>
      {!known && <option value={value}>{value || '–'} ?</option>}
      {parts.map((p) => (
        <option key={p.id} value={p.tag}>
          {p.tag}
        </option>
      ))}
    </select>
  );
}

/** ein Ereignis der Zeitleiste bearbeiten */
function EventRow({
  e,
  refs,
  kinds,
  onChange,
  onRemove,
}: {
  e: ScenarioEvent;
  refs: Refs;
  kinds: ScenarioEventKind[];
  onChange: (e: ScenarioEvent) => void;
  onRemove: () => void;
}) {
  const set = (p: Partial<ScenarioEvent>) => onChange({ ...e, ...p } as ScenarioEvent);
  let body: React.ReactNode = null;
  switch (e.kind) {
    case 'control': {
      const part = refs.controls.find((p) => p.tag === e.ref);
      body = (
        <>
          <PartSelect parts={refs.controls} value={e.ref} onChange={(ref) => set({ ref })} />
          {part?.type === 'selector' ? (
            <select
              value={Number(e.value)}
              onChange={(x) => set({ value: Number(x.target.value) })}
            >
              <option value={0}>0</option>
              <option value={1}>{tx('Hand', 'Manual')}</option>
              <option value={2}>Auto</option>
            </select>
          ) : part?.type === 'poti' ? (
            <input
              type="number"
              min={0}
              max={100}
              value={Number(e.value)}
              onChange={(x) => set({ value: Number(x.target.value) || 0 })}
            />
          ) : (
            <select
              value={e.value ? '1' : '0'}
              onChange={(x) => set({ value: x.target.value === '1' })}
            >
              <option value="1">{t('publish.on')}</option>
              <option value="0">{t('publish.off')}</option>
            </select>
          )}
        </>
      );
      break;
    }
    case 'fault': {
      const part = refs.faulty.find((p) => p.tag === e.ref);
      const faults = part ? faultsOf(part.type) : [];
      body = (
        <>
          <PartSelect
            parts={refs.faulty}
            value={e.ref}
            onChange={(ref) => {
              const p = refs.faulty.find((x) => x.tag === ref);
              const f = p ? faultsOf(p.type) : [];
              set({ ref, fault: f.some(([k]) => k === e.fault) ? e.fault : (f[0]?.[0] ?? '') });
            }}
          />
          <select value={e.fault} onChange={(x) => set({ fault: x.target.value })}>
            {faults.map(([k, name]) => (
              <option key={k} value={k}>
                {faultLabel(k, name)}
              </option>
            ))}
          </select>
          <span>{t('scenario.until')}</span>
          <input
            className="sz-sec"
            type="number"
            min={0}
            step={0.1}
            placeholder={t('scenario.toEnd')}
            aria-label={t('scenario.until')}
            value={e.until === undefined ? '' : sec(e.until)}
            onChange={(x) => set({ until: x.target.value === '' ? undefined : ms(x.target.value) })}
          />
          <span>s</span>
        </>
      );
      break;
    }
    case 'power':
      body = (
        <>
          <span>{t('scenario.until')}</span>
          <Seconds
            value={e.until}
            label={t('scenario.until')}
            onChange={(until) => set({ until })}
          />
          <span>s</span>
        </>
      );
      break;
    case 'workpiece':
      body = (
        <>
          <PartSelect parts={refs.drops} value={e.ref} onChange={(ref) => set({ ref })} />
          <select
            value={e.spec.material}
            onChange={(x) => set({ spec: { ...e.spec, material: x.target.value as MaterialId } })}
          >
            {Object.entries(MATERIALS).map(([k, m]) => (
              <option key={k} value={k}>
                {tx(m.name, MATERIAL_EN[k] ?? m.name)}
              </option>
            ))}
          </select>
          <select
            value={e.spec.color}
            onChange={(x) => set({ spec: { ...e.spec, color: x.target.value as ColorId } })}
          >
            {Object.entries(COLORS).map(([k, c]) => (
              <option key={k} value={k}>
                {tx(c.name, COLOR_EN[k] ?? c.name)}
              </option>
            ))}
          </select>
          <select
            value={e.spec.size}
            onChange={(x) => set({ spec: { ...e.spec, size: x.target.value as SizeId } })}
          >
            {Object.entries(SIZES).map(([k, s]) => (
              <option key={k} value={k}>
                {tx(s.name, SIZE_EN[k] ?? s.name)}
              </option>
            ))}
          </select>
        </>
      );
      break;
    case 'magazine':
      body = <PartSelect parts={refs.magazines} value={e.ref} onChange={(ref) => set({ ref })} />;
      break;
    case 'tank':
      body = (
        <>
          <PartSelect parts={refs.tanks} value={e.ref} onChange={(ref) => set({ ref })} />
          <input
            type="number"
            min={0}
            max={100}
            value={e.level}
            aria-label="%"
            onChange={(x) =>
              set({ level: Math.max(0, Math.min(100, Number(x.target.value) || 0)) })
            }
          />
          <span>%</span>
        </>
      );
      break;
  }
  return (
    <div className={`publish-row sz-event sz-${e.kind}`}>
      <Seconds value={e.at} label={t('publish.at')} onChange={(at) => set({ at })} />
      <span>s</span>
      {e.kind !== 'power' && (
        <>
          <span title={t('scenario.jitterTitle')}>+</span>
          <input
            className="sz-sec"
            type="number"
            min={0}
            step={0.1}
            placeholder="0"
            value={e.jitter ? sec(e.jitter) : ''}
            aria-label={t('scenario.jitter')}
            title={t('scenario.jitterTitle')}
            onChange={(x) => set({ jitter: ms(x.target.value) || undefined })}
          />
        </>
      )}
      <select
        value={e.kind}
        onChange={(x) => onChange(defaultEvent(x.target.value as ScenarioEventKind, e.at, refs))}
      >
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(`scenario.kind.${k}` as never)}
          </option>
        ))}
      </select>
      {body}
      <button className="icon-btn" aria-label={t('publish.remove')} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** Ereignisliste, nach Zeit sortiert angezeigt */
export function EventList({
  layout,
  events,
  onChange,
}: {
  layout: Layout;
  events: ScenarioEvent[];
  onChange: (events: ScenarioEvent[]) => void;
}) {
  const refs = refsOf(layout);
  const kinds = possibleKinds(refs);
  const order = events.map((e, i) => [e, i] as const).sort((a, b) => a[0].at - b[0].at);
  return (
    <>
      {order.map(([e, i]) => (
        <EventRow
          key={i}
          e={e}
          refs={refs}
          kinds={kinds}
          onChange={(x) => onChange(events.map((y, k) => (k === i ? x : y)))}
          onRemove={() => onChange(events.filter((_, k) => k !== i))}
        />
      ))}
      <button
        className="btn btn-small"
        onClick={() =>
          onChange([
            ...events,
            defaultEvent(
              kinds.includes('control') ? 'control' : 'fault',
              Math.max(0, ...events.map((e) => e.at)) + (events.length ? 1000 : 100),
              refs,
            ),
          ])
        }
      >
        + {t('scenario.addEvent')}
      </button>
    </>
  );
}

/** Prüfregeln bearbeiten */
export function RuleList({
  layout,
  rules,
  onChange,
}: {
  layout: Layout;
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}) {
  const refs = refsOf(layout);
  const { bins, tankTags: tanks, outputs } = refs;
  const outSel = (value: string, set: (v: string) => void, key?: string) => (
    <select key={key} value={value} onChange={(e) => set(e.target.value)}>
      {!outputs.includes(value) && <option value={value}>{value || '–'} ?</option>}
      {outputs.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
  return (
    <>
      {rules.map((rule, k) => {
        const set = (r: Rule) => onChange(rules.map((x, j) => (j === k ? r : x)));
        return (
          <div key={k} className="publish-row">
            <select
              value={rule.kind}
              onChange={(e) => set(defaultRule(e.target.value as Rule['kind'], refs))}
            >
              {RULE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`publish.rule.${kind}` as never)}
                </option>
              ))}
            </select>
            {rule.kind === 'minIn' && (
              <>
                <select value={rule.bin} onChange={(e) => set({ ...rule, bin: e.target.value })}>
                  {bins.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={rule.n}
                  onChange={(e) => set({ ...rule, n: Math.max(1, Number(e.target.value) || 1) })}
                />
              </>
            )}
            {rule.kind === 'tankRange' && (
              <>
                <select value={rule.tank} onChange={(e) => set({ ...rule, tank: e.target.value })}>
                  {tanks.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={rule.min}
                  onChange={(e) => set({ ...rule, min: Number(e.target.value) })}
                />
                <span>…</span>
                <input
                  type="number"
                  value={rule.max}
                  onChange={(e) => set({ ...rule, max: Number(e.target.value) })}
                />
                <span>% {tx('ab', 'from')}</span>
                <Seconds
                  value={rule.fromMs}
                  label={t('publish.at')}
                  onChange={(fromMs) => set({ ...rule, fromMs })}
                />
                <span>s</span>
              </>
            )}
            {rule.kind === 'exclusive' && (
              <>
                {outSel(rule.a, (a) => set({ ...rule, a }), 'a')}
                {outSel(rule.b, (b) => set({ ...rule, b }), 'b')}
              </>
            )}
            {rule.kind === 'neverOn' && outSel(rule.output, (output) => set({ ...rule, output }))}
            {rule.kind === 'offFrom' && (
              <>
                {outSel(rule.output, (output) => set({ ...rule, output }))}
                <span>{tx('ab', 'from')}</span>
                <Seconds
                  value={rule.fromMs}
                  label={t('publish.at')}
                  onChange={(fromMs) => set({ ...rule, fromMs })}
                />
                <span>s</span>
              </>
            )}
            {rule.kind === 'onBetween' && (
              <>
                {outSel(rule.output, (output) => set({ ...rule, output }))}
                <Seconds
                  value={rule.fromMs}
                  label={t('publish.at')}
                  onChange={(fromMs) => set({ ...rule, fromMs })}
                />
                <span>…</span>
                <Seconds
                  value={rule.toMs}
                  label={t('scenario.until')}
                  onChange={(toMs) => set({ ...rule, toMs })}
                />
                <span>s</span>
              </>
            )}
            <span className="muted publish-rule-text">{ruleLabel(rule)}</span>
            <button
              className="icon-btn"
              aria-label={t('publish.remove')}
              onClick={() => onChange(rules.filter((_, j) => j !== k))}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        className="btn btn-small"
        onClick={() => onChange([...rules, defaultRule(bins.length ? 'minIn' : 'neverOn', refs)])}
      >
        + {t('publish.addRule')}
      </button>
    </>
  );
}

const KIND_CLASS: Record<ScenarioEventKind, string> = {
  control: 'sz-c-control',
  fault: 'sz-c-fault',
  power: 'sz-c-power',
  workpiece: 'sz-c-workpiece',
  magazine: 'sz-c-workpiece',
  tank: 'sz-c-tank',
};

/** Zeitleiste: Marken je Ereignis, Balken für Störungs- und Ausfalldauer, Streubereich hell */
export function Timeline({
  events,
  durationMs,
  time,
}: {
  events: ScenarioEvent[];
  durationMs: number;
  /** Simulationszeit, wenn dieses Szenario läuft */
  time?: number;
}) {
  const W = 1000;
  const H = 34;
  const x = (t: number) => (Math.max(0, Math.min(t, durationMs)) / durationMs) * W;
  const step =
    durationMs > 120_000
      ? 30_000
      : durationMs > 30_000
        ? 10_000
        : durationMs > 10_000
          ? 5_000
          : 1_000;
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += step) ticks.push(t);
  return (
    <svg
      className="sz-timeline"
      viewBox={`0 0 ${W} ${H + 12}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('scenario.timeline')}
    >
      <rect x={0} y={4} width={W} height={H - 8} className="sz-track" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={H - 4} y2={H} className="sz-tick" />
          <text x={Math.min(x(t) + 2, W - 30)} y={H + 10} className="sz-ticktext">
            {t / 1000} s
          </text>
        </g>
      ))}
      {events.map((e, i) => {
        const end =
          e.kind === 'power' ? e.until : e.kind === 'fault' ? (e.until ?? durationMs) : undefined;
        const cls = KIND_CLASS[e.kind];
        return (
          <g key={i} className={cls}>
            {e.jitter ? (
              <rect
                x={x(e.at)}
                y={6}
                width={Math.max(2, x(e.at + e.jitter) - x(e.at))}
                height={H - 12}
                className="sz-jitter"
              />
            ) : null}
            {end !== undefined && end > e.at && (
              <rect
                x={x(e.at)}
                y={12}
                width={x(end) - x(e.at)}
                height={H - 24}
                className="sz-span"
              />
            )}
            <rect x={x(e.at) - 2} y={4} width={4} height={H - 8} className="sz-mark">
              <title>{t(`scenario.kind.${e.kind}` as never)}</title>
            </rect>
          </g>
        );
      })}
      {time !== undefined && time > 0 && (
        <line x1={x(time)} x2={x(time)} y1={0} y2={H} className="sz-now" />
      )}
    </svg>
  );
}
