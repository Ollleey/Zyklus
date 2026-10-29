# Design-Überarbeitung D1–D6 – Plan

**Stand:** D1–D6 umgesetzt, siehe [README.md](README.md) (vorher/nachher) und `CHANGELOG.md`.
Abweichungen vom Plan: Trennwand 30 mm; eigene 0-V-Rückleitung nicht gezeichnet (das Modell kennt
keine Bezugsleiter); Light Theme nur als Tokens; volle Beobachtung (Haltepunkte, Steuern) bleibt M9.

Grundlage: Auftrag „Design-Überarbeitung + Erweiterungen“, Rückfragen vom 2026-10-29,
Ist-Screenshots in [`before/`](before/) (erzeugt mit `node scripts/screenshots.mjs docs/design/before`).

Entschieden:

- Screenshots mit Playwright über das installierte Edge (`channel: 'msedge'`), Skript `scripts/screenshots.mjs`.
- Schriften **IBM Plex Sans** (mit **Plex Sans Condensed** für schmale Modulfronten) und **IBM Plex Mono**, lokal über `@fontsource`.
- Raster **realistisch skaliert** (siehe Abschnitt 2).
- Erst D1–D6, danach M8 ff. aus [`PLAN.md`](../../PLAN.md). Beim `.scl`-Export werden `0/1` an BOOL zu `TRUE/FALSE`.

## 1. Befund aus den Ist-Screenshots

| Stelle                | Problem                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Schrank (02, 05)      | Module sind flache Kästen, Hutschiene ein grauer Streifen, Kabelkanal eine Zahlenreihe ohne Kanal-Optik          |
| Proportionen (05)     | DI 8 ist halb so breit wie die CPU – real ist die CPU sechsmal breiter; der Schrank wirkt leer und spielzeughaft |
| Feldgeräte            | identische Karten, Kabel sind 1-px-Linien in Typfarbe, keine Klemmen                                             |
| Zeitdiagramm (03, 05) | Soll und Ist nicht unterscheidbar, Spuren ohne Signal füllen die Höhe, darunter ~150 px Leerraum                 |
| Prozessansicht (03)   | knapp 1/4 der Breite, Taster als Pillen                                                                          |
| Kopfzeile (03)        | neun gleichrangige Knöpfe; „Lösung verwerfen“ steht zwischen harmlosen Aktionen                                  |
| Typografie            | System-UI plus Mono für Zahlen, Großbuchstaben-Überschriften mit Sperrung („SCHALTSCHRANK“)                      |

## 2. Maßstab und Raster (realistisch skaliert)

Ein Rasterschritt = **15 mm** (Teilungseinheit, „TE“). Die Hutschiene ist in mm bemaßt, der Schrank
wird maßstäblich gezeichnet (1 mm = 1 SVG-Einheit, Zoom regelt die Darstellung).

| Modul                       | Breite        | Bisher (alte Einheit) | Anmerkung                             |
| --------------------------- | ------------- | --------------------- | ------------------------------------- |
| CPU klein                   | 6 TE (90 mm)  | 2                     |                                       |
| CPU klein Onboard (neu)     | 8 TE (120 mm) | –                     | DI 6 / DO 4 / AI 2 integriert         |
| CPU mittel, CPU schnell     | 7 TE (105 mm) | 3                     |                                       |
| DI 4, DO 4 (neu)            | 1 TE          | –                     | billiger als DI 8 / DO 8              |
| DI 8, DO 8, DI 8 HF         | 1 TE          | 1                     |                                       |
| AI 2, AO 2                  | 1 TE          | 1                     | Messbereich je Kanal einstellbar      |
| AI 4 (neu), DI 8/DO 8 (neu) | 2 TE          | –                     |                                       |
| REL 4, KOP                  | 2 TE          | 1                     | Relais und Busanschluss bauen breiter |

- **Schrankbreite je Level** neu in TE: Referenzaufbau + etwa der heutige relative Spielraum, damit
  Platz Rätselelement bleibt. Kapazität der Kabelkanäle bleibt; Belegung wird je TE-Spalte gezählt.
