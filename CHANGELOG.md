# Changelog

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
