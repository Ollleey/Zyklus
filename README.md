# ZYKLUS (Arbeitstitel)

Puzzlespiel rund um Steuerungsbau: Aufträge lesen, Baugruppen auf die Hutschiene stecken, Feldgeräte
verdrahten, in SCL, FUP, KOP oder GRAPH programmieren, simulieren und gegen Soll-Verläufe prüfen.
Programmiert wird im Stil des TIA-Portals (S7-1500): OB1, Weck- und Prozessalarm-OBs, eigene FB/FC,
Instanz-DBs, Global-DBs, PLC-Variablentabelle.

Inhalt: Einführung und 27 Aufträge, Grundkurs für Einsteiger ohne Vorkenntnisse, Handbuch,
Sandkasten mit Szenario-Editor, Zufallsaufträge mit Auftragscode, Testpult und das Bonusspiel
Klemmen-Patience. Oberfläche, Aufträge und Handbuch auf Deutsch und Englisch.

## Starten

```bash
npm install
npm run dev -w @zyklus/game
```

Dann <http://localhost:5173> öffnen. Läuft komplett offline im Browser; Fortschritt liegt im `localStorage`.

### Desktop-Anwendung (Windows, Linux)

```bash
npm run dev:desktop
npm run build:desktop
```

Installer, portable `.exe`, Speicherorte, Umzug der Spielstände und Release: siehe
[docs/desktop/README.md](docs/desktop/README.md). Voraussetzung: Rust und die Visual Studio Build
Tools (C++). Linux-AppImage im Container: `scripts/linux-appimage.sh` (Aufruf im Kopf des Skripts).

## Tests

```bash
npm test
npm run typecheck
```

## Aufbau

| Paket                   | Inhalt                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/sim-core`     | SPS-Simulation (IR, Interpreter, Zyklus, Timer/Zähler), Projektmodell, Spiel-Engine (Schaltschrank, Signale, Verifikation) |
| `packages/scl-compiler` | SCL-Lexer/Parser, Typprüfung, Codegen → IR, Import/Export externer `.scl`-Quellen, Monaco-Sprachdefinition                 |
| `packages/fup-model`    | FUP/KOP-Modell (Netzwerke, Boxen, Verbindungen), GRAPH-Schrittketten, Boxkatalog, Absenkung nach SCL                       |
| `packages/levels`       | Aufträge als JSON (mit englischer Überlagerung), Referenzlösungen als TIA-Quellen, Tests                                   |
| `packages/plant-sim`    | Sandkasten: Anlagenmodell, Mechanik, Sensoren, Dateiformat, Szenarien, Veröffentlichen als Auftrag                         |
| `packages/zufall`       | Zufallsaufträge: Auftragscode, Baupläne mit Musterlösung, eingebaute Fehler für Bestandsanlagen                            |
| `packages/platform`     | Plattformschicht Web/Desktop: Speicher, Dateidialoge, Fenster                                                              |
| `apps/game`             | React-App (Vite, Monaco)                                                                                                   |
| `apps/desktop`          | Tauri-Hülle für die Desktop-Anwendung, E2E-Test                                                                            |

## Dokumentation

Das Handbuch im Spiel zeigt diese Seiten (Englisch jeweils unter `docs/en/`):

| Datei                                          | Inhalt                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/semantik.md](docs/semantik.md)           | Laufzeitregeln: Zyklus, Prozessabbild, Alarme                              |
| [docs/scl.md](docs/scl.md)                     | SCL-Sprachumfang                                                           |
| [docs/fup.md](docs/fup.md)                     | FUP- und KOP-Editor                                                        |
| [docs/online.md](docs/online.md)               | Beobachten, Forcen, Trace, Bestandsanlagen, Bibliothek                     |
| [docs/geraete.md](docs/geraete.md)             | Geräte und Fehlerbilder                                                    |
| [docs/technologie.md](docs/technologie.md)     | Technologie: PID, Zähler, Puls, Kommunikation, Panel                       |
| [docs/schrittketten.md](docs/schrittketten.md) | Schrittketten verstehen: Methode, Betriebsarten, Not-Halt                  |
| [docs/graph.md](docs/graph.md)                 | GRAPH-Editor                                                               |
| [docs/szenarien.md](docs/szenarien.md)         | Szenario-Editor und Zufallsaufträge                                        |
| [docs/grundkurs/](docs/grundkurs)              | Grundkurs für Einsteiger (Lektionen, Seiten mit `<!-- Seite -->` getrennt) |

Weitere: [docs/sandbox/README.md](docs/sandbox/README.md) (Sandkasten intern),
[docs/desktop/README.md](docs/desktop/README.md) (Desktop-Anwendung), [CHANGELOG.md](CHANGELOG.md),
[PLAN.md](PLAN.md).
