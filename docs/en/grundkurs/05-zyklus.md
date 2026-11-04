# The cycle – the program runs again and again

A PLC program does not wait. It runs from top to bottom and immediately starts again – every cycle.
The rules:

- At the **start** of the cycle all inputs are read. While the cycle runs, they don't change for the
  program.
- At the **end** of the cycle all outputs are written.
- If you assign the same output twice, the **last** assignment wins.

```
"Lampe" := "Taster1";
"Lampe" := "Taster2";   // only this line counts – Taster1 has no effect
```

This is a common beginner's mistake. The game warns you about it.

<!-- Seite -->

## IF – if, then

With `IF` statements are only executed under a condition:

```
IF "Taster" THEN
    "Lampe" := TRUE;
END_IF;
```

Careful: if the button is 0, **nothing at all** happens in this example – the lamp keeps its value.
Once switched on, it stays on! If it should go off again, you need an `ELSE`:

```
IF "Taster" THEN
    "Lampe" := TRUE;
ELSE
    "Lampe" := FALSE;
END_IF;
```

(That is the same as `"Lampe" := "Taster";` – just longer.)

> Rule of thumb: an IF without ELSE leaves the value as it is. Sometimes that is exactly what you
> want – see the next lesson.
