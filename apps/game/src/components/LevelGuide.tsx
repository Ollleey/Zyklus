import { moduleType, type BoardAnalysis, type Solution } from '@zyklus/sim-core';
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
  title: string;
  text: string;
  done: (s: GuideState) => boolean;
}

/** Schritte der Einführung (Auftrag 0) */
export const GUIDE_STEPS: Step[] = [
  {
    title: 'Auftrag lesen',
    text: 'Lies die Mail und das **Datenblatt** und schließ sie dann – die Knöpfe „Auftrag“ und „Datenblatt“ oben holen sie jederzeit zurück.',
    done: (s) => !s.briefOpen,
  },
  {
    title: 'CPU stecken',
    text: 'Wähl im **Schaltschrank** oben die **CPU kompakt** und klick auf die Hutschiene. Sie hat Ein- und Ausgänge eingebaut.',
    done: (s) => s.solution.modules.some((m) => moduleType(m.type).kind === 'cpu'),
  },
  {
    title: 'Verdrahten',
    text: 'Klick am Schrankrand auf den **Taster S1** und dann auf eine Eingangsklemme (DI), danach auf die **Lampe H1** und eine Ausgangsklemme (DO).',
    done: (s) => s.analysis.bindings.has('S1') && s.analysis.bindings.has('H1'),
  },
  {
    title: 'Programm schreiben',
    text: 'Schreib im **Programm** (OB „Main“, SCL): `"Lampe" := "Taster";` – die Namen stehen unter PLC-Variablen.',
    done: (s) => s.compiledOk && s.size > 0,
  },
  {
    title: 'Ausprobieren',
    text: 'Unten im **Testpult**: Testfall wählen und **▶ Start**. Im Zeitdiagramm siehst du Taster und Lampe.',
    done: (s) => s.tested,
  },
  {
    title: 'Abnahme',
    text: 'Klick oben auf **Abnahme**. Alle Testfälle laufen durch – danach siehst du Kosten, Energie und Größe im Vergleich.',
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
        <p>Geschafft! Zurück im Posteingang wartet der erste echte Auftrag.</p>
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
        <h3>{s.title}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('coach.close')}>
          ✕
        </button>
      </div>
      <p>{rich(s.text)}</p>
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
