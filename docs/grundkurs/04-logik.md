# Logik: UND, ODER, NICHT

Das einfachste Programm überträgt einen Eingang auf einen Ausgang. In **SCL** (der Textsprache)
steht links, was geschaltet wird, rechts, wovon es abhängt:

```
"Lampe" := "Taster";
```

`:=` heißt „wird zu“. Das Semikolon `;` beendet die Anweisung. Solange der Taster 1 ist, ist auch
die Lampe 1.

<!-- Seite -->

## UND, ODER, NICHT

| Verknüpfung | SCL           | ist 1, wenn …          |
| ----------- | ------------- | ---------------------- |
| UND         | `"A" AND "B"` | beide 1 sind           |
| ODER        | `"A" OR "B"`  | mindestens einer 1 ist |
| NICHT       | `NOT "A"`     | A gerade 0 ist         |

Beispiele:

```
// Presse nur, wenn beide Hände auf den Tastern sind
"Presse" := "Taster_links" AND "Taster_rechts";

// Licht im Flur: von zwei Stellen aus
"Licht" := "Taster_oben" OR "Taster_unten";

// Warnlampe, solange das Tor NICHT zu ist
"Warnung" := NOT "Tor_zu";
```

<!-- Seite -->

## Wahrheitstabelle

So prüft man eine Verknüpfung: alle Fälle aufschreiben.

| A   | B   | A AND B | A OR B |
| --- | --- | ------- | ------ |
| 0   | 0   | 0       | 0      |
| 0   | 1   | 0       | 1      |
| 1   | 0   | 0       | 1      |
| 1   | 1   | 1       | 1      |

Klammern bestimmen die Reihenfolge, wie in Mathe:
`"Motor" := ("Start" OR "Hand") AND NOT "Stoerung";`

## Dasselbe grafisch

In **FUP** sind das Kästchen: `&` für UND, `>=1` für ODER, ein kleiner Kreis am Eingang für NICHT.
In **KOP** sind es Kontakte in Reihe (UND) oder parallel (ODER). Im Spiel kannst du jederzeit
zwischen SCL, FUP und KOP wählen – nimm, was dir leichter fällt.
