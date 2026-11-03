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
  alarms: readonly AlarmEntry[];
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
}: Props) {
  const active = new Map<number, AlarmEntry>();
  for (const a of [...alarms].reverse()) {
    if (a.coming) active.set(a.inst, a);
    else active.delete(a.inst);
  }
  return (
    <div className="hmi" role="group" aria-label={t('hmi.title')}>
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
          </div>
          {alarms.length === 0 && <div className="muted">{t('hmi.noAlarms')}</div>}
          {alarms.slice(0, 6).map((a, i) => (
            <div
              key={i}
              className={`hmi-alarm ${a.coming && active.get(a.inst) === a ? 'hmi-alarm-active' : ''}`}
            >
              <span className="mono">{time(a.time)}</span> {a.coming ? '▲' : '▽'} {a.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
