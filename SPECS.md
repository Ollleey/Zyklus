# Auftrag: PLC-Puzzlespiel im Stil von Shenzhen I/O – mit Siemens-artiger FUP/SCL-Logik

Du bist Lead-Developer für ein Lern- und Puzzlespiel. Baue ein Spiel, das sich **spielerisch fast 1:1 wie Shenzhen I/O** anfühlt (Datenblatt-Aufgabe → Bauteile auf Platine platzieren → verdrahten → programmieren → simulieren → gegen Soll-Signalverläufe verifizieren → Optimierungs-Histogramme), aber statt Assembler-Mikrocontrollern wird mit **SPS-Logik im Siemens-TIA-Stil** programmiert: **FUP (Funktionsplan)** und **SCL (Structured Control Language, IEC 61131-3 ST)**.

Arbeite zuerst im Plan-Modus: lies diese Spezifikation, stelle maximal 5 Rückfragen zu echten Unklarheiten, schlage dann einen Meilensteinplan vor und warte auf Freigabe.

---

## 1. Rechtliches / Originalität
- Eigener Spielname, eigene Grafiken, eigene Texte. **Keine** Assets, Texte, Levels oder Namen von Zachtronics übernehmen.
- Keine Siemens-Logos oder -Markennamen im UI. Bezeichnungen wie „FUP-Editor“, „SCL-Editor“, „OB1“, „DB“, „PAE/PAA“ sind als Fachbegriffe ok. Kein Hinweis auf offizielle Kompatibilität.

## 2. Tech-Stack (Vorschlag, begründet abweichen erlaubt)
- **TypeScript + Vite + React**, Rendering von Platine/FUP auf **Canvas oder SVG**.
- **Monaco Editor** für SCL inkl. Syntax-Highlighting und Fehlermarkierung.
- **Simulations-Core als reines TS-Paket** ohne UI-Abhängigkeit, deterministisch, vollständig mit **Vitest** getestet.
- Speichern in `localStorage` + Export/Import von Lösungen als JSON.
- Läuft offline im Browser, später optional mit Electron/Tauri verpackbar.

## 3. Kern-Gameplay-Loop (wie Shenzhen I/O)
1. **Auftrag/Datenblatt**: Kunde (fiktive Firma) schickt Aufgabe per In-Game-Mail. Datenblatt beschreibt Ein-/Ausgänge, Timing, Grenzwerte.
2. **Bauplatz (Schaltschrank/Hutschiene statt Platine)**: begrenzter Platz. Spieler platziert Module aus einem Katalog.
3. **Verdrahtung**: Sensoren/Aktoren (vom Level fest vorgegeben, am Rand) mit DI/DO/AI/AO-Kanälen verbinden. Leitungen dürfen sich nicht kreuzen bzw. kosten Platz (Kabelkanäle).
4. **Programmieren**: jede CPU bekommt ein Programm (OB1) in FUP **oder** SCL – pro CPU wählbar.
5. **Simulation**: Play / Pause / Einzelzyklus / Schnellvorlauf. Live-**Zeitdiagramm (Logic Analyzer)** mit Soll- (grau) und Ist-Verlauf (farbig), Abweichungen rot markiert.
6. **Verifikation**: Lösung gilt nur, wenn alle Testfälle (inkl. zufällige Seeds) bestehen.
7. **Bewertung mit 3 Metriken + Histogrammen**: 
   - **Kosten** (Summe Modulpreise)
   - **Energie/Rechenaufwand** (ausgeführte Anweisungen bzw. gewichtete Operationen über alle Zyklen)
   - **Programmgröße** (FUP: Anzahl Boxen; SCL: Anzahl Anweisungen, nicht Zeilen)
   Histogramme mit lokal generierten Fake-Verteilungen + eigenen Bestwerten.
8. **Sandbox-Modus** und **eingebautes Handbuch** (Datenblätter aller Module + Befehlsreferenz als im Spiel lesbare „PDF-Seiten“).

## 4. SPS-Simulationsmodell (das Herzstück)
### 4.1 Zyklus
- Klassischer zyklischer Betrieb pro CPU:
  1. Prozessabbild der Eingänge (**PAE**) einlesen
  2. **OB1** ausführen
  3. Prozessabbild der Ausgänge (**PAA**) schreiben
