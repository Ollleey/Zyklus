# SCL – Sprachumfang der Spiel-SPS

Grundlage für den SCL-Editor und das spätere Handbuch. Die Laufzeitsemantik der Befehle steht in
[semantik.md](semantik.md).

## Aufbau eines Programms (OB1)

```
VAR                       // statisch (Instanz-DB), behält Werte über Zyklen
  Laufzeit : TON;
  Teile    : CTU;
  Schritt  : INT := 0;
END_VAR
VAR_TEMP                  // temporär, startet jeden Zyklus mit dem Startwert
  i : INT;
END_VAR
VAR CONSTANT
  GRENZE : INT := 100;
END_VAR

// Anweisungen
"Motor" := ("Start" OR "Motor") AND "Stopp";
```

Deklarationen stehen vor den Anweisungen. Groß-/Kleinschreibung spielt keine Rolle.

## Namen

| Schreibweise              | Bedeutung                                                   |
| ------------------------- | ----------------------------------------------------------- |
| `#name`                   | lokale Variable / Instanz (aus VAR, VAR_TEMP, VAR CONSTANT) |
| `"name"`                  | PLC-Variable aus der Variablentabelle                       |
| `"Daten".wert`            | Element des globalen Datenbausteins                         |
| `name`                    | erst lokal, dann PLC-Variable                               |
| `%I0.0`, `%QW64`, `%MD10` | Absolutadresse (`%…W` = INT, `%…D` = DINT)                  |
| `#T1.Q`, `#Z.CV`          | Ausgang einer FB-Instanz (nur lesen)                        |

## Datentypen und Literale

`BOOL, INT, DINT, REAL, WORD, TIME`

- `TRUE`, `FALSE`, `BOOL#1`
- `42`, `1_000`, `-5`, `16#FF`, `2#1010`, `8#17`, `INT#5`, `DINT#100000`, `WORD#16#F0F0`
- `1.5`, `2.5E3`, `REAL#1`
- `T#500ms`, `T#1s200ms`, `T#2m`, `T#1h`, `T#1.5s`, `TIME#250ms`

Zahlen ohne Typpräfix passen sich dem Zusammenhang an (`"Wert" := 1 + 2;` rechnet in REAL).

### Implizite Umwandlung

Nur verlustfrei erweiternd: `INT → DINT`, `INT → REAL`, `DINT → REAL`. Alles andere braucht eine
Konvertierungsfunktion (`REAL_TO_INT`, `INT_TO_WORD`, `DINT_TO_TIME`, …). Gerechnet wird im
gemeinsamen Typ der Operanden: `#int / 2` ist eine Ganzzahldivision, auch wenn das Ergebnis in eine
REAL-Variable geschrieben wird.

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

`AND/OR/XOR/NOT` auf BOOL und WORD. TIME: `T + T`, `T - T`, `T * Zahl`, `T / Zahl`.

## Anweisungen

```
x := ausdruck;

IF bedingung THEN … ELSIF bedingung THEN … ELSE … END_IF;

CASE ganzzahl OF
  0:        …
  1, 3:     …
  5..9:     …
ELSE        …
END_CASE;

FOR #i := 1 TO 10 BY 2 DO … END_FOR;     // BY muss eine Konstante sein, Endwert wird einmal ausgewertet
WHILE bedingung DO … END_WHILE;
REPEAT … UNTIL bedingung END_REPEAT;
EXIT;  CONTINUE;  RETURN;
```

Endlosschleifen führen zur Zykluszeitüberschreitung: Die CPU geht in STOP.

## FB-Aufrufe

Parameter immer benannt. Eingänge mit `:=`, Ausgänge mit `=>`:

```
#T1(IN := "Taster", PT := T#500ms, Q => #entprellt);
#Z(CU := #T1.Q, R := "Reset", PV := 10);
```

| Typ                      | Eingänge (Pflicht **fett**)   | Ausgänge   |
| ------------------------ | ----------------------------- | ---------- |
| TP, TON, TOF             | **IN**, **PT**                | Q, ET      |
| TONR                     | **IN**, R, **PT**             | Q, ET      |
| CTU                      | **CU**, R, **PV**             | Q, CV      |
| CTD                      | **CD**, LD, **PV**            | Q, CV      |
| CTUD                     | **CU**, **CD**, R, LD, **PV** | QU, QD, CV |
| R_TRIG, F_TRIG           | **CLK**                       | Q          |
| SR (Rücksetzen dominant) | **S1**, **R**                 | Q1         |
| RS (Setzen dominant)     | **S**, **R1**                 | Q1         |

Aliasse: `TON_TIME` usw., `CTU_INT` usw.

## Funktionen

Parameter entweder alle positionell oder alle benannt.

| Funktion                | Parameter                          | Ergebnis                     |
| ----------------------- | ---------------------------------- | ---------------------------- |
| `ABS`                   | IN                                 | wie IN                       |
| `LIMIT`                 | MN, IN, MX                         | wie IN                       |
| `MIN`, `MAX`            | IN1, IN2, …                        | gemeinsamer Typ              |
| `SEL`                   | G, IN0, IN1                        | wie IN0/IN1                  |
| `MUX`                   | K, IN0, IN1, …, ELSE (nur benannt) | wie INx                      |
| `IN_RANGE`, `OUT_RANGE` | MIN, VAL, MAX                      | BOOL                         |
| `NORM_X`                | MIN, VALUE, MAX                    | REAL                         |
| `SCALE_X`               | MIN, VALUE (REAL), MAX             | Typ von MIN/MAX bzw. Zieltyp |
| `SHL`, `SHR`            | IN (WORD), N (INT)                 | WORD                         |
| `ROUND`, `TRUNC`        | IN (REAL)                          | DINT                         |
| `X_TO_Y`                | IN                                 | Y (für alle Typpaare)        |

## Programmgröße

Gezählt werden Anweisungen, nicht Zeilen: jede Zuweisung, jeder FB-Aufruf, jedes
IF/CASE/FOR/WHILE/REPEAT (plus die Anweisungen darin), EXIT/CONTINUE/RETURN. Leere Anweisungen (`;`)
zählen nicht.

## Bewusst nicht unterstützt

Arrays, Strukturen, Strings, `**`, Zeiger, Sprungmarken/GOTO, eigene FB/FC (folgen in M7).
