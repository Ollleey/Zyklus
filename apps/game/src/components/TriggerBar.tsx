import { useState } from 'react';
import type { PlcProject, TriggerSpec } from '@zyklus/sim-core';
import { t } from '../i18n';
import { resolveOperand } from '../state/online';
import type { RunView } from '../sim/types';

const OPS: TriggerSpec['op'][] = ['=', '<>', '>', '>=', '<', '<=', 'rise', 'fall'];

/**
 * Beobachten mit Trigger: Die Simulation hält nach dem Zyklus an, in dem die Bedingung erfüllt
 * ist – danach zeigen Programm und Beobachtungstabelle genau diesen Stand. Einmalig; zum nächsten
 * Mal wieder scharf schalten.
 */
export function TriggerBar({
  project,
  cpuId,
  run,
}: {
  project: PlcProject;
  cpuId: string;
  run: RunView | null;
}) {
  const [operand, setOperand] = useState('');
  const [op, setOp] = useState<TriggerSpec['op']>('rise');
  const [value, setValue] = useState('1');
  const [armed, setArmed] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hit = run && armed === run && run.breakHit?.line === 0 ? run.breakHit : null;

  const arm = () => {
    setError(null);
    if (!run) return setError(t('monitor.startSim'));
    const target = resolveOperand(project, operand.trim());
    if ('error' in target) return setError(target.error);
    const v = /^true$/i.test(value) ? 1 : /^false$/i.test(value) ? 0 : Number(value);
    if (op !== 'rise' && op !== 'fall' && !Number.isFinite(v))
      return setError(t('trigger.badValue'));
    run.setTrigger({
      cpu: cpuId,
      target:
        target.kind === 'address'
          ? { address: target.address }
          : target.kind === 'slot'
            ? { slot: target.name }
            : { instance: target.name, field: target.field },
      op,
      value: Number.isFinite(v) ? v : 0,
    });
    setArmed(run);
  };
  const disarm = () => {
    run?.setTrigger(null);
    setArmed(null);
  };

  return (
    <div className="trigger-bar">
      <b>{t('trigger.title')}</b>
      <input
        className="mono"
        value={operand}
        placeholder={'"Zaehler".CV'}
        spellCheck={false}
        aria-label={t('trigger.operand')}
        onChange={(e) => setOperand(e.target.value)}
      />
      <select value={op} onChange={(e) => setOp(e.target.value as TriggerSpec['op'])}>
        {OPS.map((o) => (
          <option key={o} value={o}>
            {o === 'rise' ? t('trigger.rise') : o === 'fall' ? t('trigger.fall') : o}
          </option>
        ))}
      </select>
      {op !== 'rise' && op !== 'fall' && (
        <input
          className="mono trigger-value"
          value={value}
          aria-label={t('trigger.value')}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {armed && armed === run && !hit ? (
        <>
          <span className="trigger-armed">● {t('trigger.armed')}</span>
          <button className="btn btn-small" onClick={disarm}>
            {t('trigger.disarm')}
          </button>
        </>
      ) : (
        <button className="btn btn-small btn-primary" onClick={arm} disabled={!operand.trim()}>
          {t('trigger.arm')}
        </button>
      )}
      {hit && (
        <span className="trigger-hit">
          ⏸ {t('trigger.hit', { time: (hit.time / 1000).toFixed(3) })}
        </span>
      )}
      {error && <span className="pe-error">{error}</span>}
    </div>
  );
}