- **Zykluszeit** pro CPU-Typ konfigurierbar (z. B. 1 ms / 5 ms / 10 ms). Globale Simulationszeit in ms-Ticks.
- Optional ab späterem Meilenstein: **OB35-Weckalarm** (zyklischer Interrupt) und **OB40 Prozessalarm** (Flanke an DI).
- Mehrere CPUs möglich, Kommunikation über einfache **Koppelmodule** (z. B. 16-Bit-Wort-Austausch, wie PUT/GET light) mit Latenz von 1 Zyklus.

### 4.2 Datentypen und Speicher
- `BOOL, INT, DINT, REAL, WORD, TIME`
- Operandenbereiche: `%I` (Eingänge), `%Q` (Ausgänge), `%M` (Merker), `%IW/%QW` (Analog), lokale Variablen (`TEMP`), statische Variablen in **Instanz-DBs**, ein globaler **DB** pro CPU.
- **Symbolische Variablentabelle** (PLC-Tags) pro CPU, Spieler vergibt Namen.

### 4.3 Befehlsumfang (FUP und SCL identisch, gemeinsame Semantik)
- Bitlogik: `AND, OR, XOR, NOT`, Zuweisung, `S` / `R`, **SR / RS** (Dominanz korrekt!)
- Flanken: `P_TRIG / N_TRIG`, `R_TRIG / F_TRIG`
- Zeiten (IEC): `TP, TON, TOF, TONR`
- Zähler: `CTU, CTD, CTUD`
- Vergleich: `==, <>, <, <=, >, >=`, `IN_RANGE / OUT_RANGE`
- Arithmetik: `+ - * / MOD`, `ABS, LIMIT, MIN, MAX`
- Übertragen/Auswahl: `MOVE, SEL, MUX`
- Analogwert: **`NORM_X`, `SCALE_X`**
- Wort-Logik und Schieben: `AND/OR/XOR` auf WORD, `SHL/SHR`
- SCL zusätzlich: `IF/ELSIF/ELSE`, `CASE`, `FOR`, `WHILE` (mit Schleifenlimit gegen Endlosschleifen → Zykluszeitüberschreitung = CPU geht in STOP, wie echt)
- Spieler darf eigene **FBs/FCs** anlegen (ab späterem Meilenstein), Kosten zählen in Programmgröße.

### 4.4 Architektur
- FUP-Graph **und** SCL-Text werden in dieselbe **Zwischenrepräsentation (IR)** kompiliert; nur der Interpreter der IR wird simuliert.
- SCL: eigener Lexer/Parser (hand-written oder Chevrotain) mit verständlichen deutschen Fehlermeldungen inkl. Zeile/Spalte.
- FUP: Netzwerke wie in TIA (Netzwerk 1, 2, …), Boxen per Drag & Drop, Pins verbinden, Negationskreis am Eingang per Klick, Zuweisungsboxen rechts.
- Auswertungsreihenfolge innerhalb eines Netzwerks und zwischen Netzwerken exakt definiert und dokumentiert (Netzwerke top-down).

## 5. Eingangssignalverarbeitung (Pflicht-Feature, eigene Level-Mechanik)
Die Prozess-Simulation erzeugt **realistische, fehlerbehaftete Signale**, die der Spieler verarbeiten muss:
- **Tasterprellen**: konfigurierbare Prellzeit und Prellanzahl → Spieler muss entprellen (TON/TOF oder Zähllogik).
- **Rauschen auf Analogwerten**: Rohwert 0…27648 (Siemens-Normbereich), Rauschamplitude, Ausreißer/Spikes → Mittelwertbildung, Hysterese, Plausibilisierung.
- **Drahtbruch/Überlauf**: Rohwert 32767 bzw. Unterlauf → Fehler erkennen und Ersatzwert/Störmeldung ausgeben.
- **Kurze Impulse** kürzer als die Zykluszeit → werden ohne Prozessalarm verpasst (lehrreich!).
- **Öffner vs. Schließer** (NC/NO), drahtbruchsichere Not-Halt-Logik.
- **Sensor-Flattern** an Lichtschranken, Mehrfachauslösung beim Zählen.
- Jede Störung über **Seed** reproduzierbar; Testfälle laufen mit mehreren Seeds.

