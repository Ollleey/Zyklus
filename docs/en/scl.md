# SCL – language scope of the game PLC

Goal: what you write in the game is real SCL as in the TIA Portal for the S7-1500 and can be
imported via “external sources”. The run-time semantics are described in
[semantik.md](semantik.md).

## Project structure (as in the TIA block editor)

Every CPU has:

- **PLC tag table**: name, data type, address (`"Start"` → `%I0.0`)
- **OB1 “Main”**: interface (only **Temp** and **Constant**) + statement section in SCL, FBD or LAD
- **Global data blocks**: static data, e.g. `"Daten".Schritt`, with a **Retain** column
- **Instance DBs** for timers, counters, edges and own FBs: e.g. `"T1_DB"` of type `IEC_TIMER`
- **PLC data types**: own structures, e.g. `"Rezept"` (under “Data blocks”)
- **Own FB/FC**, **interrupt OBs** (cyclic interrupt OB30…38, hardware interrupt OB40…47), the
  **startup OB100** and the error OBs (OB80, OB82, OB86, OB121)

As in TIA, an OB has no static variables. Whatever should persist over cycles belongs in a data
block or in the static data of an FB.

## Own blocks

| Block                | Interface                                           | Call                                         |
| -------------------- | --------------------------------------------------- | -------------------------------------------- |
| FB                   | Input, Output, InOut, Static, Temp, Constant        | `"Motor_DB"(Start := "S1", Laeuft => "M1");` |
| FC                   | Input, Output, InOut, Temp, Constant                | `"Begrenze"(x := "Wert", ueberlauf => #ov);` |
| Multi-instance in FB | Static of type `TON_TIME`, `IEC_TIMER`, `"OwnFB"` … | `#T1(IN := #ein, PT := T#2s);`               |

- Inputs with `:=`, outputs with `=>`. FB inputs that are not supplied keep the value from the last
  call; for FCs all inputs and in-out parameters must be supplied.
- In-out parameters (InOut) need a variable of exactly the matching type.
- Readable from outside: `"Motor_DB".Laeuft`, `"Motor_DB".T1.Q`; outputs are only written by the FB
  itself.
- **FC with a return value**: return type in the interface (`Void` = none), in the block
  `#Ret_Val := …;`, called in an expression: `"Wert" := "Skalieren"(Roh := "Rohwert", Faktor := 0.5);`.
  Outputs in the expression with `NAME => target`. Called as a statement, the value is discarded.
- **Positional parameters** for own FB/FC: `"Skalieren"("Rohwert", 0.5)` – in order onto inputs and
  in-out parameters; outputs stay named. System blocks need names.
- Recursion is not possible.
- The game PLC inlines FB/FC at every call site. Program size counts the body once, every call costs
  one statement; energy is charged per executed instruction.
- Own FBs and FCs can also be used as boxes in FBD and LAD; an FB can also be written as a step
  sequence in **GRAPH**.

## Interrupt OBs

- Cyclic interrupt: interval and phase shift in ms. Hardware interrupt: input (`%I0.3` or `"tag"`)
  and edge. In the `.scl` source the event is a comment in the block header:
  `// Ereignis: Weckalarm, Takt 100 ms, Phase 0 ms`.
- Like OB1, interrupt OBs only have Temp and Constant; they share data with OB1 via data blocks.

In the editor you only write the statement section. Export/import as an `.scl` source:

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

## Names

| Notation                          | Meaning                                         |
| --------------------------------- | ----------------------------------------------- |
| `#name`                           | local variable (Temp/Constant of the interface) |
| `"name"`                          | PLC tag from the tag table                      |
| `"Daten".wert`                    | element of a global DB                          |
| `"T1_DB".Q`, `"Daten".T1.ET`      | element of an instance                          |
| `name`                            | local first, then global                        |
| `%I0.0`, `%IB0`, `%IW64`, `%MD10` | absolute address: Bool, Byte, Word, DWord       |

