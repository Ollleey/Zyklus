# Semantics of the game PLC

This document defines how `@zyklus/sim-core` computes. It is the binding reference for the SCL
compiler, the FBD compiler, level design and tests. Where the game PLC deliberately deviates from a
real controller, this is marked (**game rule**).

## 1. Time and cycle

- Global simulation time in whole **milliseconds** (`Simulation.time`). One `tick()` = 1 ms.
- Sequence of a tick `t`:
  1. `env.beforeScans(t)` – plant/stimuli set the **input terminals** (`cpu.inputs`).
  2. Every CPU whose cycle is due (`(t − phaseMs) mod cycleMs = 0`) runs one cycle.
     Order = order in the CPU array.
  3. `env.afterScans(t)` – the plant reads the **output terminals** (`cpu.outputs`) and computes on.
- One cycle:
  1. **PII** ← input terminals (copy, frozen afterwards)
  2. TEMP variables ← start value
  3. Run **OB1** (all read/write accesses to `%I`/`%Q` go to PII/PIQ)
  4. Output terminals ← **PIQ**
- **Game rule:** the computing time of a cycle is 0 ms; outputs take effect in the same tick. The
  cycle time only determines the sampling grid.
- Consequence: an input pulse lying completely between two cycle starts is **not seen**.

### Interrupt OBs

- Besides OB1 a project can contain **cyclic interrupt OBs** (OB30…38, fixed interval `intervalMs`,
  phase `phaseMs`) and **hardware interrupt OBs** (OB40…47, rising or falling edge at an input bit).
  In the IR they are code ranges `tasks` after `mainEnd`.
- Order within a tick: first hardware interrupts (edge at the input terminal compared with the
  previous tick; never on the very first sample), then due cyclic interrupts, then OB1.
- **Game rule:** an interrupt OB updates the PII before and writes the PIQ to the output terminals
  afterwards – it sees fresh inputs and acts immediately. Its instruction budget is the same as for
  a cycle; exceeding it → STOP. With **process image partitions** (TPA, see “Devices and faults”) the
  real behaviour applies instead.
- Cyclic interrupts need a CPU with cyclic interrupts, hardware interrupts a CPU with hardware
  interrupts and an input on an interrupt-capable module (**DI 8 HF**). This is checked when the
  solution is compiled.

### Several CPUs

- Coupler modules (**KOP**) are connected in pairs in slot order. At the end of every tick the
  simulation copies the send words %QW100/%QW102 of each CPU into the receive words %IW100/%IW102 of
  the partner CPU. It reads them with its next PII.
- A **partition** (`board.wall`) divides the cabinet: no module on it, no cable through it, modules
  to the right of the wall do not belong to a CPU to its left (except via an interface module).

## 2. Cycle time monitoring and STOP

- Every CPU has a budget `maxOpsPerCycle` (executed IR instructions, unweighted).
- If the budget is exceeded (endless loop, too much computation), the CPU goes to **STOP**
  immediately: PIQ and output terminals become 0, no further cycles run. `stopInfo` holds time and
  reason.
- Exactly `maxOpsPerCycle` instructions are still allowed.
- A **programming error** (array index out of range, MOVE_BLK past the end of the array) stops the
  CPU as well; the message names variable and index (unless OB121 or local error handling exists).
- STOP persists until the CPU restarts: mode switch STOP → RUN or power off/on (sandbox: button
  “Restart”; in jobs as test step `power`).

### Restart, startup OB and retentivity

- A restart (warm restart) sets all **non-retentive** data to their start values, resets timers,
  counters and edges and clears memory bits and process images. **Retentive** variables (global DB,
  FB Input/Output/Static) keep their value.
- Then the **startup OB100** runs once, then the first cycle of OB1. **Game rule:** during startup
  the PII is already up to date; outputs only take effect with the first cycle.
- While the power is off the CPU stands still, all outputs are off.

## 3. Data types

| Type                     | Representation                           | Overflow in arithmetic    |
| ------------------------ | ---------------------------------------- | ------------------------- |
| BOOL                     | `boolean`                                | –                         |
| INT                      | 16 bit, signed                           | two's complement (wrap)   |
| DINT                     | 32 bit, signed                           | wrap                      |
| BYTE                     | 8 bit bit string                         | – (no arithmetic)         |
| WORD                     | 16 bit bit string                        | – (no arithmetic)         |
| DWORD                    | 32 bit bit string                        | – (no arithmetic)         |
| TIME                     | 32 bit ms, signed                        | wrap                      |
| REAL                     | IEEE-754 32 bit (`Math.fround`)          | ±Inf / NaN as IEEE        |
| SINT, USINT, UINT, UDINT | 8/16/32 bit signed or unsigned           | wrap                      |
| LINT, ULINT, LWORD       | JS number, ±(2^53 − 1)                   | **game rule:** saturation |
| LREAL                    | IEEE-754 64 bit                          | ±Inf / NaN as IEEE        |
| DATE                     | days since 1990-01-01                    | saturation                |
| TOD                      | ms since midnight                        | saturation                |
| CHAR, STRING             | text (string with a maximum length each) | truncated                 |

