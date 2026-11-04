# Flanken – ein Druck, eine Aktion

Eine Lampe soll mit **einem** Taster ein- und ausgeschaltet werden: drücken = an, nochmal drücken =
aus. Naiv:

```
IF "Taster" THEN
    "Lampe" := NOT "Lampe";
END_IF;
```

Das geht schief: Ein Tastendruck dauert vielleicht 200 ms – das sind 20 Zyklen. Die Lampe wechselt
20-mal hin und her, das Ergebnis ist Zufall.

<!-- Seite -->

## Die steigende Flanke

Gebraucht wird nur der **Moment**, in dem der Taster von 0 auf 1 geht – die **steigende Flanke**.
Dafür gibt es den Baustein **R_TRIG**. Er liefert genau einen Zyklus lang 1:

```
"TasterFlanke"(CLK := "Taster");
IF "TasterFlanke".Q THEN
    "Lampe" := NOT "Lampe";
END_IF;
```

`"TasterFlanke"` ist ein **Instanz-DB** vom Typ `R_TRIG` – er merkt sich den Wert aus dem letzten
Zyklus. Im Spiel legst du ihn im Tab **Datenbausteine** mit „Instanz-DB hinzufügen“ an.

Die **fallende Flanke** (1 → 0, Loslassen) heißt **F_TRIG**.

> Merksatz: Soll etwas einmal pro Tastendruck passieren, brauchst du eine Flanke.
