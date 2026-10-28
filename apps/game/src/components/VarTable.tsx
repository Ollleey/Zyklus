import type { VarDecl } from '@zyklus/sim-core';
import { t } from '../i18n';

export const ELEMENTARY_TYPES = ['Bool', 'Byte', 'Word', 'DWord', 'Int', 'DInt', 'Real', 'Time'];

interface Props {
  rows: VarDecl[];
  onChange: (rows: VarDecl[]) => void;
  types?: string[];
  /** Zeile mit Fehler (wird markiert) */
  errorRows?: Set<number>;
  withInit?: boolean;
}

/** Tabelle wie im TIA-Schnittstelleneditor: Name, Datentyp, Startwert, Kommentar. */
export function VarTable({
  rows,
  onChange,
  types = ELEMENTARY_TYPES,
  errorRows,
  withInit = true,
}: Props) {
  const set = (i: number, patch: Partial<VarDecl>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <table className="var-table">
      <thead>
        <tr>
          <th>{t('table.name')}</th>
          <th>{t('table.type')}</th>
          {withInit && <th>{t('table.init')}</th>}
          <th>{t('table.comment')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={errorRows?.has(i) ? 'row-error' : ''}>
            <td>
              <input
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                spellCheck={false}
              />
            </td>
            <td>
              <select value={r.type} onChange={(e) => set(i, { type: e.target.value })}>
                {!types.includes(r.type) && <option value={r.type}>{r.type}</option>}
                {types.map((ty) => (
                  <option key={ty}>{ty}</option>
                ))}
              </select>
            </td>
            {withInit && (
              <td>
                <input
                  value={r.init ?? ''}
                  onChange={(e) => set(i, { init: e.target.value || undefined })}
                  spellCheck={false}
                />
              </td>
            )}
            <td>
              <input
                value={r.comment ?? ''}
                onChange={(e) => set(i, { comment: e.target.value || undefined })}
              />
            </td>
            <td>
              <button
                className="icon-btn"
                title="Zeile löschen"
                onClick={() => onChange(rows.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={withInit ? 5 : 4}>
            <button
              className="link-btn"
              onClick={() =>
                onChange([...rows, { name: `Var_${rows.length + 1}`, type: types[0] ?? 'Bool' }])
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
