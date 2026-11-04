# Zähler und Vergleiche

Eine Kiste ist voll, wenn 10 Teile darin liegen. Eine Lichtschranke meldet jedes Teil – die SPS muss
**zählen**.

Der Baustein **CTU** (Count Up, Instanz-DB vom Typ `CTU_INT`) zählt bei jeder steigenden Flanke an
**CU** um eins hoch. **R** setzt ihn auf 0 zurück, **PV** ist der Zielwert:

```
"Teile"(CU := "Lichtschranke", R := "Quittieren", PV := 10);
"Kiste_voll" := "Teile".Q;      // 1, sobald CV >= PV
```

`"Teile".CV` ist der aktuelle Zählerstand. Die Flanke steckt im Zähler schon drin – ein Teil, das
lange vor der Lichtschranke steht, zählt trotzdem nur einmal.

<!-- Seite -->

## Zahlen und Vergleiche

Neben Bool gibt es Zahlen: **Int** (ganze Zahlen −32768 … 32767), **Real** (Kommazahlen),
**Time** (Zeiten). Mit Zahlen kann man rechnen und vergleichen:

| Vergleich      | SCL           |
| -------------- | ------------- |
| gleich         | `"Zahl" = 5`  |
| ungleich       | `"Zahl" <> 5` |
| größer         | `"Zahl" > 5`  |
| kleiner gleich | `"Zahl" <= 5` |

Ein Vergleich ergibt wieder 0 oder 1 und lässt sich mit AND/OR verknüpfen:

```
"Warnung" := "Teile".CV >= 8 AND NOT "Kiste_voll";   // fast voll
```

## Analoge Werte

Ein Füllstandssensor liefert eine Zahl, z. B. 0 … 27648 für 0 … 100 %. Die Steuerung vergleicht sie
mit Grenzwerten: Pumpe an unter 40 %, aus über 70 %. Die Lücke dazwischen heißt **Hysterese** – sie
verhindert, dass die Pumpe ständig an- und ausgeht.
