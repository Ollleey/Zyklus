# Understanding step sequences

A **step sequence** describes a process as a series of **steps**. Exactly one step is always active.
A step determines which **actions** (outputs) are on; its **transition** (step-enabling condition)
says when the next step is due. This page explains the method; how to use the GRAPH editor is
described under “GRAPH (step sequences)”.

## From the process to the sequence

1. **Write the process down in words**, sentence by sentence: “Clamp the workpiece. When clamped,
   lower the drill …”
2. **Every sentence with “while” becomes a step**, every “when”/“until” a transition.
3. **For each transition find the signal** that reliably shows it: limit switch, sensor, time. If a
   signal is missing, a sensor is missing – or the step needs a time.
4. **Actions per step** in a table: step × output. The output assignments follow from it.
5. **Define the initial position**: in which state may the sequence start?

| Step | Clamp | Drill motor | Lower | Raise | next when …         |
| ---- | ----- | ----------- | ----- | ----- | ------------------- |
| 0    |       |             |       |       | Start (edge) AND up |
| 1    | ●     |             |       |       | clamped             |
| 2    | ●     | ●           | ●     |       | down                |
| 3    | ●     | ●           |       |       | 300 ms              |
| 4    | ●     | ●           |       | ●     | up                  |
| 5    |       |             |       |       | not clamped         |

## Implementation in SCL

The step number is stored in an Int variable of a data block (`"Kette".Schritt`). The program has two
separate parts:

```
// 1. Advance: only the transition of the active step
CASE "Kette".Schritt OF
    0: IF "StartFlanke".Q AND "Oben" THEN "Kette".Schritt := 1; END_IF;
    1: IF "Gespannt" THEN "Kette".Schritt := 2; END_IF;
    2: IF "Unten" THEN "Kette".Schritt := 3; END_IF;
    3: IF "Verweilzeit".Q THEN "Kette".Schritt := 4; END_IF;
    4: IF "Oben" THEN "Kette".Schritt := 5; END_IF;
    5: IF NOT "Gespannt" THEN "Kette".Schritt := 0; END_IF;
END_CASE;

// 2. Outputs from the step (every output exactly once)
"Spannen"   := "Kette".Schritt >= 1 AND "Kette".Schritt <= 4;
"Bohrmotor" := "Kette".Schritt >= 2 AND "Kette".Schritt <= 4;
"Senken"    := "Kette".Schritt = 2;
"Heben"     := "Kette".Schritt = 4;
```

Times within a step: the timer always runs, its input is “step active”:
`"Verweilzeit"(IN := "Kette".Schritt = 3, PT := T#300ms);`. Per cycle the sequence advances at most
one step – even if the next transition were already true.

## Branches

- **Alternative (OR branch)**: a step has several transitions to different targets, e.g. metal part
  → step 10, otherwise → step 20. In SCL an `IF … ELSIF …` within the step; in GRAPH several
  transitions below the step (the first true one wins).
- **Jump back**: a transition may point to an earlier step (loop, e.g. “next part”).
- **Simultaneous processes (AND branch)**: two independent partial processes, such as drilling and
  testing. In GRAPH as a **simultaneous branch** (one transition with several targets) and
  **synchronisation** (one transition waiting for several steps); in SCL as two sequences with their
  own step variable that meet in a waiting step (“both done”).

## Operating modes

Real plants have more than “running”:

- **Auto**: the sequence advances by itself.
- **Single step**: every transition additionally needs a button press (edge) – for setting up and
  troubleshooting: `IF "Unten" AND ("Auto" OR "Weiter_Flanke".Q) THEN …`
- **Manual**: the sequence stands still, individual outputs are operated directly by buttons (with
  interlocks!).
- **Homing**: before Auto starts, the plant moves to its initial position (cylinders in, drill up).

## Emergency stop, faults, monitoring

- **Emergency stop** (NC): switches dangerous outputs off immediately – best independently of the
  sequence, as the last AND condition of the outputs – and puts the sequence into the initial step.
  It continues only after unlocking and a new start.
- **Step monitoring**: if a step takes longer than expected (e.g. drill not down after 5 s),
  something is broken. A TON with `IN := Schritt = 2` and a generous time then reports a fault.
- **Fault**: stop the sequence (don't advance), outputs to a safe state, show a message. After
  acknowledging it continues from the initial step.

```
IF NOT "NotHalt" OR "Stoerung" THEN
    "Kette".Schritt := 0;
END_IF;
"Senken" := "Kette".Schritt = 2 AND "NotHalt" AND NOT "Stoerung";
```

## Typical mistakes

| Symptom                                      | Cause                                                         |
| -------------------------------------------- | ------------------------------------------------------------- |
| Sequence runs several times while Start held | Start without an edge                                         |
| Sequence gets stuck in one step              | the transition's signal never comes (sensor, wrong name)      |
| Output flickers or has no effect             | output assigned in several places                             |
| Time within the step never elapses           | timer only called inside an IF/CASE branch                    |
| After a restart the sequence starts mid-way  | step variable retentive – set initial step in startup (OB100) |
| Two processes active at the same time        | individual memory bits instead of one step number             |

## GRAPH and SCL

GRAPH draws the same sequence: steps, transitions, actions with **N** (while active), **S/R**
(set/reset) and **D** (delayed), `Schrittzeit` for times within a step. The game translates GRAPH
into exactly the CASE above. GRAPH or SCL – the method stays the same. You can practise it in
**job 10 (drilling station)**.
