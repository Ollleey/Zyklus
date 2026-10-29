# Changelog

## D6.1 â€“ E/A-Baugruppen im GehÃ¤use der CPU (2026-10-29)

- E/A-Baugruppen, Koppelmodul und E/A-Feld der Kompakt-CPU im selben anthrazitfarbenen GehÃ¤use wie
  die CPU: LÃ¼ftungsschlitze, schmale Kennfarbe statt farbigem Kopf, helle Beschriftung auf dunkler
  Front, Kanal-LEDs auf der Front neben weiÃŸen Beschriftungsstreifen, dunkler Klemmenblock mit
  orangen BetÃ¤tigern

## D6 â€“ Zeitdiagramm, Prozessansicht, Feinschliff, Abnahme (2026-10-29)

- Zeitdiagramm neu: Ist krÃ¤ftig (Bool cyan, Analog violett, Anlagenwerte gelb), Soll als helles
  Band dahinter, Abweichungen rot schraffiert â€“ Klick setzt den Zeiger an den Anfang; Analogspuren
  mit Wertebereich; Zeiger mit Zeit und den Werten aller Spuren (Klick heftet ihn an); SpurhÃ¶he passt
  sich an, das Diagramm fÃ¼llt den Simulationsbereich
- Prozessansicht: Drucktaster als Grafik mit Kragen und Hub, Ã–ffner rot, Wahlschalter als Knebel,
  Kennzeichnung und elektrisches Signal am Taster; Bereich verstellbar (Standard ein Drittel)
- Beobachten: Werte von PLC-Variablen, Datenbausteinen, Instanzen und Temp-Variablen am Zeilenende
  im SCL-Editor, Wertspalte in der PLC-Variablentabelle (nur wÃ¤hrend einer Simulation), BOOL nach
  Einstellung
- Feinschliff: Kopfzeilen von Patience und Posteingang ohne Punkt-AufzÃ¤hlungen, HandbuchfuÃŸ,
  Zeigerstil
- Abnahme: Screenshots in `docs/design/after/`, GegenÃ¼berstellung in `docs/design/README.md`;
  Ã—100 mit Zeitdiagramm und Live-Werten 55â€“61 Bilder je Sekunde
- 524 Tests

## D5 â€“ BOOL-Literale 0/1 (2026-10-29)

- SCL: `0` und `1` gelten Ã¼berall als Bool, wo ein Bool erwartet wird â€“ Zuweisung (`"Motor" := 1;`),
  Vergleich und VerknÃ¼pfung (`IF "Start" = 1 THEN`, `"Stopp" <> 0`), Parameter (`IN := 1`),
  Startwerte in Datenbausteinen und Schnittstellen; `TRUE`/`FALSE` in jeder Schreibweise
- Andere Zahlen an Bool: â€žBOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.â€œ mit Zeile und
  Spalte; Int-Variablen werden weiterhin nicht zu Bool
- `.scl`-Export schreibt an diesen Stellen `TRUE`/`FALSE` (auch Bool-Startwerte), Zahlen an Int
  bleiben stehen
- FUP: Konstanten `0/1/TRUE/FALSE` an Bool-Pins, auch negiert; andere Zahlen werden am Pin gemeldet
- Einstellung â€žBOOL als 0/1 oder TRUE/FALSEâ€œ (Standard 0/1) in der Simulationsleiste, gilt fÃ¼r
  alle Ansichten; Zeitdiagramm zeigt den aktuellen Bool-Wert je Spur
- 524 Tests

## D4 â€“ Neue Baugruppen, Analogtechnik, Level 16â€“17 (2026-10-29)

- Baugruppen mit Kanalgruppen: DI 4, DO 4 (je 15 mm), DI 8/DO 8 (30 mm), AI 4 (30 mm) und CPU kompakt
  (120 mm) mit E/A auf der CPU (DI 6, DO 4, AI 2 0â€“10 V); Adressvergabe je Gruppe, E/A auf der CPU
  zuerst (%I0.0, %Q0.0, %IW64)
