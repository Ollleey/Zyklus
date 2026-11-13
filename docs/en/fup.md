# FBD – function block diagram in TIA style

## Operation

- **Networks** are stacked and processed from top to bottom. Every network has a title; move with
  ↑/↓, delete with ✕, add with “+ Network”.
- Drag **boxes** from the instruction list into a network or click them (inserts into the selected
  network). Timers, counters and R_TRIG/F_TRIG create an instance DB – as in TIA
  (`IEC_Timer_0_DB`, `IEC_Counter_0_DB`, `R_TRIG_DB` …).
- **Connect:** drag from the round handle of a Bool output onto a Bool input. An output may feed
  several inputs, an input has exactly one source.
- **Negate:** click a Bool input; double-click the handle of a Bool output.
- Write **operands** directly at the pin: `"Start"`, `%I0.0`, `"Daten".Wert`, `T#2s`, `100`. For
  assignments, memory and edge boxes and instances the operand is above the box.
- **Extend:** ✚ under &, >=1, X, ADD, MUL, MIN, MAX, MUX adds an input, ━ removes it.
- **Select:** click a box; with **Shift** or **Ctrl** add more boxes (or remove them); **drag a
  frame** on free space to select all boxes inside; **Ctrl+A** selects all boxes of the network.
- **Move:** drag the selected boxes together or nudge them with the **arrow keys** (with Shift in
  larger steps).
- **Delete:** select boxes or click a connection, press Del – connections of deleted boxes go too.

As in TIA, connections only carry Bool signals. Numeric values go through operands, e.g. through a
variable in a global DB.

## LAD (ladder diagram)

LAD works on the same network model: contacts in series (AND), parallel branches (OR), boxes and
coils at the right rail. The language switch above the editor converts FBD ↔ LAD where the network
can be represented. Program size in LAD = contacts, boxes and coils.

## Boxes

| Category      | Boxes                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| Bit logic     | `&`, `>=1`, `X`, `=`, `S`, `R`, `SR`, `RS`, `P_TRIG`, `N_TRIG`, `R_TRIG`, `F_TRIG` |
| Timers        | `TP`, `TON`, `TOF`, `TONR`                                                         |
| Counters      | `CTU`, `CTD`, `CTUD`                                                               |
| Comparators   | `==`, `<>`, `>`, `>=`, `<`, `<=`, `IN_RANGE`, `OUT_RANGE`                          |
| Math          | `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `LIMIT`, `MIN`, `MAX`                    |
| Move          | `MOVE`, `CONV`, `SEL`, `MUX`, `NORM_X`, `SCALE_X`, `SHL`, `SHR`                    |
| Communication | `TSEND_C`, `TRCV_C`, `PUT`, `GET`                                                  |

Function boxes have **EN/ENO**: if EN is connected or set, the box only runs with EN = 1; ENO = EN.
Without EN the box always runs, ENO = 1.

### Own blocks

Under **Own blocks** all FBs and FCs of the project (except the one being edited) are available as
boxes, in LAD in the box selection; **Technology** offers the library blocks (PID_Compact). The pins
come from the interface: Input and InOut on the left, Output on the right, plus `Ret_Val` for an FC
with a return value. Bool pins can be connected, all others get an operand. EN/ENO are added as for
function boxes: with EN = 0 the block is not called.

- **FB:** when inserted, an instance DB is created (`Name_DB`). In an FB the operand above the box
  can also be a static variable of the FB's type (`#Innen`, multi-instance).
- **FC:** no operand. Value outputs and `Ret_Val` need a target operand or a connection.

If the interface changes, the pins adapt; operands at removed pins are no longer compiled.

### Comments and block protection

Every block has a **block comment** (line below the block selection), every network a title and a
comment. In the SCL source the block comment appears as `//` lines in the header.

A **protected block** (supplied in a job) only shows its interface: code and language can be
neither viewed nor changed, but it is compiled and called normally and does not count toward
program size.

## Semantics

FBD is translated network by network into SCL and then brought into the IR by the same compiler as
SCL. So all rules from [semantik.md](semantik.md) and [scl.md](scl.md) apply unchanged.

- **Order:** networks from top to bottom. Within a network topologically along the connections; on
  a tie top before bottom, left before right.
- Logic operations with exactly one target are merged into one expression, branches use a helper
  variable (Temp).
- **SR** (S, R1): reset dominant. **RS** (R, S1): set dominant. The memory bit is the operand.
- **P_TRIG/N_TRIG** evaluate the input with the edge memory bit (operand).
- **CONV** converts into the data type of the output operand.
- With `IEC_COUNTER` the Q output in the DB is called `QU` (CTU) or `QD` (CTD).

## Errors

Messages point to network, box and pin (`NW 2 · ton1.PT`); the box gets a red outline. Detected are
among others open inputs, missing operands, connection plus operand at the same input, feedback
loops, connections to value pins and all type errors of the SCL compiler.

## Program size

Counts the boxes. The CPU limit for FBD is networks (CPU klein: 10).
