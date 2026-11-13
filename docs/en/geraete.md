# Devices and error handling

## Device configuration

Click a module in the cabinet: its properties are shown below the cabinet.

| Property             | Effect                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Start address        | first address per channel kind (DI/DO byte, AI/AO even byte address); empty = assigned automatically; overlaps are a build error |
| Input delay          | 0.05 … 20 ms: a level change only counts once it has been present this long – debounces buttons and light barriers in hardware   |
| Outputs on STOP      | switch off (default), hold last value or substitute value per channel                                                            |
| Diagnostics          | report wire break at a 4–20 mA channel and missing load voltage                                                                  |
| Measuring range (AI) | 0–10 V or 4–20 mA                                                                                                                |
| Process image        | OB1 (TPA 0) or a process image partition TPA 1 … 4                                                                               |
| CPU: system memory   | bit 0 FirstScan (first cycle), 1 DiagStatusUpdate, 2 AlwaysTRUE, 3 AlwaysFALSE                                                   |
| CPU: clock memory    | bit 0 10 Hz, 1 5 Hz, 2 2.5 Hz, 3 2 Hz, 4 1.25 Hz, 5 1 Hz, 6 0.625 Hz, 7 0.5 Hz                                                   |

Example: clock memory at `%MB0` → `%M0.5` flashes at 1 Hz.

## Process image partitions (TPA)

Without any setting the **game rule** applies: an interrupt OB (cyclic or hardware interrupt) reads
all inputs fresh before it starts and writes all outputs afterwards.

As soon as a module is assigned to a **process image partition** (TPA 1 … 4, property “Process
image”), the CPU works like a real one:

- OB1 only updates the channels **without** a TPA (process image of OB1 = TPA 0).
- An interrupt OB with **TPA n** (set in the OB's event) reads the inputs of TPA n before it starts
  and writes its outputs afterwards.
- An interrupt OB without a TPA then reads and writes no I/O at all – it only works with the process
  image that OB1 updates.

This way a fast sub-task in a cyclic interrupt reacts with its own I/O without waiting for the OB1
cycle. If OB1 writes to an output in a TPA, this only reaches the terminal when the corresponding
interrupt OB runs. In the source the TPA is part of the event line
(`// Ereignis: Weckalarm, Takt 5 ms, Phase 0 ms, TPA 1`).

## Distributed I/O

An **interface module (IM PN)** turns the modules to its right into a distributed station – up to
the next CPU, the next interface module or the partition. The station belongs to a CPU via
PROFINET (property “Assigned CPU”, default: first CPU), even across a partition and without a
cable duct to the CPU. Its addresses continue after the CPU's central modules.

- **Update time** 1, 2, 4 (default), 8 or 16 ms: this is how often station and CPU exchange inputs
  and outputs. That's extra delay – fast signals belong on central modules (or on an HSC in the
  station).
- **Station failure** (cable interrupted, station without power): all modules of the station deliver
  0 or switch off, the CPU reports a rack failure – OB86 with `#Event_Class = 16#39` (coming) and
  `16#38` (going); without OB86 the CPU stays in RUN and doesn't notice the failure.
- In the sandbox: pulling the interface module = station failure.

## Error OBs

| OB    | Event                | Without OB                  | With OB                                             |
| ----- | -------------------- | --------------------------- | --------------------------------------------------- |
| OB80  | Time error           | STOP                        | tolerated once (cycle aborted), STOP twice in a row |
| OB82  | Diagnostic interrupt | RUN, diagnostic buffer only | runs on coming and going diagnostics                |
| OB86  | Rack failure         | RUN, diagnostic buffer only | runs when pulling and plugging in                   |
| OB121 | Programming error    | STOP                        | RUN; the faulty access returns 0 or writes nothing  |

- OB82 and OB86 have the start information **`#Event_Class`**: `16#39` coming, `16#38` going.
- A failed module delivers 0 at all inputs – that can be a valid measured value. Only OB86 detects
  the failure reliably.

## Local error handling

`GET_ERR_ID()` (Word) returns the ID of the last programming error in the running OB: `16#2522`
area length error when reading, `16#2523` when writing, `0` no error. **Game rule:** if the program
uses `GET_ERR_ID`, programming errors no longer lead to STOP or OB121 anywhere.

```
#wert := "Daten".Feld[#i];
IF GET_ERR_ID() <> 0 THEN
    #wert := 0;   // substitute value
END_IF;
```

## RUNTIME

`#dauer := RUNTIME(MEM := #merker);` (LReal, `#merker` static) returns the time since the last call
in seconds. **Game rule:** computing time results from the number of executed instructions (cycle
time / instruction budget per instruction).

## Diagnostic buffer and LEDs

- The **diagnostic buffer** (click the CPU in the cabinet) shows startup, STOP, programming errors,
  time errors and module messages with time.
- **ERROR** (red): STOP due to an error or pending diagnostics. **MAINT** (yellow): forcing active.

## Online & diagnostics

Tab **“Online & diagnostics”** in the program area (while the simulation runs), per CPU:

- **CPU**: operating state (on STOP with its cause), cycle load, pending diagnostics, force jobs.
- **Modules** with a diagnostic symbol and text: ✓ OK, ⚠ load voltage missing or analogue channel with
  wire break or overflow (with channel and address), ✕ module pulled or station failed.
- **Diagnostic buffer** complete (up to 50 entries, newest first), filterable by error, diagnostic and
  operation.

The same symbols appear in the cabinet at the top right of the affected module; the text is in the
tooltip.

## Testing faults

- Jobs specify faults in the test case: wire break at the sensor, **module pulled**, **load voltage
  missing**, **station failed**.
- In the sandbox: “Pull module” or “Load voltage off” in the properties of an I/O module while the
  simulation runs.
