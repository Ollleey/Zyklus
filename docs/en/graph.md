# GRAPH – step sequences

A **function block** can be written as a **step sequence** (GRAPH) instead of SCL, FBD or LAD:
language switch **GRAPH** above the editor (FBs only). It is called like any FB via its instance DB,
e.g. `"Bohren_DB"();` in OB1.

## Structure

- **Steps** with number and name. Exactly one step is the **initial step** (double frame); the
  sequence starts with it after startup. While monitoring, the active step is green.
- Below each step are its **actions** and its outgoing **transitions**.
- A **transition** has a condition in SCL and a target step. If the condition is true, the target
  step becomes active. At most one transition fires per cycle; with several, the first one that is
  true applies (order in the editor).

## Actions

| Qualifier | Effect                                                                   |
| --------- | ------------------------------------------------------------------------ |
| **N**     | operand is 1 while the step is active (otherwise 0)                      |
| **S**     | operand is set while the step is active and stays 1                      |
| **R**     | operand is reset while the step is active                                |
| **D**     | like N, but only once the step has been active for the given time (T#2s) |

If an operand appears with N or D in several steps, it is 1 while one of them is active. An operand
is either N/D or S/R, not both.

## Step time

In conditions, `Schrittzeit` stands for the time the current step has been active:
`"Unten" AND Schrittzeit >= T#300ms`. It starts with the cycle after advancing.

## Lowering and size

The sequence is translated into SCL: `CASE` over the number of the active step (static variable
`__Schritt`), the step time is a TON (`__Zeit`). Both are in the instance DB and can be monitored,
e.g. `"Bohren_DB".__Schritt`. Program size counts steps, transitions and actions.
