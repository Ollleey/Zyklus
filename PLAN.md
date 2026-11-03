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
- Stand: umgesetzt bis auf Sound und eigenes Onboarding; Tastenkürzel wie bisher (Esc, Entf).

## Ausbau M8–M13: „wie an einer echten S7“ (Entwurf)

Ziel: Nach M7 kann man Steuerungen bauen. Ab jetzt soll sich die Arbeit anfühlen wie im echten
Projekt: strukturierte Daten statt Einzelvariablen, Gerätekonfiguration statt fester Module,
Online-Funktionen zum Testen, Fehler-OBs statt hartem STOP, KOP als dritte Sprache,
Technologiebausteine, Inbetriebnahme fremder Programme. Reihenfolge nach Abhängigkeit:
Datentypen sind die Grundlage für fast alles danach.

Was heute fehlt, im Vergleich zur Praxis:

| Bereich         | Heute                              | In echten Projekten                                                        |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Daten           | 8 Elementartypen, keine Strukturen | ARRAY, STRUCT, PLC-Datentypen (UDT), STRING, USInt…LInt, LReal, DTL        |
| Bausteine       | FB/FC ohne Rückgabewert, OB1/30/40 | FC mit Rückgabewert, Anlauf-OB100, Fehler-OBs, remanente Daten, Bibliothek |
| Sprachen        | SCL, FUP (ohne eigene Bausteine)   | KOP am häufigsten, FUP/KOP rufen eigene FB/FC auf, GRAPH für Schrittketten |
| Testen          | Logikanalysator, Handbetrieb       | Beobachten im Editor, Beobachtungs-/Forcetabelle, Trace mit Trigger        |
| Hardware        | feste Module, feste Adressen       | Gerätekonfiguration: Adressen, Eingangsfilter, Diagnose, Ersatzwerte, TPA  |
| Fehlerverhalten | jede Überschreitung → STOP         | OB80/OB82/OB121, Diagnosepuffer, RUN/STOP-Schalter, Neustart               |
| Technologie     | alles selbst programmiert          | PID_Compact, schneller Zähler (HSC), PWM-Ausgang, Kommunikation PUT/GET    |
| Aufgaben        | Neubau nach Datenblatt             | fremde Programme in Betrieb nehmen, Fehler suchen, Anlagen erweitern       |

### M8 – Datentypen und Bausteine wie im Projekt (erledigt, siehe CHANGELOG M8a–M8g)

- **ARRAY** (`Array[0..9] of Int`, auch mehrdimensional, Index variabel mit Bereichsprüfung →
  Programmierfehler), **STRUCT**, **PLC-Datentypen** (eigener Projektbaum-Ordner, in DBs, Schnittstellen
  und Tags verwendbar), `FOR` über Arrays.
