import { useState } from 'react';
import { tr, type AlarmEntry, type Device } from '@zyklus/sim-core';
import { t } from '../i18n';

interface Props {
  devices: Device[];
  values: Map<string, boolean | number>;
  manual: boolean;
  actuated: (device: string) => boolean;
  onActuate: (device: string, v: boolean) => void;
  analogValue: (device: string) => number;
  onAnalog: (device: string, v: number) => void;
  alarms: readonly (AlarmEntry & { unacked?: boolean })[];
  onAcknowledge?: () => void;
  /** Merkeradresse je Element; mit `onAddress` änderbar */
  addresses?: Map<string, string>;
  onAddress?: (device: string, address: string) => void;
}

const time = (ms: number) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

/**
 * Bedienpanel: Taster, Schalter und Eingabefelder schreiben in Merker der CPU, Lampen und
 * Anzeigen lesen sie; darunter die Meldungen aus dem Programm (Program_Alarm).
 */
export function HmiPanel({
  devices,
  values,
  manual,
  actuated,
  onActuate,
  analogValue,
  onAnalog,
  alarms,
  onAcknowledge,
  addresses,
  onAddress,
}: Props) {
  const [setup, setSetup] = useState(false);
  const unacked = alarms.filter((a) => a.unacked).length;
  const active = new Map<number, AlarmEntry>();
  for (const a of [...alarms].reverse()) {
    if (a.coming) active.set(a.inst, a);
    else active.delete(a.inst);
  }
  return (
    <div className="hmi" role="group" aria-label={t('hmi.title')}>
      {onAddress && devices.length > 0 && (
        <div className="hmi-setup">
          <button
            className="btn btn-small"
            aria-expanded={setup}
            title={t('hmi.addressesHint')}
            onClick={() => setSetup(!setup)}
          >
            ⚙ {t('hmi.addresses')}
          </button>
          {setup && (
            <table className="var-table">
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td>{tr(d.name)}</td>
                    <td className="mono muted">{d.tag}</td>
                    <td>
                      <input
                        className="mono"
                        defaultValue={addresses?.get(d.id) ?? ''}
                        spellCheck={false}
                        aria-label={`${t('table.address')} ${tr(d.name)}`}
                        onBlur={(e) => onAddress(d.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="hmi-screen">
        <div className="hmi-elements">
          {devices.map((d) => {
            const label = tr(d.name);
            if (d.kind === 'DI') {
              const pressed = manual && actuated(d.id);
              const isSwitch = d.role === 'switch';
              return (
                <button
                  key={d.id}
                  className={`hmi-button ${values.get(d.id) === true || pressed ? 'hmi-button-down' : ''}`}
                  disabled={!manual}
                  title={manual ? '' : t('hmi.manualOnly')}
                  onClick={() => manual && isSwitch && onActuate(d.id, !pressed)}
                  onPointerDown={() => manual && !isSwitch && onActuate(d.id, true)}
                  onPointerUp={() => manual && !isSwitch && onActuate(d.id, false)}
                  onPointerLeave={() => manual && !isSwitch && pressed && onActuate(d.id, false)}
                >
                  {label}
                </button>
              );
            }
            if (d.kind === 'DO') {
              const on = values.get(d.id) === true;
              return (
                <span key={d.id} className="hmi-lamp">
                  <span className={`hmi-lamp-dot ${on ? 'hmi-lamp-on' : ''}`} aria-hidden="true" />
                  {label}
                </span>
              );
            }
            const unit = d.analog?.unit ?? '';
            if (d.kind === 'AI') {
              return (
                <label key={d.id} className="hmi-field">
                  {label}
                  <input
                    type="number"
                    disabled={!manual}
                    min={d.analog?.min}
                    max={d.analog?.max}
                    value={manual ? analogValue(d.id) : Number(values.get(d.id) ?? 0)}
                    onChange={(e) => onAnalog(d.id, Number(e.target.value) || 0)}
                  />
                  {unit}
                </label>
              );
            }
            return (
              <span key={d.id} className="hmi-field">
                {label}
                <output className="hmi-output">{Number(values.get(d.id) ?? 0)}</output>
                {unit}
              </span>
            );
          })}
        </div>
        <div className="hmi-alarms" aria-label={t('hmi.alarms')}>
          <div className="hmi-alarms-title">
            {t('hmi.alarms')} ({active.size})
            {onAcknowledge && (
              <button
                className={`btn btn-small hmi-ack ${unacked ? 'btn-primary' : ''}`}
                disabled={!unacked}
                title={t('hmi.ackHint')}
                onClick={onAcknowledge}
              >
                {t('hmi.ack')}
                {unacked ? ` (${unacked})` : ''}
              </button>
            )}
          </div>
          {alarms.length === 0 && <div className="muted">{t('hmi.noAlarms')}</div>}
          {alarms.slice(0, 6).map((a, i) => (
            <div
              key={i}
              className={`hmi-alarm ${a.coming && active.get(a.inst) === a ? 'hmi-alarm-active' : ''} ${a.unacked ? 'hmi-alarm-unacked' : ''}`}
            >
              <span className="mono">{time(a.time)}</span> {a.coming ? '▲' : '▽'}
              {a.unacked ? ' !' : ''} {a.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
