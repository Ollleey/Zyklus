# SCL – Sprachumfang der Spiel-SPS

Ziel: Was man im Spiel schreibt, ist echtes SCL wie im TIA-Portal für S7-1500 und lässt sich über
„Externe Quellen“ importieren. Die Laufzeitsemantik steht in [semantik.md](semantik.md).

## Projektaufbau (wie im TIA-Bausteineditor)

Jede CPU hat:

- **PLC-Variablentabelle**: Name, Datentyp, Adresse (`"Start"` → `%I0.0`)
- **OB1 „Main“**: Schnittstelle (nur **Temp** und **Constant**) + Anweisungsteil in SCL oder FUP
- **Globale Datenbausteine**: statische Daten, z. B. `"Daten".Schritt`
- **Instanz-DBs** für Zeiten, Zähler, Flanken: z. B. `"T1_DB"` vom Typ `IEC_TIMER`

Ein OB hat – wie in TIA – keine statischen Variablen. Was über Zyklen erhalten bleiben soll,
gehört in einen Datenbaustein. Eigene FB/FC mit Multiinstanzen folgen in M7.

Im Editor schreibt man nur den Anweisungsteil. Export/Import als `.scl`-Quelle:

```
DATA_BLOCK "IEC_Timer_0_DB"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN
IEC_TIMER
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
   VAR_TEMP
      i : Int;
   END_VAR
BEGIN
	"IEC_Timer_0_DB".TON(IN := "Start", PT := T#2S);
	"Motor" := "IEC_Timer_0_DB".Q;
END_ORGANIZATION_BLOCK
```

## Namen

| Schreibweise                      | Bedeutung                                         |
| --------------------------------- | ------------------------------------------------- |
| `#name`                           | lokale Variable (Temp/Constant der Schnittstelle) |
| `"name"`                          | PLC-Variable aus der Variablentabelle             |
| `"Daten".wert`                    | Element eines Global-DBs                          |
| `"T1_DB".Q`, `"Daten".T1.ET`      | Element einer Instanz                             |
| `name`                            | erst lokal, dann global                           |
| `%I0.0`, `%IB0`, `%IW64`, `%MD10` | Absolutadresse: Bool, Byte, Word, DWord           |

Namen dürfen Umlaute enthalten (`#Zähler`).

## Datentypen und Literale

`Bool, Byte, Word, DWord, Int, DInt, Real, Time`

- `TRUE`, `FALSE`, `BOOL#1`
- `42`, `1_000`, `-5`, `16#FF`, `2#1010`, `8#17`, `INT#5`, `DINT#100000`
- `B#16#0F`, `W#16#F0F0`, `DW#16#FFFF_0000`, `WORD#16#FF`
- `1.5`, `2.5E3`, `REAL#1`
- `T#500ms`, `T#2S`, `T#1s200ms`, `T#2m`, `T#1h`, `TIME#250ms`

Zahlen ohne Präfix passen sich dem Zusammenhang an (`"Wert" := 1 + 2;` rechnet in Real).

### Implizite Konvertierung

Angelehnt an S7-1500 mit deaktivierter IEC-Prüfung:

| von   | implizit nach                 |
| ----- | ----------------------------- |
| Byte  | Word, DWord, Int, DInt        |
| Word  | DWord, Int (Bitmuster), DInt  |
| DWord | DInt (Bitmuster)              |
| Int   | DInt, Real, Word (Bitmuster)  |
| DInt  | Real, DWord (Bitmuster), Time |
| Time  | DInt                          |

Verengungen (`DInt → Int`, `Real → Int` …) brauchen eine Funktion (`DINT_TO_INT`, `REAL_TO_INT`).
Gerechnet wird im gemeinsamen Typ der Operanden: `#int / 2` ist eine Ganzzahldivision, auch wenn das
Ergebnis in eine Real-Variable geschrieben wird. Bitfolgen werden in Rechnungen als Int bzw. DInt
verwendet (`%IW64 + 1`).

## Operatoren (absteigende Bindung)

| Rang | Operatoren              |
| ---- | ----------------------- |
| 1    | `( )`, Funktionsaufruf  |
| 2    | `-` (Vorzeichen), `NOT` |
| 3    | `*`, `/`, `MOD`         |
| 4    | `+`, `-`                |
| 5    | `<`, `<=`, `>`, `>=`    |
| 6    | `=`, `<>`               |
| 7    | `AND`, `&`              |
| 8    | `XOR`                   |
| 9    | `OR`                    |

