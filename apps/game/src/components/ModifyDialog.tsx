import { useEffect, useState } from 'react';
import type { PlcProject, Value } from '@zyklus/sim-core';
import { t } from '../i18n';
import { formatValue, useBoolFormat } from '../state/prefs';
import { resolveOperand } from '../state/online';
import type { OnlineAccess } from './OnlinePanel';

/**
 * Steuern aus dem Editor (Rechtsklick auf einen Operanden): Wert einmalig schreiben, wie
 * „Steuern auf 1/0“ bzw. „Steuern mit Wert“ im TIA-Portal. Eingänge schreibt das Spiel ins
 * Prozessabbild; der nächste Zyklus kann sie wieder überschreiben.
 */
export function ModifyDialog({
  operand,
  project,
  access,
  onClose,
}: {
  operand: string;
  project: PlcProject;
  access?: OnlineAccess;
  onClose: () => void;
}) {
  const boolFormat = useBoolFormat();
  const target = resolveOperand(project, operand);
  const bad = 'error' in target;
  const current: Value | undefined = !bad && access ? access.read(target) : undefined;
  const [text, setText] = useState(
    typeof current === 'number' ? String(current) : typeof current === 'string' ? current : '',
  );
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const write = (v: Value) => {
    if (bad || !access) return;
    access.modify(target, v);
    setDone(formatValue(v, boolFormat, typeof v === 'number' && !Number.isInteger(v) ? 2 : 0));
  };
  const isBool = typeof current === 'boolean';

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="confirm modify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modify-title"
      >
        <h2 id="modify-title">{t('modify.title')}</h2>
        <p className="mono">{operand}</p>
        {bad ? (
          <p className="pe-error">{(target as { error: string }).error}</p>
        ) : !access ? (
          <p className="muted">{t('monitor.startSim')}</p>
        ) : (
          <>
            <p>
              {t('modify.current')}{' '}
              <b className="mono">
                {current === undefined
                  ? '–'
                  : formatValue(
                      current,
                      boolFormat,
                      typeof current === 'number' && !Number.isInteger(current) ? 2 : 0,
                    )}
              </b>
            </p>
            {isBool ? (
              <div className="confirm-actions modify-actions">
                <button className="btn btn-primary" autoFocus onClick={() => write(true)}>
                  {t('modify.to1')}
                </button>
                <button className="btn" onClick={() => write(false)}>
                  {t('modify.to0')}
                </button>
              </div>
            ) : (
              <form
                className="modify-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(text.replace(',', '.'));
                  write(typeof current === 'string' ? text : Number.isFinite(n) ? n : text);
                }}
              >
                <input
                  className="mono"
                  autoFocus
                  value={text}
                  aria-label={t('modify.value')}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">
                  {t('modify.write')}
                </button>
              </form>
            )}
            {done && <p className="publish-ok">✓ {t('modify.done', { value: done })}</p>}
            <p className="muted modify-hint">{t('modify.hint')}</p>
          </>
        )}
        <div className="confirm-actions">
          <button className="btn" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
