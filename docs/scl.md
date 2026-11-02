# SCL – Sprachumfang der Spiel-SPS

Ziel: Was man im Spiel schreibt, ist echtes SCL wie im TIA-Portal für S7-1500 und lässt sich über
„Externe Quellen“ importieren. Die Laufzeitsemantik steht in [semantik.md](semantik.md).

## Projektaufbau (wie im TIA-Bausteineditor)

Jede CPU hat:

- **PLC-Variablentabelle**: Name, Datentyp, Adresse (`"Start"` → `%I0.0`)
- **OB1 „Main“**: Schnittstelle (nur **Temp** und **Constant**) + Anweisungsteil in SCL oder FUP
- **Globale Datenbausteine**: statische Daten, z. B. `"Daten".Schritt`, mit Spalte **Remanent**
- **Instanz-DBs** für Zeiten, Zähler, Flanken und eigene FBs: z. B. `"T1_DB"` vom Typ `IEC_TIMER`
- **PLC-Datentypen**: eigene Strukturen, z. B. `"Rezept"` (unter „Datenbausteine“)
- **Eigene FB/FC**, **Alarm-OBs** (Weckalarm OB30…38, Prozessalarm OB40…47) und der
  **Anlauf-OB100**

Ein OB hat – wie in TIA – keine statischen Variablen. Was über Zyklen erhalten bleiben soll,
gehört in einen Datenbaustein oder in die statischen Daten eines FB.

## Eigene Bausteine

| Baustein           | Schnittstelle                                           | Aufruf                                       |
| ------------------ | ------------------------------------------------------- | -------------------------------------------- |
| FB                 | Input, Output, InOut, Static, Temp, Constant            | `"Motor_DB"(Start := "S1", Laeuft => "M1");` |
| FC                 | Input, Output, InOut, Temp, Constant                    | `"Begrenze"(x := "Wert", ueberlauf => #ov);` |
| Multiinstanz im FB | Static vom Typ `TON_TIME`, `IEC_TIMER`, `"EigenerFB"` … | `#T1(IN := #ein, PT := T#2s);`               |

- Eingänge mit `:=`, Ausgänge mit `=>`. Nicht versorgte FB-Eingänge behalten den Wert vom letzten
  Aufruf; bei FCs müssen alle Eingänge und Durchgangsparameter versorgt sein.
- Durchgangsparameter (InOut) brauchen eine Variable genau passenden Typs.
- Von außen lesbar: `"Motor_DB".Laeuft`, `"Motor_DB".T1.Q`; Ausgänge schreibt nur der FB selbst.
- **FC mit Rückgabewert**: Return-Typ in der Schnittstelle (`Void` = keiner), im Baustein
  `#Ret_Val := …;`, Aufruf im Ausdruck: `"Wert" := "Skalieren"(Roh := "Rohwert", Faktor := 0.5);`.
  Ausgänge im Ausdruck mit `NAME => ziel`. Als Anweisung aufgerufen wird der Wert verworfen.
- **Positionsparameter** bei eigenen FB/FC: `"Skalieren"("Rohwert", 0.5)` – der Reihe nach auf
  Eingänge und Durchgangsparameter; Ausgänge bleiben benannt. Systembausteine brauchen Namen.
- Rekursion ist nicht möglich.
- Die Spiel-SPS setzt FB/FC an jeder Aufrufstelle ein. Die Programmgröße zählt den Rumpf einmal,
  jeder Aufruf kostet eine Anweisung; Energie fällt je ausgeführtem Befehl an.

## Alarm-OBs

- Weckalarm: Takt und Phasenverschiebung in ms. Prozessalarm: Eingang (`%I0.3` oder `"Variable"`)
  und Flanke. In der `.scl`-Quelle steht das Ereignis als Kommentar im Bausteinkopf:
  `// Ereignis: Weckalarm, Takt 100 ms, Phase 0 ms`.
- Alarm-OBs haben wie OB1 nur Temp und Constant; Daten teilen sie mit OB1 über Datenbausteine.

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

| Gruppe          | Typen                                                            |
| --------------- | ---------------------------------------------------------------- |
| Bit, Bitfolge   | `Bool`, `Byte`, `Word`, `DWord`, `LWord`                         |
| Ganzzahl        | `SInt`, `USInt`, `Int`, `UInt`, `DInt`, `UDInt`, `LInt`, `ULInt` |
| Gleitkomma      | `Real`, `LReal`                                                  |
| Zeit, Datum     | `Time`, `Date`, `Time_Of_Day` (`TOD`), `DTL`                     |
| Zeichen         | `Char`, `String`, `String[n]` (n = 1 … 254)                      |
| zusammengesetzt | `Array[lo..hi] of …`, `Struct … END_STRUCT`, `"PLC-Datentyp"`    |