- Messbereich je Analogkanal (0â€“10 V oder 4â€“20 mA) im Modul-Inspektor (Baugruppe anklicken);
  FeldgerÃ¤te haben eine feste Signalart. Falscher Bereich: Eingang liefert 32767, Ausgang kommt
  beim Stellglied nicht an, Warnung im Schrank. Drahtbruch erkennt nur 4â€“20 mA (32767), bei 0â€“10 V
  fÃ¤llt das Signal auf 0. Ã„ltere AuftrÃ¤ge ohne Signalart verhalten sich wie bisher
- Analogfront: Balken je Kanal, rote Fehler-LED bei Ãœberlauf/Drahtbruch, Messbereich in der
  Beschriftung; Kompakt-CPU mit eigenem E/A-Feld; DI 8/DO 8 mit zweispaltigem Streifen
- Level 16 â€žZwei BehÃ¤lter, eine Steuerungâ€œ (AI 4 auf 4â€“20 mA, Drahtbrucherkennung, FC zweimal
  aufgerufen) und Level 17 â€žFÃ¶rderband am Frequenzumrichterâ€œ (Rampe 10 Hz/s im festen Zyklus,
  Freigabe, RÃ¼ckmeldung Ã¼ber 4â€“20 mA); Anlagenmodelle â€žzwei BehÃ¤lterâ€œ und â€žAntrieb am Umrichterâ€œ
  mit ÃœberlastungszÃ¤hlung, Anlagenansichten; ReferenzlÃ¶sungen, Richtwerte, Tests typischer
  FehllÃ¶sungen (Messbereich vergessen, Rampe zu steil auf 5-ms-CPU, Sollwert ohne Rampe)
- Erlaubnislisten der Level 1â€“15 um passende neue Baugruppen ergÃ¤nzt; alle Referenzen bestehen
- Handbuch zeigt Kanalgruppen und Messbereiche der Baugruppen
- 511 Tests

## D3 â€“ Leitungen und FeldgerÃ¤te (2026-10-29)

- Leitungen als Adern mit Biegeradius: vom GerÃ¤t zum Plattenrand, durch den unteren Kanal unter dem
  Deckel, von unten in die Baugruppe; an der Federzugklemme sitzt eine AderendhÃ¼lse in Aderfarbe
- Farben nach Schaltschrank-Praxis: DC-Steuerleitungen dunkelblau, Analogleitungen violett mit
  gestricheltem Schirm; aktives Signal hellt die Ader auf und pulsiert leicht (aus bei reduzierter
  Bewegung)
- Hover auf GerÃ¤t, Leitung oder Klemme hebt die ganze Strecke samt GerÃ¤t und Klemme hervor
- FeldgerÃ¤te als Symbole statt Karten: Taster grÃ¼n, Stopp/Ã–ffner rot, Not-Halt mit Pilz,
  Wahlschalter, Lichtschranke, Endlagen-/NÃ¤herungsschalter, Messumformer mit Messbereich, Motor
  (M, 3~ bei Leistung), Ventil, Leuchtmelder, Stellglied; Kennzeichnung wie im Schaltplan,
  Signalart darunter; Zustand live (Motor grÃ¼n, Leuchte an, Ventil betÃ¤tigt, Strahl unterbrochen)
- Verdrahtung bleibt Aufgabe des Spielers (GerÃ¤t anklicken, dann Klemme)
- Nicht umgesetzt: eigene 0-V-RÃ¼ckleitung (das Modell kennt keine Bezugsleiter)
- 496 Tests

## D2 â€“ Hardware-Optik und MaÃŸstab (2026-10-29)

- MaÃŸstab: ein Rasterschritt der Hutschiene sind 15 mm. CPU klein 90 mm, CPU mittel/schnell
  105 mm, DI 8/DO 8/DI 8 HF/AI 2/AO 2 je 15 mm, REL 4 und KOP je 30 mm, Trennwand 30 mm.
  Schrankbreiten der Level und Referenzaufbauten umgerechnet; Preise und Richtwerte unverÃ¤ndert
