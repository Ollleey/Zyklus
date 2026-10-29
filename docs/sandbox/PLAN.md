# Sandkasten-Modus – Plan (zur Freigabe)

Grundlage: `Sandbox_Anweisung.txt` und die Antworten vom 2026-10-29:

- **Ansicht:** Draufsicht und Seitenansicht, umschaltbar.
- **Bisheriger Sandkasten** bleibt als **„Testpult“**; der neue Modus heißt **„Sandkasten“**. Der Speicherschlüssel des Testpults bleibt gleich, damit gespeicherte Stände erhalten bleiben.
- **Verdrahtung:** Standard ist von Hand. Zusätzlich gibt es einen Knopf **„Automatisch verdrahten“**, der nur auf Klick freie passende Kanäle belegt.
- **Layout:** Die Bereiche sind beweglich und schließbar, Standard wie bei den Aufträgen, die Anordnung wird gespeichert.

## Architektur

```
packages/plant-sim   (neu, ohne UI, Vitest)
  materials.ts       Materialtabelle: Dichte, Metall/Reduktionsfaktor, Dielektrizitätszahl,
                     Reflexionsgrad je Farbe, durchsichtig
  model.ts           Anlage: Bauteile (Typ, Lage x/y/z, Drehung, Parameter, Kennzeichnung),
                     Werkstück-Mix, Seed; Werkstücke (Material, Farbe, Maße, Masse, Lage, Zustand)
  parts/*.ts         Verhalten je Bauteiltyp (Band, Zylinder, Weiche, Tank …)
  sensors/*.ts       detect(sensor, welt) → Signal, reine Funktionen
  engine.ts          fester Zeitschritt, Kollision (AABB, Raster zur Beschleunigung), Seed-PRNG
  plant.ts           SandboxPlant implementiert das bestehende Plant-Interface von sim-core
  devices.ts         elektrische Bauteile → Feldgeräte (Device[]) für den Schaltschrank
```

- **Keine zweite SPS:** Aus der Anlage entsteht zur Laufzeit ein gewöhnliches `Level`. Seine Feldgeräte sind die elektrischen Bauteile, sein Anlagenmodell ist `SandboxPlant`. Darauf laufen `LevelRun`, der Compiler und der Schaltschrank unverändert.
- **Zeit:** Die SPS tickt weiter mit 1 ms. Die Mechanik rechnet mit festem Schritt von 2 ms, ausgelöst durch die SPS-Ticks. Sensoren werden jede ms ausgewertet. So bleibt der Lauf deterministisch: gleiche Anlage und gleicher Seed ergeben denselben Verlauf.
- **Koordinaten in mm:** Die Draufsicht zeigt x/y, die Seitenansicht x/z. Jedes Bauteil hat eine Grundfläche und eine Höhe. Werkstücke liegen auf Oberflächen und fallen beim Verlassen nach unten auf das nächste darunterliegende Bauteil.
- **Neu in sim-core:** Forcen von Ein- und Ausgängen. Ein Force-Wert überschreibt Peripherie zu PAE bzw. PAA zu Peripherie und ist in Schrank und Tabelle mit „F“ markiert. Die Kampagne bleibt unberührt, ein Lauf mit Force-Werten wird nicht bewertet.

## Meilensteine

Nach jedem Meilenstein: alle Tests grün, Kampagne und gespeicherte Lösungen unverändert, Commit, CHANGELOG.

### S1 – Anlagenmodell und Physik-Core

- Paket `plant-sim`, Datenmodell, `materials.ts` (Stahl, Aluminium, Messing, Holz, Kunststoff, Glas) und Farben.
- Bauteile mit Mechanik:
  - Förderband (Länge, Geschwindigkeit, Richtung), Rollenbahn, Kurve
  - Magazin (Liste oder Zufallsmix mit Seed), Rutsche, Auffangbehälter mit Zählung
  - Weiche/Sortierklappe, Drehtisch, Hubtisch, Anschlag
  - Tank mit Zu- und Ablauf, Rohrleitung
- Aktoren:
  - Zylinder einfach- und doppeltwirkend mit 3/2- bzw. 5/2-Ventil, Hubzeit, Endlagen
  - Motor, Motor am Umrichter (AO), Pumpe, Magnetventil
  - Meldeleuchte, Hupe, Ampel
- Bedienelemente: Taster (Schließer/Öffner), Schalter, Not-Halt (verrastend), Wahlschalter Hand/Auto, Poti.
- Werkstücke bewegen sich auf Bändern, stoßen an Anschläge, werden geschoben und fallen in Behälter.
- Tests: Kinematik, Kollision, Zählung, Determinismus.

### S2 – Sensor-Physik

- Alle Sensortypen als reine Funktionen: induktiv mit Reduktionsfaktor, kapazitiv nach Dielektrizitätszahl, optischer Taster nach Reflexionsgrad, Einweg- und Reflexions-Lichtschranke mit Polfilter, Farbsensor (DI je Farbe oder Farbcode INT), Ultraschall mit Blindzone, Endschalter mit Prellen, Zylinderschalter, Wägezelle, Füllstand analog und Grenzwert.
- Gemeinsame Parameter: Schaltabstand, Ansprechzeit, Hysterese, Schließer/Öffner. Rauschen und Prellen kommen aus der bestehenden Signalverarbeitung, Analogwerte liegen im Normbereich 0…27648.
- Pflichttests aus Abschnitt 8 der Anweisung, dazu Grenzfälle wie Hysterese und Blindzone.

