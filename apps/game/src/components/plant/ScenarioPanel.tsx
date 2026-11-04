import { useEffect, useRef, useState } from 'react';
import {
  missingRefs,
  newScenario,
  newScenarioId,
  parseScenarioFile,
  testOfScenario,
  toScenarioFile,
  type Layout,
  type Scenario,
} from '@zyklus/plant-sim';
import { tr, verifySolution, type Level, type Verification } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { FILE_TYPES, platform } from '@zyklus/platform';
import { msg, t } from '../../i18n';
import type { SlotContext } from '../../screens/LevelScreen';
import { EventList, RuleList, Timeline } from './ScenarioParts';

interface Props {
  layout: Layout;
  onChange: (layout: Layout) => void;
  level: Level;
  ctx: SlotContext;
  onPublish: () => void;
}

const fileBase = (name: string) =>
  name
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'szenario';

/**
 * Szenario-Editor des Sandkastens: Prüfläufe mit Zeitleiste (Bedienung, Störungen, Stromausfall,
 * Teile, Füllstände) und Regeln. Ein Szenario lässt sich live abspielen, mit dem eigenen Programm
 * prüfen, als Datei weitergeben und als Auftrag veröffentlichen.
 */
export function ScenarioPanel({ layout, onChange, level, ctx, onPublish }: Props) {
  const scenarios = layout.scenarios ?? [];
  const [selId, setSelId] = useState<string | null>(scenarios[0]?.id ?? null);
  const sel = scenarios.find((s) => s.id === selId) ?? scenarios[0] ?? null;
  const [result, setResult] = useState<{ id: string; v: Verification } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { sim, run, solution } = ctx;

  const setScenarios = (list: Scenario[]) =>
    onChange({ ...layout, scenarios: list.length ? list : undefined });
  const update = (p: Partial<Scenario>) => {
    if (!sel) return;
    setScenarios(scenarios.map((s) => (s.id === sel.id ? { ...s, ...p } : s)));
    setResult(null);
  };

  const add = (s: Scenario) => {
    setScenarios([...scenarios, s]);
    setSelId(s.id);
    setResult(null);
  };

  // Abspielen: erst Testfall wählen, nach dem Neuzeichnen starten
  const playAfter = useRef<string | null>(null);
  const testIdx = sel ? level.tests.findIndex((x) => x.id === `sz-${sel.id}`) : -1;
  const playing = sel && sim.mode === 'test' && sim.testIdx === testIdx && testIdx > 0;
  useEffect(() => {
    if (playAfter.current && level.tests[sim.testIdx]?.id === playAfter.current) {
      playAfter.current = null;
      // nach dem Zurücksetzen des Laufs durch den Testfallwechsel (Effekt der Simulation) starten
      const play = sim.play;
      window.setTimeout(play, 0);
    }
  });
  const play = () => {
    if (!sel || testIdx < 1) return;
    playAfter.current = `sz-${sel.id}`;
    sim.select(testIdx, sel.seeds[0] ?? layout.seed);
  };

  const verify = () => {
    if (!sel) return;
    setBusy(true);
    setError(null);
    window.setTimeout(() => {
      try {
        const one: Level = { ...level, tests: [testOfScenario(layout, sel, `sz-${sel.id}`, true)] };
        const c = compileSolution(one, solution);
        if (!c.ok) setError(t('publish.notCompiled'));
        else setResult({ id: sel.id, v: verifySolution(one, solution, c.programs, c.size) });
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy(false);
    }, 30);
  };

  const importFile = async () => {
    const f = await platform.files.open([FILE_TYPES.szenario]);
    if (!f) return;
    const r = parseScenarioFile(f.text);
    if (!r.ok) setError(r.error);
    else add({ ...r.scenario, id: newScenarioId() });
  };

  const exportFile = () => {
    if (sel)
      void platform.files.save(`${fileBase(sel.name)}.szenario`, toScenarioFile(sel), [
        FILE_TYPES.szenario,
      ]);
  };

  const tags = new Set(layout.parts.map((p) => p.tag));
  const missing = sel ? missingRefs(sel, tags) : [];
  const res = result && sel && result.id === sel.id ? result.v : null;

  return (
    <div className="scenario-panel">
      <div className="sz-head">
        <div className="sz-tabs" role="tablist" aria-label={t('scenario.title')}>
          {scenarios.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === sel?.id}
              className={`btn btn-small ${s.id === sel?.id ? 'btn-active' : ''}`}
              onClick={() => setSelId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-small"
          onClick={() =>
            add(newScenario(`${t('scenario.default')} ${scenarios.length + 1}`, layout.seed))
          }
        >
          + {t('scenario.new')}
        </button>
        <button
          className="btn btn-small"
          disabled={!sel}
          onClick={() =>
            sel &&
            add({
              ...structuredClone(sel),
              id: newScenarioId(),
              name: `${sel.name} (2)`,
            })
          }
        >
          {t('scenario.duplicate')}
        </button>
        <button className="btn btn-small" onClick={() => void importFile()}>
          {t('scenario.import')}
        </button>
        <button className="btn btn-small" disabled={!sel} onClick={exportFile}>
          {t('scenario.export')}
        </button>
        <button
          className="btn btn-small btn-danger"
          disabled={!sel}
          onClick={() => sel && setScenarios(scenarios.filter((s) => s.id !== sel.id))}
        >
          {t('scenario.remove')}
        </button>
      </div>

      {!sel ? (
        <p className="muted sz-empty">{t('scenario.empty')}</p>
      ) : (
        <>
          <div className="publish-row">
            <label className="pe-field">
              <span>{t('scenario.name')}</span>
              <input value={sel.name} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="pe-field">
              <span>{t('publish.duration')}</span>
              <input
                type="number"
                min={1}
                max={600}
                value={sel.durationMs / 1000}
                onChange={(e) =>
                  update({
                    durationMs: Math.max(1, Math.min(600, Number(e.target.value) || 1)) * 1000,
                  })
                }
              />
            </label>
            <label className="pe-field">
              <span>{t('publish.seeds')}</span>
              <input
                value={sel.seeds.join(', ')}
                onChange={(e) =>
                  update({
                    seeds: e.target.value
                      .split(/[ ,;]+/)
                      .map(Number)
                      .filter((n) => Number.isInteger(n) && n > 0),
                  })
                }
              />
            </label>
          </div>

          <Timeline
            events={sel.events}
            durationMs={sel.durationMs}
            time={playing ? run?.time : undefined}
          />

          <div className="sz-actions">
            {playing ? (
              <button className="btn btn-small" onClick={() => sim.setMode('manual')}>
                ■ {t('scenario.stop')}
              </button>
            ) : (
              <button
                className="btn btn-small btn-primary"
                onClick={play}
                disabled={!sim.ready || testIdx < 1}
              >
                ▶ {t('scenario.play')}
              </button>
            )}
            <button className="btn btn-small" onClick={verify} disabled={busy || !sel.rules.length}>
              {busy ? t('publish.running') : `✓ ${t('scenario.verify')}`}
            </button>
            <button className="btn btn-small" onClick={onPublish}>
              {t('publish.menu')}
            </button>
          </div>

          {missing.length > 0 && (
            <p className="pe-error">{t('scenario.missing', { refs: missing.join(', ') })}</p>
          )}
          {error && <p className="pe-error">{msg(error)}</p>}
          {res && (
            <div className={res.passed ? 'publish-ok' : 'pe-error'}>
              {res.passed ? t('scenario.passed') : t('scenario.failed')}
              <ul className="sz-results">
                {res.runs.map((r) => (
                  <li key={`${r.testId}-${r.seed}`}>
                    {t('sim.seed')} {r.seed}
                    {r.stop ? `: ${msg(r.stop)}` : ''}
                    <ul>
                      {r.criteria.map((c, k) => (
                        <li key={k} className={c.ok ? 'sz-ok' : 'sz-bad'}>
                          {c.ok ? '✓' : '✗'} {tr(c.name)}
                          {!c.ok && c.detail ? ` – ${msg(c.detail)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h4>{t('scenario.events')}</h4>
          <p className="muted sz-hint">{t('scenario.eventsHint')}</p>
          <EventList
            layout={layout}
            events={sel.events}
            onChange={(events) => update({ events })}
          />

          <h4>{t('publish.rules')}</h4>
          <RuleList layout={layout} rules={sel.rules} onChange={(rules) => update({ rules })} />
        </>
      )}
    </div>
  );
}
