# Online functions – testing as on the device

All functions work with the running simulation (manual mode, test case or sandbox).

## Monitoring

Above the program editor, **👓 Monitoring on/off** switches the display (like the glasses in the
TIA Portal; the setting is remembered). While the simulation runs or is paused, the values are
shown right in the program – when paused or in single cycle, the state of that cycle.

- **SCL**: to the right of each line a column with all operands of the line and their values
  (**1 green**, **0 blue**, numbers yellow). Conditions of `IF`, `ELSIF`, `WHILE` and `UNTIL` are
  coloured: green fulfilled, blue not fulfilled.
- **LAD**: the **power flow** from the left rail – contacts, wires, boxes and coils green where power
  flows, blue (dashed) where not. Box pins show their values, timers and counters also `ET`, `Q`,
  `CV` from the instance DB.
- **FBD**: values at operands and pins, **connection lines** green (1) or dashed blue (0); unassigned
  outputs of timers and counters show their value from the instance DB.
- **GRAPH**: the active step is outlined in green.
- **FB**: local variables (`#…`) are shown from the instance DB of the selected **call
  environment** (selection next to the switch). In an **FC** only global operands are visible.

If a value cannot be determined (e.g. an edge in the middle of a rung), that spot stays neutral grey
instead of being coloured wrongly.

## Watch table and force table

Tab **“Watch & force”** in the program area, saved per CPU and job.

| Column       | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| Operand      | `"Motor"`, `%IW64`, `"Daten".Wert`, `"Lager".Fach[2].Teil`, `"T1".ET` |
| Format       | DEC, HEX (`16#…`), BIN (`2#…`), time (`T#…`)                          |
| Modify value | `TRUE`, `42`, `16#FF`, `T#2s`, `'Text'`                               |

- **⚡ Modify** writes the value once: inputs into the PII, outputs into the PIQ, memory bits and
  variables directly. The next cycle may overwrite it again. **Modify cyclically** writes it again
  in every frame.
- **Forcing** only exists at inputs and outputs: a forced input replaces the field signal, a forced
  output applies at the terminal – even in STOP. The CPU's **MAINT LED** lights yellow.
- **With active force jobs no job is accepted** (criterion “No force jobs active”).

## Trace

The logic analyzer below the simulation records every signal at 1 ms.

- **Signals**: show and hide traces, add program variables (`"Daten".Wert`, `%MW10`).
- **Trigger** on a signal: rising or falling edge, value `=`, `>` or `<`. **Pre-trigger** and
  **post-trigger** define the window.
- **Arm** waits from now on; after triggering the window stays (dashed trigger line). **Release**
  returns to the live display.

## Cross-references

Tab **“Cross-references”**:

- **Cross-reference list**: every symbol with address, location (click jumps there) and access; ✎n
  shows several write locations.
- **Call structure**: which OB calls which FB/FC and system blocks.
- **Assignment list**: used bits in I, Q and memory (■ used in the program, □ only created).
- If an output is assigned **unconditionally** in two places, the compiler warns: the earlier
  assignment never takes effect.

## Compiling and loading

In manual mode and in the sandbox the CPU keeps working with the loaded version after a program
change. The simulation bar shows “Program changed”:

- **Load (in RUN)** for pure code changes: current values, timers and counters stay, no startup.
- **Load (STOP needed)** if variables or instances have changed: keep the current values of
  variables with the same name or reset them to start values; then startup (OB100).

Hardware changes and test cases start a new attempt as before.

## Single step and breakpoints

- **Cycle** computes exactly one more cycle.
- **Breakpoint**: click in the left margin of the SCL editor (red dot). **Game rule:** the
  simulation stops after the cycle in which the line was executed (in TIA in the middle of the
  cycle); the line is highlighted in red. **Start** runs on to the next hit.

## Existing plants

Some jobs come with the hardware and program of a running plant. The goal is to find the faults and
**change as little as possible**: besides cost, energy and size the **amount of change** counts –
added plus removed program lines compared to the supplied program (blank and comment lines don't
count, neither do settings in the cabinet). If a block is rewritten in FBD, LAD or GRAPH, its
compiled code counts – so switching the language counts as a rewrite. “Discard solution” restores
the supplied state. Helpful:
cross-references, monitoring, breakpoints and the compiler warning for multiple assignments.

## Extensions

An **extension** builds on a solved job: you start with your own solution of the predecessor
(without one, with the supplied one). Its tests keep running as **regression tests**
(“Regression: …”) – the new function must not break anything existing.

## Library

Store your own FBs and FCs in the **library** with 📚 next to the block name, PLC data types in the
Data blocks tab. Every store is a new **version**. Via “+ Block → From library …” you insert the
newest version in a later job; a block with the same name is updated. As long as an inserted block
is **unchanged** (shown as “Library v2”), it doesn't count toward program size – reuse pays off.

## Language

At the top of the inbox you choose **Deutsch** or **English**. The interface, all jobs, messages
and the handbook are translated.
