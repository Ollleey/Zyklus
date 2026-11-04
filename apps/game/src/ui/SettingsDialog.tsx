import { useEffect, useState } from 'react';
import { platform, type UpdateInfo } from '@zyklus/platform';
import { LANGUAGES, chooseLanguage, language, msg, t } from '../i18n';

const AUTO_KEY = 'zyklus.updates.auto';

/** beim Start nach Updates suchen (Desktop, Standard aus – das Spiel läuft sonst ganz offline) */
export function loadAutoUpdate(): boolean {
  try {
    return platform.storage.getItem(AUTO_KEY) === 'ja';
  } catch {
    return false;
  }
}

function saveAutoUpdate(on: boolean): void {
  try {
    platform.storage.setItem(AUTO_KEY, on ? 'ja' : 'nein');
  } catch {
    /* nur für diese Sitzung */
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'found'; info: UpdateInfo }
  | { kind: 'installing'; progress: number }
  | { kind: 'error'; message: string };

/** Update-Suche und -Installation (Desktop); `found` übernimmt ein schon gefundenes Update */
export function UpdateSection({ found }: { found?: UpdateInfo | null }) {
  const updates = platform.updates;
  const [state, setState] = useState<State>(
    found ? { kind: 'found', info: found } : { kind: 'idle' },
  );
  const [auto, setAuto] = useState(loadAutoUpdate);

  if (!updates) return <p className="muted">{t('settings.webUpdates')}</p>;

  const search = async () => {
    setState({ kind: 'checking' });
    try {
      const info = await updates.check();
      setState(info ? { kind: 'found', info } : { kind: 'current' });
    } catch (e) {
      setState({ kind: 'error', message: String((e as Error)?.message ?? e) });
    }
  };
  const install = async () => {
    setState({ kind: 'installing', progress: 0 });
    try {
      await updates.install((p) => setState({ kind: 'installing', progress: p }));
    } catch (e) {
      setState({ kind: 'error', message: String((e as Error)?.message ?? e) });
    }
  };

  return (
    <div className="settings-updates">
      <p>
        {t('about.version')} <b className="mono">{__APP_VERSION__}</b>
      </p>
      {state.kind === 'found' ? (
        <div className="settings-found" role="status">
          <p>{t('settings.found', { version: state.info.version })}</p>
          {state.info.notes && <pre className="settings-notes">{state.info.notes}</pre>}
          <p>{t('settings.installAsk')}</p>
          <div className="confirm-actions">
            <button className="btn" onClick={() => setState({ kind: 'idle' })}>
              {t('settings.later')}
            </button>
            <button className="btn btn-primary" onClick={() => void install()} autoFocus>
              {t('settings.yesInstall')}
            </button>
          </div>
        </div>
      ) : state.kind === 'installing' ? (
        <p role="status">
          ⏳ {t('settings.installing')}
          {state.progress >= 0 && ` ${Math.round(state.progress * 100)} %`}
        </p>
      ) : (
        <>
          <button
            className="btn btn-primary"
            disabled={state.kind === 'checking'}
            onClick={() => void search()}
          >
            {state.kind === 'checking' ? t('settings.checking') : t('settings.check')}
          </button>
          {state.kind === 'current' && <p className="publish-ok">✓ {t('settings.current')}</p>}
          {state.kind === 'error' && (
            <p className="pe-error">
              {t('settings.error')} {msg(state.message)}
            </p>
          )}
        </>
      )}
      <label className="settings-check">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked);
            saveAutoUpdate(e.target.checked);
          }}
        />
        {t('settings.auto')}
      </label>
    </div>
  );
}

/** Einstellungen: Sprache und Updates */
export function SettingsDialog({
  onClose,
  found,
}: {
  onClose: () => void;
  found?: UpdateInfo | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="confirm settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title">{t('settings.title')}</h2>
        <h3>{t('language.label')}</h3>
        <select
          className="lang-select"
          value={language()}
          aria-label={t('language.label')}
          onChange={(e) => void chooseLanguage(e.target.value as 'de' | 'en')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <h3>{t('settings.updates')}</h3>
        <UpdateSection found={found} />
        <div className="confirm-actions">
          <button className="btn" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Einmal je Sitzung beim Start nach Updates suchen, wenn eingeschaltet. Fehler (z. B. offline)
 * bleiben still – die Suche auf Knopfdruck meldet sie.
 */
let checkedThisSession = false;
export function useStartupUpdate(): UpdateInfo | null {
  const [found, setFound] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (checkedThisSession || !platform.updates || !loadAutoUpdate()) return;
    checkedThisSession = true;
    platform.updates.check().then(setFound, () => {});
  }, []);
  return found;
}
