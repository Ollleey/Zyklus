import type { DataType, Tag } from '@zyklus/sim-core';
import { TIA_NAMES } from '@zyklus/scl-compiler';
import { t } from '../i18n';

const TYPES = Object.keys(TIA_NAMES) as DataType[];

interface Props {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
  errorRows?: Set<number>;
}

/** PLC-Variablentabelle. Zeilen angeschlossener Geräte haben eine feste Adresse. */
export function TagTable({ tags, onChange, errorRows }: Props) {
  const set = (i: number, patch: Partial<Tag>) =>
    onChange(tags.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <table className="var-table">
      <thead>
        <tr>
          <th>{t('table.name')}</th>
          <th>{t('table.type')}</th>
          <th>{t('table.address')}</th>
          <th>{t('table.comment')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tags.map((tag, i) => {
          const device = tag.comment?.startsWith('Gerät ');
          return (
            <tr key={i} className={errorRows?.has(i) ? 'row-error' : ''}>
              <td>
                <input
                  value={tag.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  spellCheck={false}
                />
              </td>
              <td>
                <select
                  value={tag.t}
                  disabled={device}
                  onChange={(e) => set(i, { t: e.target.value as DataType })}
                >
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {TIA_NAMES[ty]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  value={tag.address}
                  disabled={device}
                  onChange={(e) => set(i, { address: e.target.value })}
                  spellCheck={false}
                />
              </td>
              <td>
                <input
                  value={tag.comment ?? ''}
                  disabled={device}
                  onChange={(e) => set(i, { comment: e.target.value || undefined })}
                />
              </td>
              <td>
                {!device && (
                  <button
                    className="icon-btn"
                    title="Zeile löschen"
                    onClick={() => onChange(tags.filter((_, k) => k !== i))}
                  >
                    ✕
                  </button>
                )}
              </td>
            </tr>
          );
        })}
        <tr>
          <td colSpan={5}>
            <button
              className="link-btn"
              onClick={() =>
                onChange([
                  ...tags,
                  { name: `Merker_${tags.length + 1}`, t: 'BOOL', address: `%M${tags.length}.0` },
                ])
              }
            >
              + {t('table.add')}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
