# Desktop-Abnahme: manuelle Checkliste

Vor einem Release auf einem Windows-Rechner durchgehen (am besten einer ohne Entwicklungswerkzeuge).
Automatisch geprüft werden die Punkte mit „(E2E)“ durch `npm run e2e -w @zyklus/desktop`.

## Installation

- [ ] `ZYKLUS_<version>_x64-setup.exe` startet; SmartScreen-Warnung erscheint (unsigniert) →
      „Weitere Informationen → Trotzdem ausführen“
- [ ] Installation ohne Administratorrechte möglich (Benutzerinstallation), Startmenü-Eintrag „ZYKLUS“
- [ ] alternativ `ZYKLUS_<version>_x64_de-DE.msi` installiert ebenso
- [ ] portable `ZYKLUS_<version>_x64_portable.exe` startet ohne Installation

## Erster Start

- [ ] Fenster erscheint in unter 1 s, Posteingang in unter 3 s (E2E: Zeit wird ausgegeben)
- [ ] Angebot „Spielstand aus der Web-Version übernehmen?“; „Datei wählen …“ öffnet den Dialog
- [ ] im Browser `Spielstand → Alles exportieren`, Datei in der Desktop-Version importieren:
      Fortschritt, Lösungen und Anlagen sind da
- [ ] ohne Netzwerk (WLAN aus / Netzwerkkabel ab) startet und läuft alles (E2E: toter Proxy)

## Spielen und Speichern

- [ ] Auftrag 1 lösen, Prüfen → „Auftrag erfüllt“ (E2E)
- [ ] App schließen und neu starten → Fortschritt ist da (E2E)
- [ ] Fenstergröße und -position ändern, neu starten → bleiben erhalten
- [ ] Sandkasten: Anlage bauen, Titel zeigt `*`; Strg+S speichert, `*` verschwindet
- [ ] mit `*` schließen → Rückfrage „Speichern und beenden / Nicht speichern / Abbrechen“
- [ ] Meine Anlagen → „Ordner öffnen“ zeigt `Dokumente\ZYKLUS\Anlagen` mit `.anlage`-Dateien (E2E)
- [ ] „Ordner ändern …“ auf einen anderen Ordner; nach Neustart weiter dort

## Dateien und Menü

- [ ] Datei → Exportieren speichert eine `.anlage` über „Speichern unter“
- [ ] Doppelklick auf eine `.anlage`-Datei startet das Spiel mit dieser Anlage im Sandkasten
      (E2E: Kaltstart offline und Weitergabe an das laufende Spiel)
- [ ] Doppelklick auf eine `.auftrag`-Datei legt den Auftrag unter „Eigene Aufträge“ an und öffnet ihn
- [ ] Datei → Zuletzt geöffnet listet die Dateien; verschobene Datei verschwindet mit Hinweis
- [ ] F11 Vollbild, Strg +/−/0 Zoom, F1 Handbuch, Hilfe → Über zeigt die Version
- [ ] Leertaste startet/hält die Simulation, nicht beim Tippen im Editor

## Deinstallation

- [ ] „Apps & Features“ → ZYKLUS deinstallieren entfernt Programm und Startmenü-Eintrag
- [ ] Spielstände bleiben erhalten: `%APPDATA%\de.zyklus.spiel\` und `Dokumente\ZYKLUS\Anlagen\`
- [ ] Neuinstallation findet den alten Fortschritt wieder