- LÃ¶sungsformat Version 2 mit Migration: alte StÃ¤nde werden beim Start (localStorage, Version 3) und
  beim Import von LÃ¶sungsdateien umgerechnet, Reihenfolge und LÃ¼cken bleiben erhalten, Level 13 je
  Seite der Trennwand. Was nicht mehr passt, lÃ¤dt und wird als â€žragt Ã¼ber die Hutschieneâ€œ gemeldet.
  Tests mit dem alten Referenzaufbau jedes Levels
- Engine: Betriebsartenschalter RUN/STOP (Neustart mit erhaltenen Merkern und Datenbausteinen),
  mittlere Auslastung des Befehlsbudgets je CPU
- Schaltschrank maÃŸstÃ¤blich in mm gezeichnet: verzinkte Montageplatte, 35-mm-Hutschiene mit
  LanglÃ¶chern und Lichtkante, VerdrahtungskanÃ¤le oben und unten mit Fingern, Deckel und
  Belegungsschild (Ã¼berfÃ¼llte Spalten rot), Trennwand als Schottblech, Buskabel der Koppelmodule
  im oberen Kanal
- CPU: GehÃ¤use mit LÃ¼ftungsschlitzen und FronttÃ¼r, LEDs RUN/STOP/ERROR/MAINT mit Leuchten aus der
  Simulation, Anzeige mit Typ, Name, Zykluszeit und Last, Betriebsartenschalter (bedienbar im
  Sandkasten), Kartenschacht, RJ45 mit Link-LED
- E/A-Baugruppen: Beschriftungsstreifen mit LED, Adresse und Symbolname je Kanal (Tooltip mit vollem
  Namen), Analogbalken, Federzugklemmen mit orangen BetÃ¤tigern als Verdrahtungsziel
- Zoom mit Mausrad um den Zeiger, Verschieben durch Ziehen, â€žEinpassenâ€œ, Vorschau beim Stecken,
  Einrast-Animation (aus bei reduzierter Bewegung); Leitungen laufen unter dem Kanaldeckel und
  hinter den Fronten
- Noch offen fÃ¼r D3: LeitungsfÃ¼hrung mit Biegeradius und AderendhÃ¼lsen, GerÃ¤tesymbole; bei
  â€žEinpassenâ€œ ist die Modulbeschriftung klein, lesbar mit Zoom
- 493 Tests

## D1 â€“ Designsystem und Grundlayout (2026-10-29)

- Plan fÃ¼r die Design-Ãœberarbeitung D1â€“D6 (`docs/design/PLAN.md`) und Ausbauplan M8â€“M13 (`PLAN.md`)
- Screenshots per Playwright Ã¼ber das installierte Edge (`scripts/screenshots.mjs`), Ist-Stand in
  `docs/design/before/`, aktueller Stand in `docs/design/after/`
- Design-Tokens in `apps/game/src/theme.ts` (Farben, 4-px-AbstÃ¤nde, Radien, Schatten, Schrift), als
  CSS-Variablen gesetzt; Light-Palette vorbereitet. Bestehende Styles laufen Ã¼ber die Tokens,
  Monaco-Theme und Editor-Schrift ebenfalls
- Schriften IBM Plex Sans, Plex Sans Condensed und Plex Mono lokal gebÃ¼ndelt
- Kopfzeile neu: Auftrag und Kunde, Auftrag/Datenblatt als Umschalter, Kosten und GrÃ¶ÃŸe gruppiert,
  Speichern/Laden/Export im MenÃ¼ â€žMehrâ€œ, â€žLÃ¶sung verwerfenâ€œ dort abgesetzt mit eigenem
  BestÃ¤tigungsdialog; â€žPrÃ¼fenâ€œ ist die einzige PrimÃ¤raktion (Federzug-Orange)
- Eigene Dialoge statt Browser-`confirm`/`alert` (Verwerfen, Import ersetzen, Baustein lÃ¶schen)
- Verstellbare Bereiche: Schrank/Programm, HÃ¶he der Simulation, Prozessansicht; GrÃ¶ÃŸen werden
  gespeichert, Trenner auch per Tastatur bedienbar; Mindestbreite 1280 px
- AnweisungszÃ¤hler als Balken; Ãœberschriften in Satzschreibung statt gesperrter GroÃŸbuchstaben;
  Datenblatt- und Handbuchpapier kÃ¼hl statt cremefarben; Favicon
