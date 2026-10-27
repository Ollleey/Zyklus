# Meilensteinplan – Arbeitstitel „ZYKLUS“

Ein PLC-Puzzlespiel: Datenblatt → Module auf Hutschiene setzen → verdrahten → in FUP/SCL programmieren → simulieren → gegen Soll-Verläufe verifizieren → Histogramme.
(Name ist ein Platzhalter; eigene Grafiken, Texte und Level, keine Zachtronics- oder Siemens-Marken.)

## Festgelegte Entscheidungen

| Thema          | Entscheidung                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack          | TypeScript (strict), Vite, React, SVG für Hutschiene/FUP/Zeitdiagramm, Monaco für SCL, Vitest                                                                                                                             |
| Monorepo       | npm workspaces                                                                                                                                                                                                            |
| Sprache        | Deutsch, alle UI-Strings über i18n-Schlüssel (`de.json`), Level-Texte als `{ de: "…" }`-Objekte → Englisch nachrüstbar                                                                                                    |
| Verdrahtung    | Raster-Schaltschrank mit **Kabelkanälen**: Leitungen laufen durch Kanäle mit begrenzter Kapazität; Kanalsegmente belegen Bauplatz. Kreuzen erlaubt, Engpass ist die Kapazität                                             |
| Energie-Metrik | Gewichtete IR-Ops summiert über alle Zyklen und CPUs: Bitlogik/Move 1, INT-Arithmetik/Vergleich 2, Timer/Zähler/Flanken 3, REAL-Ops/NORM_X/SCALE_X 4 (Tabelle zentral in `sim-core/src/metrics/weights.ts`, balancierbar) |

## Repository-Struktur

```
packages/
  sim-core/       reines TS, keine UI: IR, Interpreter, Datentypen, Speicher (I/Q/M/DB/TEMP),
                  CPU-Zyklus, Bus/Koppelmodul, Module, Anlagen-Modelle (Plants), Störungen,
                  Seed-PRNG, Testfall-Runner, Verifikation, Metriken
  scl-compiler/   Lexer + Recursive-Descent-Parser (handgeschrieben) → AST → Typprüfung → IR;
                  deutsche Fehlermeldungen mit Zeile/Spalte; Anweisungszähler
  fup-model/      Datenmodell Netzwerke/Boxen/Pins/Negationen, Validierung, topologische
                  Sortierung → IR; Boxzähler
  levels/         Level-JSON + Referenzlösungen (SCL/FUP) + Test, der jede Referenzlösung
                  gegen ihr Level verifiziert (kleine Abweichung von der Vorgabe: eigenes Paket,
                  weil es sim-core + beide Compiler braucht)
apps/
  game/           React-App: Mail/Datenblatt, Schaltschrank, Editoren, Logic Analyzer,
                  Anlagen-Ansicht, Histogramme, Handbuch, Sandbox, Minispiel
```

## Kern-Semantik (wird in M1 fest dokumentiert, `docs/semantik.md`)

- **Zeit**: globale Simulationszeit in ms-Ticks. Jede CPU startet einen Zyklus, wenn ihre Zykluszeit abgelaufen ist (1/5/10 ms). Ablauf: PAE einlesen → OB1 → PAA schreiben. Eingangssignale, die zwischen zwei PAE-Lesezeitpunkten an- und wieder abfallen, gehen verloren (gewollt).
- **Timer** arbeiten auf dem Zeitstempel des Zyklusbeginns (deterministisch); Randfälle (PT = 0, IN fällt genau bei ET = PT, TOF-Retrigger, TONR-Reset) werden in Tests festgenagelt.
- **Zykluszeitüberwachung**: Jede CPU hat ein Op-Budget pro Zyklus; Überschreitung (z. B. durch `WHILE`) → CPU geht in **STOP**, Ausgänge auf 0, Testfall schlägt fehl. Zusätzlich hartes Schleifenlimit.
- **Auswertungsreihenfolge**: Netzwerke top-down; innerhalb eines FUP-Netzwerks topologisch von links nach rechts, Zuweisungsboxen rechts in Reihenfolge von oben nach unten. SR: R dominant, RS: S dominant (Namen nach IEC: das zuletzt genannte dominiert).
- **IR**: lineare, typisierte Instruktionsliste pro OB/FB mit Slots (keine Bäume) – einfach zu interpretieren und zu zählen. FB-Instanzen (TON, CTU, R_TRIG, eigene FBs) haben Instanz-DBs.
- **Datentypen**: BOOL, INT (16 bit, Überlauf wrappt wie echt), DINT, REAL (float32 via `Math.fround`), WORD, TIME.
- **Determinismus**: ein seedbarer PRNG (mulberry32/xoshiro) pro Störquelle, abgeleitet aus Level-Seed + Kanal → gleiche Lösung + Seed = identische Verläufe und Metriken.

## Level-Format

