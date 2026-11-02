import { useEffect } from 'react';
import { platform } from '@zyklus/platform';
import { t } from '../i18n';

/** „Über ZYKLUS“: Name, Version (aus der Root-package.json) und Plattform */
export function AboutDialog({ onClose }: { onClose: () => void }) {
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
      <div className="confirm about" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <h2 id="about-title">ZYKLUS</h2>
        <p className="muted">{t('app.subtitle')}</p>
        <dl className="about-facts">
          <dt>{t('about.version')}</dt>
          <dd className="mono">{__APP_VERSION__}</dd>
          <dt>{t('about.platform')}</dt>
          <dd>{platform.kind === 'desktop' ? t('about.desktop') : t('about.web')}</dd>
        </dl>
        <p className="muted">{t('about.offline')}</p>
        <div className="confirm-actions">
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