- Testzeitlimit fÃ¼r die Level-Tests auf 60 s (unter Last liefen zwei Determinismus-Tests in das
  Standardlimit von 5 s)

## M7 â€“ Alarme, eigene Bausteine, mehrere CPUs, Level 10â€“15, Werkstatt (2026-10-29)

- Engine:
  - Alarm-OBs: Weckalarm (OB30â€¦38, Takt und Phase) und Prozessalarm (OB40â€¦47, Flanke an einem
    Eingangsbit) als eigene Codebereiche im IR; frisches PAE, sofort wirksame AusgÃ¤nge, gleiches
    Befehlsbudget wie ein Zyklus
  - Baugruppen DI 8 HF (alarmfÃ¤hig) und KOP (Koppelmodul, je 2 WÃ¶rter in beide Richtungen ab
    %QW100/%IW100); Trennwand im Schaltschrank (kein Modul darauf, keine Leitung hindurch, Baugruppen
    rechts davon brauchen eine eigene CPU)
  - Anlagenmodelle Bohrstation, Sortierstrecke und WÃ¤rmestrecke PT1 mit Totzeit; Anlagen kÃ¶nnen
    DigitaleingÃ¤nge liefern (Endlagen, Lichtschranken); Kriterium TastverhÃ¤ltnis (`duty`)
- SCL-Compiler:
  - mehrere OBs mit Ereignis, PrÃ¼fung von Nummernbereich, Takt und Eingang; eigene Temp-Variablen je OB
  - eigene FB und FC: Ein-/AusgÃ¤nge, Durchgangsparameter (auf die Variable abgebildet), statische
    Daten, Multiinstanzen von Systembausteinen und eigenen FBs, Instanz-DBs eigener FBs, Zugriff
    von auÃŸen (`"Motor_DB".Laeuft`), RETURN; Rekursion wird erkannt. Bausteine werden an der
    Aufrufstelle eingesetzt, Meldungen kommen einmal am Baustein, die ProgrammgrÃ¶ÃŸe zÃ¤hlt den Rumpf
    einmal
  - Ereignisse Ã¼berstehen Export und Import der `.scl`-Quelle (Kommentarzeile im Bausteinkopf)
- LÃ¶sungen: CPU-FÃ¤higkeiten werden geprÃ¼ft (Weck-/Prozessalarm, Alarmeingang auf DI 8 HF)
- Level 10â€“15: Bohrstation als Schrittkette, Sortierweiche mit Bit-Warteschlange, PWM Ã¼ber
  Zeitglieder, Pumpenhaus und Leitwarte mit zwei CPUs, AbfÃ¼llen mit Prozessalarm, PI-Regler als FB
  im Weckalarm â€“ jeweils mit ReferenzlÃ¶sung, Richtwerten und Tests typischer FehllÃ¶sungen
- App:
  - Bausteinauswahl je CPU (FB, FC, Weckalarm-OB, Prozessalarm-OB anlegen, umbenennen, lÃ¶schen),
    Ereigniseinstellungen, Schnittstelle je Bausteinart, eigene FBs als Instanz- und Multiinstanztyp
  - Trennwand, Koppelmodule mit Buskabel und Alarmkennzeichnung im Schaltschrank
  - Anlagenansichten fÃ¼r Bohrstation, Sortierband, Ofen, Heizband, Pumpenhaus, AbfÃ¼llung
  - Handbuch mit Seiten zu Bedienung, Baugruppen-DatenblÃ¤ttern, Laufzeitregeln, SCL, FUP und
    Boxreferenz (aus `docs/` und den Katalogen erzeugt)
  - Sandkasten: alle Baugruppen, TestgerÃ¤te, nur Handbetrieb
  - Bonusspiel Klemmen-Patience (nach 3 erledigten AuftrÃ¤gen): Reihenklemmen nach Aderfarbe und
    Querschnitt auf Sammelschienen sortieren, Spiel je Seed, RÃ¼ckgÃ¤ngig
  - `.scl`-Export je CPU