- **Trennwand** (Level 13) als 2-TE-Schottblech.
- **Preise** der bestehenden Module bleiben, neue Module werden dazwischen eingepreist;
  Richtwerte (`par`) werden aus den Referenzlösungen neu bestimmt, ein Test hält sie synchron.

### Migration

- Lösungsformat `version: 2` (Positionen in TE). Version 1 wird beim Laden umgerechnet: Module in
  ihrer Reihenfolge von links gepackt, Lücken proportional übernommen. Passt ein alter Aufbau nicht
  mehr auf die Schiene, lädt er trotzdem und zeigt die übliche Meldung „ragt über die Hutschiene“.
- Lösungsdatei `zyklus-loesung` Version 2, Import von Version 1 mit derselben Umrechnung;
  localStorage `zyklus.version` 3. Tests: Altstände aller Level laden, Referenzaufbauten nach Migration gültig.

## 3. Gestaltung

### Leitidee

Der Schaltschrank ist das eine laute Element: maßstäblich, aus Material (verzinkte Montageplatte,
Hutschiene, Kanäle, Klemmen, Adern). Alles drumherum ist ruhiges Werkzeug – Editor, Diagramm,
Kopfzeile treten zurück und nehmen die Signalfarben des Schranks auf, statt eigene Akzente zu setzen.

### Farben (Tokens in `apps/game/src/theme.css` als CSS-Variablen)

| Name            | Hex       | Rolle                                                     |
| --------------- | --------- | --------------------------------------------------------- |
| Graphit         | `#1A1E23` | Hintergrund der Arbeitsfläche                             |
| Schiefer        | `#252B33` | Panels, Editor-Hintergrund                                |
| Zink            | `#BFC5CA` | Montageplatte (mit Gradient und feinem SVG-Rauschen)      |
| Federzug-Orange | `#F08A1C` | Klemmenbetätiger und die eine Primäraktion „Prüfen“       |
| Aderblau        | `#2D5FAE` | DC-Steuerleitungen; 0 V als blau-weiße Ader               |
| Messviolett     | `#8E63CF` | Analogsignale (Adern geschirmt), Analogspuren im Diagramm |

Status: LED-Grün `#3FD98A`, Gelb `#F4C443`, Rot `#E5484D`, Ist-Signal Cyan `#3CC8DC`. Text auf Graphit
`#E4E7EA` / gedämpft `#9AA4AE` (beide ≥ 4,5:1). Status nie nur über Farbe: LEDs tragen Kürzel,
Abweichungen im Diagramm sind zusätzlich schraffiert.

### Schrift

- IBM Plex Sans 400/500/600 für UI, Satzspiegel 14 px, Skala 12 · 14 · 16 · 20 · 26.
- IBM Plex Sans Condensed 500 für Beschriftungsstreifen und Typschilder (passt auf 15 mm).
- IBM Plex Mono für Adressen, Code, Werte – nur dort, wo Zeichen ausgerichtet sein müssen.
- Überschriften in Satzschreibung statt gesperrter Großbuchstaben.

### Layout (≥ 1280 px, Splitter verstellbar, Größen gespeichert)

```
┌ Auftrag #1 Förderband ─ Kunde ───────── ¤8  ▮▮▯ 1/40 ───── [Mehr ▾] [▶ Prüfen] ┐
├──────────────────────────────────────────┬──────────────────────────────────────┤
│ Schaltschrank (Zoom/Pan, Einpassen)       │ Programm: Bausteine | Variablen | DBs │
│  ═ Kanal ═══════════════════════════════  │                                      │
│  [CPU      ][I][Q][AI]  … Hutschiene     │   SCL / FUP                          │
│  ═ Kanal ═══════════════════════════════  │                                      │
│ Palette (links, senkrecht, nach Typ)      │ Meldungen                            │
├──────────────────────────────────────────┴──────────────────────────────────────┤
│ Simulation ▶ ⏸ |▷ ×1 ×10 ×100  t = 1,234 s                                      │
│ Zeitdiagramm (2/3, füllt die Höhe)               │ Prozessansicht (1/3)          │
└──────────────────────────────────────────────────┴───────────────────────────────┘
```

