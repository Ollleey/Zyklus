# Counters and comparisons

A box is full when there are 10 parts in it. A light barrier reports every part – the PLC has to
**count**.

The block **CTU** (count up, instance DB of type `CTU_INT`) counts up by one at every rising edge at
**CU**. **R** resets it to 0, **PV** is the target value:

```
"Teile"(CU := "Lichtschranke", R := "Quittieren", PV := 10);
"Kiste_voll" := "Teile".Q;      // 1 as soon as CV >= PV
```

`"Teile".CV` is the current count. The edge is already built into the counter – a part that stands in
front of the light barrier for a long time still counts only once.

<!-- Seite -->

## Numbers and comparisons

Besides Bool there are numbers: **Int** (whole numbers −32768 … 32767), **Real** (decimals),
**Time** (times). You can calculate and compare with numbers:

| Comparison    | SCL           |
| ------------- | ------------- |
| equal         | `"Zahl" = 5`  |
| not equal     | `"Zahl" <> 5` |
| greater       | `"Zahl" > 5`  |
| less or equal | `"Zahl" <= 5` |

A comparison again gives 0 or 1 and can be combined with AND/OR:

```
"Warnung" := "Teile".CV >= 8 AND NOT "Kiste_voll";   // almost full
```

## Analogue values

A level sensor delivers a number, e.g. 0 … 27648 for 0 … 100 %. The controller compares it with
limits: pump on below 40 %, off above 70 %. The gap in between is called **hysteresis** – it stops
the pump from switching on and off all the time.