**Spielvereinfachungen:** `LInt`, `ULInt`, `LWord` sind auf ±(2^53 − 1) begrenzt (Sättigung statt
Überlauf). 64-bit-Typen und `String` gibt es nur in Datenbausteinen und lokal, nicht als
PLC-Variable im E/A- oder Merkerbereich.

- `TRUE`, `FALSE` (Schreibweise egal), `BOOL#1`; wo ein Bool erwartet wird, auch `0` und `1`
  (`"Motor" := 1;`, `IF "Start" = 1 THEN`, `IN := 1`). Andere Zahlen sind ein Fehler, Int-Variablen
  werden nicht zu Bool. Der `.scl`-Export schreibt dort `TRUE`/`FALSE`.
- `42`, `1_000`, `-5`, `16#FF`, `2#1010`, `8#17`, `INT#5`, `DINT#100000`
- `B#16#0F`, `W#16#F0F0`, `DW#16#FFFF_0000`, `WORD#16#FF`
- `1.5`, `2.5E3`, `REAL#1`
- `T#500ms`, `T#2S`, `T#1s200ms`, `T#2m`, `T#1h`, `TIME#250ms`
- `SINT#-5`, `USINT#200`, `UINT#60000`, `UDINT#4000000000`, `LINT#…`, `LREAL#1.5`, `LWORD#16#FF`
- `D#2026-01-05`, `DATE#…`, `TOD#06:30:00`, `TIME_OF_DAY#22:15:00.5`
- `'Text'` (Zeichenkette bzw. Char), Fluchtzeichen `$'` (Hochkomma), `$$`, `$N` (Zeilenumbruch), `$T`

Zahlen ohne Präfix passen sich dem Zusammenhang an (`"Wert" := 1 + 2;` rechnet in Real).

### Implizite Konvertierung

Angelehnt an S7-1500 mit deaktivierter IEC-Prüfung:

| von   | implizit nach                                          |
| ----- | ------------------------------------------------------ |
| Byte  | Word, DWord, LWord, Int, DInt, USInt, UInt, UDInt      |
| Word  | DWord, LWord, Int (Bitmuster), DInt, UInt, UDInt       |
| DWord | LWord, DInt (Bitmuster), UDInt                         |
| SInt  | Int, DInt, LInt, Real, LReal, Byte                     |
| USInt | UInt, UDInt, ULInt, Int, DInt, LInt, Real, LReal, Byte |
| Int   | DInt, LInt, Real, LReal, Word (Bitmuster)              |
| UInt  | UDInt, ULInt, DInt, LInt, Real, LReal, Word            |
| DInt  | LInt, Real, LReal, DWord (Bitmuster), Time             |
| UDInt | ULInt, LInt, LReal, DWord                              |
| LInt  | LReal                                                  |
| Real  | LReal                                                  |
| Time  | DInt                                                   |
| Char  | String                                                 |

Verengungen (`DInt → Int`, `Real → Int` …) brauchen eine Funktion (`DINT_TO_INT`, `REAL_TO_INT`).
Gerechnet wird im gemeinsamen Typ der Operanden: `#int / 2` ist eine Ganzzahldivision, auch wenn das
Ergebnis in eine Real-Variable geschrieben wird. Bitfolgen werden in Rechnungen als Int bzw. DInt
verwendet (`%IW64 + 1`).

## Felder und Strukturen

- `Werte : Array[0..9] of Int;`, mehrdimensional `Array[1..3, 0..1] of Real`, verschachtelt
  `Array[1..5] of "Rezept"`. Startwerte als Liste: `[1, 2, 3(0)]` (`3(0)` = dreimal 0).
- Zugriff `"DB".Werte[#i]`, `#Matrix[#i, #j]`, `"Lager".Fach[#i].Teil`. Konstante Indizes prüft der
  Compiler; ein variabler Index außerhalb der Grenzen ist ein **Programmierfehler** – die CPU geht
  in STOP.
- Ganze Felder und Strukturen gleichen Typs lassen sich zuweisen und als Parameter übergeben
  (Eingang/Ausgang kopieren, Durchgangsparameter als Verweis).
- **PLC-Datentypen** (UDT) legt man unter „Datenbausteine → + PLC-Datentyp“ an; in Quellen
  `TYPE "Name" STRUCT … END_STRUCT; END_TYPE`. Gleich sind zwei Strukturen nur bei gleichem
  Datentyp. Startwerte der Elemente gelten für jede Variable dieses Typs.

