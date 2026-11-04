# Was ist eine SPS?

Eine **SPS** (speicherprogrammierbare Steuerung) ist ein kleiner Industriecomputer im
Schaltschrank. Sie steuert Maschinen: Förderbänder, Pumpen, Ampeln, Tore, Pressen.

Statt Drähte und Relais fest zu verschalten, schreibt man ein **Programm**. Will man das Verhalten
ändern, ändert man das Programm – nicht die Verdrahtung.

| Teil         | Aufgabe                             | Beispiel                         |
| ------------ | ----------------------------------- | -------------------------------- |
| **Eingänge** | melden der SPS, was draußen los ist | Taster, Schalter, Sensor         |
| **Programm** | entscheidet, was passieren soll     | „Lampe an, wenn Taster gedrückt“ |
| **Ausgänge** | schalten Geräte ein und aus         | Lampe, Motor, Ventil             |

<!-- Seite -->

## Wie eine SPS arbeitet

Die SPS arbeitet in einer Schleife, dem **Zyklus**. Immer wieder, viele Male pro Sekunde:

1. **Eingänge lesen** – Wer drückt gerade? Welcher Sensor meldet etwas?
2. **Programm abarbeiten** – von oben nach unten, Zeile für Zeile
3. **Ausgänge schreiben** – Lampen, Motoren und Ventile bekommen ihren neuen Zustand

Danach beginnt alles von vorn. Ein Zyklus dauert im Spiel 10 ms – die SPS schaut also hundertmal
pro Sekunde nach, ob sich etwas geändert hat.

> Merksatz: Die SPS fragt ständig „Was ist draußen?“, rechnet kurz und schaltet dann.

<!-- Seite -->

## Im Spiel

In ZYKLUS baust du genau so eine Steuerung:

- Im **Schaltschrank** steckst du eine **CPU** (das ist die SPS) und Ein-/Ausgangsbaugruppen auf eine
  Hutschiene und verdrahtest die Geräte der Anlage.
- Im **Programm** schreibst du, was die Anlage tun soll – in **SCL** (Text) oder **FUP/KOP**
  (Bausteine zum Zusammenklicken).
- Im **Testpult** probierst du es aus, mit **Prüfen** wird die Arbeit abgenommen.

Keine Sorge: Du musst nichts davon schon können. Die nächsten Lektionen erklären alles der Reihe
nach.
