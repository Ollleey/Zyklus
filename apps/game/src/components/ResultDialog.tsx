import { tr, type Level, type Verification } from '@zyklus/sim-core';
import { t } from '../i18n';
import type { Best } from '../state/persistence';

interface Props {
  level: Level;
  result: Verification;
  best?: Best;
  onClose: () => void;
  onInspect: (testIdx: number, seed: number) => void;
}

export function ResultDialog({ level, result, best, onClose, onInspect }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('result.title')}
      >
        <h2 className={result.passed ? 'ok' : 'fail'}>
          {result.passed ? `✓ ${t('result.passed')}` : `✗ ${t('result.failed')}`}
        </h2>
        <table className="result-table">
          <tbody>
            {level.tests.map((test, i) => {
              const runs = result.runs.filter((r) => r.testId === test.id);
              const ok = runs.filter((r) => r.passed).length;
              const firstFail = runs.find((r) => !r.passed);
              return (
                <tr key={test.id} className={ok === runs.length ? 'ok' : 'fail'}>
                  <td>{ok === runs.length ? '✓' : '✗'}</td>
                  <td>{tr(test.name)}</td>
                  <td className="num">
                    {ok}/{runs.length} {t('result.runs')}
                  </td>
                  <td>
                    {firstFail && (
                      <button className="link-btn" onClick={() => onInspect(i, firstFail.seed)}>
                        Seed {firstFail.seed} ansehen
                        {firstFail.stop ? ` – ${firstFail.stop}` : ''}
                      </button>
                    )}
                    {firstFail?.criteria
                      .filter((c) => !c.ok)
                      .map((c, k) => (
                        <div key={k} className="criterion-fail">
                          ✗ {tr(c.name)}
                          {c.detail ? ` (${c.detail})` : ''}
                        </div>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result.passed && (
          <div className="metrics-big">
            {(
              [
                ['cost', t('metrics.cost'), result.metrics.cost],
                ['energy', t('metrics.energy'), result.metrics.energy],
                ['size', t('metrics.size'), result.metrics.size],
              ] as const
            ).map(([key, label, value]) => (
              <div key={key} className="metric">
                <div className="metric-value">{value}</div>
                <div className="metric-label">{label}</div>
                {best && (
                  <div className="metric-best">
                    {t('result.best')}: {best[key]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            {t('result.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
