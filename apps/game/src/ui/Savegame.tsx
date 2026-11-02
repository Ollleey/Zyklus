import { useState } from 'react';
import {
  FILE_TYPES,
  applySavegame,
  exportSavegame,
  parseSavegame,
  platform,
  type Savegame,
} from '@zyklus/platform';
import { t } from '../i18n';
import { ConfirmDialog } from './ConfirmDialog';
import { Menu } from './Menu';

/** Merker: Angebot zum Übernehmen des Web-Spielstands wurde beantwortet (nur Desktop) */
const OFFER_KEY = 'zyklus.desktop.webImportAngeboten';

/** schon gespielt? (gelöste Aufträge oder eigene Anlagen) */
function hasProgress(): boolean {
  try {
    const p = JSON.parse(platform.storage.getItem('zyklus.fortschritt') ?? '{}') as object;
    return Object.keys(p).length > 0 || platform.storage.getItem('zyklus.anlagen') !== null;
  } catch {
    return false;
  }
}

/** Gesamten Spielstand als Datei speichern */
export async function exportAll(): Promise<string | null> {
  await platform.flush();
  return platform.files.save(
    'spielstand-export.json',
    exportSavegame(platform.storage, platform.kind),
    [FILE_TYPES.export],
  );
}

/** übernehmen, schreiben und das Spiel mit dem neuen Stand neu laden */
async function apply(s: Savegame): Promise<void> {
  applySavegame(platform.storage, s);
  platform.storage.setItem(OFFER_KEY, 'ja');
  await platform.flush();
  location.reload();
}

/**
 * Menü „Spielstand“ im Posteingang (Alles exportieren / Spielstand importieren) und auf dem
 * Desktop beim ersten Start das Angebot, den Spielstand aus der Web-Version zu übernehmen.
 */
export function SavegameMenu() {
  const [pending, setPending] = useState<Savegame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState(
    () =>
      platform.kind === 'desktop' && platform.storage.getItem(OFFER_KEY) === null && !hasProgress(),
  );

  const pick = async () => {
    const f = await platform.files.open([FILE_TYPES.export]);
    if (!f) return;
    const r = parseSavegame(f.text);
    if (!r.ok) setError(r.error);
    else setPending(r.savegame);
  };

  const closeOffer = () => {
    platform.storage.setItem(OFFER_KEY, 'nein');
    setOffer(false);
  };

  return (
    <>
      <Menu
        label={t('savegame.menu')}
        items={[
          {
            label: t('savegame.export'),
            title: t('savegame.exportTitle'),
            onSelect: () => void exportAll(),
          },
          { label: t('savegame.import'), onSelect: () => void pick() },
        ]}
      />
      {error && (
        <ConfirmDialog
          title={t('savegame.import')}
          text={error}
          confirmLabel={t('dialog.close')}
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      )}
      {pending && (
        <ConfirmDialog
          title={t('savegame.import')}
          text={t('savegame.confirm', {
            n: Object.keys(pending.entries).length,
            date: pending.exported ? new Date(pending.exported).toLocaleString('de-AT') : '–',
          })}
          confirmLabel={t('savegame.replace')}
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => void apply(pending)}
        />
      )}
      {offer && !pending && (
        <div className="modal-backdrop">
          <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="offer-title">
            <h2 id="offer-title">{t('savegame.offerTitle')}</h2>
            <p>{t('savegame.offerText')}</p>
            <div className="confirm-actions">
              <button className="btn" onClick={closeOffer}>
                {t('savegame.offerNo')}
              </button>
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  closeOffer();
                  void pick();
                }}
              >
                {t('savegame.offerYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
