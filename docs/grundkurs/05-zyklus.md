# Der Zyklus – das Programm läuft immer wieder

Ein SPS-Programm wartet nicht. Es läuft von oben nach unten durch und beginnt sofort wieder von
vorn – jeden Zyklus. Dabei gilt:

- Am **Anfang** des Zyklus werden alle Eingänge gelesen. Während der Zyklus läuft, ändern sie sich
  für das Programm nicht.
- Am **Ende** des Zyklus werden alle Ausgänge geschrieben.
- Weist man demselben Ausgang zweimal etwas zu, gewinnt die **letzte** Zuweisung.

```
"Lampe" := "Taster1";
"Lampe" := "Taster2";   // nur diese Zeile zählt – Taster1 ist wirkungslos
```

Das ist ein häufiger Anfängerfehler. Das Spiel warnt dich dann.

<!-- Seite -->

## IF – wenn, dann

Mit `IF` führt man Anweisungen nur unter einer Bedingung aus:

```
IF "Taster" THEN
    "Lampe" := TRUE;
END_IF;
```

Achtung: Ist der Taster 0, passiert in diesem Beispiel **gar nichts** – die Lampe behält ihren
Wert. Einmal eingeschaltet, bleibt sie an! Soll sie auch wieder ausgehen, braucht es ein `ELSE`:

```
IF "Taster" THEN
    "Lampe" := TRUE;
ELSE
    "Lampe" := FALSE;
END_IF;
```

(Das ist dasselbe wie `"Lampe" := "Taster";` – nur länger.)

> Merksatz: Ein IF ohne ELSE lässt den Wert stehen. Manchmal ist genau das gewollt – siehe nächste
> Lektion.
