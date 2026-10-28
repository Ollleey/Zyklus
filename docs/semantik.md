# Semantik der Spiel-SPS

Dieses Dokument legt fest, wie `@zyklus/sim-core` rechnet. Es ist die verbindliche Referenz für
SCL-Compiler, FUP-Compiler, Level-Design und Tests. Wo die Spiel-SPS bewusst von einer echten
Steuerung abweicht, ist das markiert (**Spielregel**).

## 1. Zeit und Zyklus

- Globale Simulationszeit in ganzen **Millisekunden** (`Simulation.time`). Ein `tick()` = 1 ms.
- Ablauf eines Ticks `t`:
  1. `env.beforeScans(t)` – Anlage/Stimuli setzen die **Eingangsklemmen** (`cpu.inputs`).
  2. Jede CPU, deren Zyklus fällig ist (`(t − phaseMs) mod cycleMs = 0`), führt einen Zyklus aus.
     Reihenfolge = Reihenfolge im CPU-Array.
  3. `env.afterScans(t)` – Anlage liest die **Ausgangsklemmen** (`cpu.outputs`) und rechnet weiter.
- Ein Zyklus:
  1. **PAE** ← Eingangsklemmen (Kopie, danach eingefroren)
  2. TEMP-Variablen ← Startwert
  3. **OB1** ausführen (alle Lese-/Schreibzugriffe auf `%I`/`%Q` gehen auf PAE/PAA)
  4. Ausgangsklemmen ← **PAA**
- **Spielregel:** Die Rechenzeit eines Zyklus ist 0 ms; Ausgänge wirken im selben Tick. Die
  Zykluszeit bestimmt nur das Abtastraster.
- Folge: Ein Eingangsimpuls, der vollständig zwischen zwei Zyklusstarts liegt, wird **nicht gesehen**.

## 2. Zykluszeitüberwachung und STOP

- Jede CPU hat ein Budget `maxOpsPerCycle` (ausgeführte IR-Befehle, ungewichtet).
- Wird das Budget überschritten (Endlosschleife, zu viel Rechenarbeit), geht die CPU sofort in **STOP**:
  PAA und Ausgangsklemmen werden 0, es laufen keine weiteren Zyklen. `stopInfo` hält Zeit und Grund.
- Genau `maxOpsPerCycle` Befehle sind noch erlaubt.
- STOP ist endgültig für den Simulationslauf (kein automatischer Wiederanlauf).

## 3. Datentypen

| Typ   | Darstellung                     | Überlauf bei Arithmetik |
| ----- | ------------------------------- | ----------------------- |
| BOOL  | `boolean`                       | –                       |
| INT   | 16 bit, vorzeichenbehaftet      | Zweierkomplement (wrap) |
| DINT  | 32 bit, vorzeichenbehaftet      | wrap                    |
| BYTE  | 8 bit Bitfolge                  | – (keine Arithmetik)    |
| WORD  | 16 bit Bitfolge                 | – (keine Arithmetik)    |
| DWORD | 32 bit Bitfolge                 | – (keine Arithmetik)    |
| TIME  | 32 bit ms, vorzeichenbehaftet   | wrap                    |
| REAL  | IEEE-754 32 bit (`Math.fround`) | ±Inf / NaN wie IEEE     |

- Ganzzahlige Division schneidet Richtung 0 ab; `MOD` hat das Vorzeichen des Dividenden.
- **Spielregel:** Ganzzahlige Division bzw. MOD durch 0 ergibt 0 (keine Fehlerreaktion).
- REAL-Division durch 0 ergibt ±Inf bzw. NaN.

### Konvertierung (`conv`)

- REAL → Ganzzahl: Modus `round` (kaufmännisch auf gerade Zahl, IEC `ROUND`) oder `trunc`, danach
  **Sättigung** auf den Zielbereich. NaN → 0.
- INT ↔ WORD, DINT ↔ DWORD, TIME ↔ DWORD: Bitmuster wird übernommen (`-1` ↔ `16#FFFF`).
- TIME ↔ DINT: identisch.
- Andere Ganzzahl-Verengungen (z. B. DINT → INT): **Sättigung**.
- BOOL → Zahl: 0/1. Zahl → BOOL: ≠ 0.

