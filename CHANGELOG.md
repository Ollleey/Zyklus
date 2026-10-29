# Changelog

## D3 – Leitungen und Feldgeräte (2026-10-29)

- Leitungen als Adern mit Biegeradius: vom Gerät zum Plattenrand, durch den unteren Kanal unter dem
  Deckel, von unten in die Baugruppe; an der Federzugklemme sitzt eine Aderendhülse in Aderfarbe
- Farben nach Schaltschrank-Praxis: DC-Steuerleitungen dunkelblau, Analogleitungen violett mit
  gestricheltem Schirm; aktives Signal hellt die Ader auf und pulsiert leicht (aus bei reduzierter
  Bewegung)
- Hover auf Gerät, Leitung oder Klemme hebt die ganze Strecke samt Gerät und Klemme hervor
- Feldgeräte als Symbole statt Karten: Taster grün, Stopp/Öffner rot, Not-Halt mit Pilz,
  Wahlschalter, Lichtschranke, Endlagen-/Näherungsschalter, Messumformer mit Messbereich, Motor
  (M, 3~ bei Leistung), Ventil, Leuchtmelder, Stellglied; Kennzeichnung wie im Schaltplan,
  Signalart darunter; Zustand live (Motor grün, Leuchte an, Ventil betätigt, Strahl unterbrochen)
- Verdrahtung bleibt Aufgabe des Spielers (Gerät anklicken, dann Klemme)
- Nicht umgesetzt: eigene 0-V-Rückleitung (das Modell kennt keine Bezugsleiter)
- 496 Tests

## D2 – Hardware-Optik und Maßstab (2026-10-29)

- Maßstab: ein Rasterschritt der Hutschiene sind 15 mm. CPU klein 90 mm, CPU mittel/schnell
  105 mm, DI 8/DO 8/DI 8 HF/AI 2/AO 2 je 15 mm, REL 4 und KOP je 30 mm, Trennwand 30 mm.
  Schrankbreiten der Level und Referenzaufbauten umgerechnet; Preise und Richtwerte unverändert
- Lösungsformat Version 2 mit Migration: alte Stände werden beim Start (localStorage, Version 3) und
  beim Import von Lösungsdateien umgerechnet, Reihenfolge und Lücken bleiben erhalten, Level 13 je
  Seite der Trennwand. Was nicht mehr passt, lädt und wird als „ragt über die Hutschiene“ gemeldet.
  Tests mit dem alten Referenzaufbau jedes Levels
- Engine: Betriebsartenschalter RUN/STOP (Neustart mit erhaltenen Merkern und Datenbausteinen),
  mittlere Auslastung des Befehlsbudgets je CPU
- Schaltschrank maßstäblich in mm gezeichnet: verzinkte Montageplatte, 35-mm-Hutschiene mit
  Langlöchern und Lichtkante, Verdrahtungskanäle oben und unten mit Fingern, Deckel und
  Belegungsschild (überfüllte Spalten rot), Trennwand als Schottblech, Buskabel der Koppelmodule
  im oberen Kanal
- CPU: Gehäuse mit Lüftungsschlitzen und Fronttür, LEDs RUN/STOP/ERROR/MAINT mit Leuchten aus der
  Simulation, Anzeige mit Typ, Name, Zykluszeit und Last, Betriebsartenschalter (bedienbar im
  Sandkasten), Kartenschacht, RJ45 mit Link-LED
- E/A-Baugruppen: Beschriftungsstreifen mit LED, Adresse und Symbolname je Kanal (Tooltip mit vollem
  Namen), Analogbalken, Federzugklemmen mit orangen Betätigern als Verdrahtungsziel
- Zoom mit Mausrad um den Zeiger, Verschieben durch Ziehen, „Einpassen“, Vorschau beim Stecken,
  Einrast-Animation (aus bei reduzierter Bewegung); Leitungen laufen unter dem Kanaldeckel und
  hinter den Fronten
- Noch offen für D3: Leitungsführung mit Biegeradius und Aderendhülsen, Gerätesymbole; bei
  „Einpassen“ ist die Modulbeschriftung klein, lesbar mit Zoom
