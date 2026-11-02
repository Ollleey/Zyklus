import { useId } from 'react';
import type { VarDecl } from '@zyklus/sim-core';
import { t } from '../i18n';

export const ELEMENTARY_TYPES = [
  'Bool',
  'Byte',
  'Word',
  'DWord',
  'Int',
  'DInt',
  'Real',
  'Time',
  'SInt',
  'USInt',
  'UInt',
  'UDInt',
  'LInt',
  'ULInt',
  'LReal',
  'LWord',
];

interface Props {
  rows: VarDecl[];
  onChange: (rows: VarDecl[]) => void;
  types?: string[];
  /** Zeile mit Fehler (wird markiert) */
  errorRows?: Set<number>;
  withInit?: boolean;
  /** Spalte „Remanent“ (Global-DB, FB-Input/Output/Static) */
  withRetain?: boolean;
}

/** Tabelle wie im TIA-Schnittstelleneditor: Name, Datentyp, Startwert, Kommentar. */
export function VarTable({
  rows,
  onChange,
  types = ELEMENTARY_TYPES,
  errorRows,
  withInit = true,
  withRetain = false,
}: Props) {
  const listId = useId();
  const set = (i: number, patch: Partial<VarDecl>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <table className="var-table">
      <thead>
        <tr>
          <th>{t('table.name')}</th>
          <th>{t('table.type')}</th>
          {withInit && <th>{t('table.init')}</th>}
          {withRetain && <th title={t('table.retain.hint')}>{t('table.retain')}</th>}
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
              {/* freier Text mit Vorschlägen: auch Array[0..9] of Int */}
              <input
                value={r.type}
                list={listId}
                onChange={(e) => set(i, { type: e.target.value })}
                spellCheck={false}
              />
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
            {withRetain && (
              <td className="var-retain">
                <input
                  type="checkbox"
                  checked={!!r.retain}
                  aria-label={t('table.retain')}
                  onChange={(e) => {
                    const { retain: _, ...rest } = r;
                    onChange(
                      rows.map((x, k) =>
                        k === i ? (e.target.checked ? { ...rest, retain: true } : rest) : x,
                      ),
                    );
                  }}
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
          <td colSpan={4 + (withInit ? 1 : 0) + (withRetain ? 1 : 0)}>
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
      <datalist id={listId}>
        {[...types, 'Array[0..9] of Int'].map((ty) => (
          <option key={ty} value={ty} />
        ))}
      </datalist>
    </table>
  );
}
