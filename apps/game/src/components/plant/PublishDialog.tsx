import { useEffect, useMemo, useState } from 'react';
import { verifySolution, type Level, type Solution, type Verification } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import {
  connectionsOf,
  publishLevel,
  ruleText,
  type ControlStep,
  type Layout,
  type PublishTest,
  type Rule,
} from '@zyklus/plant-sim';
import { t } from '../../i18n';
import { putCustomLevel, toAuftragFile } from '../../state/customLevels';

interface Props {
  layout: Layout;
  solution: Solution;
  name: string;
  author: string;
  onClose: () => void;
  onPublished: (level: Level) => void;
}

const RULE_KINDS: Rule['kind'][] = [
  'sorted',
  'noLoss',
  'minIn',
  'tankRange',
  'exclusive',
  'neverOn',
];

function defaultRule(kind: Rule['kind'], bins: string[], tanks: string[], outputs: string[]): Rule {
  switch (kind) {
    case 'minIn':
      return { kind, bin: bins[0] ?? '', n: 5 };
    case 'tankRange':
      return { kind, tank: tanks[0] ?? '', min: 30, max: 80, fromMs: 20000 };
    case 'exclusive':
      return { kind, a: outputs[0] ?? '', b: outputs[1] ?? outputs[0] ?? '' };
    case 'neverOn':
      return { kind, output: outputs[0] ?? '' };
    default:
      return { kind } as Rule;
  }
}

