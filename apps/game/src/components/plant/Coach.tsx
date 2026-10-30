import { moduleType } from '@zyklus/sim-core';
import type { Layout } from '@zyklus/plant-sim';
import { t } from '../../i18n';
import { plantOf } from '../../sim/types';
import type { SlotContext } from '../../screens/LevelScreen';

/** Ein Schritt des geführten Einstiegs; `done` erkennt, dass er erledigt ist */
interface Step {
  title: string;
  text: string;
  hint?: string;
  done: (layout: Layout, ctx: SlotContext) => boolean;
}

const has = (layout: Layout, type: string) => layout.parts.some((p) => p.type === type);
const moduleKinds = (ctx: SlotContext) => ctx.solution.modules.map((m) => moduleType(m.type).kind);

export const COACH_STEPS: Step[] = [
  {
    title: 'Förderband aufstellen',
    text: 'Zieh aus der Bibliothek links ein **Förderband** auf die Fläche (oder klick es an).',
    hint: 'Mit dem Mausrad zoomst du, mit gedrückter Maus auf freier Fläche verschiebst du die Ansicht.',
    done: (l) => has(l, 'belt'),
  },
  {
    title: 'Sensor am Band',
    text: 'Stell einen **Induktiven Sensor** neben das Band. Drück **R**, bis die Erfassungszone über das Band zeigt.',
    hint: 'Die halbtransparente Zone zeigt, wo der Sensor erkennt. Im Inspektor rechts stellst du den Schaltabstand ein.',
    done: (l) => has(l, 'inductive'),
  },
  {
    title: 'Schalter zum Einschalten',
    text: 'Unter **Bedienelemente** gibt es einen **Schalter**. Stell ihn irgendwo hin – damit schaltest du das Band später ein.',
    done: (l) => has(l, 'switch'),
  },
  {
    title: 'CPU stecken',
    text: 'Wechsle zum Tab **Schaltschrank** und steck eine **CPU klein** auf die Hutschiene.',
    hint: 'Die Feldgeräte deiner Anlage hängen schon am Rand des Schranks: Eingänge links, Ausgänge rechts.',
    done: (_, c) => moduleKinds(c).includes('cpu'),
  },
  {
    title: 'Ein- und Ausgänge',
    text: 'Steck rechts neben die CPU eine **DI 8** für Sensor und Schalter und ein **REL 4** – der Bandmotor ist ein Leistungsverbraucher und braucht ein Relais.',
    done: (_, c) => {
      const k = moduleKinds(c);
      return k.includes('rel') && (k.includes('di') || k.includes('dio'));
    },
  },
  {
    title: 'Verdrahten',
    text: 'Klick ein Gerät am Schrankrand an und dann eine freie Klemme – oder im Tab **Signale** auf **Automatisch verdrahten**.',
    hint: 'Beim Verdrahten legt das Spiel die PLC-Variablen an, z. B. „M1_Bandmotor“ und „S1_Schalter“.',
    done: (_, c) => c.analysis.bindings.size > 0 && c.solution.wires.length >= 3,
  },
  {
    title: 'Programm schreiben',
    text: 'Schreib rechts im **Programm** (SCL): `"M1_Bandmotor" := "S1_Schalter";`',
    hint: 'Die Namen findest du unter PLC-Variablen. Rote Unterstreichung zeigt Fehler.',
    done: (_, c) => c.compiledOk && c.size > 0,
  },
  {
    title: 'Starten',
    text: 'Unten **▶ Start** drücken und in der Anlage auf den **Schalter** klicken. Das Band läuft – leg mit Rechtsklick ein Werkstück darauf.',
    done: (l, c) => {
      const p = plantOf(c.run);
      const belt = l.parts.find((x) => x.type === 'belt');
      return !!p && !!belt && p.world.st(belt).speed !== 0;
    },
  },
];

interface Props {
  step: number;
  layout: Layout;
  ctx: SlotContext;
  onStep: (n: number) => void;
  onClose: () => void;
}

/** einfache Hervorhebung: **fett** und `Code` */
function rich(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, i) =>
      part.startsWith('**') ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : part.startsWith('`') ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

/** geführter Einstieg: schwebende Karte, die erledigte Schritte selbst erkennt */
export function Coach({ step, layout, ctx, onStep, onClose }: Props) {
  if (step >= COACH_STEPS.length) {
    return (
      <aside className="coach" aria-live="polite">
        <h3>✓ {t('coach.finished')}</h3>
        <p>{t('coach.finishedText')}</p>
        <div className="coach-actions">
          <button className="btn btn-primary btn-small" onClick={onClose}>
            {t('coach.close')}
          </button>
        </div>
      </aside>
    );
  }
  const s = COACH_STEPS[step]!;
  const done = s.done(layout, ctx);
  return (
    <aside className="coach" aria-live="polite">
      <div className="coach-head">
        <span className="coach-no">
          {step + 1} / {COACH_STEPS.length}
        </span>
        <h3>{s.title}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('coach.close')}>
          ✕
        </button>
      </div>
      <p>{rich(s.text)}</p>
      {s.hint && <p className="muted coach-hint">{rich(s.hint)}</p>}
      <div className="coach-progress">
        {COACH_STEPS.map((_, i) => (
          <span
            key={i}
            className={i < step ? 'coach-dot-done' : i === step ? 'coach-dot-now' : ''}
          />
        ))}
      </div>
      <div className="coach-actions">
        {step > 0 && (
          <button className="btn btn-small" onClick={() => onStep(step - 1)}>
            {t('coach.back')}
          </button>
        )}
        <button
          className={`btn btn-small ${done ? 'btn-primary' : ''}`}
          onClick={() => onStep(step + 1)}
        >
          {done ? `✓ ${t('coach.next')}` : t('coach.skip')}
        </button>
      </div>
    </aside>
  );
}
