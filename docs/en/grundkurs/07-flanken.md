# Edges – one press, one action

A lamp should be switched on and off with **one** button: press = on, press again = off. Naively:

```
IF "Taster" THEN
    "Lampe" := NOT "Lampe";
END_IF;
```

That goes wrong: a button press lasts maybe 200 ms – that is 20 cycles. The lamp toggles 20 times,
the result is random.

<!-- Seite -->

## The rising edge

What you need is only the **moment** the button goes from 0 to 1 – the **rising edge**. The block
**R_TRIG** does that. It delivers 1 for exactly one cycle:

```
"TasterFlanke"(CLK := "Taster");
IF "TasterFlanke".Q THEN
    "Lampe" := NOT "Lampe";
END_IF;
```

`"TasterFlanke"` is an **instance DB** of type `R_TRIG` – it remembers the value from the last cycle.
In the game you create it in the **Data blocks** tab with “Add instance DB”.

The **falling edge** (1 → 0, release) is called **F_TRIG**.

> Rule of thumb: if something should happen once per button press, you need an edge.
