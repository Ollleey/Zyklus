# FUP – Funktionsplan im TIA-Stil

## Bedienung

- **Netzwerke** stehen untereinander und werden von oben nach unten bearbeitet. Jedes Netzwerk hat
  einen Titel; mit ↑/↓ verschieben, ✕ löschen, „+ Netzwerk“ anfügen.
- **Boxen** aus der Anweisungsliste ins Netzwerk ziehen oder anklicken (fügt ins gewählte Netzwerk ein).
  Zeiten, Zähler und R_TRIG/F_TRIG legen dabei – wie TIA – einen Instanz-DB an
  (`IEC_Timer_0_DB`, `IEC_Counter_0_DB`, `R_TRIG_DB` …).
- **Verbinden:** vom runden Griff eines Bool-Ausgangs auf einen Bool-Eingang ziehen. Ein Ausgang darf
  mehrere Eingänge speisen, ein Eingang hat genau eine Quelle.
- **Negieren:** Klick auf einen Bool-Eingang; Doppelklick auf den Griff eines Bool-Ausgangs.
- **Operanden** direkt an den Pin schreiben: `"Start"`, `%I0.0`, `"Daten".Wert`, `T#2s`, `100`.
  Über Zuweisungen, Speicher- und Flankenboxen sowie Instanzen steht der Operand über der Box.
- **Erweitern:** ✚ unter &, >=1, X, ADD, MUL, MIN, MAX, MUX fügt einen Eingang hinzu, ━ entfernt ihn.
- **Löschen:** Box oder Verbindung anklicken, Entf.

Wie in TIA tragen Verbindungen nur Bool-Signale. Zahlenwerte laufen über Operanden, z. B. über eine
Variable im Global-DB.

## Boxen

| Kategorie        | Boxen                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Bitverknüpfungen | `&`, `>=1`, `X`, `=`, `S`, `R`, `SR`, `RS`, `P_TRIG`, `N_TRIG`, `R_TRIG`, `F_TRIG` |
| Zeiten           | `TP`, `TON`, `TOF`, `TONR`                                                         |
| Zähler           | `CTU`, `CTD`, `CTUD`                                                               |
| Vergleicher      | `==`, `<>`, `>`, `>=`, `<`, `<=`, `IN_RANGE`, `OUT_RANGE`                          |
| Mathematik       | `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `LIMIT`, `MIN`, `MAX`                    |
| Übertragen       | `MOVE`, `CONV`, `SEL`, `MUX`, `NORM_X`, `SCALE_X`, `SHL`, `SHR`                    |

Funktionsboxen haben **EN/ENO**: Ist EN verbunden bzw. belegt, wird die Box nur bei EN = 1
ausgeführt; ENO = EN. Ohne EN läuft die Box immer, ENO = 1.

### Eigene Bausteine

Unter **Eigene Bausteine** stehen alle FB und FC des Projekts (außer dem gerade bearbeiteten) als
Box, in KOP im Box-Auswahlfeld. Die Pins kommen aus der Schnittstelle: Input und InOut links,
Output rechts, beim FC mit Rückgabewert zusätzlich `Ret_Val`. Bool-Pins lassen sich verbinden,
alle anderen bekommen einen Operanden. Dazu kommen EN/ENO wie bei den Funktionsboxen: Bei EN = 0
wird der Baustein nicht aufgerufen.

- **FB:** Beim Einfügen wird ein Instanz-DB angelegt (`Name_DB`). In einem FB kann der Operand
  über der Box auch eine statische Variable vom Typ des FB sein (`#Innen`, Multiinstanz).
- **FC:** kein Operand. Wert-Ausgänge und `Ret_Val` brauchen einen Zieloperanden oder eine
  Verbindung.

Ändert sich die Schnittstelle, passen sich die Pins an; Operanden an entfernten Pins werden nicht
mehr übersetzt.

### Kommentare und Bausteinschutz

Jeder Baustein hat einen **Bausteinkommentar** (Zeile unter der Bausteinauswahl), jedes Netzwerk
Titel und Kommentar. In der SCL-Quelle steht der Bausteinkommentar als `//`-Zeilen im Kopf.

Ein **geschützter Baustein** (vorgegeben im Auftrag) zeigt nur seine Schnittstelle: Code und
Sprache lassen sich weder ansehen noch ändern, er wird aber normal übersetzt und aufgerufen und
zählt nicht zur Programmgröße.

## Semantik

FUP wird netzwerkweise nach SCL übersetzt und dann vom selben Compiler wie SCL in die IR gebracht.
Damit gelten alle Regeln aus [semantik.md](semantik.md) und [scl.md](scl.md) unverändert.

- **Reihenfolge:** Netzwerke von oben nach unten. Innerhalb eines Netzwerks topologisch entlang der
  Verbindungen; bei Gleichstand oben vor unten, links vor rechts.
- Verknüpfungen mit genau einem Ziel werden zu einem Ausdruck zusammengefasst, Verzweigungen nutzen
  eine Hilfsvariable (Temp).
- **SR** (S, R1): Rücksetzen dominant. **RS** (R, S1): Setzen dominant. Das Speicherbit ist der Operand.
- **P_TRIG/N_TRIG** werten den Eingang mit dem Flankenmerker (Operand) aus.
- **CONV** konvertiert in den Datentyp des Ausgangsoperanden.
- Bei `IEC_COUNTER` heißt der Q-Ausgang im DB `QU` (CTU) bzw. `QD` (CTD).

## Fehler

Meldungen zeigen auf Netzwerk, Box und Pin (`NW 2 · ton1.PT`); die Box wird rot umrandet.
Erkannt werden u. a. offene Eingänge, fehlende Operanden, Verbindung plus Operand am selben Eingang,
Rückkopplungen (Kreise), Verbindungen an Wert-Pins sowie alle Typfehler des SCL-Compilers.

## Programmgröße

Zählt die Boxen. Die CPU-Grenze für FUP sind Netzwerke (CPU klein: 10).