Inhalte linksbündig; Zahlen im Diagramm und in Tabellen rechtsbündig in Mono.

### Abgleich mit Standardlösungen

Vorher-Entwurf war „dunkles UI mit einem grellen Akzent und Mono-Labels überall“ – das ist genau
die generische Variante. Geändert: Akzent ist nicht frei gewählt, sondern das Orange der
Federzugklemmen und kommt nur an Klemmen und „Prüfen“ vor; Mono nur für Adressen/Code; keine
gesperrten Großbuchstaben-Labels; keine Punkt-getrennten Meta-Zeilen in der Kopfzeile.

## 4. Meilensteine

Nach jedem: alle Tests grün, Referenzlösungen bestehen, Screenshots aktualisiert, Commit, CHANGELOG.

### D1 – Designsystem und Grundlayout

- `theme.css` mit Tokens (Farben, 4-px-Abstände, Radien, Schatten, Typo), Schriften lokal gebündelt,
  vorhandene Styles auf Tokens umgestellt; Light Theme vorbereitet (nur Tokens).
- Kopfzeile neu: Auftrag/Kunde, Kosten/Größe gruppiert, Anweisungszähler als Balken, „Prüfen“ einzige
  Primäraktion, Speichern/Laden/Export im Menü „Mehr“, „Lösung verwerfen“ abgesetzt mit eigenem
  Bestätigungsdialog (statt `confirm`).
- Layout mit Splittern (Größe in localStorage), Mindestbreite 1280 px.
- Monaco-Theme aus den Tokens.

### D2 – Hardware-Optik

- Montageplatte, 35-mm-Hutschiene mit Langlöchern und Lichtkante, geschlitzte Kanäle oben und unten
  mit Deckel und Füllstands-Label am Kanal.
- Maßstäbliche Module nach Abschnitt 2 (Datenmodell + Migration hier, damit D2 nicht doppelt zeichnet).
- CPU: anthrazit, Lüftungsschlitze, Fronttür, LEDs RUN/STOP/ERROR/MAINT mit Glow live, RUN/STOP-Schalter
  (wirksam im Sandkasten, sonst gesperrt), Speicherkartenschacht, RJ45 mit Link-LED, Typschild mit Name,
  Soll- und gemessener Zykluszeit.
- I/O-Module: Beschriftungsstreifen (Adresse + gekürztes Symbol, Tooltip voll), Kanal-LEDs live,
  Federzugklemmen unten; Typstreifen oben dezent.
- Schrank zoom- und verschiebbar (Mausrad, Ziehen, „Einpassen“), Einrast-Animation beim Stecken
  (respektiert `prefers-reduced-motion`).

### D3 – Kabel und Feldgeräte

- Adern als Pfade mit Biegeradius durch den unteren Kanal, Farben nach Praxis (DC Aderblau, Analog
  violett mit gestricheltem Schirm, 0 V blau-weiß), Aderendhülse an der Klemme; aktives Signal hellt auf,
  Hover hebt die ganze Strecke samt Gerät und Klemme hervor.
- Gerätesymbole statt Karten: Taster grün, Öffner/Stopp rot, Not-Halt mit Pilz, Lichtschranke, Motor
  (M im Kreis), Ventil, Leuchtmelder, Messumformer mit Signalart; Kennzeichnung wie im Schaltplan.
- Verhalten unverändert (Klick Gerät → Klick Klemme), Klemmen statt Kanalpunkte als Ziel.

### D4 – Neue Module, Analogtechnik, zwei Level

- Katalog: DI 4, DO 4, DI 8/DO 8, AI 4, CPU klein Onboard; Adressvergabe für gemischte Module und
  Onboard-I/O wie TIA (Onboard zuerst).