Names may contain umlauts (`#Zähler`).

## Data types and literals

| Group           | Types                                                            |
| --------------- | ---------------------------------------------------------------- |
| Bit, bit string | `Bool`, `Byte`, `Word`, `DWord`, `LWord`                         |
| Integer         | `SInt`, `USInt`, `Int`, `UInt`, `DInt`, `UDInt`, `LInt`, `ULInt` |
| Floating point  | `Real`, `LReal`                                                  |
| Time, date      | `Time`, `Date`, `Time_Of_Day` (`TOD`), `DTL`                     |
| Characters      | `Char`, `String`, `String[n]` (n = 1 … 254)                      |
| Structured      | `Array[lo..hi] of …`, `Struct … END_STRUCT`, `"PLC data type"`   |

**Game simplifications:** `LInt`, `ULInt`, `LWord` are limited to ±(2^53 − 1) (saturation instead
of overflow). 64-bit types and `String` only exist in data blocks and locally, not as PLC tags in
the I/O or memory area.

- `TRUE`, `FALSE` (any case), `BOOL#1`; where a Bool is expected, also `0` and `1`
  (`"Motor" := 1;`, `IF "Start" = 1 THEN`, `IN := 1`). Other numbers are an error, Int variables do
  not become Bool. The `.scl` export writes `TRUE`/`FALSE` there.
- `42`, `1_000`, `-5`, `16#FF`, `2#1010`, `8#17`, `INT#5`, `DINT#100000`
- `B#16#0F`, `W#16#F0F0`, `DW#16#FFFF_0000`, `WORD#16#FF`
- `1.5`, `2.5E3`, `REAL#1`
- `T#500ms`, `T#2S`, `T#1s200ms`, `T#2m`, `T#1h`, `TIME#250ms`
- `SINT#-5`, `USINT#200`, `UINT#60000`, `UDINT#4000000000`, `LINT#…`, `LREAL#1.5`, `LWORD#16#FF`
- `D#2026-01-05`, `DATE#…`, `TOD#06:30:00`, `TIME_OF_DAY#22:15:00.5`
- `'Text'` (string or Char), escape characters `$'` (apostrophe), `$$`, `$N` (line break), `$T`

Numbers without a prefix adapt to the context (`"Wert" := 1 + 2;` computes in Real).

### Implicit conversion

Modelled on the S7-1500 with IEC check disabled:

| from  | implicitly to                                          |
| ----- | ------------------------------------------------------ |
| Byte  | Word, DWord, LWord, Int, DInt, USInt, UInt, UDInt      |
| Word  | DWord, LWord, Int (bit pattern), DInt, UInt, UDInt     |
| DWord | LWord, DInt (bit pattern), UDInt                       |
| SInt  | Int, DInt, LInt, Real, LReal, Byte                     |
| USInt | UInt, UDInt, ULInt, Int, DInt, LInt, Real, LReal, Byte |
| Int   | DInt, LInt, Real, LReal, Word (bit pattern)            |
| UInt  | UDInt, ULInt, DInt, LInt, Real, LReal, Word            |
| DInt  | LInt, Real, LReal, DWord (bit pattern), Time           |
| UDInt | ULInt, LInt, LReal, DWord                              |
| LInt  | LReal                                                  |
| Real  | LReal                                                  |
| Time  | DInt                                                   |
| Char  | String                                                 |

Narrowing (`DInt → Int`, `Real → Int` …) needs a function (`DINT_TO_INT`, `REAL_TO_INT`).
Computation happens in the common type of the operands: `#int / 2` is an integer division, even if
the result is written to a Real variable. Bit strings are used as Int or DInt in calculations
(`%IW64 + 1`).

## Arrays and structures

- `Werte : Array[0..9] of Int;`, multi-dimensional `Array[1..3, 0..1] of Real`, nested
  `Array[1..5] of "Rezept"`. Start values as a list: `[1, 2, 3(0)]` (`3(0)` = three times 0).
