import { useState } from 'react';
import { platform } from '@zyklus/platform';
import { tr, type Hint } from '@zyklus/sim-core';
import { t } from '../i18n';
import { Markdown } from '../ui/Markdown';

const KEY = (levelId: string) => `zyklus.tipps.${levelId}`;

/** Anzahl aufgedeckter Tipps eines Auftrags (gespeichert, damit sie offen bleiben) */
export function revealedHints(levelId: string): number {
  try {
    const n = Number(platform.storage.getItem(KEY(levelId)) ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/**
 * Hilfestellungen zum Aufdecken: Die Titel sind sichtbar, der Text erst nach einem Klick – vom
 * kleinen Anstoß bis zum Lösungsweg. Aufgedeckt wird der Reihe nach, damit niemand aus
 * Versehen gleich die Lösung sieht.
 */
export function HintList({ levelId, hints }: { levelId: string; hints: Hint[] }) {
  const [shown, setShown] = useState(() => Math.min(hints.length, revealedHints(levelId)));
  const reveal = (n: number) => {
    setShown(n);
    try {
      if (n > 0) platform.storage.setItem(KEY(levelId), String(n));
      else platform.storage.removeItem(KEY(levelId));
    } catch {
      /* Speicher nicht verfügbar: Tipps bleiben bis zum Schließen offen */
    }
  };
  return (
    <div className="hints">
      <p className="muted">{t('hints.intro')}</p>
      <ol className="hint-list">
        {hints.map((h, i) => {
          const open = i < shown;
          const last = i === hints.length - 1;
          return (
            <li key={i} className={`hint ${open ? 'hint-open' : ''}`}>
              <div className="hint-head">
                <span className="hint-no">{i + 1}</span>
                <b>{tr(h.title)}</b>
                {!open && i === shown && (
                  <button
                    className={`btn btn-small ${last ? '' : 'btn-primary'}`}
                    onClick={() => reveal(i + 1)}
                  >
                    {last ? t('hints.revealSolution') : t('hints.reveal')}
                  </button>
                )}
                {!open && i > shown && <span className="muted">🔒</span>}
              </div>
              {open && (
                <div className="hint-text">
                  <Markdown text={tr(h.text)} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {shown > 0 && (
        <button className="btn btn-small" onClick={() => reveal(0)}>
          {t('hints.hideAll')}
        </button>
      )}
    </div>
  );
}