### S3 – Arbeitsbereich und Anlageneditor

- **Bewegliche Panels:** Anlage, Schaltschrank, Programm und Simulation sind Panels in Andockbereichen links, rechts und unten.
  - Ein Panel lässt sich über seine Kopfzeile verschieben (Menü oder Ziehen) und schließen.
  - Über „Ansicht“ wird es wieder geöffnet, mehrere Panels in einem Bereich werden zu Tabs.
  - Größen und Anordnung werden gespeichert, „Standardanordnung“ stellt den Ausgangszustand her.
  - Standard: links Anlage und Schaltschrank als Tabs, rechts Programm, unten Simulation.
  - Dieselbe Panel-Technik bekommen auch die Aufträge, mit ihrer heutigen Standardanordnung.
- **Editor:**
  - Raster mit Einrasten, Zoom und Verschieben.
  - Bibliothek mit Ziehen und Ablegen; Drehen (90°), Verschieben, Kopieren, Löschen.
  - Undo/Redo mit mindestens 50 Schritten.
  - Inspektor mit Parametern und Kennzeichnung (automatisch B1, M1, S1, Y1, H1, 1A1 …, editierbar).
  - Erfassungszonen der Sensoren halbtransparent, leuchtend bei Erkennung.
  - Draufsicht und Seitenansicht umschaltbar; Werkstück per Kontextmenü einfügen.

### S4 – Kopplung und Live-Simulation

- Elektrische Bauteile erscheinen als Feldgeräte am Schrankrand mit Kennzeichnung und Signalart.
- Verdrahtung von Hand wie bisher, dazu der Knopf „Automatisch verdrahten“. Eine Liste zeigt nicht angeschlossene Geräte.
- PLC-Variablen werden vorgeschlagen (z. B. `B1_Induktiv` auf `%I0.2`), einzeln oder alle übernehmen.
- Live-Simulation: Werkstücke fließen, Zylinder fahren, Bänder laufen, der Tank füllt sich. Die Darstellung wird zwischen den Schritten interpoliert, auch bei ×100.
- Eingreifen: Taster und Schalter bedienen, Werkstücke mit der Maus versetzen, Magazin auslösen.
- Forcetabelle mit „F“-Markierung, Zeitdiagramm mit frei wählbaren Signalen.

### S5 – Export, Import, Speichern

- Datei `*.anlage.json` mit `formatVersion`:
  - Anlage, Schaltschrank, alle CPU-Programme
  - Simulationseinstellungen, gewählte Signale
  - Name, Beschreibung, Autor, Datum
- Prüfung beim Import mit zod und deutschen Meldungen, unbekannte Felder werden ignoriert, alte Versionen migriert.
- Download und Import per Dialog sowie Ziehen der Datei ins Fenster; `.scl` je CPU wie bisher.
- Autosave alle 30 s. „Meine Anlagen“ mit Vorschaubild sowie Umbenennen, Duplizieren und Löschen mit Bestätigung.
- Tests: Round-Trip Export → Import ergibt denselben Zustand, Migration.

### S6 – Vorlagen, Störungen, Zähler, Feinschliff

- **Vorlagen**, je mit und ohne Beispielprogramm (`*.anlage.json` im Repo):
  - Sortierstation Metall/Holz
  - Materialprüfung (induktiv, kapazitiv, optisch, drei Behälter)
  - Tankanlage (Pumpe, Ventil, Ultraschall, Grenzwert, Hand/Auto)
  - Testpult-Bauteile als Bibliothek
- **Störungen:** Sensor dauernd 0 oder 1, Drahtbruch, Zylinder klemmt, Band blockiert; im Inspektor ein- und ausschaltbar.
- **Zähler-Overlay:** Teile je Behälter, Durchsatz je Minute, Fehlsortierungen nach Soll-Regel je Behälter.
- **Tests:** Integrationstest „Vorlage 1 sortiert 100 Teile ohne Fehlsortierung“; Leistungstest mit 50 Werkstücken und 30 Bauteilen bei ×100 über 50 fps.
- Playwright-Screenshots nach `docs/sandbox/`.

Optional danach: **Anlage als Level veröffentlichen**. Der Spieler definiert Testfälle und Soll-Regeln, daraus entsteht ein spielbares Level-JSON.

## Risiken

- **Leistung:** 50 Werkstücke bei ×100 sind viele Mechanikschritte je Bild. Abhilfe sind der 2-ms-Schritt, ein Raster für die Kollision und Sensor-Erfassungszonen als vorberechnete Rechtecke. Gemessen wird ab S1.
- **Zwei Ansichten:** Jedes Bauteil braucht eine Darstellung von oben und von der Seite. Die Zeichnungen bleiben deshalb einfach und schematisch.
- **Panels:** Das Umstellen der Aufträge auf bewegliche Panels darf das bestehende Layout nicht verschlechtern. Die Standardanordnung entspricht genau dem heutigen Stand.