- 493 Tests

## D1 – Designsystem und Grundlayout (2026-10-29)

- Plan für die Design-Überarbeitung D1–D6 (`docs/design/PLAN.md`) und Ausbauplan M8–M13 (`PLAN.md`)
- Screenshots per Playwright über das installierte Edge (`scripts/screenshots.mjs`), Ist-Stand in
  `docs/design/before/`, aktueller Stand in `docs/design/after/`
- Design-Tokens in `apps/game/src/theme.ts` (Farben, 4-px-Abstände, Radien, Schatten, Schrift), als
  CSS-Variablen gesetzt; Light-Palette vorbereitet. Bestehende Styles laufen über die Tokens,
  Monaco-Theme und Editor-Schrift ebenfalls
- Schriften IBM Plex Sans, Plex Sans Condensed und Plex Mono lokal gebündelt
- Kopfzeile neu: Auftrag und Kunde, Auftrag/Datenblatt als Umschalter, Kosten und Größe gruppiert,
  Speichern/Laden/Export im Menü „Mehr“, „Lösung verwerfen“ dort abgesetzt mit eigenem
  Bestätigungsdialog; „Prüfen“ ist die einzige Primäraktion (Federzug-Orange)
- Eigene Dialoge statt Browser-`confirm`/`alert` (Verwerfen, Import ersetzen, Baustein löschen)
- Verstellbare Bereiche: Schrank/Programm, Höhe der Simulation, Prozessansicht; Größen werden
  gespeichert, Trenner auch per Tastatur bedienbar; Mindestbreite 1280 px
- Anweisungszähler als Balken; Überschriften in Satzschreibung statt gesperrter Großbuchstaben;
  Datenblatt- und Handbuchpapier kühl statt cremefarben; Favicon
- Testzeitlimit für die Level-Tests auf 60 s (unter Last liefen zwei Determinismus-Tests in das
  Standardlimit von 5 s)

## M7 – Alarme, eigene Bausteine, mehrere CPUs, Level 10–15, Werkstatt (2026-10-29)

- Engine:
  - Alarm-OBs: Weckalarm (OB30…38, Takt und Phase) und Prozessalarm (OB40…47, Flanke an einem
    Eingangsbit) als eigene Codebereiche im IR; frisches PAE, sofort wirksame Ausgänge, gleiches
    Befehlsbudget wie ein Zyklus
  - Baugruppen DI 8 HF (alarmfähig) und KOP (Koppelmodul, je 2 Wörter in beide Richtungen ab
    %QW100/%IW100); Trennwand im Schaltschrank (kein Modul darauf, keine Leitung hindurch, Baugruppen
    rechts davon brauchen eine eigene CPU)
  - Anlagenmodelle Bohrstation, Sortierstrecke und Wärmestrecke PT1 mit Totzeit; Anlagen können
    Digitaleingänge liefern (Endlagen, Lichtschranken); Kriterium Tastverhältnis (`duty`)
- SCL-Compiler:
  - mehrere OBs mit Ereignis, Prüfung von Nummernbereich, Takt und Eingang; eigene Temp-Variablen je OB
  - eigene FB und FC: Ein-/Ausgänge, Durchgangsparameter (auf die Variable abgebildet), statische
    Daten, Multiinstanzen von Systembausteinen und eigenen FBs, Instanz-DBs eigener FBs, Zugriff
    von außen (`"Motor_DB".Laeuft`), RETURN; Rekursion wird erkannt. Bausteine werden an der
    Aufrufstelle eingesetzt, Meldungen kommen einmal am Baustein, die Programmgröße zählt den Rumpf
    einmal
  - Ereignisse überstehen Export und Import der `.scl`-Quelle (Kommentarzeile im Bausteinkopf)
- Lösungen: CPU-Fähigkeiten werden geprüft (Weck-/Prozessalarm, Alarmeingang auf DI 8 HF)
- Level 10–15: Bohrstation als Schrittkette, Sortierweiche mit Bit-Warteschlange, PWM über
  Zeitglieder, Pumpenhaus und Leitwarte mit zwei CPUs, Abfüllen mit Prozessalarm, PI-Regler als FB
  im Weckalarm – jeweils mit Referenzlösung, Richtwerten und Tests typischer Fehllösungen
