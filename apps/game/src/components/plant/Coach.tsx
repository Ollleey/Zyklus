import { moduleType, tr, type Text } from '@zyklus/sim-core';
import type { Layout } from '@zyklus/plant-sim';
import { t } from '../../i18n';
import { plantOf } from '../../sim/types';
import type { SlotContext } from '../../screens/LevelScreen';

/** Ein Schritt des geführten Einstiegs; `done` erkennt, dass er erledigt ist */
interface Step {
  title: Text;
  text: Text;
  hint?: Text;
  done: (layout: Layout, ctx: SlotContext) => boolean;
}

const has = (layout: Layout, type: string) => layout.parts.some((p) => p.type === type);
const moduleKinds = (ctx: SlotContext) => ctx.solution.modules.map((m) => moduleType(m.type).kind);

export const COACH_STEPS: Step[] = [
  {
    title: { de: 'Förderband aufstellen', en: 'Place a conveyor' },
    text: {
      de: 'Zieh aus der Bibliothek links ein **Förderband** auf die Fläche (oder klick es an).',
      en: 'Drag a **conveyor** from the library on the left onto the canvas (or click it).',
    },
    hint: {
      de: 'Mit dem Mausrad zoomst du, mit gedrückter Maus auf freier Fläche verschiebst du die Ansicht.',
      en: 'The mouse wheel zooms, dragging on an empty area pans the view.',
    },
    done: (l) => has(l, 'belt'),
  },
  {
    title: { de: 'Sensor am Band', en: 'Sensor at the belt' },
    text: {
      de: 'Stell einen **Induktiven Sensor** neben das Band. Drück **R**, bis die Erfassungszone über das Band zeigt.',
      en: 'Place an **inductive sensor** next to the belt. Press **R** until the detection zone points over the belt.',
    },
    hint: {
      de: 'Die halbtransparente Zone zeigt, wo der Sensor erkennt. Im Inspektor rechts stellst du den Schaltabstand ein.',
      en: 'The translucent zone shows where the sensor detects. In the inspector on the right you set the switching distance.',
    },
    done: (l) => has(l, 'inductive'),
  },
  {
    title: { de: 'Schalter zum Einschalten', en: 'A switch to turn it on' },
    text: {
      de: 'Unter **Bedienelemente** gibt es einen **Schalter**. Stell ihn irgendwo hin – damit schaltest du das Band später ein.',
      en: 'Under **Controls** there is a **switch**. Put it anywhere – you will use it to switch the belt on later.',
    },
    done: (l) => has(l, 'switch'),
  },
  {
    title: { de: 'CPU stecken', en: 'Plug in a CPU' },
    text: {
      de: 'Wechsle zum Tab **Schaltschrank** und steck eine **CPU klein** auf die Hutschiene.',
      en: 'Switch to the **Control cabinet** tab and plug a **CPU klein** onto the DIN rail.',
    },
    hint: {
      de: 'Die Feldgeräte deiner Anlage hängen schon am Rand des Schranks: Eingänge links, Ausgänge rechts.',
      en: 'The field devices of your plant already hang at the edge of the cabinet: inputs left, outputs right.',
    },
    done: (_, c) => moduleKinds(c).includes('cpu'),
  },
  {
    title: { de: 'Ein- und Ausgänge', en: 'Inputs and outputs' },
    text: {
      de: 'Steck rechts neben die CPU eine **DI 8** für Sensor und Schalter und ein **REL 4** – der Bandmotor ist ein Leistungsverbraucher und braucht ein Relais.',
      en: 'Plug a **DI 8** for sensor and switch and a **REL 4** to the right of the CPU – the belt motor is a power consumer and needs a relay.',
    },
    done: (_, c) => {
      const k = moduleKinds(c);
      return k.includes('rel') && (k.includes('di') || k.includes('dio'));
    },
  },
  {
    title: { de: 'Verdrahten', en: 'Wire up' },
    text: {
      de: 'Klick ein Gerät am Schrankrand an und dann eine freie Klemme – oder im Tab **Signale** auf **Automatisch verdrahten**.',
      en: 'Click a device at the cabinet edge and then a free terminal – or in the **Signals** tab click **Wire automatically**.',
    },
    hint: {
      de: 'Beim Verdrahten legt das Spiel die PLC-Variablen an, z. B. „M1_Bandmotor“ und „S1_Schalter“.',
      en: 'When wiring, the game creates the PLC tags, e.g. “M1_Bandmotor” and “S1_Schalter”.',
    },
    done: (_, c) => c.analysis.bindings.size > 0 && c.solution.wires.length >= 3,
  },
  {
    title: { de: 'Programm schreiben', en: 'Write the program' },
    text: {
      de: 'Schreib rechts im **Programm** (SCL): `"M1_Bandmotor" := "S1_Schalter";`',
      en: 'Write in the **program** on the right (SCL): `"M1_Bandmotor" := "S1_Schalter";`',
    },
    hint: {
      de: 'Die Namen findest du unter PLC-Variablen. Rote Unterstreichung zeigt Fehler.',
      en: 'You find the names under PLC tags. A red underline shows errors.',
    },
    done: (_, c) => c.compiledOk && c.size > 0,
  },
  {
    title: { de: 'Starten', en: 'Start' },
    text: {
      de: 'Unten **▶ Start** drücken und in der Anlage auf den **Schalter** klicken. Das Band läuft – leg mit Rechtsklick ein Werkstück darauf.',
      en: 'Press **▶ Start** below and click the **switch** in the plant. The belt runs – right-click to put a workpiece on it.',
    },
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
        <h3>{tr(s.title)}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('coach.close')}>
          ✕
        </button>
      </div>
      <p>{rich(tr(s.text))}</p>
      {s.hint && <p className="muted coach-hint">{rich(tr(s.hint))}</p>}
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
