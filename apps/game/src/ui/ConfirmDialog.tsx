import { useEffect, useRef } from 'react';
import { t } from '../i18n';

interface Props {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** dritte Wahl zwischen Abbrechen und Bestätigen */
  secondary?: { label: string; onSelect: () => void };
}

/** Bestätigung im Stil des Spiels statt Browser-`confirm`. Esc bricht ab, Fokus startet auf „Abbrechen“. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  secondary,
}: Props) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{text}</p>
        <div className="confirm-actions">
          <button ref={cancel} className="btn" onClick={onCancel}>
            {t('dialog.cancel')}
          </button>
          {secondary && (
            <button className="btn" onClick={secondary.onSelect}>
              {secondary.label}
            </button>
          )}
          <button
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