- Nicht umgesetzt aus dem Plan: Sound, eigenes Onboarding (das Handbuch erklÃ¤rt die Bedienung);
  Aufruf eigener FB/FC aus FUP
- 472 Tests

## M6 â€“ Metriken, Histogramme, Speichern (2026-10-29)

- Richtwerte (`par`) je Level aus den Metriken der ReferenzlÃ¶sungen; ein Test hÃ¤lt beides synchron
- Vergleichsverteilungen: lokal und deterministisch aus Level-id und Richtwert erzeugt
  (die meisten LÃ¶sungen etwas schlechter, langer Schwanz, wenige besser); Histogramm-Klassen,
  â€žbesser als x %â€œ
- LÃ¶sungsdatei `*.zyklus.json` (Format `zyklus-loesung`, Version 1): Export, Import mit PrÃ¼fung von
  Format, Version, Auftrag und Grobstruktur, deutsche Fehlermeldungen
- Spielstand mit VersionsschlÃ¼ssel und Migration, Verlauf der letzten 10 bestandenen PrÃ¼fungen
- App: Histogramme fÃ¼r Kosten, Energie und GrÃ¶ÃŸe im PrÃ¼fdialog (eigener Wert und Bestwert),
  KnÃ¶pfe â€žLÃ¶sung speichernâ€œ / â€žLÃ¶sung ladenâ€œ
- 411 Tests

## M5 â€“ SignalstÃ¶rungen und Analogtechnik (2026-10-28)

- Engine:
  - AnalogeingÃ¤nge mit Messbereich (physikalisch â†” 0â€¦27648), linear interpolierten Stimuli,
    Rauschen, AusreiÃŸern und Geberfehlern (Drahtbruch/Ãœberlauf 32767, Unterlauf âˆ’32768), alles per Seed
    reproduzierbar; Ãœber-/Untersteuerbereich begrenzt wie S7
  - Relaisbaugruppe REL 4 (Ansprechzeit 15 ms, Abfallzeit 30 ms); Leistungsverbraucher (SchÃ¼tze, Pumpen)
    brauchen einen Relaisausgang
  - Anlagenmodell Tank (Pumpe, verÃ¤nderlicher Verbrauch) mit RÃ¼ckkopplung auf den Messwert
  - Kriterien statt fester Soll-VerlÃ¤ufe: `always`, `range`, `exclusive`, `maxChanges`, `track`;
    Aufzeichnung von Anlagenzustand (`plant.*`) und stÃ¶rungsfreiem Messwert (`true.*`)
- Level 4â€“9: Baustellenampel, TeilezÃ¤hler mit flatternder Lichtschranke, Stern-Dreieck-Anlauf mit
  Verriegelung, HochbehÃ¤lter mit Hysterese, Drahtbruch mit Ersatzreaktion, GlÃ¤ttung eines verrauschten
  Messwerts â€“ jeweils mit ReferenzlÃ¶sung und Tests fÃ¼r typische FehllÃ¶sungen
- App: Analogspuren im Logic Analyzer (Messwert und wahrer Wert), Anlagenzeilen, Anlagenansichten
  (Ampel, Lichtschranke, Stern-Dreieck, Tank, Ofen, Durchfluss), Schalter und Schieberegler im
  Handbetrieb, verletzte Kriterien im PrÃ¼fdialog
- 398 Tests

## M4 â€“ FUP-Editor (2026-10-28)

- `@zyklus/fup-model`: Netzwerk-/Box-/Verbindungsmodell im TIA-Stil (Bool-Verbindungen, Operanden an
  Pins, Negation, erweiterbare EingÃ¤nge), Katalog mit 40 Boxen in 6 Kategorien, Absenkung nach SCL mit
  topologischer Auswertungsreihenfolge, Validierung (offene Pins, RÃ¼ckkopplung, Wert-Verbindungen â€¦),
  RÃ¼ckfÃ¼hrung aller Meldungen auf Netzwerk/Box/Pin, ProgrammgrÃ¶ÃŸe = Boxen
- SCL-Compiler: interne FUP-Funktionen (SR, RS, P_TRIG, N_TRIG, IN_RANGE, OUT_RANGE, CONV) nur fÃ¼r aus
  FUP erzeugte Bausteine
