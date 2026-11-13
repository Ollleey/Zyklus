import { useState } from 'react';
import {
  MODULE_TYPES,
  channelKindAt,
  tr,
  type BoardAnalysis,
  type DiagEntry,
  type ModuleFaultKind,
  type Solution,
} from '@zyklus/sim-core';
import { msg, t } from '../i18n';
import type { RunView } from '../sim/types';

/** Zustand einer Baugruppe für Diagnose-Symbol und Text */
export type ModuleHealth = { level: 'ok' | 'warn' | 'fault' | 'off'; texts: string[] };

const FAULT_TEXT: Record<ModuleFaultKind, () => string> = {
  pulled: () => t('diag.pulled'),
  noLoad: () => t('diag.noLoad'),
  station: () => t('diag.station'),
};

/**
 * Zustand einer Baugruppe: gezogen bzw. Station ausgefallen (Störung), Lastspannung fehlt
 * (Warnung), Analogkanal mit Drahtbruch oder Überlauf (Warnung, je Kanal).
 */
export function moduleHealth(
  solution: Solution,
  analysis: Pick<BoardAnalysis, 'cpuOf' | 'channelAddress'>,
  run: RunView | null,
  moduleId: string,
): ModuleHealth {
  if (!run) return { level: 'off', texts: [] };
  const m = solution.modules.find((x) => x.id === moduleId);
  const mt = m && MODULE_TYPES[m.type];
  if (!m || !mt) return { level: 'off', texts: [] };
  const faults = run.moduleFaults(moduleId);
  const texts = [...faults].map((f) => FAULT_TEXT[f]());
  let level: ModuleHealth['level'] =
    faults.has('pulled') || faults.has('station') ? 'fault' : faults.size ? 'warn' : 'ok';
  const cpu = analysis.cpuOf.get(moduleId);
  if (cpu && level !== 'fault') {
    for (let ch = 0; ch < mt.channels; ch++) {
      const kind = channelKindAt(mt, ch);
      if (kind !== 'AI') continue;
      const addr = analysis.channelAddress.get(`${moduleId}:${ch}`);
      if (!addr || !solution.wires.some((w) => w.module === moduleId && w.channel === ch)) continue;
      let v: unknown;
      try {
        v = run.cpus.get(cpu)?.read(addr);
      } catch {
        v = undefined;
      }
      if (typeof v === 'number' && (v >= 32767 || v <= -32768)) {
        texts.push(t('diag.channel', { ch: ch, address: addr }));
        level = 'warn';
      }
    }
  }
  return { level, texts };
}

export const HEALTH_ICON: Record<ModuleHealth['level'], string> = {
  ok: '✓',
  warn: '⚠',
  fault: '✕',
  off: '–',
};

type Filter = 'all' | DiagEntry['kind'];

/**
 * Online & Diagnose (wie im TIA-Portal): Betriebszustand und Zykluslast der CPU, Zustand jeder
 * Baugruppe mit Symbol und Text, Diagnosepuffer mit Filter.
 */
export function DiagnosisPanel({
  cpuId,
  solution,
  analysis,
  run,
}: {
  cpuId: string;
  solution: Solution;
  analysis?: Pick<BoardAnalysis, 'cpuOf' | 'channelAddress'>;
  run: RunView | null;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const cpu = run?.cpus.get(cpuId);
  if (!run || !cpu || !analysis) return <p className="muted diag-empty">{t('diag.offline')}</p>;
  const modules = solution.modules.filter(
    (m) => m.id === cpuId || analysis.cpuOf.get(m.id) === cpuId,
  );
  const stopError =
    cpu.mode === 'STOP' && cpu.stopInfo && !['SWITCH', 'POWER'].includes(cpu.stopInfo.reason);
  const entries = cpu.diagnostics.filter((e) => filter === 'all' || e.kind === filter);

  return (
    <div className="diag-panel">
      <section>
        <h4>{t('diag.cpu')}</h4>
        <table className="diag-table">
          <tbody>
            <tr>
              <th>{t('diag.mode')}</th>
              <td
                className={cpu.mode === 'RUN' ? 'diag-ok' : stopError ? 'diag-fault' : 'diag-warn'}
              >
                {cpu.mode}
                {cpu.mode === 'STOP' && cpu.stopInfo ? ` – ${msg(cpu.stopInfo.message)}` : ''}
              </td>
            </tr>
            <tr>
              <th>{t('diag.load')}</th>
              <td>
                <span className="diag-bar">
                  <span
                    style={{ width: `${Math.min(100, Math.round(cpu.load * 100))}%` }}
                    className={cpu.load > 0.9 ? 'diag-bar-high' : ''}
                  />
                </span>{' '}
                {Math.round(cpu.load * 100)} %
              </td>
            </tr>
            <tr>
              <th>{t('diag.pending')}</th>
              <td className={cpu.diagActive ? 'diag-warn' : 'diag-ok'}>{cpu.diagActive}</td>
            </tr>
            <tr>
              <th>{t('diag.forces')}</th>
              <td className={cpu.forceCount ? 'diag-warn' : ''}>{cpu.forceCount}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4>{t('diag.modules')}</h4>
        <table className="diag-table">
          <tbody>
            {modules.map((m) => {
              const mt = MODULE_TYPES[m.type];
              const h =
                m.id === cpuId
                  ? {
                      level: (stopError
                        ? 'fault'
                        : cpu.mode === 'STOP'
                          ? 'warn'
                          : 'ok') as ModuleHealth['level'],
                      texts: cpu.mode === 'STOP' && cpu.stopInfo ? [msg(cpu.stopInfo.message)] : [],
                    }
                  : moduleHealth(solution, analysis, run, m.id);
              return (
                <tr key={m.id}>
                  <th>
                    <span className={`diag-icon diag-${h.level}`} aria-hidden>
                      {HEALTH_ICON[h.level]}
                    </span>{' '}
                    {mt ? tr(mt.name) : m.type} <span className="muted">{m.id}</span>
                  </th>
                  <td>{h.texts.length ? h.texts.join(' · ') : t('diag.ok')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h4>
          {t('cabinet.diagBuffer')} ({cpu.diagnostics.length})
          <select
            className="diag-filter"
            value={filter}
            aria-label={t('diag.filter')}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">{t('diag.all')}</option>
            <option value="error">{t('diag.errors')}</option>
            <option value="diag">{t('diag.diags')}</option>
            <option value="event">{t('diag.events')}</option>
          </select>
        </h4>
        {entries.length ? (
          <ol className="diag-list">
            {entries.map((e, i) => (
              <li key={i} className={`diag-${e.kind}`}>
                <span className="diag-time">{(e.time / 1000).toFixed(3)} s</span>
                <span className="diag-kind">{t(`diag.kind.${e.kind}` as never)}</span>
                {msg(e.text)}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t('cabinet.diagEmpty')}</p>
        )}
      </section>
    </div>
  );
}
