import { tr, type Level } from '@zyklus/sim-core';
import { t } from '../i18n';
import type { LevelProgress } from '../state/persistence';

export type Place = 'handbook' | 'sandbox' | 'patience';

/** Gelöste Aufträge, ab denen das Bonusspiel freigeschaltet ist */
export const PATIENCE_UNLOCK = 3;

interface Props {
  levels: Level[];
  progress: Record<string, LevelProgress>;
  onOpen: (id: string) => void;
  onPlace: (p: Place) => void;
}

export function Inbox({ levels, progress, onOpen, onPlace }: Props) {
  const solved = levels.filter((l) => progress[l.id]?.solved).length;
  const patience = solved >= PATIENCE_UNLOCK;
  return (
    <div className="inbox">
      <header className="inbox-head">
        <div className="brand">
          <span className="brand-mark">⏚</span>
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
        </div>
        <nav className="workshop">
          <button className="btn" onClick={() => onPlace('handbook')}>
            📖 {t('handbook.title')}
          </button>
          <button className="btn" onClick={() => onPlace('sandbox')}>
            ⚙ {t('sandbox.title')}
          </button>
          <button
            className="btn"
            disabled={!patience}
            title={patience ? '' : t('patience.locked', { n: PATIENCE_UNLOCK })}
            onClick={() => onPlace('patience')}
          >
            {patience ? '▦' : '🔒'} {t('patience.title')}
          </button>
        </nav>
      </header>
      <p className="inbox-progress">
        {solved} / {levels.length} {t('inbox.progress')}
      </p>
      <h2>{t('inbox.title')}</h2>
      {levels.length === 0 && <p>{t('inbox.empty')}</p>}
      <ul className="mail-list">
        {levels.map((l, i) => {
          const p = progress[l.id];
          // Aufträge werden nacheinander freigeschaltet
          const unlocked = i === 0 || progress[levels[i - 1]!.id]?.solved;
          return (
            <li key={l.id}>
              <button
                className={`mail-item ${p?.solved ? 'solved' : ''}`}
                disabled={!unlocked}
                onClick={() => onOpen(l.id)}
              >
                <span className="mail-no">#{l.order}</span>
                <span className="mail-from">{tr(l.customer)}</span>
                <span className="mail-subject">{tr(l.mail.subject)}</span>
                <span className="mail-status">
                  {p?.solved ? `✓ ${t('inbox.solved')}` : unlocked ? t('inbox.open') : '🔒'}
                </span>
                {p?.best && (
                  <span className="mail-best">
                    ¤{p.best.cost} · {p.best.energy} E · {p.best.size} Anw.
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
