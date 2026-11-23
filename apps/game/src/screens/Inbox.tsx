import { useState } from 'react';
import { tr, type Level } from '@zyklus/sim-core';
import { LANGUAGES, chooseLanguage, language, t, tx } from '../i18n';
import { RandomJobs } from '../components/RandomJobs';
import { LESSONS } from '../course/lessons';
import { loadDone, loadStart, saveStart, type Start } from '../state/course';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SavegameMenu } from '../ui/Savegame';
import { SettingsDialog, useStartupUpdate } from '../ui/SettingsDialog';
import {
  parseAuftragFile,
  putCustomLevel,
  removeCustomLevel,
  toAuftragFile,
  type CustomLevel,
} from '../state/customLevels';
import type { LevelProgress } from '../state/persistence';
import { FILE_TYPES, platform, platformFileName } from '@zyklus/platform';

/** `sandbox` ist das Testpult (Schlüssel bleibt wegen gespeicherter Stände) */
export type Place = 'handbook' | 'sandbox' | 'sandkasten' | 'patience' | 'grundkurs';

/** Gelöste Aufträge, ab denen das Bonusspiel freigeschaltet ist */
export const PATIENCE_UNLOCK = 3;

interface Props {
  levels: Level[];
  /** Übungsaufträge außerhalb der Kampagne (immer offen) */
  extras?: Level[];
  progress: Record<string, LevelProgress>;
  onOpen: (id: string) => void;
  onPlace: (p: Place) => void;
  /** eigene Aufträge aus dem Sandkasten */
  custom: CustomLevel[];
  onCustom: (list: CustomLevel[]) => void;
}

export function Inbox({
  levels,
  extras = [],
  progress,
  onOpen,
  onPlace,
  custom: all,
  onCustom,
}: Props) {
  // Zufallsaufträge haben einen eigenen Abschnitt
  const custom = all.filter((c) => !c.random);
  const random = all.filter((c) => c.random);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomLevel | null>(null);
  // Einstieg: beim ersten Besuch fragen, ob schon Vorkenntnisse da sind
  const [start, setStartState] = useState<Start | null>(loadStart);
  const chooseStart = (s: Start) => {
    saveStart(s);
    setStartState(s);
    if (s === 'anfaenger') onPlace('grundkurs');
  };
  const courseDone = loadDone().length;
  const [settings, setSettings] = useState(false);
  // Update beim Start gefunden (nur wenn in den Einstellungen eingeschaltet)
  const update = useStartupUpdate();
  const importFile = async () => {
    const f = await platform.files.open([FILE_TYPES.auftrag]);
    if (!f) return;
    const r = parseAuftragFile(f.text);
    if (!r.ok) setError(r.error);
    else {
      setError(null);
      onCustom(putCustomLevel(r.value));
    }
  };
  const download = (c: CustomLevel) =>
    void platform.files.save(platformFileName(`${c.level.id}.auftrag.json`), toAuftragFile(c), [
      FILE_TYPES.auftrag,
    ]);
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
          <button className="btn" onClick={() => onPlace('grundkurs')} title={t('course.hint')}>
            🎓 {t('course.title')}
            {courseDone > 0 && courseDone < LESSONS.length && (
              <span className="course-badge">
                {' '}
                {courseDone}/{LESSONS.length}
              </span>
            )}
          </button>
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
          <SavegameMenu />
          <button className="btn" onClick={() => setSettings(true)}>
            🔧 {t('settings.title')}
          </button>
          <select
            className="lang-select"
            value={language()}
            aria-label={t('language.label')}
            title={t('language.label')}
            onChange={(e) => void chooseLanguage(e.target.value as 'de' | 'en')}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </nav>
      </header>
      {update && (
        <p className="notice update-notice" role="status">
          {t('settings.found', { version: update.version })}{' '}
          <button className="btn btn-small btn-primary" onClick={() => setSettings(true)}>
            {t('settings.show')}
          </button>
        </p>
      )}
      {settings && <SettingsDialog found={update} onClose={() => setSettings(false)} />}
      {start === null && (
        <section className="start-choice" aria-labelledby="start-title">
          <h2 id="start-title">{t('start.title')}</h2>
          <div className="start-cards">
            <button className="start-card" onClick={() => chooseStart('anfaenger')}>
              <span className="start-icon">🎓</span>
              <b>{t('start.beginner')}</b>
              <span>{t('start.beginnerText')}</span>
            </button>
            <button className="start-card" onClick={() => chooseStart('profi')}>
              <span className="start-icon">⚙</span>
              <b>{t('start.pro')}</b>
              <span>{t('start.proText')}</span>
            </button>
          </div>
        </section>
      )}
      <p className="inbox-progress">
        {solved} / {levels.length} {t('inbox.progress')}
      </p>
      {levels.length > 0 && solved === levels.length && (
        <section className="campaign-done" aria-live="polite">
          <h2>🏆 {t('campaign.done.title')}</h2>
          <p>{t('campaign.done.text', { n: levels.length })}</p>
        </section>
      )}
      <h2>{t('inbox.title')}</h2>
      {levels.length === 0 && <p>{t('inbox.empty')}</p>}
      <ul className="mail-list">
        {levels.map((l, i) => {
          const p = progress[l.id];
          // Aufträge werden nacheinander freigeschaltet; Einführung und Auftrag 1 sind immer offen
          const unlocked =
            i === 0 || l.order <= 1 || p?.solved || progress[levels[i - 1]!.id]?.solved;
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
                    <span>
                      {p.best.energy} {tx('Energie', 'energy')}
                    </span>
                    <span>
                      {p.best.size} {tx('Anweisungen', 'statements')}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {extras.length > 0 && (
        <>
          <h2>{t('extras.title')}</h2>
          <p className="muted">{t('extras.text')}</p>
          <ul className="mail-list">
            {extras.map((l, i) => {
              const p = progress[l.id];
              return (
                <li key={l.id}>
                  <button
                    className={`mail-item ${p?.solved ? 'solved' : ''}`}
                    onClick={() => onOpen(l.id)}
                  >
                    <span className="mail-no">Ü{i + 1}</span>
                    <span className="mail-from">{tr(l.customer)}</span>
                    <span className="mail-subject">{tr(l.mail.subject)}</span>
                    <span className="mail-status">
                      {p?.solved ? `✓ ${t('inbox.solved')}` : t('inbox.open')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <RandomJobs list={random} progress={progress} onOpen={onOpen} onChange={onCustom} />
      <h2 className="custom-head">
        {t('custom.title')}
        <button className="btn btn-small" onClick={() => void importFile()}>
          {t('custom.import')}
        </button>
      </h2>
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
                    <span>
                      {Math.round(c.level.par.energy)} {tx('Energie', 'energy')}
                    </span>
                    <span>
                      {c.level.par.size} {tx('Anweisungen', 'statements')}
                    </span>
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