- Integer division truncates towards 0; `MOD` has the sign of the dividend.
- **Game rule:** integer division or MOD by 0 gives 0 (no error reaction).
- REAL division by 0 gives ±Inf or NaN.

### Conversion (`conv`)

- REAL → integer: mode `round` (round half to even, IEC `ROUND`) or `trunc`, then **saturation** to
  the target range. NaN → 0.
- INT ↔ WORD, DINT ↔ DWORD, TIME ↔ DWORD: the bit pattern is kept (`-1` ↔ `16#FFFF`).
- TIME ↔ DINT: identical.
- Other integer narrowing (e.g. DINT → INT): **saturation**.
- BOOL → number: 0/1. Number → BOOL: ≠ 0.

## 4. Memory

- `%I`, `%Q`, `%M` are byte-addressed (default 128 bytes I/O, 256 bytes memory).
- Words/double words are **big-endian**: `%MW0` = `%MB0` (high) and `%MB1` (low); `%M1.0` is the
  least significant bit of `%MW0`.
- Address forms: `%I0.0`, `%Q1.7`, `%M10.3` (bit), `%IB0`, `%MB3` (byte), `%IW64`, `%QW2`, `%MW4`
  (word), `%ID0`, `%MD8` (double word). In SCL they have the TIA types Byte/Word/DWord.
- Variables (global DB, static instance data, TEMP) live in typed **slots** and cannot be reached via
  absolute addresses.
- **Game rule:** TEMP variables start every cycle with their start value (undefined on real hardware).
- Arrays and structures are laid out flat in consecutive slots; a variable index is checked at run
  time (IR instruction `chk`, operand `islot`).
- **Work memory:** every CPU has a limit for data in bytes (data blocks, static instance data; Bool
  and Byte 1, Int 2, DInt/Real/Time 4, 64-bit 8, String[n] n + 2 bytes, 16 bytes per timer/counter/
  edge). Temp does not count. If the limit is exceeded, the program cannot be loaded.
- Symbolic names (PLC tags): unique regardless of case; overlapping addresses are allowed but
  reported as a warning.

## 5. Evaluation order

- The IR is executed strictly sequentially, jumps only via `jmp`/`jz`/`jnz`.
- Networks are compiled top to bottom (network 1 first).
- Within an FBD network: topologically from left to right; assignments at the right edge from top
  to bottom.
- Several assignments to the same variable in one cycle: the one executed last wins; only the final
  PIQ value appears at the terminal.

## 6. Instructions

### Bit logic

`AND`, `OR`, `XOR`, `NOT`, assignment. `S`/`R` only act when the condition is 1 and otherwise leave
the target unchanged.

### SR / RS

Memory box with memory bit `q`:

- **SR** (reset dominant): `q := (q OR S) AND NOT R`
- **RS** (set dominant): `q := (q AND NOT R) OR S`

### Edges

- `P_TRIG` / `N_TRIG` with edge memory bit: `Q := CLK AND NOT M` or `NOT CLK AND M`; then `M := CLK`.
  Two evaluations with the same memory bit interfere (as in reality).
- `R_TRIG` / `F_TRIG` as an instance; the edge memory starts at 0, i.e. if CLK is 1 in the first
  cycle, R_TRIG returns TRUE once.

### Timers (IEC)

All timers use the time stamp of the **start of the cycle**. ET is limited to PT. PT < 0 acts like 0. PT may change at run time and takes effect immediately.

- **TON**: with IN = 1, ET runs from the start; `Q := ET ≥ PT`. IN = 0 → Q = 0, ET = 0. PT = 0 → Q
  immediately.
- **TOF**: IN = 1 → Q = 1, ET = 0. A falling edge starts the time; after PT, Q = 0, ET stays = PT
  until IN becomes 1 again. IN again during the run-down restarts.
- **TP**: a rising edge at IN (only when idle) starts a pulse of length PT, Q = 1 while ET < PT. Not
  retriggerable. Afterwards ET stays = PT while IN = 1; with IN = 0, ET = 0. PT = 0 → no pulse.
- **TONR**: adds up the time IN was 1 (measured from cycle to cycle). Q = ET ≥ PT and stays even with
  IN = 0. **R** resets ET and Q and has priority over IN. Special case PT = 0: Q only if IN = 1 or
  time has already been accumulated.

Resolution = cycle time: Q of a TON with PT = 25 ms only becomes visible after 30 ms with a 10 ms
cycle.

### Counters (IEC, count value INT)

Counting happens on **rising edges** of CU/CD (internal edge memory, always updated – even while
R/LD is active). At the INT limits the counter stops.