`AND/OR/XOR/NOT` auf Bool und Bitfolgen. Time: `T + T`, `T - T`, `T * Zahl`, `T / Zahl`.

## Anweisungen

```
x := ausdruck;
IF … THEN … ELSIF … THEN … ELSE … END_IF;
CASE ganzzahl OF 0: … 1, 3: … 5..9: … ELSE … END_CASE;
FOR #i := 1 TO 10 BY 2 DO … END_FOR;     // BY konstant, Endwert einmal ausgewertet
WHILE … DO … END_WHILE;
REPEAT … UNTIL … END_REPEAT;
EXIT;  CONTINUE;  RETURN;
REGION Name
  …
END_REGION
```

Endlosschleifen führen zur Zykluszeitüberschreitung: Die CPU geht in STOP.

## Zeiten, Zähler, Flanken

Parameter immer benannt. Eingänge mit `:=`, Ausgänge mit `=>`.

| Instanz-DB vom Typ                             | Aufruf                               | lesbare Elemente |
| ---------------------------------------------- | ------------------------------------ | ---------------- |
| `IEC_TIMER`                                    | `"T".TON(…)`, `.TOF`, `.TP`, `.TONR` | Q, ET            |
| `TON_TIME`, `TOF_TIME`, `TP_TIME`, `TONR_TIME` | `"T"(…)`                             | Q, ET            |
| `IEC_COUNTER`                                  | `"Z".CTU(…)`, `.CTD`, `.CTUD`        | QU, QD, CV       |
| `CTU_INT`, `CTD_INT`                           | `"Z"(…)`                             | Q, CV            |
| `CTUD_INT`                                     | `"Z"(…)`                             | QU, QD, CV       |
| `R_TRIG`, `F_TRIG`                             | `"F"(CLK := …)`                      | Q                |

| Anweisung      | Eingänge (Pflicht **fett**)   | Ausgänge   |
| -------------- | ----------------------------- | ---------- |
| TP, TON, TOF   | **IN**, **PT**                | Q, ET      |
| TONR           | **IN**, R, **PT**             | Q, ET      |
| CTU            | **CU**, R, **PV**             | Q, CV      |
| CTD            | **CD**, LD, **PV**            | Q, CV      |
| CTUD           | **CU**, **CD**, R, LD, **PV** | QU, QD, CV |
| R_TRIG, F_TRIG | **CLK**                       | Q          |

Ein IEC_TIMER-DB gehört zu genau einer Zeitart. Instanzen dürfen auch Variablen eines Global-DBs sein
(`"Daten".T1 : TON_TIME` → `"Daten".T1(…)`).

## Funktionen

Parameter entweder alle positionell oder alle benannt.

| Funktion         | Parameter                            | Ergebnis                     |
| ---------------- | ------------------------------------ | ---------------------------- |
| `ABS`            | IN                                   | wie IN                       |
| `LIMIT`          | MN, IN, MX                           | wie IN                       |
| `MIN`, `MAX`     | IN1, IN2, …                          | gemeinsamer Typ              |
| `SEL`            | G, IN0, IN1                          | wie IN0/IN1                  |
| `MUX`            | K, IN0, IN1, …, INELSE (nur benannt) | wie INx                      |
| `NORM_X`         | MIN, VALUE, MAX                      | Real                         |
| `SCALE_X`        | MIN, VALUE (Real), MAX               | Typ von MIN/MAX bzw. Zieltyp |
| `SHL`, `SHR`     | IN (Bitfolge), N (Int)               | wie IN                       |
| `ROUND`, `TRUNC` | IN (Real)                            | DInt                         |
| `X_TO_Y`         | IN                                   | Y (alle Typpaare)            |

`SR`, `RS`, `IN_RANGE`, `OUT_RANGE`, `P_TRIG`, `N_TRIG` gibt es wie in TIA nur in FUP/KOP.

## Programmgröße

Gezählt werden Anweisungen, nicht Zeilen: jede Zuweisung, jeder Aufruf, jedes
IF/CASE/FOR/WHILE/REPEAT (plus die Anweisungen darin), EXIT/CONTINUE/RETURN. REGION und leere
Anweisungen zählen nicht.

## Bewusst nicht unterstützt (noch)

Arrays, Strukturen, Strings, `**`, Zeiger, GOTO, eigene FB/FC und weitere OBs (M7).
