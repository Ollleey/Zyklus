# Design-Überarbeitung: vorher und nachher

Aufnahmen mit `node scripts/screenshots.mjs <ordner>` (Playwright über das installierte Edge,
1440 × 900, laufender Dev-Server). Vorher-Stand: nach M7 (191d33f), vor D1. Nachher-Stand: D6.
Plan und Entscheidungen: [PLAN.md](PLAN.md).

| Ansicht                         | Vorher                                            | Nachher                                                            |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Level 1 leer                    | [before/02](before/02-level1-leer.png)            | [after/02](after/02-level1-leer.png)                               |
| Level 1 in der Simulation       | [before/03](before/03-level1-simulation.png)      | [after/03](after/03-level1-simulation.png)                         |
| Analog-Level                    | [before/04 (Tank)](before/04-analog-tank.png)     | [after/04 (zwei Behälter, 4–20 mA)](after/04-analog-behaelter.png) |
| Sandkasten mit allen Modultypen | [before/05](before/05-sandkasten-alle-module.png) | [after/05](after/05-sandkasten-alle-module.png)                    |
| Handbuch                        | [before/06](before/06-handbuch.png)               | [after/06](after/06-handbuch.png)                                  |
| Klemmen-Patience                | [before/07](before/07-patience.png)               | [after/07](after/07-patience.png)                                  |

Zusätzlich nachher: Nahaufnahme CPU und E/A ([08](after/08-schrank-nah.png)), Trennwand mit zwei
CPUs ([09](after/09-level13-trennwand.png)), CPU per Schalter auf STOP ([10](after/10-sandkasten-stop.png)),
Feldgerätesymbole ([12](after/12-feldgeraete-rechts.png)), Kompakt-CPU, DI 8/DO 8, AI 4 mit
Modul-Inspektor ([13](after/13-kompakt-analog.png)), Frequenzumrichter-Level ([14](after/14-level17-umrichter.png)),
Zeitdiagramm mit Abweichung und Zeiger ([15](after/15-zeitdiagramm-abweichung.png)), Live-Werte im
Editor ([16](after/16-beobachten.png)).

## Was sich geändert hat

| Bereich            | Vorher                                                                | Nachher                                                                                                                                |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Schaltschrank      | flache dunkle Rechtecke, Hutschiene aus Linien, Kanal als Zahlenreihe | maßstäblich in mm: verzinkte Platte, 35-mm-Hutschiene mit Langlöchern, Kanäle mit Deckel und Belegungsschild, zoom- und verschiebbar   |
| Proportionen       | DI 8 halb so breit wie die CPU                                        | 15-mm-Raster: CPU 90–120 mm, E/A-Module 15–30 mm                                                                                       |
| CPU                | Rechteck mit zwei Punkten                                             | Gehäuse mit Lüftung, Fronttür, LEDs RUN/STOP/ERROR/MAINT mit Leuchten, Anzeige mit Zyklus und Last, Betriebsartenschalter, Karte, RJ45 |
| E/A-Module         | Kanalpunkte mit Adresse                                               | Beschriftungsstreifen mit LED, Adresse und Symbol, Federzugklemmen, Analogbalken und Fehler-LED                                        |
| Leitungen          | 1-px-Linien in Typfarbe                                               | Adern mit Biegeradius durch den Kanal, Aderendhülsen, DC blau, Analog violett geschirmt, Hover-Hervorhebung                            |
| Feldgeräte         | gleiche Karten                                                        | Symbole (Taster, Not-Halt, Schalter, Lichtschranke, Motor, Ventil, Leuchte, Messumformer) mit Kennzeichnung                            |
| Zeitdiagramm       | Soll und Ist kaum unterscheidbar, Leerraum darunter                   | Ist kräftig, Soll als helles Band, Abweichungen schraffiert und anklickbar, Analogachsen, Zeiger mit allen Werten, füllt den Bereich   |
| Prozessansicht     | ein Viertel der Breite, Pillen-Taster                                 | verstellbar (Standard ein Drittel), Drucktaster mit Hub, Öffner rot, Signal und Wert am Taster                                         |
| Kopfzeile          | neun gleichrangige Knöpfe                                             | Auftrag, Unterlagen, Kennzahlen, Menü „Mehr“, „Prüfen“ als einzige Primäraktion, Verwerfen mit Bestätigungsdialog                      |
| Typografie, Farben | Systemschrift, gesperrte Großbuchstaben                               | IBM Plex Sans/Condensed/Mono lokal, Tokens in `theme.ts`, Federzug-Orange nur an Klemmen und „Prüfen“                                  |

## Messwerte

- Simulation ×100 im Level 16 (40-s-Testfall) mit laufendem Zeitdiagramm und Live-Werten:
  55–61 Bilder je Sekunde (Playwright, `requestAnimationFrame` über 2 s gezählt).
- Kontrast: Text `#E4E7EA` und gedämpft `#9AA4AE` auf `#21262D` ≥ 4,5 : 1.
