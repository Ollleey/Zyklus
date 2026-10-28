# ZYKLUS (Arbeitstitel)

Puzzlespiel rund um Steuerungsbau: Aufträge lesen, Baugruppen auf die Hutschiene stecken, Feldgeräte
verdrahten, in SCL (FUP folgt) programmieren, simulieren und gegen Soll-Verläufe prüfen.
Programmiert wird im Stil des TIA-Portals (S7-1500): OB1, Instanz-DBs, Global-DBs, PLC-Variablentabelle.

## Starten

```bash
npm install
npm run dev -w @zyklus/game
```

Dann <http://localhost:5173> öffnen. Läuft komplett offline im Browser; Fortschritt liegt im `localStorage`.

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
| `packages/levels`       | Aufträge als JSON, Referenzlösungen als TIA-Quellen, Tests                                                                 |
| `apps/game`             | React-App (Vite, Monaco)                                                                                                   |

Dokumentation: [docs/semantik.md](docs/semantik.md) (Laufzeitregeln), [docs/scl.md](docs/scl.md) (Sprachumfang).
