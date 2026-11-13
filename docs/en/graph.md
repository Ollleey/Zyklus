# GRAPH – step sequences

A **function block** can be written as a **step sequence** (GRAPH) instead of SCL, FBD or LAD:
language switch **GRAPH** above the editor (FBs only). It is called like any FB via its instance DB,
e.g. `"Bohren_DB"();` in OB1. How to design a sequence is explained under “Understanding step
sequences”.

## Structure

- **Steps** with number and name. Exactly one step is the **initial step** (double frame); the
  sequence starts with it after startup.
- Below each step are its **interlock** (C), **supervision** (V), its **actions** and its outgoing
  **transitions**.
- A **transition** has a condition in SCL and a target step. If the condition is true, the target
  step becomes active. If a step has several outgoing transitions (**alternative branch**), the
  first one that is true applies (order in the editor).

## Simultaneous branch and synchronisation

- **Simultaneous branch**: enter several target steps, e.g. `3, 4` – both become active at the same
  time and continue independently.
- **Synchronisation**: enter further steps in the **and** field that must be active too, e.g. `5`.
  The transition is listed under its first predecessor and only switches when all predecessors are
  active and the condition is true; then all predecessors become inactive.

## Actions

| Qualifier | Effect                                                                   |
| --------- | ------------------------------------------------------------------------ |
| **N**     | operand is 1 while the step is active (otherwise 0)                      |
| **S**     | operand is set while the step is active and stays 1                      |
| **R**     | operand is reset while the step is active                                |
| **D**     | like N, but only once the step has been active for the given time (T#2s) |

If an operand appears with N or D in several steps, it is 1 while one of them is active. An operand
is either N/D or S/R, not both.

## Interlock and supervision

- **C – interlock**: condition in SCL, e.g. `"Door_closed"`. The actions of the step only take effect
  while it holds. If it is missing while the step is active, `ERR_FLT` is set.
- **V – supervision**: condition in SCL, e.g. `Schrittzeit > T#5s` (drill not down in time). If it
  becomes true, the step reports a **fault**: `ERR_FLT` = 1, the sequence does not advance, and while
  monitoring the step is red. **Acknowledge** with `ACK_EF` to clear the fault; it then counts as
  handled for this activation of the step.

## Operating modes and sequence control

Every sequence FB also has these parameters (as in S7-GRAPH), e.g.
`"Bohren_DB"(ACK_EF := "Ack", SW_TAP := "Jog_mode", T_PUSH := "Next");`

| Input                         | Effect                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `SW_AUTO`, `SW_TAP`, `SW_MAN` | edge selects **Auto** (default), **Jog** or **Manual**                |
| `T_PUSH`                      | Jog: a true transition only switches on an edge at T_PUSH             |
| `S_SEL`, `S_ON`               | Manual: edge at S_ON activates step S_SEL, all others become inactive |
| `INIT_SQ`                     | sequence to its initial state (only the initial step active), while 1 |
| `OFF_SQ`                      | sequence off (no step active), while 1                                |
| `ACK_EF`                      | acknowledge fault                                                     |

| Output                        | Meaning                                  |
| ----------------------------- | ---------------------------------------- |
| `ERR_FLT`                     | fault (supervision or missing interlock) |
| `S_NO`                        | number of the (lowest) active step       |
| `AUTO_ON`, `TAP_ON`, `MAN_ON` | current mode                             |

In Manual mode no transition switches. While monitoring, the mode is shown above the sequence.

## Permanent instructions

Above and below the sequence you can enter **permanent instructions** in SCL. They run in every
cycle before or after the sequence, independent of the active step – e.g. to compute an enable or to
derive a lamp from `S_NO`.

## Step time

In conditions, `Schrittzeit` stands for the time the step has been active (for transitions: the
first predecessor): `"Unten" AND Schrittzeit >= T#300ms`. It starts with the cycle after advancing.

## Lowering and size

The sequence is translated into SCL: per step an active bit `__X<n>` and a step time `__Z<n>` (TON),
plus `__Schritt` (= `S_NO`), `__Fehler` (faulted step) and `__Betrieb`. All of them are in the
instance DB and can be monitored, e.g. `"Bohren_DB".__X3`. Program size counts steps, transitions
and actions.