- Weitere Elementartypen: SInt/USInt/UInt/UDInt/LInt/ULInt, LReal, Char, **String** (mit `LEN`,
  `CONCAT`, `LEFT`, `MID`, `FIND`, `INT_TO_STRING` …), LWord, Date/TOD/**DTL** mit `RD_SYS_T`/`RD_LOC_T`.
- Typumwandlungen und Literale nach S7-1500-Tabelle für alle neuen Typen; `MOVE_BLK`, `FILL_BLK`,
  `SWAP`, Slice-Zugriff `%X3` / `.%B1`, `AT`-freie Sichten.
- **FC mit Rückgabewert** (`Ret_Val`), Aufruf im Ausdruck; benannte und unbenannte Parameter.
- **Anlauf-OB100**, **remanente** Variablen (Retain-Spalte in DBs und FB-Statics), Startwerte vs.
  Istwerte, „Neustart“ im Simulator (Spannung aus/ein als Testschritt).
- IR: Speichermodell für zusammengesetzte Daten (flache Slots mit Offset, Array-Index als Operand).
- Speichergrenzen der CPU zusätzlich in Byte Arbeitsspeicher (Datenmenge wird zur Designfrage).
- Level 18–19: Rezepturverwaltung (Array of UDT, Rezeptwahl), Schichtprotokoll (String + DTL,
  Ringpuffer).
- Nicht umgesetzt: PLC-Variablen vom Typ eines PLC-Datentyps, `AT`-Sichten, Istwert-Spalte im
  DB-Editor (kommt mit dem Beobachten in M9).

### M9 – Online-Funktionen (Testen wie am Gerät) (erledigt, siehe CHANGELOG M9a–M9f)

- **Beobachten** im SCL-Editor (Werte neben den Zeilen, Bedingungen grün/blau) und im FUP-Editor
  (Signalfluss farbig, Werte an Pins), angehalten bei Pause.
- **Beobachtungstabelle**: Operanden/Symbole mit Anzeigeformat (dez., hex, bin, Zeit), Steuern von
  Werten einmalig oder zyklisch; **Forcetabelle** für Ein-/Ausgänge an der Peripherie
  (Force-LED an der CPU, Forcen zählt bei der Prüfung als Fehler).
- **Trace** wie in TIA: Signale wählen, Trigger (Flanke, Wert, Bitmuster), Vor-/Nachlauf,
  Aufzeichnungstakt (OB1 / Weckalarm) – der Logikanalysator wird zu diesem Werkzeug.
- **Querverweisliste** (wo wird `"Motor"` geschrieben/gelesen), **Aufrufstruktur**, **Zuordnungsliste**
  (belegte E/A/M-Bits), Warnung bei Mehrfachzuweisung.
- **Übersetzen / Laden**: getrennt wie in TIA; „Laden in RUN“ nur bei kompatiblen Änderungen,
  sonst STOP nötig; Istwerte bleiben erhalten oder werden zurückgesetzt (bewusste Wahl).
- Schrittbetrieb pro Zyklus und Haltepunkte in SCL (Testpunkt, nur Simulator).

### M10 – Gerätekonfiguration und Fehlerbehandlung (erledigt, siehe CHANGELOG M10a–M10d; ohne TPA)

- **Gerätesicht**: Baugruppe anklicken → Eigenschaften: Anfangsadresse ändern, **Eingangsverzögerung**
  (0,05 … 20 ms – Hardwareentprellung als Alternative zum Programm), Diagnose freigeben
  (Drahtbruch, fehlende Lastspannung), Messart/Messbereich bei AI (z. B. 4…20 mA mit Drahtbruch-
  erkennung), **Ersatzwert / letzten Wert halten** bei STOP für Ausgänge, Teilprozessabbild (TPA) für
  Alarm-OBs, Systemmerker und Taktmerker (`%M0.5` 1 Hz) wie in den CPU-Eigenschaften.
- **Fehler-OBs**: OB80 (Zykluszeitüberschreitung, einmal toleriert), OB82 (Diagnosealarm,
  z. B. Drahtbruch), OB86 (Baugruppenausfall), OB121 (Programmierfehler, z. B. Arrayindex) –
  fehlt der OB, geht die CPU wie echt in STOP; `GET_ERR_ID`, `RUNTIME`.
- **Diagnosepuffer** mit Zeitstempel und Klartext; CPU-LEDs RUN/ERROR/MAINT; **RUN/STOP-Schalter**
  und Neustart im Simulator.
- Störungsszenarien in Testfällen: Lastspannung weg, Baugruppe gezogen, Drahtbruch erst zur Laufzeit.
- Level 20–21: Anlage muss bei Drahtbruch bzw. Baugruppenausfall geordnet weiterlaufen (OB86 +
  Ersatzbetrieb), Mittelwert ohne Zykluszeitfehler (Lastverteilung bzw. laufende Summe, OB80).

### M11 – KOP und eigene Bausteine in FUP/KOP (erledigt, siehe CHANGELOG M11a–M11c; ohne GRAPH-light)

- **KOP-Editor** (Kontaktplan): Kontakte (Schließer/Öffner, P/N), Spulen (=, S, R, P/N-Spule),
  Parallelzweige, Boxen wie in FUP; Absenkung über dasselbe Netzwerkmodell nach SCL.
  Umschalten KOP ↔ FUP pro Baustein, wo darstellbar (wie in TIA).
- **Eigene FB/FC als Boxen** in FUP und KOP (Instanz wählen bzw. Multiinstanz), EN/ENO.
- Netzwerktitel und -kommentare, Baustein-Kommentare, Bausteinschutz für vorgegebene Bausteine.
- Optional **GRAPH-light**: Schrittkette als Diagramm (Schritt, Transition, Aktionen N/S/R/D),
  abgesenkt auf CASE-Code – Level 10 neu lösbar.

### M12 – Technologie und Kommunikation (erledigt, siehe CHANGELOG M12a–M12f; TSEND_C/TRCV_C statt PUT/GET)

- Technologieobjekte mit Konfigurationsdialog statt Selbstbau: **PID_Compact** (mit Selbstoptimierung
  als Spielmechanik), **High-Speed-Counter** auf DI 8 HF (Alternative zu OB40), **PWM-/PTO-Ausgang**
  auf DQ HF, Skalierung mit `NORM_X/SCALE_X` als Box-Paar.
- **Dezentrale Peripherie**: ET-200-Station hinter einem Interfacemodul, PROFINET-Aktualisierungszeit
  (1 … 16 ms) als zusätzliche Latenz, Stationsausfall → OB86.
- **CPU-CPU-Kommunikation** mit `PUT`/`GET` bzw. `TSEND_C`/`TRCV_C` (Auftragsstatus DONE/BUSY/ERROR,
  Laufzeit über mehrere Zyklen) statt fester Koppelwörter.
- Einfaches **Bedienpanel**: Bildeditor mit Taster, Lampe, E/A-Feld, Meldeanzeige; Meldungen aus dem
  Programm (`Program_Alarm`) – ersetzt in passenden Leveln die festen Bedientaster.
- Level 20–22: Temperaturregelung mit PID_Compact und Störgrößenaufschaltung, Positionieren mit
  HSC, verteilte Anlage mit zwei Stationen und Panel.

### M13 – Inbetriebnahme und Instandhaltung

- Neue Auftragsart **„Bestandsanlage“**: Projekt mit fremdem Programm wird geliefert (bewusst mit
  Schwächen: Mehrfachzuweisung, fehlende Verriegelung, prellende Eingänge, Überlauf), Ziel ist
  Fehler finden und minimal ändern; Bewertung zusätzlich nach **Änderungsumfang**.
- Auftragsart **„Erweiterung“**: laufende Anlage um eine Station erweitern, ohne bestehende Tests
  zu brechen (Regressionstests aus dem Vorgängerlevel).
- **Bibliothek**: eigene FBs/UDTs aus gelösten Aufträgen als Typen mit Version speichern und in späteren
  Aufträgen einsetzen (Kosten für Wiederverwendung sinken).
- Level 23–26 plus Kampagnenabschluss; Onboarding-Auftrag 0 mit geführten Schritten; Englisch.

### Querschnitt (laufend)

- Jede neue Anweisung mit Unit-Tests und Eintrag in Handbuch und `docs/`.
- Jeder neue Level mit Referenzlösung, Richtwerten und Tests typischer Fehllösungen.
- Rückwärtskompatibilität der Lösungsdateien (Formatversion, Migration).
- Performance: Simulationsläufe bleiben unter 1 s je Testfall (Profiling ab M8).

## Risiken / bewusste Vereinfachungen

- Keine vollständige TIA-Kompatibilität (bewusst: Spielsemantik, dokumentiert).
- FUP-Editor ist der UI-aufwendigste Teil; Fokus zunächst auf Funktion, dann Optik.
- Balancing von Preisen/Gewichten und Fake-Histogrammen erst in M6/M7.
