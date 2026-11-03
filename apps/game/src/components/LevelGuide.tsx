import { moduleType, tr, type BoardAnalysis, type Solution, type Text } from '@zyklus/sim-core';
import { t } from '../i18n';

/** Zustand des Auftrags, aus dem die Schritte ihren Fortschritt ablesen */
export interface GuideState {
  briefOpen: boolean;
  solution: Solution;
  analysis: BoardAnalysis;
  compiledOk: boolean;
  size: number;
  /** im Testpult lief schon Simulationszeit */
  tested: boolean;
  passed: boolean;
}

interface Step {
  title: Text;
  text: Text;
  done: (s: GuideState) => boolean;
}

/** Schritte der Einführung (Auftrag 0) */
export const GUIDE_STEPS: Step[] = [
  {
    title: { de: 'Auftrag lesen', en: 'Read the job' },
    text: {
      de: 'Lies die Mail und das **Datenblatt** und schließ sie dann – die Knöpfe „Auftrag“ und „Datenblatt“ oben holen sie jederzeit zurück.',
      en: 'Read the mail and the **datasheet**, then close them – the “Job” and “Datasheet” buttons at the top bring them back at any time.',
    },
    done: (s) => !s.briefOpen,
  },
  {
    title: { de: 'CPU stecken', en: 'Plug in the CPU' },
    text: {
      de: 'Wähl im **Schaltschrank** oben die **CPU kompakt** und klick auf die Hutschiene. Sie hat Ein- und Ausgänge eingebaut.',
      en: 'In the **control cabinet** at the top, choose the **CPU kompakt** and click on the DIN rail. It has built-in inputs and outputs.',
    },
    done: (s) => s.solution.modules.some((m) => moduleType(m.type).kind === 'cpu'),
  },
  {
    title: { de: 'Verdrahten', en: 'Wire up' },
    text: {
      de: 'Klick am Schrankrand auf den **Taster S1** und dann auf eine Eingangsklemme (DI), danach auf die **Lampe H1** und eine Ausgangsklemme (DO).',
      en: 'At the cabinet edge, click the **push button S1** and then an input terminal (DI), then the **lamp H1** and an output terminal (DO).',
    },
    done: (s) => s.analysis.bindings.has('S1') && s.analysis.bindings.has('H1'),
  },
  {
    title: { de: 'Programm schreiben', en: 'Write the program' },
    text: {
      de: 'Schreib im **Programm** (OB „Main“, SCL): `"Lampe" := "Taster";` – die Namen stehen unter PLC-Variablen.',
      en: 'Write in the **program** (OB “Main”, SCL): `"Lampe" := "Taster";` – the names are listed under PLC tags.',
    },
    done: (s) => s.compiledOk && s.size > 0,
  },
  {
    title: { de: 'Ausprobieren', en: 'Try it out' },
    text: {
      de: 'Unten im **Testpult**: Testfall wählen und **▶ Start**. Im Zeitdiagramm siehst du Taster und Lampe.',
      en: 'Down in the **test bench**: choose a test case and press **▶ Start**. The timing chart shows button and lamp.',
    },
    done: (s) => s.tested,
  },
  {
    title: { de: 'Abnahme', en: 'Verify' },
    text: {
      de: 'Klick oben auf **Prüfen**. Alle Testfälle laufen durch – danach siehst du Kosten, Energie und Größe im Vergleich.',
      en: 'Click **Verify** at the top. All test cases run – afterwards you see cost, energy and size compared to others.',
    },
    done: (s) => s.passed,
  },
];

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

/** schwebende Schrittkarte; der aktuelle Schritt ist der erste noch nicht erledigte */
export function LevelGuide({ state, onClose }: { state: GuideState; onClose: () => void }) {
  const step = GUIDE_STEPS.findIndex((s) => !s.done(state));
  if (step < 0) {
    return (
      <aside className="coach" aria-live="polite">
        <h3>✓ {t('coach.finished')}</h3>
        <p>
          {tr({
            de: 'Geschafft! Zurück im Posteingang wartet der erste echte Auftrag.',
            en: 'Done! Back in the inbox the first real job is waiting.',
          })}
        </p>
        <div className="coach-actions">
          <button className="btn btn-primary btn-small" onClick={onClose}>
            {t('coach.close')}
          </button>
        </div>
      </aside>
    );
  }
  const s = GUIDE_STEPS[step]!;
  return (
    <aside className="coach" aria-live="polite" aria-label={t('guide.title')}>
      <div className="coach-head">
        <span className="coach-no">
          {step + 1} / {GUIDE_STEPS.length}
        </span>
        <h3>{tr(s.title)}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('coach.close')}>
          ✕
        </button>
      </div>
      <p>{rich(tr(s.text))}</p>
      <div className="coach-progress">
        {GUIDE_STEPS.map((_, i) => (
          <span
            key={i}
            className={i < step ? 'coach-dot-done' : i === step ? 'coach-dot-now' : ''}
          />
        ))}
      </div>
    </aside>
  );
}