- **CTU**: R → CV = 0, otherwise CU edge → CV + 1. `Q := CV ≥ PV`.
- **CTD**: LD → CV = PV, otherwise CD edge → CV − 1. `Q := CV ≤ 0`.
- **CTUD**: priority R before LD before counting; simultaneous edges at CU and CD cancel out.
  `QU := CV ≥ PV`, `QD := CV ≤ 0`.

### Comparison

`==, <>, <, <=, >, >=` on INT, DINT, REAL, WORD, TIME (BOOL only `==`/`<>`). REAL exactly.
`IN_RANGE(MIN, VAL, MAX)` = `MIN ≤ VAL ≤ MAX`, `OUT_RANGE` = `VAL < MIN OR VAL > MAX`.

### Arithmetic and functions

- `+ - * / MOD` see section 3; `ABS`, `NEG` (edge case `ABS(-32768) = -32768` due to overflow).
- `LIMIT(MN, IN, MX)` = `MIN(MAX(IN, MN), MX)`.
- `MIN`, `MAX` with any number of inputs (≥ 2).
- `SEL(G, IN0, IN1)`: G = 0 → IN0, G = 1 → IN1.
- `MUX(K, IN0 … INn, ELSE)`: a valid K selects INk, otherwise ELSE; without ELSE the target stays
  unchanged.

### Analog values

- `NORM_X(MIN, VALUE, MAX)` = `(VALUE − MIN) / (MAX − MIN)` as REAL, **without limiting**
  (over-/underflow stays visible). **Game rule:** MIN = MAX → 0.
- `SCALE_X(MIN, VALUE, MAX)` = `VALUE · (MAX − MIN) + MIN`, result in the type of MIN/MAX.
  **Game rule:** an integer result is rounded half-even and saturated.
- Nominal range: 0 … 27648; overflow 32767, underflow −32768.

### Word logic and shifting

`AND/OR/XOR/NOT` on BYTE/WORD/DWORD. `SHL`/`SHR` (bit strings, shift width INT): zeros are shifted
in, bits shifted out are lost; width ≥ bit width → 0; width ≤ 0 → unchanged.

### Counters in an IEC_COUNTER instance DB

CTU also sets QU, CTD also sets QD (that's what the outputs are called in an IEC_COUNTER DB).

## 7. Metrics

- **Instructions**: number of executed IR instructions over all cycles (jumps included).
- **Energy**: sum of the weights of executed instructions (`src/metrics/weights.ts`):

| Group                                                       | Weight |
| ----------------------------------------------------------- | ------ |
| Bit logic, S/R, SR/RS, MOVE, jumps, WORD logic              | 1      |
| Integer arithmetic, comparison, CONV, LIMIT/MIN/MAX/SEL/MUX | 2      |
| Timers, counters, edges                                     | 3      |
| Everything on REAL, NORM_X, SCALE_X                         | 4      |

## 8. Field signals and plant

- **Digital inputs:** actuation from the test case, normally closed contacts inverted,
  bouncing/fluttering as additional switching (even number, the final state stays).
- **Analog inputs:** physical value (stimulus interpolated linearly or plant model) → raw value
  `(v − min) / (max − min) · 27648`, limited to −4864 … 32511. Then noise (normal distribution),
  outliers and sensor faults: wire break/overflow **32767**, underflow **−32768**. The disturbances
  are drawn exactly once per ms (reproducible).
- **Measuring range:** analog channels are set to 0–10 V or 4–20 mA (default: the first selectable
  range, 0–10 V for AI 2/AI 4/AO 2; on-board CPU I/O only 0–10 V). If a device has a fixed signal
  type that doesn't match the channel, an input delivers 32767 permanently and an output arrives at
  the actuator as 0 (warning in the cabinet). Only 4–20 mA reports a wire break with 32767; with
  0–10 V the signal drops to 0. Devices without a signal type (older jobs) fit any range.
- **Channel groups:** mixed modules and on-board CPU I/O assign addresses per group (digital
  byte-wise, analog word-wise); on-board CPU I/O comes before all plugged-in modules.
- **Relay outputs:** the contact follows the command only after the pick-up time (15 ms) or drop-out
  time (30 ms); a shorter command is swallowed. The contact is always what is measured.
- **Plant model:** computes on with the contact states after the CPU cycles of a tick; the new
  measured values take effect from the next tick. If the model delivers a value for a digital input
  (end position, light barrier), it applies instead of the stimulus or manual mode.
- Models: tank, drilling station (clamping, feed, dwell time, damage), sorting track (parcels with
  height, diverter at the end of the light barrier), thermal process (first-order lag with dead time
  and losses), drive, positioning axis.
- Criterion **duty cycle** (`duty`): on-share per window of the period; the window after a setpoint
  change is skipped.

## 9. Determinism

- No time or random sources except simulation time and `Rng` (mulberry32).
- Disturbance sources get their own seeds via `deriveSeed(levelSeed, channelname)`, so adding a
  channel does not shift the sequences of the others.
- Same solution + same seed → identical traces and metrics (secured by tests).