/** Anlage als Auftrag veröffentlichen: Angaben, Testfälle, Probelauf mit der eigenen Lösung */
export function PublishDialog({ layout, solution, name, author, onClose, onPublished }: Props) {
  const bins = layout.parts.filter((p) => p.type === 'bin').map((p) => p.tag);
  const tanks = layout.parts.filter((p) => p.type === 'tank').map((p) => p.tag);
  const controls = layout.parts.filter((p) =>
    ['button', 'switch', 'estop', 'selector', 'poti'].includes(p.type),
  );
  const outputs = connectionsOf(layout)
    .filter((c) => c.device.kind === 'DO')
    .map((c) => c.device.label!);

  const [title, setTitle] = useState(name);
  const [customer, setCustomer] = useState(author || 'Eigene Werkstatt');
  const [mail, setMail] = useState('');
  const [notes, setNotes] = useState('');
  const [tests, setTests] = useState<PublishTest[]>(() => [
    {
      name: 'Normalbetrieb',
      durationMs: 60000,
      seeds: [layout.seed],
      controls: controls[0]
        ? [[100, controls[0].tag, controls[0].type === 'selector' ? 2 : true]]
        : [],
      rules: bins.length ? [{ kind: 'sorted' }, { kind: 'noLoss' }] : [],
    },
  ]);
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const level = useMemo(() => {
    try {
      return { level: publishLevel(layout, { title, customer, mail, notes }, tests), error: null };
    } catch (e) {
      return { level: null, error: (e as Error).message };
    }
  }, [layout, title, customer, mail, notes, tests]);

  // jede Änderung macht den Probelauf ungültig
  useEffect(() => setResult(null), [level]);

  const setTest = (i: number, p: Partial<PublishTest>) =>
    setTests(tests.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const verify = () => {
    if (!level.level) return;
    setBusy(true);
    setError(null);
    // im nächsten Bild rechnen, damit „läuft…“ sichtbar wird
    window.setTimeout(() => {
      try {
        const c = compileSolution(level.level!, solution);
        if (!c.ok) setError(t('publish.notCompiled'));
        else setResult(verifySolution(level.level!, solution, c.programs, c.size));
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy(false);
    }, 30);
  };

  const finalLevel = (): Level | null =>
    level.level && result?.passed ? { ...level.level, par: result.metrics } : null;

  const publish = () => {
    const l = finalLevel();
    if (!l) return;
    putCustomLevel({ level: l, author });
    onPublished(l);
  };

  const download = () => {
    const l = finalLevel();
    if (!l) return;
    const blob = new Blob([toAuftragFile({ level: l, author })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${l.id}.auftrag.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const failures = result
    ? result.runs.flatMap((r) => [
        ...(r.stop ? [`${r.testId} (Seed ${r.seed}): ${r.stop}`] : []),
        ...r.criteria
          .filter((c) => !c.ok)
          .map((c) => `${r.testId} (Seed ${r.seed}): ${c.name.de} – ${c.detail ?? ''}`),
      ])
    : [];

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="myplants publish"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
      >
        <header className="myplants-head">
          <h2 id="publish-title">{t('publish.title')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('dialog.close')}>
            ✕
          </button>
        </header>
        <p className="muted">{t('publish.intro')}</p>
        <section className="myplants-current">
          <label className="pe-field">
            <span>{t('publish.levelTitle')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="pe-field">
            <span>{t('publish.customer')}</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <label className="pe-field myplants-desc">
            <span>{t('publish.mail')}</span>
            <textarea rows={3} value={mail} onChange={(e) => setMail(e.target.value)} />
          </label>
          <label className="pe-field myplants-desc">
            <span>{t('publish.notes')}</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>

        {tests.map((test, i) => (
          <section key={i} className="publish-test">
            <div className="publish-row">
              <label className="pe-field">
                <span>{t('publish.testName')}</span>
                <input value={test.name} onChange={(e) => setTest(i, { name: e.target.value })} />
              </label>
              <label className="pe-field">
                <span>{t('publish.duration')}</span>
                <input
                  type="number"
                  min={1}
                  value={test.durationMs / 1000}
                  onChange={(e) =>
                    setTest(i, { durationMs: Math.max(1, Number(e.target.value) || 1) * 1000 })
                  }
                />
              </label>
              <label className="pe-field">
                <span>{t('publish.seeds')}</span>
                <input
                  value={test.seeds.join(', ')}
                  onChange={(e) =>
                    setTest(i, {
                      seeds: e.target.value
                        .split(/[ ,;]+/)
                        .map(Number)
                        .filter((n) => Number.isInteger(n) && n > 0),
                    })
                  }
                />
              </label>
              <button
                className="icon-btn"
                aria-label={t('publish.removeTest')}
                disabled={tests.length < 2}
                onClick={() => setTests(tests.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </div>

            <h4>{t('publish.controls')}</h4>
            {test.controls.map(([at, ref, value], k) => {
              const part = controls.find((p) => p.tag === ref);
              const set = (c: ControlStep) =>
                setTest(i, { controls: test.controls.map((x, j) => (j === k ? c : x)) });
              return (
                <div key={k} className="publish-row">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={at / 1000}
                    aria-label={t('publish.at')}
                    onChange={(e) =>
                      set([Math.round((Number(e.target.value) || 0) * 1000), ref, value])
                    }
                  />
                  <span>s</span>
                  <select value={ref} onChange={(e) => set([at, e.target.value, value])}>
                    {controls.map((p) => (
                      <option key={p.id} value={p.tag}>
                        {p.tag}
                      </option>
                    ))}
                  </select>
                  {part?.type === 'selector' ? (
                    <select
                      value={Number(value)}
                      onChange={(e) => set([at, ref, Number(e.target.value)])}
                    >
                      <option value={0}>0</option>
                      <option value={1}>Hand</option>
                      <option value={2}>Auto</option>
                    </select>
                  ) : part?.type === 'poti' ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Number(value)}
                      onChange={(e) => set([at, ref, Number(e.target.value) || 0])}
                    />
                  ) : (
                    <select
                      value={value ? '1' : '0'}
                      onChange={(e) => set([at, ref, e.target.value === '1'])}
                    >
                      <option value="1">{t('publish.on')}</option>
                      <option value="0">{t('publish.off')}</option>
                    </select>
                  )}
                  <button
                    className="icon-btn"
                    aria-label={t('publish.remove')}
                    onClick={() =>
                      setTest(i, { controls: test.controls.filter((_, j) => j !== k) })
                    }
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              className="btn btn-small"
              disabled={!controls.length}
              onClick={() =>
                setTest(i, {
                  controls: [
                    ...test.controls,
                    [test.controls.at(-1)?.[0] ?? 0, controls[0]!.tag, true],
                  ],
                })
              }
            >
              + {t('publish.addControl')}
            </button>

            <h4>{t('publish.rules')}</h4>
            {test.rules.map((rule, k) => {
              const set = (r: Rule) =>
                setTest(i, { rules: test.rules.map((x, j) => (j === k ? r : x)) });
              return (
                <div key={k} className="publish-row">
                  <select
                    value={rule.kind}
                    onChange={(e) =>
                      set(defaultRule(e.target.value as Rule['kind'], bins, tanks, outputs))
                    }
                  >
                    {RULE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`publish.rule.${kind}` as never)}
                      </option>
                    ))}
                  </select>
                  {rule.kind === 'minIn' && (
                    <>
                      <select
                        value={rule.bin}
                        onChange={(e) => set({ ...rule, bin: e.target.value })}
                      >
                        {bins.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={rule.n}
                        onChange={(e) =>
                          set({ ...rule, n: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </>
                  )}
                  {rule.kind === 'tankRange' && (
                    <>
                      <select
                        value={rule.tank}
                        onChange={(e) => set({ ...rule, tank: e.target.value })}
                      >
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
                      <span>% ab</span>
                      <input
                        type="number"
                        value={rule.fromMs / 1000}
                        onChange={(e) =>
                          set({ ...rule, fromMs: (Number(e.target.value) || 0) * 1000 })
                        }
                      />
                      <span>s</span>
                    </>
                  )}
                  {rule.kind === 'exclusive' && (
                    <>
                      {(['a', 'b'] as const).map((key) => (
                        <select
                          key={key}
                          value={rule[key]}
                          onChange={(e) => set({ ...rule, [key]: e.target.value })}
                        >
                          {outputs.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ))}
                    </>
                  )}
                  {rule.kind === 'neverOn' && (
                    <select
                      value={rule.output}
                      onChange={(e) => set({ ...rule, output: e.target.value })}
                    >
                      {outputs.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  )}
                  <span className="muted publish-rule-text">{ruleText(rule)}</span>
                  <button
                    className="icon-btn"
                    aria-label={t('publish.remove')}
                    onClick={() => setTest(i, { rules: test.rules.filter((_, j) => j !== k) })}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              className="btn btn-small"
              onClick={() =>
                setTest(i, {
                  rules: [
                    ...test.rules,
                    defaultRule(bins.length ? 'minIn' : 'neverOn', bins, tanks, outputs),
                  ],
                })
              }
            >
              + {t('publish.addRule')}
            </button>
          </section>
        ))}
        <button
          className="btn btn-small"
          onClick={() =>
            setTests([
              ...tests,
              { ...structuredClone(tests[0]!), name: `Test ${tests.length + 1}` },
            ])
          }
        >
          + {t('publish.addTest')}
        </button>

        <footer className="publish-foot">
          {level.error && <p className="pe-error">{level.error}</p>}
          {error && <p className="pe-error">{error}</p>}
          {result && (
            <div className={result.passed ? 'publish-ok' : 'pe-error'}>
              {result.passed
                ? t('publish.passed', {
                    cost: result.metrics.cost,
                    energy: Math.round(result.metrics.energy),
                    size: result.metrics.size,
                  })
                : t('publish.failed')}
              {failures.length > 0 && (
                <ul>
                  {failures.slice(0, 6).map((f, k) => (
                    <li key={k}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="myplants-actions">
            <button className="btn" onClick={verify} disabled={!level.level || busy}>
              {busy ? t('publish.running') : t('publish.verify')}
            </button>
            <button className="btn btn-primary" onClick={publish} disabled={!result?.passed}>
              {t('publish.publish')}
            </button>
            <button className="btn" onClick={download} disabled={!result?.passed}>
              {t('publish.download')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