- JSON: Story-Mail, Datenblatt, feste Peripherie (Sensoren/Aktoren am Rand mit Störungsparametern), erlaubte Module, Bauplatz-Größe, Testfälle (Seeds + Stimuli), Soll-Verläufe.
- **Soll-Verläufe** zwei Arten:
  1. _Zeitreihen_ für offene Steuerungen (Ampel, Selbsthaltung …), Vergleich mit Toleranzfenster (± 1 Zykluszeit der langsamsten erlaubten CPU).
  2. _Kriterien_ für Regelkreise/rückgekoppelte Anlagen (Tank, PI-Regler, Sortierweiche): Bänder, „Pumpe nie bei Füllstand > X“, „Zählerstand = N am Ende“.
- Anlagen-Dynamik (Tank, Temperaturstrecke PT1, Förderband mit Teilen) ist Code in `sim-core/plants`, das Level referenziert Typ + Parameter.

## Meilensteine

Nach jedem Meilenstein: alle Tests grün, Git-Commit, Eintrag in `CHANGELOG.md`.

### M1 – Sim-Core

- Monorepo-Gerüst (npm workspaces, tsconfig, Vitest, ESLint/Prettier), `git init`.
- Datentypen + Speicherbereiche, symbolische Tag-Tabelle, IR-Definition, Interpreter.
- Zyklusmodell mit mehreren CPUs auf gemeinsamer Zeitachse, STOP bei Zykluszeitüberschreitung.
- Befehle: Bitlogik, S/R, SR/RS, P_TRIG/N_TRIG, R_TRIG/F_TRIG, TP/TON/TOF/TONR, CTU/CTD/CTUD, Vergleiche, IN_RANGE/OUT_RANGE, Arithmetik, ABS/LIMIT/MIN/MAX, MOVE/SEL/MUX, NORM_X/SCALE_X, WORD-Logik, SHL/SHR.
- Unit-Tests für jeden Befehl, Timer-Randfälle, Dominanz, Determinismus-Test. `docs/semantik.md`.

### M2 – SCL-Compiler

- Lexer, Parser (Ausdrücke mit IEC-Präzedenz, `IF/ELSIF/ELSE`, `CASE`, `FOR`, `WHILE`, FB-Aufrufe `#T1(IN := …, PT := T#500ms)`), Typprüfung, Codegen → IR.
- Deutsche Fehlermeldungen mit Zeile/Spalte; Anweisungszähler für Programmgröße.
- Monaco-Sprachdefinition (Highlighting, Fehler-Marker) – zunächst als Paket-Export, eingebunden in M3.

### M3 – Level 1–3 spielbar

- Level-Loader + Schema-Validierung, Level 1–3 inkl. Referenzlösungen + Tests.
- UI: Mail/Datenblatt, einfacher Schaltschrank (Module platzieren, Kanäle zuordnen, Kabelkanäle), SCL-Editor, Simulation (Play/Pause/Einzelzyklus/Schnell), Logic Analyzer (Soll grau, Ist farbig, Abweichung rot), Verifikation über mehrere Seeds.
- Erste Anlagen-Ansicht (Förderband), Taster per Klick in Sandbox.

### M4 – FUP-Editor

- Netzwerke 1…n, Boxen per Drag & Drop, Pins verbinden, Negationskreis per Klick, Zuweisungsboxen rechts, Operanden mit Tag-Autovervollständigung.
- `fup-model` → IR, Validierung (Zyklen, offene Pins), Boxzähler; FUP/SCL pro CPU wählbar.
- Referenzlösung mindestens eines Levels zusätzlich in FUP, Äquivalenztest FUP ⇔ SCL.

### M5 – Signalstörungen + Analogtechnik

- Störmodelle: Prellen, Rauschen + Spikes, Drahtbruch (32767)/Unterlauf, Kurzimpulse, NC/NO, Flattern – alle seedbar.
- AI/AO-Module, Relais/Schütz mit Schaltverzögerung.
- Level 4–9 inkl. Anlagen-Ansichten (Ampel, Zähler, Stern-Dreieck, Tank, Temperatur) und Referenzlösungen.

### M6 – Metriken, Histogramme, Speichern

- Kosten/Energie/Programmgröße, Histogramme mit lokal erzeugten (seed-basierten) Fake-Verteilungen + eigenen Bestwerten.
- localStorage-Persistenz, Export/Import von Lösungen als JSON (versioniertes Format).

### M7 – Rest + Polish

- Level 10–15 (Schrittkette, Sortierweiche, PWM, 2 CPUs + Koppelmodul, Kurzimpuls mit OB40, PI-Regler mit PT1-Strecke).
- OB35-Weckalarm, OB40-Prozessalarm, eigene FB/FC.
- Handbuch als „PDF-Seiten“ (Moduldatenblätter + Befehlsreferenz), Sandbox-Modus.
- Bonus-Minispiel: **Klemmen-Patience** – Kabel nach Farbe/Querschnitt auf Klemmleisten sortieren (eigene Regeln).
- Polish: Sound optional, Tastenkürzel, Onboarding.

## Risiken / bewusste Vereinfachungen

- Keine vollständige TIA-Kompatibilität (bewusst: Spielsemantik, dokumentiert).
- FUP-Editor ist der UI-aufwendigste Teil; Fokus zunächst auf Funktion, dann Optik.
- Balancing von Preisen/Gewichten und Fake-Histogrammen erst in M6/M7.