- Access `"DB".Werte[#i]`, `#Matrix[#i, #j]`, `"Lager".Fach[#i].Teil`. The compiler checks constant
  indices; a variable index outside the bounds is a **programming error** – the CPU goes to STOP.
- Whole arrays and structures of the same type can be assigned and passed as parameters (input/
  output copy, in-out parameter by reference).
- **PLC data types** (UDT) are created under “Data blocks → + PLC data type”; in sources
  `TYPE "Name" STRUCT … END_STRUCT; END_TYPE`. Two structures are only equal with the same data
  type. Start values of the elements apply to every variable of this type.

## Strings, date and time

- `String[n]` holds up to n characters; longer values are truncated. Comparisons `=`, `<>`, `<` …
  work character by character.
- `DTL` is a structure with `YEAR` (UInt), `MONTH`, `DAY`, `WEEKDAY` (1 = Sunday), `HOUR`,
  `MINUTE`, `SECOND` (USInt) and `NANOSECOND` (UDInt).
- `RD_SYS_T(OUT => #jetzt);` or `#ret := RD_LOC_T(OUT => #jetzt);` reads the controller clock.
  **Game rule:** the clock starts every test on Monday, 5 January 2026, at 06:00:00 and runs with
  simulation time; local and system time are the same.

## Block instructions and slice access

- `MOVE_BLK(IN := #quelle[2], COUNT := 3, OUT => #ziel[0]);` copies COUNT elements from the given
  element (structures too). `FILL_BLK(IN := 0, COUNT := 10, OUT => #feld[0]);` fills.
  `UMOVE_BLK`/`UFILL_BLK` behave the same. **Game rule:** a range past the end of the array is a
  programming error (STOP).
- `SWAP(#w)` swaps the bytes of Word, DWord, LWord.
- Slice access: `#w.%X3` (bit 3, 0 = least significant), `#w.%B1` (byte 1), `#d.%W0` (word 0) –
  read and write, on bit strings and integers up to 32 bits.

## Operators (decreasing precedence)

| Rank | Operators            |
| ---- | -------------------- |
| 1    | `( )`, function call |
| 2    | `-` (sign), `NOT`    |
| 3    | `*`, `/`, `MOD`      |
| 4    | `+`, `-`             |
| 5    | `<`, `<=`, `>`, `>=` |
| 6    | `=`, `<>`            |
| 7    | `AND`, `&`           |
| 8    | `XOR`                |
| 9    | `OR`                 |

`AND/OR/XOR/NOT` on Bool and bit strings. Time: `T + T`, `T - T`, `T * number`, `T / number`.

## Statements

```
x := expression;
IF … THEN … ELSIF … THEN … ELSE … END_IF;
CASE integer OF 0: … 1, 3: … 5..9: … ELSE … END_CASE;
FOR #i := 1 TO 10 BY 2 DO … END_FOR;     // BY constant, end value evaluated once
WHILE … DO … END_WHILE;
REPEAT … UNTIL … END_REPEAT;
EXIT;  CONTINUE;  RETURN;
REGION Name
  …
END_REGION
```

Endless loops lead to a cycle time overrun: the CPU goes to STOP.

## Timers, counters, edges

Parameters are always named. Inputs with `:=`, outputs with `=>`.

| Instance DB of type                            | Call                                 | readable elements |
| ---------------------------------------------- | ------------------------------------ | ----------------- |
| `IEC_TIMER`                                    | `"T".TON(…)`, `.TOF`, `.TP`, `.TONR` | Q, ET             |
| `TON_TIME`, `TOF_TIME`, `TP_TIME`, `TONR_TIME` | `"T"(…)`                             | Q, ET             |
| `IEC_COUNTER`                                  | `"Z".CTU(…)`, `.CTD`, `.CTUD`        | QU, QD, CV        |
| `CTU_INT`, `CTD_INT`                           | `"Z"(…)`                             | Q, CV             |
| `CTUD_INT`                                     | `"Z"(…)`                             | QU, QD, CV        |
| `R_TRIG`, `F_TRIG`                             | `"F"(CLK := …)`                      | Q                 |

