import { useEffect, useState } from 'react';
import { parseAnlageFile, thumbnailSvg, type AnlageFile, type AnlageMeta } from '@zyklus/plant-sim';
import { TEMPLATE_FILES } from '../../state/templates';
import { t } from '../../i18n';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import {
  duplicateAnlage,
  listAnlagen,
  removeAnlage,
  renameAnlage,
  type StoredAnlage,
} from '../../state/layouts';

interface Props {
  activeId: string | null;
  meta: AnlageMeta;
  onMeta: (m: Partial<AnlageMeta>) => void;
  onClose: () => void;
  onOpen: (id: string, file: AnlageFile) => void;
  onNew: () => void;
  onImport: () => void;
  onSaveCurrent: () => void;
  /** Vorlage als neue Anlage übernehmen (Dateiinhalt) */
  onTemplate: (text: string) => void;
}

const date = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};

/** „Meine Anlagen“: gespeicherte Anlagen mit Vorschaubild, Angaben zur aktuellen Anlage */
export function MyPlants({
  activeId,
  meta,
  onMeta,
  onClose,
  onOpen,
  onNew,
  onImport,
  onSaveCurrent,
  onTemplate,
}: Props) {
  const [list, setList] = useState<StoredAnlage[]>(listAnlagen);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<StoredAnlage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !deleting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, deleting]);

  const open = (e: StoredAnlage) => {
    const r = parseAnlageFile(e.file);
    if (!r.ok) setError(r.error);
    else onOpen(e.id, r.file);
  };

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="myplants" role="dialog" aria-modal="true" aria-labelledby="myplants-title">
        <header className="myplants-head">
          <h2 id="myplants-title">{t('anlage.mine')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('dialog.close')}>
            ✕
          </button>
        </header>
        <section className="myplants-current">
          <h3>{t('anlage.current')}</h3>
          <label className="pe-field">
            <span>{t('anlage.name')}</span>
            <input value={meta.name} onChange={(e) => onMeta({ name: e.target.value })} />
          </label>
          <label className="pe-field">
            <span>{t('anlage.author')}</span>
            <input value={meta.author} onChange={(e) => onMeta({ author: e.target.value })} />
          </label>
          <label className="pe-field myplants-desc">
            <span>{t('anlage.description')}</span>
            <textarea
              rows={2}
              value={meta.description}
              onChange={(e) => onMeta({ description: e.target.value })}
            />
          </label>
          <div className="myplants-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                onSaveCurrent();
                setList(listAnlagen());
              }}
            >
              {t('anlage.save')}
            </button>
            <button className="btn" onClick={onNew}>
              {t('anlage.new')}
            </button>
            <button className="btn" onClick={onImport}>
              {t('anlage.import')}
            </button>
          </div>
          <p className="muted">{t('anlage.autosave')}</p>
        </section>
        <section className="myplants-templates">
          <h3>{t('anlage.templates')}</h3>
          <ul className="myplants-list">
            {TEMPLATE_FILES.map((tf) => {
              const parsed = parseAnlageFile(tf.withProgram);
              if (!parsed.ok) return null;
              const f = parsed.file;
              return (
                <li key={tf.id}>
                  <img
                    alt=""
                    className="myplants-tpl-img"
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(thumbnailSvg(f.layout))}`}
                  />
                  <b className="myplants-name">{f.name}</b>
                  <span className="muted myplants-tpl-desc">{f.description}</span>
                  <div className="myplants-item-actions">
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => onTemplate(tf.withProgram)}
                    >
                      {t('anlage.withProgram')}
                    </button>
                    <button className="btn btn-small" onClick={() => onTemplate(tf.empty)}>
                      {t('anlage.withoutProgram')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <h3>{t('anlage.stored')}</h3>
        </section>
        {error && (
          <p className="pe-error" role="alert">
            {error}
          </p>
        )}
        {!list.length && <p className="muted">{t('anlage.none')}</p>}
        <ul className="myplants-list">
          {list.map((e) => (
            <li key={e.id} className={e.id === activeId ? 'myplants-active' : ''}>
              <button className="myplants-thumb" onClick={() => open(e)} title={t('anlage.open')}>
                <img alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(e.thumbnail)}`} />
              </button>
              {renaming?.id === e.id ? (
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(ev) => setRenaming({ ...renaming, name: ev.target.value })}
                  onBlur={() => {
                    if (renaming.name.trim()) {
                      setList(renameAnlage(e.id, renaming.name.trim()));
                      if (e.id === activeId) onMeta({ name: renaming.name.trim() });
                    }
                    setRenaming(null);
                  }}
                  onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
                />
              ) : (
                <b className="myplants-name">{e.name}</b>
              )}
              <span className="muted">
                {date(e.modified)}
                {e.id === activeId ? ` · ${t('anlage.isCurrent')}` : ''}
              </span>
              <div className="myplants-item-actions">
                <button className="btn btn-small" onClick={() => open(e)}>
                  {t('anlage.open')}
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => setRenaming({ id: e.id, name: e.name })}
                >
                  {t('anlage.rename')}
                </button>
                <button className="btn btn-small" onClick={() => setList(duplicateAnlage(e.id))}>
                  {t('anlage.duplicate')}
                </button>
                <button className="btn btn-small btn-danger" onClick={() => setDeleting(e)}>
                  {t('anlage.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {deleting && (
        <ConfirmDialog
          title={t('anlage.delete')}
          text={t('anlage.deleteConfirm', { name: deleting.name })}
          confirmLabel={t('anlage.delete')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            setList(removeAnlage(deleting.id));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
