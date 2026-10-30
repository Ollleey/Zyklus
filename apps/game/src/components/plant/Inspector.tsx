import { useEffect, useState } from 'react';
import {
  CATALOG,
  COLORS,
  MATERIALS,
  PARAMS,
  connectionsOf,
  faultsOf,
  num,
  type Layout,
  type Part,
  type PartType,
  type Rot,
  type PlantView,
} from '@zyklus/plant-sim';
import { t } from '../../i18n';

interface Props {
  layout: Layout;
  part: Part | null;
  plant?: PlantView | null;
  onChange: (p: Part) => void;
  onLayout: (l: Layout) => void;
  onTagCheck: (tag: string) => boolean;
  suggestTag: (type: PartType) => string;
  live: (fn: (p: PlantView) => void) => void;
}

/** Eigenschaften des ausgewählten Bauteils; ohne Auswahl die Anlage selbst */
export function Inspector({ layout, part, plant, onChange, onLayout, onTagCheck, live }: Props) {
  const [tag, setTag] = useState(part?.tag ?? '');
  useEffect(() => setTag(part?.tag ?? ''), [part?.id, part?.tag]);

  if (!part) {
    const wps = layout.workpieces ?? [];
    return (
      <aside className="pe-inspector" aria-label={t('plant.inspector')}>
        <h4>{t('plant.layout')}</h4>
        <p className="muted">{t('plant.hint')}</p>
        <label className="pe-field">
          <span>{t('plant.seed')}</span>
          <input
            type="number"
            value={layout.seed}
            onChange={(e) =>
              onLayout({ ...layout, seed: Math.max(1, Math.round(Number(e.target.value) || 1)) })
            }
          />
        </label>
        <dl className="pe-stats">
          <dt>{t('plant.parts')}</dt>
          <dd>{layout.parts.length}</dd>
          <dt>{t('plant.signals')}</dt>
          <dd>{connectionsOf(layout).length}</dd>
          <dt>{t('plant.workpieces')}</dt>
          <dd>{plant ? plant.world.tally().free : wps.length}</dd>
        </dl>
        {!plant && wps.length > 0 && (
          <ul className="pe-wplist">
            {wps.map((w, i) => (
              <li key={i}>
                <span className="pe-swatch" style={{ background: COLORS[w.color].hex }} />
                {MATERIALS[w.material].name}, {w.size}
                <button
                  className="icon-btn"
                  aria-label={t('plant.wpRemove')}
                  onClick={() => onLayout({ ...layout, workpieces: wps.filter((_, k) => k !== i) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    );
  }

  const info = CATALOG[part.type];
  const set = (key: string, v: unknown) =>
    onChange({ ...part, params: { ...part.params, [key]: v as never } });
  const conns = connectionsOf({ ...layout, parts: [part] });
  const faults = faultsOf(part.type);
  const tagOk = /^[A-Za-z0-9_+\-.]+$/.test(tag) && onTagCheck(tag);
  const st = plant?.world.st(part);

  return (
    <aside className="pe-inspector" aria-label={t('plant.inspector')}>
      <h4>{info.name}</h4>
      <label className="pe-field">
        <span>{t('plant.tag')}</span>
        <input
          value={tag}
          aria-invalid={!tagOk}
          onChange={(e) => setTag(e.target.value)}
          onBlur={() => (tagOk ? onChange({ ...part, tag }) : setTag(part.tag))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {!tagOk && <p className="pe-error">{t('plant.tagInvalid')}</p>}
      <div className="pe-row3">
        {(['x', 'y', 'z'] as const).map((k) => (
          <label key={k} className="pe-field">
            <span>{k} mm</span>
            <input
              type="number"
              value={part[k]}
              step={10}
              onChange={(e) => onChange({ ...part, [k]: Number(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>
      <label className="pe-field">
        <span>{t('plant.rotation')}</span>
        <select
          value={part.rot}
          onChange={(e) => onChange({ ...part, rot: Number(e.target.value) as Rot })}
        >
          {[0, 90, 180, 270].map((r) => (
            <option key={r} value={r}>
              {r}°
            </option>
          ))}
        </select>
      </label>
      {PARAMS[part.type].map((spec) => {
        const v = part.params[spec.key];
        switch (spec.kind) {
          case 'num':
            return (
              <label key={spec.key} className="pe-field">
                <span>
                  {spec.label}
                  {spec.unit ? ` (${spec.unit})` : ''}
                </span>
                <input
                  type="number"
                  value={num(part.params, spec.key)}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step ?? 1}
                  onChange={(e) => {
                    let x = Number(e.target.value) || 0;
                    if (spec.min !== undefined) x = Math.max(spec.min, x);
                    if (spec.max !== undefined) x = Math.min(spec.max, x);
                    set(spec.key, x);
                  }}
                />
              </label>
            );
          case 'bool':
            return (
              <label key={spec.key} className="pe-check pe-field-check">
                <input
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => set(spec.key, e.target.checked)}
                />{' '}
                {spec.label}
              </label>
            );
          case 'select':
            return (
              <label key={spec.key} className="pe-field">
                <span>{spec.label}</span>
                <select
                  value={typeof v === 'string' ? v : spec.options[0]![0]}
                  onChange={(e) => set(spec.key, e.target.value)}
                >
                  {spec.options.map(([k, name]) => (
                    <option key={k} value={k}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            );
          case 'multi': {
            const list = Array.isArray(v) ? (v as string[]) : [];
            return (
              <fieldset key={spec.key} className="pe-multi">
                <legend>{spec.label}</legend>
                {spec.options.map(([k, name]) => (
                  <label key={k} className="pe-check">
                    <input
                      type="checkbox"
                      checked={list.includes(k)}
                      onChange={(e) =>
                        set(spec.key, e.target.checked ? [...list, k] : list.filter((x) => x !== k))
                      }
                    />{' '}
                    {name}
                  </label>
                ))}
              </fieldset>
            );
          }
          case 'ref': {
            const targets = layout.parts.filter((p) => p.type === spec.of);
            return (
              <label key={spec.key} className="pe-field">
                <span>{spec.label}</span>
                <select
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => set(spec.key, e.target.value)}
                >
                  <option value="">{t('plant.nearest')}</option>
                  {targets.map((p) => (
                    <option key={p.id} value={p.tag}>
                      {p.tag}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
        }
      })}
      {part.type === 'poti' && (
        <label className="pe-field">
          <span>{t('plant.potiValue')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={st?.control ?? 0}
            onChange={(e) => live((pl) => pl.setControl(part.id, Number(e.target.value)))}
          />
        </label>
      )}
      {faults.length > 0 && (
        <label className="pe-field">
          <span>{t('plant.fault')}</span>
          <select
            value={part.fault ?? ''}
            onChange={(e) => onChange({ ...part, fault: e.target.value || undefined })}
          >
            <option value="">{t('plant.noFault')}</option>
            {faults.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {conns.length > 0 && (
        <>
          <h5>{t('plant.connections')}</h5>
          <ul className="pe-conns">
            {conns.map((c) => (
              <li key={c.device.id}>
                <span className={`pe-kind pe-kind-${c.device.kind.toLowerCase()}`}>
                  {c.device.kind}
                </span>
                <span className="mono">{c.device.tag}</span>
                <span className="muted">{c.io.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