- Levels: Ãœbersetzung von SCL und FUP, CPU-Grenze in Netzwerken bzw. Anweisungen; FUP-ReferenzlÃ¶sungen
  fÃ¼r Level 1â€“3, Ã„quivalenztest FUP â‡” SCL (identische VerlÃ¤ufe Ã¼ber alle Seeds)
- App: Sprachwahl SCL/FUP je OB, FUP-Editor mit Anweisungsliste (Ziehen oder Klick), Boxen verschieben,
  Verbindungen ziehen, Negation per Klick, Operandenfelder, automatische Instanz-DBs, Fehler an der Box,
  Sprung aus der Meldungsliste zur Box; breiteres Programmfeld bei FUP
- 371 Tests

## M3 â€“ Level 1â€“3 spielbar (2026-10-28)

- Spiel-Engine in `sim-core/game`:
  - Baugruppenkatalog (CPU klein/mittel/schnell, DI 8, DO 8, AI 2, AO 2), Level-Format mit Validierung
  - Schaltschrank: SteckplÃ¤tze, Zuordnung zur CPU, automatische Adressvergabe wie TIA (DI/DO ab Byte 0,
    AI/AO ab Wort 64), Verdrahtung mit KanalprÃ¼fung, Kabelkanal mit KapazitÃ¤t je Spalte
  - PLC-Variablen angeschlossener GerÃ¤te werden automatisch angelegt und beim Umstecken nachgefÃ¼hrt
  - Eingangssignale mit Ã–ffner-Logik und reproduzierbarem Prellen (Seed)
  - Simulationslauf (Testfall oder Handbetrieb, Einzelzyklus), Soll/Ist-Vergleich mit Toleranzfenster
    und PrÃ¼fung der Schaltanzahl, Verifikation Ã¼ber alle TestfÃ¤lle und Seeds, Metriken
- `@zyklus/levels`: AuftrÃ¤ge 1â€“3 (FÃ¶rderband mit Selbsthaltung, Zweihandbedienung, StromstoÃŸschalter mit
  prellendem Taster) mit ReferenzlÃ¶sungen als TIA-Quellen; Tests prÃ¼fen ReferenzlÃ¶sungen, typische
  FehllÃ¶sungen und Determinismus; Speichergrenze je CPU-Typ
- `apps/game` (React + Vite + Monaco, offline):
  - Posteingang mit Freischaltung, Auftrags-Mail und Datenblatt
  - Schaltschrank (SVG): Baugruppen stecken/verschieben/entfernen, GerÃ¤te verdrahten, Kanalbelegung, Live-LEDs
  - Bausteineditor: Main [OB1] mit Schnittstelle (Temp/Constant), SCL-Editor mit Hervorhebung,
    Fehlermarkierung und AutovervollstÃ¤ndigung, PLC-Variablentabelle, Global-/Instanz-DBs, Meldungsliste
  - Simulation: Start/Pause/Zyklus/Ã—10/Ã—100, Logic Analyzer (Soll grau, Ist farbig, Abweichung rot),
    Anlagenansicht (FÃ¶rderband, Presse, Lampe), Handbetrieb mit Tastern
  - PrÃ¼fen mit Ergebnis je Testfall, fehlgeschlagene Seeds direkt ansehen, Bestwerte, Export als `.scl`
  - LÃ¶sungen und Fortschritt im `localStorage`
- 336 Tests

## S7-Treue (2026-10-28, zwischen M2 und M3)

Auf Wunsch: SCL und FUP sollen echtes S7 sein (TIA-Bausteineditor-Stil, Referenz S7-1500).

- Projektmodell wie TIA: PLC-Variablentabelle, OB1 â€žMainâ€œ mit Schnittstelle (nur Temp/Constant),
  Global-DBs, Instanz-DBs (`IEC_TIMER`, `IEC_COUNTER`, `TON_TIME`, `CTU_INT`, `R_TRIG` â€¦)