## 4. Speicher

- `%I`, `%Q`, `%M` sind byte-adressiert (Standard 128 Byte E/A, 256 Byte Merker).
- Wörter/Doppelwörter liegen **big-endian**: `%MW0` = `%MB0` (High) und `%MB1` (Low); `%M1.0` ist
  das niederwertigste Bit von `%MW0`.
- Adressformen: `%I0.0`, `%Q1.7`, `%M10.3` (Bit), `%IB0`, `%MB3` (Byte), `%IW64`, `%QW2`, `%MW4`
  (Wort), `%ID0`, `%MD8` (Doppelwort). In SCL haben sie die TIA-Typen Byte/Word/DWord.
- Variablen (Global-DB, statische Instanzdaten, TEMP) liegen in typisierten **Slots** und sind
  nicht über Absolutadressen erreichbar.
- **Spielregel:** TEMP-Variablen starten jeden Zyklus mit ihrem Startwert (bei echter Hardware undefiniert).
- Symbolische Namen (PLC-Tags): eindeutig unabhängig von Groß-/Kleinschreibung; überlappende
  Adressen sind erlaubt, werden aber als Warnung gemeldet.

## 5. Auswertungsreihenfolge

- Die IR wird strikt sequenziell ausgeführt, Sprünge nur über `jmp`/`jz`/`jnz`.
- Netzwerke werden von oben nach unten übersetzt (Netzwerk 1 zuerst).
- Innerhalb eines FUP-Netzwerks: topologisch von links nach rechts; Zuweisungen am rechten Rand
  von oben nach unten. (Details folgen mit dem FUP-Compiler in M4.)
- Mehrere Zuweisungen an dieselbe Variable in einem Zyklus: die zuletzt ausgeführte gewinnt;
  an der Klemme erscheint nur der Endwert des PAA.

## 6. Befehle

### Bitlogik

`AND`, `OR`, `XOR`, `NOT`, Zuweisung. `S`/`R` wirken nur bei Bedingung = 1 und lassen das Ziel sonst unverändert.

### SR / RS

Speicherbox mit Speicherbit `q`:

- **SR** (Rücksetzen dominant): `q := (q OR S) AND NOT R`
- **RS** (Setzen dominant): `q := (q AND NOT R) OR S`

### Flanken

- `P_TRIG` / `N_TRIG` mit Flankenmerker: `Q := CLK AND NOT M` bzw. `NOT CLK AND M`; danach `M := CLK`.
  Zwei Auswertungen mit demselben Merker stören sich (wie echt).
- `R_TRIG` / `F_TRIG` als Instanz; Flankenmerker startet mit 0, d. h. ist CLK im ersten Zyklus 1,
  liefert R_TRIG einmal TRUE.

### Zeiten (IEC)

Alle Zeitglieder verwenden den Zeitstempel des **Zyklusbeginns**. ET ist auf PT begrenzt. PT < 0 wirkt wie 0.
PT darf sich zur Laufzeit ändern und wirkt sofort.

- **TON**: Bei IN = 1 läuft ET ab Start; `Q := ET ≥ PT`. IN = 0 → Q = 0, ET = 0. PT = 0 → Q sofort.
- **TOF**: IN = 1 → Q = 1, ET = 0. Fallende Flanke startet die Zeit; nach PT wird Q = 0, ET bleibt = PT,
  bis IN wieder 1 wird. Erneutes IN während des Nachlaufs startet neu.
- **TP**: Steigende Flanke an IN (nur im Ruhezustand) startet einen Impuls der Länge PT, Q = 1 solange
  ET < PT. Nicht nachtriggerbar. Nach Ablauf bleibt ET = PT, solange IN = 1; mit IN = 0 wird ET = 0.
  PT = 0 → kein Impuls.
- **TONR**: Summiert die Zeit, in der IN = 1 war (gemessen von Zyklus zu Zyklus). Q = ET ≥ PT und
  bleibt auch bei IN = 0 erhalten. **R** setzt ET und Q zurück und hat Vorrang vor IN.
  Sonderfall PT = 0: Q nur, wenn IN = 1 oder schon Zeit aufsummiert wurde.

