import type { Text } from '@zyklus/sim-core';
import sps from '../../../../docs/grundkurs/01-sps.md?raw';
import signale from '../../../../docs/grundkurs/02-signale.md?raw';
import schrank from '../../../../docs/grundkurs/03-schrank.md?raw';
import logik from '../../../../docs/grundkurs/04-logik.md?raw';
import zyklus from '../../../../docs/grundkurs/05-zyklus.md?raw';
import speichern from '../../../../docs/grundkurs/06-speichern.md?raw';
import flanken from '../../../../docs/grundkurs/07-flanken.md?raw';
import zeiten from '../../../../docs/grundkurs/08-zeiten.md?raw';
import zaehler from '../../../../docs/grundkurs/09-zaehler.md?raw';
import schrittketten from '../../../../docs/grundkurs/10-schrittketten.md?raw';
import los from '../../../../docs/grundkurs/11-los.md?raw';
import spsEn from '../../../../docs/en/grundkurs/01-sps.md?raw';
import signaleEn from '../../../../docs/en/grundkurs/02-signale.md?raw';
import schrankEn from '../../../../docs/en/grundkurs/03-schrank.md?raw';
import logikEn from '../../../../docs/en/grundkurs/04-logik.md?raw';
import zyklusEn from '../../../../docs/en/grundkurs/05-zyklus.md?raw';
import speichernEn from '../../../../docs/en/grundkurs/06-speichern.md?raw';
import flankenEn from '../../../../docs/en/grundkurs/07-flanken.md?raw';
import zeitenEn from '../../../../docs/en/grundkurs/08-zeiten.md?raw';
import zaehlerEn from '../../../../docs/en/grundkurs/09-zaehler.md?raw';
import schrittkettenEn from '../../../../docs/en/grundkurs/10-schrittketten.md?raw';
import losEn from '../../../../docs/en/grundkurs/11-los.md?raw';

/**
 * Grundkurs für Einsteiger ohne SPS-Vorwissen: kurze Lektionen (Seiten in `docs/grundkurs`,
 * getrennt durch `<!-- Seite -->`) mit je einem kleinen Quiz.
 */

export interface Question {
  q: Text;
  options: Text[];
  /** Index der richtigen Antwort */
  correct: number;
  /** Erklärung nach dem Antworten */
  why: Text;
}

export interface Lesson {
  id: string;
  title: Text;
  de: string;
  en: string;
  quiz: Question[];
}

const PAGE = /^<!-- Seite -->\s*$/m;

/** Seiten einer Lektion in der Anzeigesprache */
export const pagesOf = (l: Lesson, en: boolean): string[] =>
  (en ? l.en : l.de)
    .split(PAGE)
    .map((p) => p.trim())
    .filter(Boolean);

const T = (de: string, en: string): Text => ({ de, en });