- SCL: Aufrufe `"DB".TON(â€¦)` / `"DB"(â€¦)`, Pfadzugriffe `"Daten".T1.Q`, `REGION`, `MUX â€¦ INELSE`,
  TIA-Typen fÃ¼r Absolutadressen (`%IW` = Word), neue Typen Byte und DWord, Literale `B#`, `W#`, `DW#`,
  implizite Konvertierungen nach S7-1500-Tabelle, Umlaute in Namen
- SR/RS, IN_RANGE/OUT_RANGE in SCL entfernt (gibt es in TIA nur in FUP/KOP)
- Externe Quellen: Import (`sourceToProject`), Export (`projectToSource`), direkte Ãœbersetzung
  (`compileSource`)
- Meldungen mit Ort (Codeteil, Schnittstellenzeile, Variablentabelle) und TIA-Typnamen
- 297 Tests

## M2 â€“ SCL-Compiler (2026-10-28)

- `@zyklus/scl-compiler`:
  - Handgeschriebener Lexer: Kommentare `//`, `(* *)`, `/* */`; lokale (`#x`), globale (`"x"`) Namen,
    Absolutadressen; Zahlen in allen Basen, typisierte Literale, Zeitangaben (`T#1s200ms`)
  - Recursive-Descent-Parser mit IEC-PrÃ¤zedenz und Fehler-Recovery (mehrere Fehler pro Lauf)
  - Deklarationen VAR / VAR_TEMP / VAR CONSTANT, FB-Instanzen inkl. SR/RS
  - IF/ELSIF/ELSE, CASE (Listen, Bereiche, ELSE), FOR (BY), WHILE, REPEAT, EXIT, CONTINUE, RETURN
  - FB-Aufrufe mit `:=`/`=>`, Elementzugriff `#T1.Q`; alle M1-Funktionen und Konvertierungen
  - TypprÃ¼fung mit impliziter Erweiterung (INT â†’ DINT â†’ REAL), kontextabhÃ¤ngigen Literalen,
    deutschen Fehlermeldungen inkl. LÃ¶sungshinweis, Warnungen (unbenutzt, Schreiben auf Eingang)
  - Codegenerierung â†’ IR mit direktem Schreiben ins Ziel und wiederverwendeten Hilfsvariablen
  - ProgrammgrÃ¶ÃŸe = Anzahl Anweisungen
  - Monaco: Monarch-Tokenizer, Sprachkonfiguration, Umwandlung Diagnosen â†’ Marker
- 155 Tests (Lexer, PrÃ¤zedenz, Recovery, AusfÃ¼hrung auf der Sim-CPU, Fehlermeldungen).
- Sprachumfang dokumentiert in `docs/scl.md`.

## M1 â€“ Sim-Core (2026-10-27)

- Monorepo mit npm workspaces, TypeScript (strict), Vitest, Prettier.
- `@zyklus/sim-core`:
  - Datentypen BOOL/INT/DINT/REAL/WORD/TIME mit Ãœberlauf- und Konvertierungsregeln
  - Speicherbereiche `%I/%Q/%M` (big-endian), Absolutadressen, symbolische Variablentabelle
  - IR (lineare, typisierte Befehlsliste) mit Builder und statischem Validator (deutsche Fehlermeldungen)
  - Interpreter: Bitlogik, S/R, SR/RS, P_TRIG/N_TRIG, R_TRIG/F_TRIG, TP/TON/TOF/TONR, CTU/CTD/CTUD,
    Vergleiche, IN_RANGE/OUT_RANGE, Arithmetik, ABS/NEG, LIMIT/MIN/MAX, SEL/MUX, NORM_X/SCALE_X,
    WORD-Logik, SHL/SHR, CONV, SprÃ¼nge
  - CPU-Zyklus PAE â†’ OB1 â†’ PAA, ZykluszeitÃ¼berwachung mit STOP, mehrere CPUs auf einer Zeitachse
  - CPU-Katalog (klein/mittel/schnell), gewichtete Energie-Metrik, seedbarer Zufallsgenerator
- 115 Unit-Tests inkl. Timer-RandfÃ¤lle, SR/RS-Dominanz, verpasste Kurzimpulse, ZykluszeitÃ¼berschreitung,
  Determinismus.
- Semantik dokumentiert in `docs/semantik.md`.
