# ZYKLUS als Desktop-Anwendung

Die Desktop-Version ist eine Tauri-2-Hülle (`apps/desktop`) um denselben Build wie die
Web-Version (`apps/game`). Spiellogik und Oberfläche sind identisch; nur die Plattformschicht
(`packages/platform`) unterscheidet Browser und Desktop. Die Web-Version bleibt baubar.

## Bauen

Voraussetzungen (einmalig): Node 24, Rust (`rustup`), Visual Studio 2022 Build Tools mit
„Desktopentwicklung mit C++“. WebView2 ist auf Windows 10/11 vorhanden.

| Befehl                            | Ergebnis                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev:desktop`             | Desktop-App mit Hot Reload (startet den Vite-Server im Modus `desktop`) |
| `npm run build:desktop`           | Installer und portable `.exe` für die aktuelle Plattform                |
| `npm run build:web`               | Web-Version in `apps/game/dist`                                         |
| `npm run e2e -w @zyklus/desktop`  | E2E-Test der gebauten App (siehe unten)                                 |
| `node scripts/offline-check.mjs`  | Spiel ohne externe Anfragen prüfen (Web-Build)                          |
| `npm run icon -w @zyklus/desktop` | App-Icon aus Code neu erzeugen (`scripts/make-icon.mjs`)                |

Ausgabe unter `apps/desktop/src-tauri/target/release/bundle/`:

- `nsis/ZYKLUS_<version>_x64-setup.exe` – Installer (Benutzerinstallation, ohne Adminrechte)
- `msi/ZYKLUS_<version>_x64_de-DE.msi` – MSI-Paket (für Verteilung per Gruppenrichtlinie)
- `portable/ZYKLUS_<version>_x64_portable.exe` – ohne Installation lauffähig

Die Versionsnummer steht nur in der Root-`package.json`; Tauri liest sie direkt, die Oberfläche
zeigt sie unter „Hilfe → Über ZYKLUS“.

## Speicherorte

| Was                                                               | Wo                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Einstellungen, Fortschritt, Lösungen, Sandkasten, eigene Aufträge | `%APPDATA%\de.zyklus.spiel\` (`einstellungen.json`, `fortschritt.json`, `loesungen\*.json`, `sandkasten.json`, `auftraege.json`) |
| Meine Anlagen                                                     | `Dokumente\ZYKLUS\Anlagen\*.anlage` (im Spiel änderbar, Knopf „Ordner öffnen“)                                                   |
| Fenstergröße und -position                                        | `%APPDATA%\de.zyklus.spiel\.window-state.json`                                                                                   |

Jede Datei wird atomar geschrieben (erst `.tmp`, alte Datei als `.bak`, dann umbenennen). Ist eine
Datei beschädigt, liest das Spiel die Sicherung. Deinstallieren lässt die Spielstände stehen.

Für Tests lassen sich beide Ordner über `ZYKLUS_DATA_DIR` und `ZYKLUS_DOCS_DIR` umlenken.

## Dateien

- `.anlage` – Anlage aus dem Sandkasten (JSON wie `.anlage.json`, das weiter gelesen wird)
- `.auftrag` – eigener Auftrag
- `spielstand-export.json` – gesamter Spielstand (Umzug von der Web-Version, Sicherung)

Der Installer verknüpft `.anlage` und `.auftrag` mit ZYKLUS. Doppelklick öffnet die Datei; läuft das
Spiel schon, geht sie an das offene Fenster.

## Umzug von der Web-Version

Die WebView der Desktop-App hat einen eigenen Speicher; der `localStorage` des Browsers ist dort
nicht sichtbar. Im Browser: Posteingang → „Spielstand“ → „Alles exportieren“. In der Desktop-App
wird beim ersten Start angeboten, diese Datei zu übernehmen (später: Posteingang → „Spielstand“ →
„Spielstand importieren …“).

## Offline

Keine CDN-Links, keine Online-Schriften, kein Nachladen: Schriften (`@fontsource`), Monaco samt
Editor-Worker und der Simulations-Worker sind gebündelt. Die Sicherheitsrichtlinie (CSP) erlaubt
nur Quellen aus der App selbst. Geprüft wird das zweifach:

- `scripts/offline-check.mjs` liefert den Web-Build (gleicher Spielcode und gleiche Assets) über einen lokalen Server aus, sperrt jede
  andere Adresse und öffnet Posteingang, Auftrag (Monaco) und Sandkasten (Worker).
- Der E2E-Test startet die gebaute App mit einem toten Proxy für die WebView und öffnet dabei eine
  Anlagendatei.

## Startzeit

Gemessen auf dem Entwicklungsrechner (Windows 11, Release-Build), Ziel unter 3 s bis spielbar:

| Messpunkt                                           | Zeit      |
| --------------------------------------------------- | --------- |
| Fenster sichtbar                                    | 0,2–0,3 s |
| Posteingang bedienbar (E2E, inkl. WebDriver-Aufbau) | 0,8–0,9 s |
| Posteingang im Offline-Check (Browser, Web-Build)   | 0,3 s     |

## E2E-Test

`npm run e2e -w @zyklus/desktop` nach `npx tauri build --no-bundle` in `apps/desktop`. Benötigt
`cargo install tauri-driver`; der passende `msedgedriver` wird nach `apps/desktop/e2e/.drivers`
geladen. Ablauf mit eigenen Testordnern (echte Spielstände bleiben unberührt):

1. Start, Angebot zum Web-Import ablehnen
2. Auftrag 1 mit hinterlegter Lösung prüfen → „Auftrag erfüllt“, Fortschritt 1/21
3. Neustart → Fortschritt aus den Dateien
4. Anlagendatei an das laufende Spiel übergeben → Sandkasten, Titel, Datei unter „Meine Anlagen“
5. Offline-Kaltstart mit Anlagendatei

„Speichern unter“ und „Öffnen“ sind native Dialoge und lassen sich per WebDriver nicht bedienen;
Export und Import sind durch Unit-Tests (`packages/platform/test`) und die Checkliste abgedeckt.

## Code-Signierung

Die Dateien sind **nicht signiert**. Windows SmartScreen warnt deshalb beim ersten Start
(„Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“).
Für eine signierte Auslieferung wäre nötig:

- ein Code-Signing-Zertifikat (OV oder EV) einer Zertifizierungsstelle; EV-Zertifikate (auf
  Hardware-Token) bauen die SmartScreen-Reputation sofort auf, OV-Zertifikate erst mit der Zeit
- alternativ Azure Trusted Signing (Abo, ohne eigenes Token)
- in `tauri.conf.json` unter `bundle.windows` `certificateThumbprint`, `digestAlgorithm: "sha256"`
  und `timestampUrl` eintragen bzw. ein `signCommand`; im Workflow das Zertifikat als Secret
  hinterlegen

## Linux

Code und Workflow sind vorbereitet. Im Repository die Variable `ZYKLUS_LINUX = true` setzen;
der Release-Workflow baut dann zusätzlich `.AppImage` und `.deb` (WebKitGTK). Die
Speicherorte folgen dort `~/.local/share/de.zyklus.spiel/` und `~/Dokumente/ZYKLUS/Anlagen/`
(ist kein Dokumente-Ordner festgelegt, z. B. unter WSL: `~/.local/share/de.zyklus.spiel/ZYKLUS/Anlagen/`).

Lokal ohne CI: `scripts/linux-appimage.sh` baut das AppImage in einem Ubuntu-22.04-Container
(Aufruf steht im Kopf des Skripts). Ergebnis: eine Datei, die ohne Installation läuft
(`chmod +x`, dann starten; fehlt FUSE: `--appimage-extract-and-run` oder `libfuse2` installieren).
Die App setzt unter Linux `WEBKIT_DISABLE_DMABUF_RENDERER=1`, weil WebKitGTK mit manchen
Grafiktreibern sonst nur eine weiße Fläche zeigt.

## Release

Tag mit der Version aus `package.json` setzen und pushen, z. B. `git tag v0.1.0 && git push --tags`.
Der Workflow `.github/workflows/release.yml` prüft die Version, führt Typprüfung und Tests aus,
baut und legt einen Release-Entwurf mit Installer, MSI und portabler `.exe` an.
