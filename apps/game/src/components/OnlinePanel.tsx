import type { PlcProject, Value } from '@zyklus/sim-core';
import { t } from '../i18n';
import { formatValue, useBoolFormat } from '../state/prefs';
import {
  formatAs,
  parseValue,
  resolveOperand,
  type ForceRow,
  type OnlineTables,
  type Target,
  type WatchFormat,
  type WatchRow,
} from '../state/online';

/** Zugriff auf die laufende CPU (nur während einer Simulation) */
export interface OnlineAccess {
  read(target: Target): Value | undefined;
  /** Wert an der Klemme (für die Forcetabelle) */
  readIo(address: string): Value | undefined;
  modify(target: Target, value: Value): void;
}

interface Props {
  project: PlcProject;
  tables: OnlineTables;
  onChange: (t: OnlineTables) => void;
  live?: OnlineAccess;
}

const FORMATS: [WatchFormat, string][] = [
  ['dec', 'DEZ'],
  ['hex', 'HEX'],
  ['bin', 'BIN'],
  ['time', 'Zeit'],
];

/**
 * Beobachtungstabelle (Operanden mit Anzeigeformat, Steuern einmalig oder zyklisch) und
 * Forcetabelle (Ein-/Ausgänge an der Peripherie) wie im TIA-Portal.
 */
export function OnlinePanel({ project, tables, onChange, live }: Props) {
  const boolFormat = useBoolFormat();
  const setWatch = (watch: WatchRow[]) => onChange({ ...tables, watch });
  const setForce = (force: ForceRow[]) => onChange({ ...tables, force });

  const show = (target: Target | { error: string }, f: WatchFormat): string => {
    if ('error' in target) return '';
    const v = live?.read(target);
    if (v === undefined) return live ? '?' : '';
    if (typeof v === 'number') return formatAs(v, f);
    return formatValue(v, boolFormat);
  };

  const showValue = (v: Value | undefined) =>
    v === undefined ? '?' : typeof v === 'number' ? String(v) : formatValue(v, boolFormat);

  const modifyRow = (r: WatchRow) => {
    const target = resolveOperand(project, r.operand);
    const v = r.modify !== undefined ? parseValue(r.modify) : undefined;
    if (!live || 'error' in target || v === undefined) return;
    live.modify(target, v);
  };

  const forcing = tables.force.some((f) => f.active);

  return (
    <div className="online-panel">
      <section>
        <div className="online-head">
          <h4>{t('online.watch')}</h4>
          <label className="online-cyclic" title={t('online.cyclic.hint')}>
            <input
              type="checkbox"
              checked={!!tables.cyclic}
              onChange={(e) => onChange({ ...tables, cyclic: e.target.checked })}
            />{' '}
            {t('online.cyclic')}
          </label>
          <button
            className="btn btn-small"
            disabled={!live}
            onClick={() => tables.watch.forEach(modifyRow)}
          >
            ⚡ {t('online.modifyAll')}
          </button>
        </div>
        <table className="var-table online-table">
          <thead>
            <tr>
              <th>{t('online.operand')}</th>
              <th>{t('online.format')}</th>
              <th>{t('online.value')}</th>
              <th>{t('online.modifyValue')}</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {tables.watch.map((r, i) => {
              const target = resolveOperand(project, r.operand);
              const set = (patch: Partial<WatchRow>) =>
                setWatch(tables.watch.map((x, k) => (k === i ? { ...x, ...patch } : x)));
              const bad =
                r.modify !== undefined && r.modify !== '' && parseValue(r.modify) === undefined;
              return (
                <tr key={i} className={'error' in target && r.operand ? 'row-error' : ''}>
                  <td title={'error' in target ? target.error : ''}>
                    <input
                      value={r.operand}
                      placeholder='"Motor", %IW64, "Daten".Wert'
                      onChange={(e) => set({ operand: e.target.value })}
                      spellCheck={false}
                    />
                  </td>
                  <td>
                    <select
                      value={r.format}
                      onChange={(e) => set({ format: e.target.value as WatchFormat })}
                    >
                      {FORMATS.map(([f, label]) => (
                        <option key={f} value={f}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="online-live">{show(target, r.format)}</td>
                  <td className={bad ? 'row-error' : ''}>
                    <input
                      value={r.modify ?? ''}
                      placeholder="TRUE, 42, T#2s"
                      onChange={(e) => set({ modify: e.target.value || undefined })}
                      spellCheck={false}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title={t('online.modify')}
                      disabled={!live || !r.modify || bad || 'error' in target}
                      onClick={() => modifyRow(r)}
                    >
                      ⚡
                    </button>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Zeile löschen"
                      onClick={() => setWatch(tables.watch.filter((_, k) => k !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={6}>
                <button
                  className="link-btn"
                  onClick={() => setWatch([...tables.watch, { operand: '', format: 'dec' }])}
                >
                  + {t('table.add')}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <div className="online-head">
          <h4>{t('online.force')}</h4>
          {forcing && <span className="online-forcing">⚠ {t('online.forcing')}</span>}
        </div>
        <table className="var-table online-table">
          <thead>
            <tr>
              <th>{t('online.operand')}</th>
              <th>{t('online.value')}</th>
              <th>{t('online.forceValue')}</th>
              <th>{t('online.active')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tables.force.map((r, i) => {
              const target = resolveOperand(project, r.operand);
              const io =
                !('error' in target) && target.kind === 'address' && /^%[IQ]/.test(target.address);
              const set = (patch: Partial<ForceRow>) =>
                setForce(tables.force.map((x, k) => (k === i ? { ...x, ...patch } : x)));
              const valueOk = parseValue(r.value) !== undefined;
              const problem = !r.operand
                ? ''
                : 'error' in target
                  ? target.error
                  : !io
                    ? t('online.forceIoOnly')
                    : !valueOk
                      ? t('online.badValue')
                      : '';
              return (
                <tr key={i} className={problem ? 'row-error' : ''}>
                  <td title={problem}>
                    <input
                      value={r.operand}
                      placeholder='"Start", %Q0.1'
                      onChange={(e) => set({ operand: e.target.value })}
                      spellCheck={false}
                    />
                  </td>
                  <td className="online-live">
                    {io && live && target.kind === 'address'
                      ? showValue(live.readIo(target.address))
                      : ''}
                  </td>
                  <td>
                    <input
                      value={r.value}
                      placeholder="TRUE"
                      onChange={(e) => set({ value: e.target.value })}
                      spellCheck={false}
                    />
                  </td>
                  <td className="var-retain">
                    <input
                      type="checkbox"
                      checked={r.active}
                      disabled={!!problem || !r.operand}
                      onChange={(e) => set({ active: e.target.checked })}
                      aria-label={t('online.active')}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Zeile löschen"
                      onClick={() => setForce(tables.force.filter((_, k) => k !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5}>
                <button
                  className="link-btn"
                  onClick={() =>
                    setForce([...tables.force, { operand: '', value: 'TRUE', active: false }])
                  }
                >
                  + {t('table.add')}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Aktive Forceaufträge einer CPU als Adresse und Wert (gültige Zeilen) */
export function activeForces(project: PlcProject, tables: OnlineTables): [string, Value][] {
  const out: [string, Value][] = [];
  for (const r of tables.force) {
    if (!r.active) continue;
    const target = resolveOperand(project, r.operand);
    const v = parseValue(r.value);
    if ('error' in target || target.kind !== 'address' || v === undefined) continue;
    if (!/^%[IQ]/.test(target.address)) continue;
    out.push([target.address, v]);
  }
  return out;
}