## Zeichenketten, Datum und Uhrzeit

- `String[n]` hält bis zu n Zeichen; längere Werte werden abgeschnitten. Vergleiche `=`, `<>`, `<` …
  arbeiten zeichenweise.
- `DTL` ist eine Struktur mit `YEAR` (UInt), `MONTH`, `DAY`, `WEEKDAY` (1 = Sonntag), `HOUR`,
  `MINUTE`, `SECOND` (USInt) und `NANOSECOND` (UDInt).
- `RD_SYS_T(OUT => #jetzt);` bzw. `#ret := RD_LOC_T(OUT => #jetzt);` liest die Uhr der Steuerung.
  **Spielregel:** Die Uhr beginnt bei jedem Test am Montag, 5. Januar 2026, um 06:00:00 und läuft mit
  der Simulationszeit; Orts- und Systemzeit sind gleich.

## Blockbefehle und Teilzugriffe

- `MOVE_BLK(IN := #quelle[2], COUNT := 3, OUT => #ziel[0]);` kopiert COUNT Elemente ab dem
  angegebenen Element (auch Strukturen). `FILL_BLK(IN := 0, COUNT := 10, OUT => #feld[0]);` füllt.
  `UMOVE_BLK`/`UFILL_BLK` verhalten sich gleich. **Spielregel:** Ein Bereich über das Feldende ist
  ein Programmierfehler (STOP).
- `SWAP(#w)` tauscht die Bytes von Word, DWord, LWord.
- Teilzugriffe: `#w.%X3` (Bit 3, 0 = niederwertigstes), `#w.%B1` (Byte 1), `#d.%W0` (Wort 0) –
  lesen und schreiben, auf Bitfolgen und Ganzzahlen bis 32 bit.

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

| Funktion               | Parameter                            | Ergebnis                     |
| ---------------------- | ------------------------------------ | ---------------------------- |
| `ABS`                  | IN                                   | wie IN                       |
| `LIMIT`                | MN, IN, MX                           | wie IN                       |
| `MIN`, `MAX`           | IN1, IN2, …                          | gemeinsamer Typ              |
| `SEL`                  | G, IN0, IN1                          | wie IN0/IN1                  |
| `MUX`                  | K, IN0, IN1, …, INELSE (nur benannt) | wie INx                      |
| `NORM_X`               | MIN, VALUE, MAX                      | Real                         |
| `SCALE_X`              | MIN, VALUE (Real), MAX               | Typ von MIN/MAX bzw. Zieltyp |
| `SHL`, `SHR`           | IN (Bitfolge), N (Int)               | wie IN                       |
| `ROUND`, `TRUNC`       | IN (Real, LReal)                     | DInt                         |
| `X_TO_Y`               | IN                                   | Y (alle Typpaare)            |
| `LEN`                  | IN (String)                          | Int                          |
| `CONCAT`               | IN1, IN2, …                          | String                       |
| `LEFT`, `RIGHT`        | IN, L                                | String                       |
| `MID`                  | IN, L, P (Position ab 1)             | String                       |
| `FIND`                 | IN1, IN2                             | Int (Position, 0 = fehlt)    |
| `DELETE`               | IN, L, P                             | String                       |
| `INSERT`               | IN1, IN2, P                          | String                       |
| `REPLACE`              | IN1, IN2, L, P                       | String                       |
| `SWAP`                 | IN (Word, DWord, LWord)              | wie IN                       |
| `RD_SYS_T`, `RD_LOC_T` | OUT => DTL                           | Int (0)                      |

`INT_TO_STRING` und Co. schreiben Zahlen ohne Vorzeichen-Platzhalter (`-42`, `1.5`);
`STRING_TO_INT` liest eine Zahl, ungültiger Text ergibt 0.

`SR`, `RS`, `IN_RANGE`, `OUT_RANGE`, `P_TRIG`, `N_TRIG` gibt es wie in TIA nur in FUP/KOP.

## Programmgröße

Gezählt werden Anweisungen, nicht Zeilen: jede Zuweisung, jeder Aufruf, jedes
IF/CASE/FOR/WHILE/REPEAT (plus die Anweisungen darin), EXIT/CONTINUE/RETURN. REGION und leere
Anweisungen zählen nicht.

## Bewusst nicht unterstützt (noch)

`**`, Zeiger (`Variant`, `Ref_To`), `AT`-Sichten, `WString`, `Array[*]`, GOTO, Felder von Instanzen,
Aufruf eigener FB/FC aus FUP, PLC-Variablen vom Typ eines PLC-Datentyps.