Auflösung = Zykluszeit: Q eines TON mit PT = 25 ms wird bei 10-ms-Zyklus erst nach 30 ms sichtbar.

### Zähler (IEC, Zählwert INT)

Gezählt wird an **steigenden Flanken** von CU/CD (interne Flankenmerker, werden immer aktualisiert –
auch wenn R/LD aktiv ist). An den INT-Grenzen bleibt der Zähler stehen.

- **CTU**: R → CV = 0, sonst CU-Flanke → CV + 1. `Q := CV ≥ PV`.
- **CTD**: LD → CV = PV, sonst CD-Flanke → CV − 1. `Q := CV ≤ 0`.
- **CTUD**: Vorrang R vor LD vor Zählen; gleichzeitige Flanken an CU und CD heben sich auf.
  `QU := CV ≥ PV`, `QD := CV ≤ 0`.

### Vergleich

`==, <>, <, <=, >, >=` auf INT, DINT, REAL, WORD, TIME (BOOL nur `==`/`<>`). REAL exakt.
`IN_RANGE(MIN, VAL, MAX)` = `MIN ≤ VAL ≤ MAX`, `OUT_RANGE` = `VAL < MIN OR VAL > MAX`.

### Arithmetik und Funktionen

- `+ - * / MOD` siehe Abschnitt 3; `ABS`, `NEG` (Randfall `ABS(-32768) = -32768` durch Überlauf).
- `LIMIT(MN, IN, MX)` = `MIN(MAX(IN, MN), MX)`.
- `MIN`, `MAX` mit beliebig vielen Eingängen (≥ 2).
- `SEL(G, IN0, IN1)`: G = 0 → IN0, G = 1 → IN1.
- `MUX(K, IN0 … INn, ELSE)`: gültiges K wählt INk, sonst ELSE; ohne ELSE bleibt das Ziel unverändert.

### Analogwerte

- `NORM_X(MIN, VALUE, MAX)` = `(VALUE − MIN) / (MAX − MIN)` als REAL, **ohne Begrenzung**
  (Über-/Unterlauf bleibt erkennbar). **Spielregel:** MIN = MAX → 0.
- `SCALE_X(MIN, VALUE, MAX)` = `VALUE · (MAX − MIN) + MIN`, Ergebnis im Typ von MIN/MAX.
  **Spielregel:** Ganzzahl-Ergebnis wird half-even gerundet und gesättigt.
- Siemens-Normbereich: 0 … 27648; Überlauf 32767, Unterlauf −32768 (Störungen ab M5).

### Wortlogik und Schieben

`AND/OR/XOR/NOT` auf BYTE/WORD/DWORD. `SHL`/`SHR` (Bitfolgen, Schiebeweite INT): Nullen werden
nachgeschoben, herausgeschobene Bits gehen verloren; Weite ≥ Bitbreite → 0; Weite ≤ 0 → unverändert.

### Zähler im IEC_COUNTER-Instanz-DB

CTU setzt zusätzlich QU, CTD zusätzlich QD (so heißen die Ausgänge im IEC_COUNTER-DB von TIA).

## 7. Metriken

- **Befehle**: Anzahl ausgeführter IR-Befehle über alle Zyklen (auch Sprünge).
- **Energie**: Summe der Gewichte ausgeführter Befehle (`src/metrics/weights.ts`):

| Gruppe                                                       | Gewicht |
| ------------------------------------------------------------ | ------- |
| Bitlogik, S/R, SR/RS, MOVE, Sprünge, WORD-Logik              | 1       |
| Ganzzahl-Arithmetik, -Vergleich, CONV, LIMIT/MIN/MAX/SEL/MUX | 2       |
| Timer, Zähler, Flanken                                       | 3       |
| Alles auf REAL, NORM_X, SCALE_X                              | 4       |

## 8. Determinismus

- Keine Zeit- oder Zufallsquellen außer Simulationszeit und `Rng` (mulberry32).
- Störquellen bekommen eigene Seeds über `deriveSeed(levelSeed, kanalname)`, damit das Hinzufügen
  eines Kanals die Folgen der anderen nicht verschiebt.
- Gleiche Lösung + gleicher Seed → identische Verläufe und Metriken (per Test abgesichert).
