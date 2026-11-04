import { moduleType, tr, type BoardAnalysis, type Solution, type Text } from '@zyklus/sim-core';
import { t } from '../i18n';
import { isBeginner } from '../state/course';

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
  /** zusätzliche Erklärung für Einsteiger (Grundkurs gewählt) */
  beginner: Text;
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
    beginner: {
      de: 'Die **Mail** sagt, was die Kundschaft will. Das **Datenblatt** listet die Geräte der Anlage – hier ein Taster S1 (Eingang) und eine Lampe H1 (Ausgang). Das Ziel: Solange S1 gedrückt ist, leuchtet H1.',
      en: 'The **mail** says what the customer wants. The **datasheet** lists the devices of the plant – here a push button S1 (input) and a lamp H1 (output). The goal: while S1 is pressed, H1 is lit.',
    },
    done: (s) => !s.briefOpen,
  },
  {
    title: { de: 'CPU stecken', en: 'Plug in the CPU' },
    text: {
      de: 'Wähl im **Schaltschrank** oben die **CPU kompakt** und klick auf die Hutschiene. Sie hat Ein- und Ausgänge eingebaut.',
      en: 'In the **control cabinet** at the top, choose the **CPU kompakt** and click on the DIN rail. It has built-in inputs and outputs.',
    },
    beginner: {
      de: 'Die **CPU** ist die SPS selbst – der Rechner, auf dem dein Programm läuft. Oben im Schaltschrank stehen alle Baugruppen; klick die CPU kompakt an und dann auf die graue Schiene. Die Zahl mit ¤ ist der Preis.',
      en: 'The **CPU** is the PLC itself – the computer your program runs on. At the top of the cabinet you see all modules; click the CPU kompakt and then the grey rail. The number with ¤ is the price.',
    },
    done: (s) => s.solution.modules.some((m) => moduleType(m.type).kind === 'cpu'),
  },
  {
    title: { de: 'Verdrahten', en: 'Wire up' },
    text: {
      de: 'Klick am Schrankrand auf den **Taster S1** und dann auf eine Eingangsklemme (DI), danach auf die **Lampe H1** und eine Ausgangsklemme (DO).',
      en: 'At the cabinet edge, click the **push button S1** and then an input terminal (DI), then the **lamp H1** and an output terminal (DO).',
    },
    beginner: {
      de: 'Ein Draht verbindet ein Gerät mit einer **Klemme**. Taster und Sensoren gehören an **DI** (Eingänge), Lampen und Motoren an **DO** (Ausgänge). Die Klemmen sind an der CPU beschriftet, z. B. I0.0 und Q0.0.',
      en: 'A wire connects a device to a **terminal**. Buttons and sensors belong to **DI** (inputs), lamps and motors to **DO** (outputs). The terminals are labelled on the CPU, e.g. I0.0 and Q0.0.',
    },
    done: (s) => s.analysis.bindings.has('S1') && s.analysis.bindings.has('H1'),
  },
  {
    title: { de: 'Programm schreiben', en: 'Write the program' },
    text: {
      de: 'Schreib im **Programm** (OB „Main“, SCL): `"Lampe" := "Taster";` – die Namen stehen unter PLC-Variablen.',
      en: 'Write in the **program** (OB “Main”, SCL): `"Lampe" := "Taster";` – the names are listed under PLC tags.',
    },
    beginner: {
      de: 'Die Zeile heißt: „Die Lampe bekommt den Wert des Tasters.“ `:=` ist die Zuweisung, das `;` beendet sie. Die Namen in Anführungszeichen kommen aus den PLC-Variablen – schreib sie genau so. Unten unter **Meldungen** steht, ob alles passt.',
      en: 'The line means: “The lamp gets the value of the button.” `:=` is the assignment, the `;` ends it. The names in quotes come from the PLC tags – write them exactly like that. Below under **Messages** it says whether everything is fine.',
    },
    done: (s) => s.compiledOk && s.size > 0,
  },
  {
    title: { de: 'Ausprobieren', en: 'Try it out' },
    text: {
      de: 'Unten im **Testpult**: Testfall wählen und **▶ Start**. Im Zeitdiagramm siehst du Taster und Lampe.',
      en: 'Down in the **test bench**: choose a test case and press **▶ Start**. The timing chart shows button and lamp.',
    },
    beginner: {
      de: 'Ein **Testfall** drückt den Taster automatisch nach einem Plan. Im **Zeitdiagramm** ist jede Zeile ein Signal: oben = 1, unten = 0. Geht die Lampenlinie mit der Tasterlinie hoch und runter, stimmt dein Programm.',
      en: 'A **test case** presses the button automatically according to a plan. In the **timing chart** every row is a signal: up = 1, down = 0. If the lamp line goes up and down with the button line, your program is right.',
    },
    done: (s) => s.tested,
  },
  {
    title: { de: 'Abnahme', en: 'Verify' },
    text: {
      de: 'Klick oben auf **Prüfen**. Alle Testfälle laufen durch – danach siehst du Kosten, Energie und Größe im Vergleich.',
      en: 'Click **Verify** at the top. All test cases run – afterwards you see cost, energy and size compared to others.',
    },
    beginner: {
      de: 'Bei der **Abnahme** prüft das Spiel alle Testfälle. Danach siehst du, wie günstig (Kosten), sparsam (Energie) und kurz (Größe) deine Lösung im Vergleich ist – optimieren kannst du später.',
      en: 'At **verification** the game checks all test cases. Afterwards you see how cheap (cost), economical (energy) and short (size) your solution is compared to others – you can optimise later.',
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
      {isBeginner() && <p className="coach-more">💡 {rich(tr(s.beginner))}</p>}
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
