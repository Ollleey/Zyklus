# Changelog

## M4 – FUP-Editor (2026-10-28)

- `@zyklus/fup-model`: Netzwerk-/Box-/Verbindungsmodell im TIA-Stil (Bool-Verbindungen, Operanden an
  Pins, Negation, erweiterbare Eingänge), Katalog mit 40 Boxen in 6 Kategorien, Absenkung nach SCL mit
  topologischer Auswertungsreihenfolge, Validierung (offene Pins, Rückkopplung, Wert-Verbindungen …),
  Rückführung aller Meldungen auf Netzwerk/Box/Pin, Programmgröße = Boxen
- SCL-Compiler: interne FUP-Funktionen (SR, RS, P_TRIG, N_TRIG, IN_RANGE, OUT_RANGE, CONV) nur für aus
  FUP erzeugte Bausteine
- Levels: Übersetzung von SCL und FUP, CPU-Grenze in Netzwerken bzw. Anweisungen; FUP-Referenzlösungen
  für Level 1–3, Äquivalenztest FUP ⇔ SCL (identische Verläufe über alle Seeds)
- App: Sprachwahl SCL/FUP je OB, FUP-Editor mit Anweisungsliste (Ziehen oder Klick), Boxen verschieben,
  Verbindungen ziehen, Negation per Klick, Operandenfelder, automatische Instanz-DBs, Fehler an der Box,
  Sprung aus der Meldungsliste zur Box; breiteres Programmfeld bei FUP
- 371 Tests

## M3 – Level 1–3 spielbar (2026-10-28)

- Spiel-Engine in `sim-core/game`:
  - Baugruppenkatalog (CPU klein/mittel/schnell, DI 8, DO 8, AI 2, AO 2), Level-Format mit Validierung
  - Schaltschrank: Steckplätze, Zuordnung zur CPU, automatische Adressvergabe wie TIA (DI/DO ab Byte 0,
    AI/AO ab Wort 64), Verdrahtung mit Kanalprüfung, Kabelkanal mit Kapazität je Spalte
  - PLC-Variablen angeschlossener Geräte werden automatisch angelegt und beim Umstecken nachgeführt
  - Eingangssignale mit Öffner-Logik und reproduzierbarem Prellen (Seed)
  - Simulationslauf (Testfall oder Handbetrieb, Einzelzyklus), Soll/Ist-Vergleich mit Toleranzfenster
    und Prüfung der Schaltanzahl, Verifikation über alle Testfälle und Seeds, Metriken
- `@zyklus/levels`: Aufträge 1–3 (Förderband mit Selbsthaltung, Zweihandbedienung, Stromstoßschalter mit
  prellendem Taster) mit Referenzlösungen als TIA-Quellen; Tests prüfen Referenzlösungen, typische
  Fehllösungen und Determinismus; Speichergrenze je CPU-Typ
- `apps/game` (React + Vite + Monaco, offline):
  - Posteingang mit Freischaltung, Auftrags-Mail und Datenblatt
  - Schaltschrank (SVG): Baugruppen stecken/verschieben/entfernen, Geräte verdrahten, Kanalbelegung, Live-LEDs
  - Bausteineditor: Main [OB1] mit Schnittstelle (Temp/Constant), SCL-Editor mit Hervorhebung,
    Fehlermarkierung und Autovervollständigung, PLC-Variablentabelle, Global-/Instanz-DBs, Meldungsliste
  - Simulation: Start/Pause/Zyklus/×10/×100, Logic Analyzer (Soll grau, Ist farbig, Abweichung rot),
    Anlagenansicht (Förderband, Presse, Lampe), Handbetrieb mit Tastern
  - Prüfen mit Ergebnis je Testfall, fehlgeschlagene Seeds direkt ansehen, Bestwerte, Export als `.scl`
  - Lösungen und Fortschritt im `localStorage`
- 336 Tests

## S7-Treue (2026-10-28, zwischen M2 und M3)

Auf Wunsch: SCL und FUP sollen echtes S7 sein (TIA-Bausteineditor-Stil, Referenz S7-1500).

