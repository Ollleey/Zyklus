# Remembering: set and reset

A conveyor belt should start with **Start** and keep running even when you release the button. Only
**Stop** halts it. So the PLC has to **remember** that Start was pressed.

That works with two IFs without ELSE:

```
IF "Start" THEN
    "Band" := TRUE;     // set
END_IF;
IF NOT "Stopp" THEN     // Stop is NC: 0 = pressed
    "Band" := FALSE;    // reset
END_IF;
```

Because the reset line is **below**, Stop wins when both are pressed at once. This is called
**reset-dominant** – almost always the right choice for machines.

<!-- Seite -->

## Latching in one line

The same as one formula – the output “holds itself”:

```
"Band" := ("Start" OR "Band") AND "Stopp";
```

Read: the belt runs when Start is pressed **or** it is already running – and Stop is not pressed
(NC = 1).

In **FBD/LAD** there are ready-made boxes for this: **SR** (set-dominant) and **RS** (reset-dominant).

<!-- Seite -->

## Where do you remember things?

Not every remembered value is an output. For intermediate values there are:

- **Memory bits** – bits in the CPU's memory, e.g. `%M10.0`
- **Data blocks** (DB) – variables with names, e.g. `"Daten".Laeuft`. In the game you create them in
  the **Data blocks** tab.

The OB “Main” itself keeps nothing from one cycle to the next – whatever should be kept belongs in a
data block.