## 6. Module-Katalog (Beispiele, Preise frei balancierbar)
| Modul | Platz | Inhalt |
|---|---|---|
| CPU klein | 2 | 1 OB1, max. 10 Netzwerke / 40 SCL-Anweisungen, 10 ms Zyklus |
| CPU mittel | 3 | mehr Speicher, 5 ms, Weckalarm |
| CPU schnell | 3 | 1 ms, Prozessalarm |
| DI 8 / DO 8 | 1 | digitale Kanäle |
| AI 2 / AO 2 | 1 | analog, 0…27648 |
| Koppelmodul | 1 | Datenaustausch zwischen CPUs |
| Relais / Schütz | 1 | Leistungsausgang mit Schaltverzögerung |

## 7. Level-Kampagne (mind. 15, steigende Schwierigkeit)
Levels als **JSON-Dateien** (Datenblatt-Text, feste Peripherie, Testfälle, Soll-Signalverläufe, erlaubte Module, Story-Mail). Vorschläge:
1. Förderband Start/Stopp mit Selbsthaltung
2. Zweihandbedienung mit 0,5 s Gleichzeitigkeit
3. Entprellter Taster als Stromstoßschalter
4. Ampelsteuerung mit Zeiten
5. Teilezähler mit Lichtschranke (flatternd)
6. Stern-Dreieck-Anlauf mit Verriegelung
7. Tankfüllstand: Analogwert skalieren, Pumpe mit Hysterese
8. Drahtbrucherkennung am Temperatursensor + Ersatzwert
9. Gleitender Mittelwert gegen Rauschen
10. Schrittkette Bohrstation (SCL `CASE`)
11. Sortierweiche nach Teilefarbe/-höhe
12. Pulsweitenmodulation über Zeitglieder
13. Zwei CPUs über Koppelmodul synchronisieren
14. Kurzimpuls-Zähler (nur mit Prozessalarm lösbar)
15. Einfacher P/PI-Regler für Temperatur mit Strecke 1. Ordnung
Plus: **Bonus-/Puzzle-Level** im Stil eines Minispiels (in Shenzhen I/O war es Solitaire – hier eigenes Minispiel erfinden, z. B. Kabelsortier-Patience).

## 8. Prozess-Visualisierung
- Neben Platine/Code eine kleine **animierte Anlagen-Ansicht** (Förderband, Tank, Ampel …), getrieben von den Ausgängen. Spieler sieht sofort, was passiert.
- Taster/Schalter in Sandbox per Klick bedienbar.

## 9. Qualitätsanforderungen
- Simulations-Core: **Unit-Tests für jeden Befehl**, besonders Timer (TON/TOF/TP-Randfälle), Flanken, SR/RS-Dominanz, SCALE_X/NORM_X, Zykluszeitüberschreitung.
- Determinismus-Test: gleiche Lösung + gleicher Seed → identische Metriken.
- Für jedes Level eine **Referenzlösung** im Repo, die per Test gegen das Level verifiziert wird.
- Code sauber modularisiert: `packages/sim-core`, `packages/scl-compiler`, `packages/fup-model`, `apps/game`.
- Nach jedem Meilenstein: Tests grün, Git-Commit, kurze Notiz in `CHANGELOG.md`.

## 10. Meilensteine (Vorschlag)
1. **M1 – Sim-Core**: Zyklusmodell, Datentypen, IR-Interpreter, Bitlogik, Timer, Zähler + Tests.
2. **M2 – SCL-Compiler**: Parser → IR, Fehlermeldungen, Monaco-Integration.
3. **M3 – Level 1–3 spielbar**: Level-JSON-Loader, Zeitdiagramm, Verifikation, einfache Platine.
4. **M4 – FUP-Editor**: Netzwerke, Boxen, Verbindungen → IR.
5. **M5 – Signalstörungen + Analogtechnik**: Prellen, Rauschen, Drahtbruch, Level 4–9.
6. **M6 – Metriken + Histogramme + Speichern/Export**.
7. **M7 – Restliche Level, Mehr-CPU, Alarme, Handbuch, Bonus-Minispiel, Polish**.

Beginne mit M1, nachdem ich den Plan freigegeben habe.