- Messbereich je Analogkanal (0–10 V, 4–20 mA) im **Modul-Inspektor**. Feldgeräte bekommen eine feste
  Signalart; ein falscher Bereich wirkt in der Simulation (falsche Rohwerte, Warnung am Modul).
  4–20 mA erkennt Drahtbruch (32767), 0–10 V nicht – das wird bei Level 8 sichtbar.
- Analogmodul-Front: Mini-Balken je Kanal, rote Fehler-LED bei Drahtbruch/Überlauf.
- Level 16 **Zwei Behälter, ein Pumpwerk** (AI 4, 4–20 mA, Drahtbruch je Sonde, Pumpenwechsel) und
  Level 17 **Förderband mit Frequenzumrichter** (Poti 0–10 V → Rampe → AO-Sollwert, Anlagenmodell Antrieb
  mit Hochlauf, Kriterium Drehzahl folgt Sollwert). Je Referenzlösung, Richtwerte, Fehllösungstests.
  Die Level von M8 ff. verschieben sich um zwei Nummern.
- Erlaubnislisten der Level 1–15 um passende neue Module ergänzen; alle Referenzen bleiben lösbar.

### D5 – BOOL-Literale `0/1`

- Compiler: Ganzzahl-Literale 0 und 1 sind an BOOL zulässig (Zuweisung, Vergleich, Parameter,
  Startwerte in Variablentabelle und DB); andere Literale → Fehler „BOOL erwartet: nur 0, 1, TRUE oder
  FALSE erlaubt.“ mit Zeile/Spalte; INT-Variablen bleiben unverträglich. `TRUE`/`FALSE` in jeder
  Schreibweise (der Lexer kennt Schlüsselwörter bereits ohne Groß-/Kleinschreibung, wird mit Tests
  festgehalten).
- Export: Der Compiler meldet die Stellen der umgedeuteten Literale; `projectToSource` ersetzt genau
  diese durch `TRUE`/`FALSE`.
- FUP: Konstanten an BOOL-Pins `0/1/TRUE/FALSE`.
- Einstellung „BOOL als 0/1 oder TRUE/FALSE“ (Standard 0/1) für Zeitdiagramm, Variablentabelle und
  Live-Werte.
- Tests in Compiler und FUP-Modell für jeden Fall.

### D6 – Zeitdiagramm, Prozessansicht, Feinschliff, Abnahme

- Zeitdiagramm: Ist kräftig (Cyan BOOL, Violett analog), Soll gestrichelt dahinter, Abweichungen rot
  schraffiert (Klick springt zur Stelle), Analogspuren mit Wertachse, Cursor mit Zeit und allen Werten,
  kompakte Spuren, füllt den Bereich; Canvas statt SVG, falls ×100 sonst unter 50 fps fällt.
- Prozessansicht ≥ 1/3 der Breite, Bewegung per `requestAnimationFrame` zwischen Zyklen interpoliert,
  Drucktaster als Grafik mit sichtbarem Hub, Öffner korrekt dargestellt.
- Einfache Live-Werte im SCL-Editor (Werte der Variablen am Zeilenende während der Simulation); volle
  Beobachtung bleibt M9.
- Abnahme: Screenshots `after/` (Level 1 leer, Level 1 in Simulation, Analog-Level, Sandkasten mit allen
  Modultypen), Gegenüberstellung in `docs/design/README.md`, fps-Messung bei ×100 per Playwright.

## 5. Risiken

- **Maßstab**: CPUs werden relativ breiter; einige Spieler-Aufbauten passen nach Migration nicht mehr
  auf die Schiene. Gemildert durch großzügige Schrankbreite bei Level mit wenig Platzdruck.
- **Kabelführung durch den unteren Kanal** ändert die Kanalbelegung nicht (Modell bleibt), nur die Zeichnung.
- **Performance**: viele SVG-Pfade mit Filtern (Glow) – Glow nur auf leuchtenden LEDs, Rauschen als
  einmal gerenderte Musterkachel.
- **Umfang**: D2 und D6 sind die größten Brocken; D4 hängt an D2 (Datenmodell Raster).
