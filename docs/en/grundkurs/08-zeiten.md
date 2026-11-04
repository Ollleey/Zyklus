# Timers

Many sequences need time: a fan should run on, a traffic light stay green for 8 s, a motor start
only after 2 s. For this there are **timer blocks**. Like R_TRIG, each needs an instance DB, here of
type `TON_TIME`, `TOF_TIME` or `TP_TIME`.

| Block   | Name      | Output Q …                             |
| ------- | --------- | -------------------------------------- |
| **TON** | on-delay  | becomes 1 when IN has been 1 for PT    |
| **TOF** | off-delay | stays 1 for PT after IN has ended      |
| **TP**  | pulse     | is 1 for exactly PT from an edge at IN |

Times are written as `T#2s`, `T#500ms`, `T#1m30s`.

<!-- Seite -->

## Examples

```
// motor starts 2 s after switching on
"Anlauf"(IN := "Ein", PT := T#2s);
"Motor" := "Anlauf".Q;

// fan runs on for 30 s after the light goes off
"Nachlauf"(IN := "Licht", PT := T#30s);
"Luefter" := "Nachlauf".Q;
```

`.Q` is the output, `.ET` the time elapsed so far.

<!-- Seite -->

## Important

- The timer block has to be called **in every cycle**, otherwise it stops counting. So don't call it
  inside an IF that only runs sometimes.
- A TON starts over as soon as IN becomes 0 in between.
- In the game you see the sequence in the **timing chart** and under **Watch**: `"Anlauf".ET` shows
  how far the time has run.