- Projektmodell wie TIA: PLC-Variablentabelle, OB1 „Main“ mit Schnittstelle (nur Temp/Constant),
  Global-DBs, Instanz-DBs (`IEC_TIMER`, `IEC_COUNTER`, `TON_TIME`, `CTU_INT`, `R_TRIG` …)
- SCL: Aufrufe `"DB".TON(…)` / `"DB"(…)`, Pfadzugriffe `"Daten".T1.Q`, `REGION`, `MUX … INELSE`,
  TIA-Typen für Absolutadressen (`%IW` = Word), neue Typen Byte und DWord, Literale `B#`, `W#`, `DW#`,
  implizite Konvertierungen nach S7-1500-Tabelle, Umlaute in Namen
- SR/RS, IN_RANGE/OUT_RANGE in SCL entfernt (gibt es in TIA nur in FUP/KOP)
- Externe Quellen: Import (`sourceToProject`), Export (`projectToSource`), direkte Übersetzung
  (`compileSource`)
- Meldungen mit Ort (Codeteil, Schnittstellenzeile, Variablentabelle) und TIA-Typnamen
- 297 Tests

## M2 – SCL-Compiler (2026-10-28)

- `@zyklus/scl-compiler`:
  - Handgeschriebener Lexer: Kommentare `//`, `(* *)`, `/* */`; lokale (`#x`), globale (`"x"`) Namen,
    Absolutadressen; Zahlen in allen Basen, typisierte Literale, Zeitangaben (`T#1s200ms`)
  - Recursive-Descent-Parser mit IEC-Präzedenz und Fehler-Recovery (mehrere Fehler pro Lauf)
  - Deklarationen VAR / VAR_TEMP / VAR CONSTANT, FB-Instanzen inkl. SR/RS
  - IF/ELSIF/ELSE, CASE (Listen, Bereiche, ELSE), FOR (BY), WHILE, REPEAT, EXIT, CONTINUE, RETURN
  - FB-Aufrufe mit `:=`/`=>`, Elementzugriff `#T1.Q`; alle M1-Funktionen und Konvertierungen
  - Typprüfung mit impliziter Erweiterung (INT → DINT → REAL), kontextabhängigen Literalen,
    deutschen Fehlermeldungen inkl. Lösungshinweis, Warnungen (unbenutzt, Schreiben auf Eingang)
  - Codegenerierung → IR mit direktem Schreiben ins Ziel und wiederverwendeten Hilfsvariablen
  - Programmgröße = Anzahl Anweisungen
  - Monaco: Monarch-Tokenizer, Sprachkonfiguration, Umwandlung Diagnosen → Marker
- 155 Tests (Lexer, Präzedenz, Recovery, Ausführung auf der Sim-CPU, Fehlermeldungen).
- Sprachumfang dokumentiert in `docs/scl.md`.

## M1 – Sim-Core (2026-10-27)

- Monorepo mit npm workspaces, TypeScript (strict), Vitest, Prettier.
- `@zyklus/sim-core`:
  - Datentypen BOOL/INT/DINT/REAL/WORD/TIME mit Überlauf- und Konvertierungsregeln
  - Speicherbereiche `%I/%Q/%M` (big-endian), Absolutadressen, symbolische Variablentabelle
  - IR (lineare, typisierte Befehlsliste) mit Builder und statischem Validator (deutsche Fehlermeldungen)
  - Interpreter: Bitlogik, S/R, SR/RS, P_TRIG/N_TRIG, R_TRIG/F_TRIG, TP/TON/TOF/TONR, CTU/CTD/CTUD,
    Vergleiche, IN_RANGE/OUT_RANGE, Arithmetik, ABS/NEG, LIMIT/MIN/MAX, SEL/MUX, NORM_X/SCALE_X,
    WORD-Logik, SHL/SHR, CONV, Sprünge
  - CPU-Zyklus PAE → OB1 → PAA, Zykluszeitüberwachung mit STOP, mehrere CPUs auf einer Zeitachse
  - CPU-Katalog (klein/mittel/schnell), gewichtete Energie-Metrik, seedbarer Zufallsgenerator
- 115 Unit-Tests inkl. Timer-Randfälle, SR/RS-Dominanz, verpasste Kurzimpulse, Zykluszeitüberschreitung,
  Determinismus.
- Semantik dokumentiert in `docs/semantik.md`.
