import { useState } from 'react';
import {
  emptyProject,
  fromRaw,
  tr,
  type BoardAnalysis,
  type Device,
  type Level,
  type LevelRun,
  type Solution,
} from '@zyklus/sim-core';
import { t } from '../../i18n';
import { autoWire, updateProject } from '../../state/edit';
import { formatValue, useBoolFormat } from '../../state/prefs';

interface Props {
  level: Level;
  solution: Solution;
  setSolution: (s: Solution) => void;
  analysis: BoardAnalysis;
  run: LevelRun | null;
  /** Lauf holen bzw. anlegen (Forcen vor dem Start) */
  ensureRun: () => LevelRun | null;
  redraw: () => void;
  /** Spuren im Zeitdiagramm; `null` = alle */
  signals: string[] | null;
  onSignals: (s: string[] | null) => void;
}

const tagComment = (d: Device) => `Gerät ${d.id}`;

/**
 * Signale der Anlage: Anschluss, PLC-Variable (Vorschlag übernehmen), Live-Wert, Forcen und
 * Auswahl für das Zeitdiagramm. Dazu „Automatisch verdrahten“ für alle offenen Geräte.
 */
export function SignalsPanel({
  level,
  solution,
  setSolution,
  analysis,
  run,
  ensureRun,
  redraw,
  signals,
  onSignals,
}: Props) {
  const boolFormat = useBoolFormat();
  const [notice, setNotice] = useState<string | null>(null);
  const devices = level.devices;
  const unwired = devices.filter((d) => !solution.wires.some((w) => w.device === d.id));

  const wireAll = () => {
    const r = autoWire(level, solution);
    setSolution(r.solution);
    const miss = Object.entries(r.missing)
      .map(([k, n]) => `${n} × ${k}`)
      .join(', ');
    setNotice(
      miss
        ? t('signals.autoMissing', { n: r.wired, missing: miss })
        : t('signals.autoDone', { n: r.wired }),
    );
  };

  /** Name in der Variablentabelle der CPU, an der das Gerät hängt */
  const tagOf = (d: Device) => {
    const b = analysis.bindings.get(d.id);
    if (!b) return undefined;
    return solution.projects[b.cpu]?.tags.find((x) => x.comment === tagComment(d));
  };

  const adopt = (list: Device[]) => {
    let s = solution;
    for (const d of list) {
      const b = analysis.bindings.get(d.id);
      if (!b) continue;
      s = updateProject(s, b.cpu, (p) => {
        const tags = [...(p ?? emptyProject()).tags];
        const i = tags.findIndex((x) => x.comment === tagComment(d));
        // vorhandene Variable mit gleichem Namen (anderes Gerät) nicht doppelt anlegen
        if (tags.some((x, k) => x.name === d.tag && k !== i)) return p;
        const tag = { name: d.tag, address: b.address, t: b.t, comment: tagComment(d) };
        if (i >= 0) tags[i] = tag;
        else tags.push(tag);
        return { ...p, tags };
      });
    }
    setSolution(s);
  };
  const pending = devices.filter((d) => {
    const tag = tagOf(d);
    return analysis.bindings.has(d.id) && tag?.name !== d.tag;
  });

  const force = (d: Device, v: boolean | number | undefined) => {
    const r = run ?? ensureRun();
    r?.force(d.id, v);
    redraw();
  };

  // Standard (`null`): alle Geräte, Anlagenwerte (Zähler, Füllstände) nur auf Wunsch
  const plantKeys = [...(run?.traces.keys() ?? [])].filter((k) => k.startsWith('plant.'));
  const effective = signals ?? devices.map((d) => d.id);
  const shown = (id: string) => effective.includes(id);
  const toggleSignal = (id: string) => {
    const next = shown(id) ? effective.filter((x) => x !== id) : [...effective, id];
    const all = devices.map((d) => d.id);
    onSignals(next.length === all.length && all.every((x) => next.includes(x)) ? null : next);
  };

  const live = (d: Device) => {
    const trace = run?.traces.get(d.id);
    const v = trace?.length ? trace[trace.length - 1]![1] : undefined;
    if (typeof v === 'number' && d.analog)
      return `${formatValue(v, boolFormat)} (${formatValue(fromRaw(v, d.analog), boolFormat, 1)} ${d.analog.unit})`;
    return formatValue(v, boolFormat);
  };

  return (
    <div className="signals">
      <div className="signals-bar">
        <button
          className="btn btn-small btn-primary"
          onClick={wireAll}
          disabled={!unwired.length}
          title={t('signals.autoTitle')}
        >
          ⚡ {t('signals.auto')}
        </button>
        <button
          className="btn btn-small"
          onClick={() => adopt(pending)}
          disabled={!pending.length}
          title={t('signals.adoptAllTitle')}
        >
          {t('signals.adoptAll')} ({pending.length})
        </button>
        <button
          className="btn btn-small"
          onClick={() => onSignals(null)}
          disabled={signals === null}
        >
          {t('signals.showAll')}
        </button>
        {run && run.forcedIds.length > 0 && (
          <button
            className="btn btn-small"
            onClick={() => {
              for (const id of run.forcedIds) run.force(id, undefined);
              redraw();
            }}
          >
            {t('signals.unforceAll')}
          </button>
        )}
      </div>
      {notice && (
        <p className="signals-notice" role="status">
          {notice}
        </p>
      )}
      {unwired.length > 0 && (
        <p className="signals-unwired">
          <b>{t('signals.unwired')}:</b> {unwired.map((d) => d.label ?? d.id).join(', ')}
        </p>
      )}
      {!devices.length && <p className="muted signals-empty">{t('signals.empty')}</p>}
      {devices.length > 0 && (
        <div className="signals-table-wrap">
          <table className="signals-table">
            <thead>
              <tr>
                <th title={t('signals.chart')}>📈</th>
                <th>{t('signals.device')}</th>
                <th>{t('signals.address')}</th>
                <th>{t('signals.tag')}</th>
                <th>{t('table.value')}</th>
                <th>{t('signals.force')}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const b = analysis.bindings.get(d.id);
                const tag = tagOf(d);
                const f = run?.forced(d.id);
                const analog = d.kind === 'AI' || d.kind === 'AO';
                return (
                  <tr key={d.id} className={f !== undefined ? 'signals-forced' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={shown(d.id)}
                        onChange={() => toggleSignal(d.id)}
                        aria-label={t('signals.chart')}
                      />
                    </td>
                    <td title={tr(d.name)}>
                      <span className={`pe-kind pe-kind-${d.kind.toLowerCase()}`}>{d.kind}</span>{' '}
                      <b>{d.label ?? d.id}</b>{' '}
                      <span className="muted">{tr(d.name).replace(/\s*\([^)]*\)$/, '')}</span>
                    </td>
                    <td className="mono">
                      {b ? b.address : <span className="signals-open">{t('signals.open')}</span>}
                    </td>
                    <td className="mono">
                      {tag?.name ?? (b ? '' : <span className="muted">{d.tag}</span>)}
                      {b && tag?.name !== d.tag && (
                        <button
                          className="link-btn"
                          onClick={() => adopt([d])}
                          title={t('signals.adoptTitle', { name: d.tag })}
                        >
                          {t('signals.adopt')} {d.tag}
                        </button>
                      )}
                    </td>
                    <td className="mono">{run ? live(d) : ''}</td>
                    <td className="signals-force">
                      <label className="pe-check" title={t('signals.forceTitle')}>
                        <input
                          type="checkbox"
                          checked={f !== undefined}
                          onChange={(e) =>
                            force(d, e.target.checked ? (analog ? 0 : true) : undefined)
                          }
                        />
                        {f !== undefined && <span className="signals-f">F</span>}
                      </label>
                      {f !== undefined &&
                        (analog ? (
                          <input
                            type="number"
                            className="signals-raw"
                            value={Number(f)}
                            min={-32768}
                            max={32767}
                            step={1}
                            onChange={(e) =>
                              force(
                                d,
                                Math.max(
                                  -32768,
                                  Math.min(32767, Math.round(Number(e.target.value) || 0)),
                                ),
                              )
                            }
                          />
                        ) : (
                          <button className="btn btn-small" onClick={() => force(d, !f)}>
                            {formatValue(f, boolFormat)}
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {plantKeys.length > 0 && (
            <p className="signals-plant">
              <b>{t('signals.plantValues')}:</b>
              {plantKeys.map((k) => (
                <label key={k} className="pe-check">
                  <input type="checkbox" checked={shown(k)} onChange={() => toggleSignal(k)} />{' '}
                  {k.slice(6)}
                </label>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
