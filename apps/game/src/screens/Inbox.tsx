import { useRef, useState } from 'react';
import { tr, type Level } from '@zyklus/sim-core';
import { t } from '../i18n';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  parseAuftragFile,
  putCustomLevel,
  removeCustomLevel,
  toAuftragFile,
  type CustomLevel,
} from '../state/customLevels';
import type { LevelProgress } from '../state/persistence';

/** `sandbox` ist das Testpult (Schlüssel bleibt wegen gespeicherter Stände) */
export type Place = 'handbook' | 'sandbox' | 'sandkasten' | 'patience';

/** Gelöste Aufträge, ab denen das Bonusspiel freigeschaltet ist */
export const PATIENCE_UNLOCK = 3;

interface Props {
  levels: Level[];
  progress: Record<string, LevelProgress>;
  onOpen: (id: string) => void;
  onPlace: (p: Place) => void;
  /** eigene Aufträge aus dem Sandkasten */
  custom: CustomLevel[];
  onCustom: (list: CustomLevel[]) => void;
}

export function Inbox({ levels, progress, onOpen, onPlace, custom, onCustom }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomLevel | null>(null);
  const importFile = async (f: File) => {
    const r = parseAuftragFile(await f.text());
    if (!r.ok) setError(r.error);
    else {
      setError(null);
      onCustom(putCustomLevel(r.value));
    }
  };
  const download = (c: CustomLevel) => {
    const blob = new Blob([toAuftragFile(c)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${c.level.id}.auftrag.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
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
          <button className="btn" onClick={() => onPlace('sandkasten')}>
            ⚙ {t('sandkasten.title')}
          </button>
          <button className="btn" onClick={() => onPlace('sandbox')}>
            ⏻ {t('testpult.title')}
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
                  <span className="mail-best meta-list">
                    <span>
                      {t('inbox.best')}: ¤{p.best.cost}
                    </span>
                    <span>{p.best.energy} Energie</span>
                    <span>{p.best.size} Anweisungen</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <h2 className="custom-head">
        {t('custom.title')}
        <button className="btn btn-small" onClick={() => fileInput.current?.click()}>
          {t('custom.import')}
        </button>
      </h2>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }}
      />
      {error && (
        <p className="pe-error" role="alert">
          {error}
        </p>
      )}
      {!custom.length && <p className="muted">{t('custom.none')}</p>}
      <ul className="mail-list">
        {custom.map((c) => {
          const p = progress[c.level.id];
          return (
            <li key={c.level.id} className="custom-item">
              <button
                className={`mail-item ${p?.solved ? 'solved' : ''}`}
                onClick={() => onOpen(c.level.id)}
              >
                <span className="mail-no">★</span>
                <span className="mail-from">{tr(c.level.customer)}</span>
                <span className="mail-subject">{tr(c.level.title)}</span>
                <span className="mail-status">
                  {p?.solved ? `✓ ${t('inbox.solved')}` : t('inbox.open')}
                </span>
                {c.level.par && (
                  <span className="mail-best meta-list">
                    <span>
                      {t('custom.par')}: ¤{c.level.par.cost}
                    </span>
                    <span>{Math.round(c.level.par.energy)} Energie</span>
                    <span>{c.level.par.size} Anweisungen</span>
                  </span>
                )}
              </button>
              <div className="custom-actions">
                <button className="btn btn-small" onClick={() => download(c)}>
                  {t('custom.download')}
                </button>
                <button className="btn btn-small btn-danger" onClick={() => setDeleting(c)}>
                  {t('custom.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {deleting && (
        <ConfirmDialog
          title={t('custom.delete')}
          text={t('custom.deleteConfirm', { name: tr(deleting.level.title) })}
          confirmLabel={t('custom.delete')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onCustom(removeCustomLevel(deleting.level.id));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