export const LESSONS: Lesson[] = [
  {
    id: 'sps',
    title: T('Was ist eine SPS?', 'What is a PLC?'),
    de: sps,
    en: spsEn,
    quiz: [
      {
        q: T(
          'Was macht eine SPS in jedem Zyklus zuerst?',
          'What does a PLC do first in every cycle?',
        ),
        options: [
          T('Ausgänge schreiben', 'Write outputs'),
          T('Eingänge lesen', 'Read inputs'),
          T('Auf einen Tastendruck warten', 'Wait for a button press'),
        ],
        correct: 1,
        why: T(
          'Erst Eingänge lesen, dann das Programm abarbeiten, dann Ausgänge schreiben – und wieder von vorn.',
          'First read inputs, then run the program, then write outputs – and start over.',
        ),
      },
      {
        q: T(
          'Wie ändert man das Verhalten einer Maschine mit SPS?',
          'How do you change the behaviour of a machine with a PLC?',
        ),
        options: [
          T('Neu verdrahten', 'Rewire it'),
          T('Das Programm ändern', 'Change the program'),
          T('Eine größere CPU stecken', 'Fit a bigger CPU'),
        ],
        correct: 1,
        why: T(
          'Genau dafür gibt es die SPS: Das Verhalten steckt im Programm, nicht in der Verdrahtung.',
          'That is what the PLC is for: the behaviour is in the program, not in the wiring.',
        ),
      },
    ],
  },
  {
    id: 'signale',
    title: T('Signale, Sensoren, Aktoren', 'Signals, sensors, actuators'),
    de: signale,
    en: signaleEn,
    quiz: [
      {
        q: T('Was ist ein Motor für die SPS?', 'What is a motor for the PLC?'),
        options: [
          T('Ein Sensor an einem Eingang', 'A sensor on an input'),
          T('Ein Aktor an einem Ausgang', 'An actuator on an output'),
          T('Ein Teil der CPU', 'Part of the CPU'),
        ],
        correct: 1,
        why: T(
          'Aktoren tun etwas und hängen an Ausgängen.',
          'Actuators do something and are connected to outputs.',
        ),
      },
      {
        q: T(
          'Ein Not-Halt ist ein Öffner. Welchen Wert liefert er, wenn niemand ihn drückt?',
          'An emergency stop is NC. Which value does it deliver when nobody presses it?',
        ),
        options: [T('0', '0'), T('1', '1')],
        correct: 1,
        why: T(
          'Ein Öffner liefert 1, solange er nicht betätigt ist. Kabelbruch oder Drücken ergeben 0 – die Anlage hält sicher an.',
          'An NC contact delivers 1 while not actuated. A broken cable or pressing gives 0 – the plant stops safely.',
        ),
      },
    ],
  },
  {
    id: 'schrank',
    title: T('Schaltschrank und Adressen', 'Cabinet and addresses'),
    de: schrank,
    en: schrankEn,
    quiz: [
      {
        q: T('Was bedeutet %Q0.1?', 'What does %Q0.1 mean?'),
        options: [
          T('Eingang, Byte 0, Bit 1', 'Input, byte 0, bit 1'),
          T('Ausgang, Byte 0, Bit 1', 'Output, byte 0, bit 1'),
          T('Ein Merker', 'A memory bit'),
        ],
        correct: 1,
        why: T(
          '%I steht für Eingänge, %Q für Ausgänge, %M für Merker.',
          '%I stands for inputs, %Q for outputs, %M for memory bits.',
        ),
      },
      {
        q: T(
          'Woher kommen im Spiel die Namen wie "Taster"?',
          'Where do names like "Taster" come from in the game?',
        ),
        options: [
          T('Man muss sie selbst erfinden', 'You have to invent them yourself'),
          T(
            'Aus der Variablentabelle, die beim Verdrahten entsteht',
            'From the tag table created by wiring',
          ),
        ],
        correct: 1,
        why: T(
          'Beim Verdrahten legt das Spiel für jedes Gerät einen Namen in den PLC-Variablen an.',
          'When wiring, the game creates a name for every device in the PLC tags.',
        ),
      },
    ],
  },
  {
    id: 'logik',
    title: T('UND, ODER, NICHT', 'AND, OR, NOT'),
    de: logik,
    en: logikEn,
    quiz: [
      {
        q: T('A = 1, B = 0. Was ergibt A AND B?', 'A = 1, B = 0. What is A AND B?'),
        options: [T('0', '0'), T('1', '1')],
        correct: 0,
        why: T('UND ist nur 1, wenn beide 1 sind.', 'AND is only 1 when both are 1.'),
      },
      {
        q: T(
          'Eine Lampe soll leuchten, wenn Taster S1 oder S2 gedrückt ist. Welche Zeile stimmt?',
          'A lamp should light when button S1 or S2 is pressed. Which line is right?',
        ),
        options: [
          T('"Lampe" := "S1" AND "S2";', '"Lampe" := "S1" AND "S2";'),
          T('"Lampe" := "S1" OR "S2";', '"Lampe" := "S1" OR "S2";'),
          T('"Lampe" := NOT "S1";', '"Lampe" := NOT "S1";'),
        ],
        correct: 1,
        why: T(
          '„Oder“ heißt OR: mindestens einer muss 1 sein.',
          '“Or” means OR: at least one has to be 1.',
        ),
      },
    ],
  },
  {
    id: 'zyklus',
    title: T('Der Zyklus und IF', 'The cycle and IF'),
    de: zyklus,
    en: zyklusEn,
    quiz: [
      {
        q: T(
          'Ein Ausgang wird im Programm zweimal zugewiesen. Was gilt?',
          'An output is assigned twice in the program. What applies?',
        ),
        options: [
          T('Die erste Zuweisung', 'The first assignment'),
          T('Die letzte Zuweisung', 'The last assignment'),
          T('Beide abwechselnd', 'Both alternately'),
        ],
        correct: 1,
        why: T(
          'Die Ausgänge werden erst am Ende des Zyklus geschrieben – der letzte Wert gewinnt.',
          'Outputs are written only at the end of the cycle – the last value wins.',
        ),
      },
      {
        q: T(
          'IF "Taster" THEN "Lampe" := TRUE; END_IF; – was passiert nach dem Loslassen?',
          'IF "Taster" THEN "Lampe" := TRUE; END_IF; – what happens after releasing?',
        ),
        options: [
          T('Die Lampe geht aus', 'The lamp goes off'),
          T('Die Lampe bleibt an', 'The lamp stays on'),
        ],
        correct: 1,
        why: T(
          'Ohne ELSE wird die Lampe nie zurückgesetzt – sie behält ihren Wert.',
          'Without ELSE the lamp is never reset – it keeps its value.',
        ),
      },
    ],
  },
  {
    id: 'speichern',
    title: T('Setzen und Rücksetzen', 'Set and reset'),
    de: speichern,
    en: speichernEn,
    quiz: [
      {
        q: T(
          'Start und Stopp werden gleichzeitig gedrückt. Was soll bei einer Maschine passieren?',
          'Start and stop are pressed at the same time. What should happen on a machine?',
        ),
        options: [
          T('Sie läuft (Setzen gewinnt)', 'It runs (set wins)'),
          T('Sie steht (Rücksetzen gewinnt)', 'It stops (reset wins)'),
        ],
        correct: 1,
        why: T(
          'Sicherheit zuerst: rücksetzdominant. In SCL steht das Rücksetzen deshalb unten.',
          'Safety first: reset-dominant. In SCL the reset therefore comes last.',
        ),
      },
      {
        q: T(
          'Wo merkt man sich einen Wert über mehrere Zyklen?',
          'Where do you keep a value over several cycles?',
        ),
        options: [
          T('In einer Temp-Variablen des OB', 'In a temp variable of the OB'),
          T('In einem Datenbaustein oder Merker', 'In a data block or memory bit'),
        ],
        correct: 1,
        why: T(
          'Temp-Variablen sind nur während eines Zyklus gültig.',
          'Temp variables are only valid during one cycle.',
        ),
      },
    ],
  },
  {
    id: 'flanken',
    title: T('Flanken', 'Edges'),
    de: flanken,
    en: flankenEn,
    quiz: [
      {
        q: T(
          'Warum schaltet NOT "Lampe" ohne Flanke zufällig?',
          'Why does NOT "Lampe" toggle randomly without an edge?',
        ),
        options: [
          T('Weil der Taster prellt', 'Because the button bounces'),
          T('Weil ein Tastendruck viele Zyklen dauert', 'Because a button press lasts many cycles'),
        ],
        correct: 1,
        why: T(
          'Bei 10 ms Zyklus ist ein Druck von 200 ms 20 Zyklen lang 1 – die Lampe wechselt 20-mal.',
          'With a 10 ms cycle a 200 ms press is 1 for 20 cycles – the lamp toggles 20 times.',
        ),
      },
      {
        q: T(
          'Wie lange ist R_TRIG.Q nach einer steigenden Flanke 1?',
          'How long is R_TRIG.Q 1 after a rising edge?',
        ),
        options: [
          T('Solange der Taster gedrückt ist', 'As long as the button is pressed'),
          T('Genau einen Zyklus', 'Exactly one cycle'),
          T('Eine Sekunde', 'One second'),
        ],
        correct: 1,
        why: T(
          'Eine Flanke ist ein Moment: genau ein Zyklus lang 1.',
          'An edge is a moment: 1 for exactly one cycle.',
        ),
      },
    ],
  },
  {
    id: 'zeiten',
    title: T('Zeiten', 'Timers'),
    de: zeiten,
    en: zeitenEn,
    quiz: [
      {
        q: T(
          'Ein Lüfter soll nach dem Ausschalten noch 30 s laufen. Welche Zeit?',
          'A fan should keep running 30 s after switching off. Which timer?',
        ),
        options: [T('TON', 'TON'), T('TOF', 'TOF'), T('TP', 'TP')],
        correct: 1,
        why: T(
          'TOF ist die Ausschaltverzögerung: Q bleibt nach dem Ende von IN noch PT lang 1.',
          'TOF is the off-delay: Q stays 1 for PT after IN ends.',
        ),
      },
      {
        q: T(
          'Was passiert, wenn man einen TON nur in einem IF aufruft?',
          'What happens if you call a TON only inside an IF?',
        ),
        options: [
          T('Nichts Besonderes', 'Nothing special'),
          T(
            'Die Zeit läuft nur, solange das IF ausgeführt wird',
            'The time only runs while the IF is executed',
          ),
        ],
        correct: 1,
        why: T(
          'Zeitbausteine müssen jeden Zyklus aufgerufen werden.',
          'Timer blocks have to be called every cycle.',
        ),
      },
    ],
  },
  {
    id: 'zaehler',
    title: T('Zähler und Vergleiche', 'Counters and comparisons'),
    de: zaehler,
    en: zaehlerEn,
    quiz: [
      {
        q: T(
          'Ein CTU hat PV := 10. Wann wird Q zu 1?',
          'A CTU has PV := 10. When does Q become 1?',
        ),
        options: [
          T('Beim ersten Teil', 'At the first part'),
          T('Sobald CV mindestens 10 ist', 'As soon as CV is at least 10'),
        ],
        correct: 1,
        why: T('Q = CV >= PV.', 'Q = CV >= PV.'),
      },
      {
        q: T(
          'Wozu dient die Hysterese bei einer Pumpe (an unter 40 %, aus über 70 %)?',
          'What is the hysteresis of a pump for (on below 40 %, off above 70 %)?',
        ),
        options: [
          T(
            'Damit die Pumpe nicht ständig an- und ausgeht',
            'So the pump does not switch on and off all the time',
          ),
          T('Damit der Tank überläuft', 'So the tank overflows'),
        ],
        correct: 0,
        why: T(
          'Mit nur einem Grenzwert würde die Pumpe um diesen Wert herum flattern.',
          'With only one limit the pump would chatter around that value.',
        ),
      },
    ],
  },
  {
    id: 'schrittketten',
    title: T('Schrittketten', 'Step sequences'),
    de: schrittketten,
    en: schrittkettenEn,
    quiz: [
      {
        q: T(
          'Wie viele Schritte einer Kette sind gleichzeitig aktiv?',
          'How many steps of a sequence are active at the same time?',
        ),
        options: [
          T('Genau einer', 'Exactly one'),
          T('Beliebig viele', 'Any number'),
          T('Keiner', 'None'),
        ],
        correct: 0,
        why: T(
          'Das ist der Kern der Schrittkette – und mit einer Schrittnummer automatisch erfüllt.',
          'That is the core of a step sequence – and automatic with a step number.',
        ),
      },
      {
        q: T('Was ist eine Transition?', 'What is a transition?'),
        options: [
          T('Ein Ausgang, der in einem Schritt an ist', 'An output that is on in a step'),
          T(
            'Die Bedingung, um zum nächsten Schritt zu gehen',
            'The condition to go to the next step',
          ),
          T('Die Nummer des aktiven Schritts', 'The number of the active step'),
        ],
        correct: 1,
        why: T(
          'Schritt = Zustand, Aktion = was an ist, Transition = wann es weitergeht.',
          'Step = state, action = what is on, transition = when to move on.',
        ),
      },
      {
        q: T(
          'Die Kette läuft mehrmals hintereinander, solange Start gedrückt ist. Was fehlt?',
          'The sequence runs several times in a row while Start is held. What is missing?',
        ),
        options: [
          T('Eine Flanke am Start', 'An edge on Start'),
          T('Ein zweiter Schritt', 'A second step'),
          T('Eine größere CPU', 'A bigger CPU'),
        ],
        correct: 0,
        why: T(
          'Mit R_TRIG startet die Kette nur einmal pro Tastendruck.',
          'With R_TRIG the sequence starts only once per button press.',
        ),
      },
    ],
  },
  {
    id: 'los',
    title: T('Dein erster Auftrag', 'Your first job'),
    de: los,
    en: losEn,
    quiz: [],
  },
];
