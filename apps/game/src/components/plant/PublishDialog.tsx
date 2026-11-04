import { useEffect, useMemo, useState } from 'react';
import { verifySolution, type Level, type Solution, type Verification } from '@zyklus/sim-core';
import { compileSolution } from '@zyklus/levels';
import { eventsFromControls, publishLevel, type Layout, type PublishTest } from '@zyklus/plant-sim';
import { t } from '../../i18n';
import { EventList, RuleList, defaultEvent, refsOf } from './ScenarioParts';
import { putCustomLevel, toAuftragFile } from '../../state/customLevels';
import { FILE_TYPES, platform, platformFileName } from '@zyklus/platform';

interface Props {
  layout: Layout;
  solution: Solution;
  name: string;
  author: string;
  onClose: () => void;
  onPublished: (level: Level) => void;
}

/** Anlage als Auftrag veröffentlichen: Angaben, Testfälle, Probelauf mit der eigenen Lösung */
export function PublishDialog({ layout, solution, name, author, onClose, onPublished }: Props) {
  const refs = refsOf(layout);

  const [title, setTitle] = useState(name);
  const [customer, setCustomer] = useState(author || 'Eigene Werkstatt');
  const [mail, setMail] = useState('');
  const [notes, setNotes] = useState('');
  // Testfälle: die Szenarien der Anlage, sonst ein Normalbetrieb mit der ersten Bedienung
  const [tests, setTests] = useState<PublishTest[]>(() =>
    layout.scenarios?.length
      ? layout.scenarios.map((s) => ({
          name: s.name,
          durationMs: s.durationMs,
          seeds: s.seeds,
          events: structuredClone(s.events),
          rules: structuredClone(s.rules),
        }))
      : [
          {
            name: 'Normalbetrieb',
            durationMs: 60000,
            seeds: [layout.seed],
            events: refs.controls.length ? [defaultEvent('control', 100, refs)] : [],
            rules: refs.bins.length ? [{ kind: 'sorted' }, { kind: 'noLoss' }] : [],
          },
        ],
  );
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
    void platform.files.save(
      platformFileName(`${l.id}.auftrag.json`),
      toAuftragFile({ level: l, author }),
      [FILE_TYPES.auftrag],
    );
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

            <h4>{t('publish.events')}</h4>
            <EventList
              layout={layout}
              events={[...eventsFromControls(test.controls ?? []), ...(test.events ?? [])]}
              onChange={(events) => setTest(i, { controls: [], events })}
            />

            <h4>{t('publish.rules')}</h4>
            <RuleList
              layout={layout}
              rules={test.rules}
              onChange={(rules) => setTest(i, { rules })}
            />
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
