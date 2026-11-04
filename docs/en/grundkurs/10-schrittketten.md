# Step sequences

Many machines work through a **sequence**: at a drilling station the workpiece is clamped, the drill
moves down, waits briefly, moves up again, the workpiece is released. With lots of memory bits and
IFs this quickly becomes confusing – and dangerous when two parts of the sequence become active at
the same time.

The solution is a **step sequence**: the sequence is split into **steps**, and **exactly one step is
always active**.

<!-- Seite -->

## The three elements of a step sequence

| Term           | Meaning                          | Drilling station          |
| -------------- | -------------------------------- | ------------------------- |
| **Step**       | one state of the sequence        | “lower drill”             |
| **Action**     | what is switched on in this step | feed down, drill motor on |
| **Transition** | condition to go to the next step | “drill is down”           |

The drilling station as a sequence:

| Step | Name    | Actions                   | next when …          |
| ---- | ------- | ------------------------- | -------------------- |
| 0    | Initial | –                         | Start pressed AND up |
| 1    | Clamp   | clamp                     | clamped              |
| 2    | Lower   | clamp, drill motor, lower | down                 |
| 3    | Dwell   | clamp, drill motor        | 300 ms passed        |
| 4    | Raise   | clamp, drill motor, raise | up                   |
| 5    | Release | –                         | no longer clamped    |

After step 5 it goes back to 0. Step 0 is the **initial step**: the sequence starts here after
switching on.

<!-- Seite -->

## In SCL: one number for the step

The number of the active step is stored in a variable, e.g. `"Kette".Schritt` (Int in a data block).
With **CASE** the program only checks the transition of the active step:

```
CASE "Kette".Schritt OF
    0:  IF "Start_Flanke".Q AND "Oben" THEN
            "Kette".Schritt := 1;
        END_IF;
    1:  IF "Gespannt" THEN
            "Kette".Schritt := 2;
        END_IF;
    2:  IF "Unten" THEN
            "Kette".Schritt := 3;
        END_IF;
    // … and so on up to 5
END_CASE;
```

After that – separately – the **outputs from the step**:

```
"Spannen"   := "Kette".Schritt >= 1 AND "Kette".Schritt <= 4;
"Bohrmotor" := "Kette".Schritt >= 2 AND "Kette".Schritt <= 4;
"Senken"    := "Kette".Schritt = 2;
"Heben"     := "Kette".Schritt = 4;
```

This way every output is assigned in exactly one place, and you see at once in which step it is on.

<!-- Seite -->

## In GRAPH: draw the sequence

Even clearer is the language **GRAPH**: you draw steps (boxes), below them their actions and the
transitions with their conditions. Internally the game translates this into exactly the CASE above.

- **N** – action is on while the step is active (the normal case)
- **S / R** – set or reset an action (stays beyond the step)
- **D** – action with a delay
- `Schrittzeit` – how long the current step has been active: `Schrittzeit >= T#300ms`

GRAPH is available for **function blocks** (FB): create the block, choose **GRAPH** at the top,
call it in OB “Main”.

<!-- Seite -->

## Rules for good step sequences

1. **Exactly one step active.** A number as step variable takes care of that automatically.
2. **Every transition is a clear signal** from the plant: limit switch, sensor, elapsed time – not
   “it'll be fine”.
3. **Start with an edge** – otherwise the sequence starts again right away while the button is held.
4. **Check the initial position**: the sequence only starts when the machine really is in its home
   position (e.g. drill up).
5. **Emergency stop and faults**: switch the outputs off and put the sequence into a safe step (or
   back to the initial step).
6. **Watch it**: in the game you see the active step live – highlighted in green in GRAPH, otherwise
   as the value of `"Kette".Schritt`. If the sequence gets stuck, the transition's signal is missing.

The handbook explains more under **Understanding step sequences**. You can try it in job 10
(drilling station).
