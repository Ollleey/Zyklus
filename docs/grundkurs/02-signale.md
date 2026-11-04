# Signale: 0 und 1

Die meisten Signale einer Steuerung kennen nur zwei Zustände:

| Wert  | heißt auch     | Beispiel                                  |
| ----- | -------------- | ----------------------------------------- |
| **1** | TRUE, an, wahr | Taster gedrückt, Sensor erkennt ein Teil  |
| **0** | FALSE, aus     | Taster losgelassen, nichts vor dem Sensor |

So ein Signal heißt **binär** oder **digital**, der Datentyp heißt **Bool**. Im Zeitdiagramm des
Spiels siehst du es als Linie, die zwischen unten (0) und oben (1) springt.

<!-- Seite -->

## Sensoren – die Sinne der Anlage

**Sensoren** melden der SPS etwas. Sie hängen an **Eingängen**.

- **Taster**: 1, solange man drückt. Lässt man los, ist er wieder 0.
- **Schalter**: bleibt in der Stellung, in die man ihn bringt.
- **Lichtschranke**: 1, wenn ein Gegenstand den Lichtstrahl unterbricht.
- **Induktiver Sensor**: erkennt Metall in der Nähe.
- **Endschalter**: meldet, dass etwas eine Position erreicht hat (z. B. Tor offen).

Manche Sensoren liefern statt 0/1 eine **Zahl**, z. B. einen Füllstand. Das nennt man **analog**;
dazu kommen wir später.

<!-- Seite -->

## Aktoren – die Muskeln der Anlage

**Aktoren** tun etwas. Sie hängen an **Ausgängen**.

- **Lampe**: leuchtet bei 1.
- **Motor**: läuft bei 1 (z. B. ein Förderband).
- **Ventil**: öffnet bei 1 – Luft fährt einen Zylinder aus, Wasser fließt.

## Schließer und Öffner

Ein **Schließer** liefert 1, wenn er betätigt ist. Ein **Öffner** ist genau umgekehrt: Er liefert 1,
wenn er **nicht** betätigt ist. Warum so umständlich? Bei einem Kabelbruch kommt nur noch 0 an. Bei
einem Not-Halt-Taster als Öffner bedeutet ein gerissenes Kabel deshalb dasselbe wie „Not-Halt
gedrückt“ – die Anlage bleibt sicher stehen.

> Merksatz: Not-Halt und Stopp-Taster sind Öffner. 1 heißt „alles in Ordnung“.