| Instruction    | Inputs (required **bold**)    | Outputs    |
| -------------- | ----------------------------- | ---------- |
| TP, TON, TOF   | **IN**, **PT**                | Q, ET      |
| TONR           | **IN**, R, **PT**             | Q, ET      |
| CTU            | **CU**, R, **PV**             | Q, CV      |
| CTD            | **CD**, LD, **PV**            | Q, CV      |
| CTUD           | **CU**, **CD**, R, LD, **PV** | QU, QD, CV |
| R_TRIG, F_TRIG | **CLK**                       | Q          |

An IEC_TIMER DB belongs to exactly one kind of timer. Instances may also be variables of a global
DB (`"Daten".T1 : TON_TIME` → `"Daten".T1(…)`).

Further system blocks with an instance DB: PID_Compact (technology), TSEND_C/TRCV_C and PUT/GET
(communication), Program_Alarm (alarms) – see the handbook page “Technology”.

## Functions

Parameters either all positional or all named.

| Function               | Parameters                          | Result                         |
| ---------------------- | ----------------------------------- | ------------------------------ |
| `ABS`                  | IN                                  | like IN                        |
| `LIMIT`                | MN, IN, MX                          | like IN                        |
| `MIN`, `MAX`           | IN1, IN2, …                         | common type                    |
| `SEL`                  | G, IN0, IN1                         | like IN0/IN1                   |
| `MUX`                  | K, IN0, IN1, …, INELSE (named only) | like INx                       |
| `NORM_X`               | MIN, VALUE, MAX                     | Real                           |
| `SCALE_X`              | MIN, VALUE (Real), MAX              | type of MIN/MAX or target type |
| `SHL`, `SHR`           | IN (bit string), N (Int)            | like IN                        |
| `ROUND`, `TRUNC`       | IN (Real, LReal)                    | DInt                           |
| `X_TO_Y`               | IN                                  | Y (all type pairs)             |
| `LEN`                  | IN (String)                         | Int                            |
| `CONCAT`               | IN1, IN2, …                         | String                         |
| `LEFT`, `RIGHT`        | IN, L                               | String                         |
| `MID`                  | IN, L, P (position from 1)          | String                         |
| `FIND`                 | IN1, IN2                            | Int (position, 0 = missing)    |
| `DELETE`               | IN, L, P                            | String                         |
| `INSERT`               | IN1, IN2, P                         | String                         |
| `REPLACE`              | IN1, IN2, L, P                      | String                         |
| `SWAP`                 | IN (Word, DWord, LWord)             | like IN                        |
| `RD_SYS_T`, `RD_LOC_T` | OUT => DTL                          | Int (0)                        |
| `GET_ERR_ID`           | –                                   | Word (last programming error)  |
| `RUNTIME`              | MEM (LReal, static)                 | LReal (s since the last call)  |

`INT_TO_STRING` and co. write numbers without a sign placeholder (`-42`, `1.5`); `STRING_TO_INT`
reads a number, invalid text gives 0.

As in TIA, `SR`, `RS`, `IN_RANGE`, `OUT_RANGE`, `P_TRIG`, `N_TRIG` only exist in FBD/LAD.

## Program size

Statements are counted, not lines: every assignment, every call, every IF/CASE/FOR/WHILE/REPEAT
(plus the statements inside), EXIT/CONTINUE/RETURN. REGION and empty statements don't count.

## Deliberately not supported (yet)

`**`, pointers (`Variant`, `Ref_To`), `AT` views, `WString`, `Array[*]`, GOTO, arrays of instances,
PLC tags of a PLC data type.