- App:
  - Bausteinauswahl je CPU (FB, FC, Weckalarm-OB, Prozessalarm-OB anlegen, umbenennen, löschen),
    Ereigniseinstellungen, Schnittstelle je Bausteinart, eigene FBs als Instanz- und Multiinstanztyp
  - Trennwand, Koppelmodule mit Buskabel und Alarmkennzeichnung im Schaltschrank
  - Anlagenansichten für Bohrstation, Sortierband, Ofen, Heizband, Pumpenhaus, Abfüllung
  - Handbuch mit Seiten zu Bedienung, Baugruppen-Datenblättern, Laufzeitregeln, SCL, FUP und
    Boxreferenz (aus `docs/` und den Katalogen erzeugt)
  - Sandkasten: alle Baugruppen, Testgeräte, nur Handbetrieb
  - Bonusspiel Klemmen-Patience (nach 3 erledigten Aufträgen): Reihenklemmen nach Aderfarbe und
    Querschnitt auf Sammelschienen sortieren, Spiel je Seed, Rückgängig
  - `.scl`-Export je CPU
- Nicht umgesetzt aus dem Plan: Sound, eigenes Onboarding (das Handbuch erklärt die Bedienung);
  Aufruf eigener FB/FC aus FUP
- 472 Tests

## M6 – Metriken, Histogramme, Speichern (2026-10-29)

- Richtwerte (`par`) je Level aus den Metriken der Referenzlösungen; ein Test hält beides synchron
- Vergleichsverteilungen: lokal und deterministisch aus Level-id und Richtwert erzeugt
  (die meisten Lösungen etwas schlechter, langer Schwanz, wenige besser); Histogramm-Klassen,
  „besser als x %“
- Lösungsdatei `*.zyklus.json` (Format `zyklus-loesung`, Version 1): Export, Import mit Prüfung von
  Format, Version, Auftrag und Grobstruktur, deutsche Fehlermeldungen
- Spielstand mit Versionsschlüssel und Migration, Verlauf der letzten 10 bestandenen Prüfungen
- App: Histogramme für Kosten, Energie und Größe im Prüfdialog (eigener Wert und Bestwert),
  Knöpfe „Lösung speichern“ / „Lösung laden“
- 411 Tests

## M5 – Signalstörungen und Analogtechnik (2026-10-28)

- Engine:
  - Analogeingänge mit Messbereich (physikalisch ↔ 0…27648), linear interpolierten Stimuli,
    Rauschen, Ausreißern und Geberfehlern (Drahtbruch/Überlauf 32767, Unterlauf −32768), alles per Seed
    reproduzierbar; Über-/Untersteuerbereich begrenzt wie S7
  - Relaisbaugruppe REL 4 (Ansprechzeit 15 ms, Abfallzeit 30 ms); Leistungsverbraucher (Schütze, Pumpen)
    brauchen einen Relaisausgang
  - Anlagenmodell Tank (Pumpe, veränderlicher Verbrauch) mit Rückkopplung auf den Messwert
  - Kriterien statt fester Soll-Verläufe: `always`, `range`, `exclusive`, `maxChanges`, `track`;
    Aufzeichnung von Anlagenzustand (`plant.*`) und störungsfreiem Messwert (`true.*`)
- Level 4–9: Baustellenampel, Teilezähler mit flatternder Lichtschranke, Stern-Dreieck-Anlauf mit
  Verriegelung, Hochbehälter mit Hysterese, Drahtbruch mit Ersatzreaktion, Glättung eines verrauschten
  Messwerts – jeweils mit Referenzlösung und Tests für typische Fehllösungen
- App: Analogspuren im Logic Analyzer (Messwert und wahrer Wert), Anlagenzeilen, Anlagenansichten
  (Ampel, Lichtschranke, Stern-Dreieck, Tank, Ofen, Durchfluss), Schalter und Schieberegler im
  Handbetrieb, verletzte Kriterien im Prüfdialog
- 398 Tests

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
