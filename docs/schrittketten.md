# Schrittketten verstehen

Eine **Schrittkette** beschreibt einen Ablauf als Folge von **Schritten**. Es ist immer genau ein
Schritt aktiv. Ein Schritt bestimmt, welche **Aktionen** (Ausgänge) an sind; seine **Transition**
(Weiterschaltbedingung) sagt, wann der nächste Schritt dran ist. Diese Seite erklärt die Methode;
wie der GRAPH-Editor bedient wird, steht unter „GRAPH (Schrittketten)“.

## Vom Ablauf zur Kette

1. **Ablauf in Worten aufschreiben**, Satz für Satz: „Werkstück spannen. Wenn gespannt, Bohrer
   senken …“
2. **Jeder Satz mit „solange“ wird ein Schritt**, jedes „wenn“/„bis“ eine Transition.
3. **Zu jeder Transition die Meldung suchen**, die sie sicher anzeigt: Endschalter, Sensor,
   Zeit. Fehlt eine Meldung, fehlt ein Sensor – oder der Schritt braucht eine Zeit.
4. **Aktionen je Schritt** in eine Tabelle: Schritt × Ausgang. Daraus ergeben sich die
   Ausgangszuweisungen.
5. **Grundstellung festlegen**: In welcher Lage darf die Kette starten?

| Schritt | Spannen | Bohrmotor | Senken | Heben | weiter, wenn …          |
| ------- | ------- | --------- | ------ | ----- | ----------------------- |
| 0       |         |           |        |       | Start (Flanke) UND oben |
| 1       | ●       |           |        |       | gespannt                |
| 2       | ●       | ●         | ●      |       | unten                   |
| 3       | ●       | ●         |        |       | 300 ms                  |
| 4       | ●       | ●         |        | ●     | oben                    |
| 5       |         |           |        |       | nicht gespannt          |

## Umsetzung in SCL

Die Schrittnummer steht in einer Int-Variablen eines Datenbausteins (`"Kette".Schritt`). Das
Programm hat zwei getrennte Teile:

```
// 1. Weiterschalten: nur die Transition des aktiven Schritts
CASE "Kette".Schritt OF
    0: IF "StartFlanke".Q AND "Oben" THEN "Kette".Schritt := 1; END_IF;
    1: IF "Gespannt" THEN "Kette".Schritt := 2; END_IF;
    2: IF "Unten" THEN "Kette".Schritt := 3; END_IF;
    3: IF "Verweilzeit".Q THEN "Kette".Schritt := 4; END_IF;
    4: IF "Oben" THEN "Kette".Schritt := 5; END_IF;
    5: IF NOT "Gespannt" THEN "Kette".Schritt := 0; END_IF;
END_CASE;

// 2. Ausgänge aus dem Schritt (jeder Ausgang genau einmal)
"Spannen"   := "Kette".Schritt >= 1 AND "Kette".Schritt <= 4;
"Bohrmotor" := "Kette".Schritt >= 2 AND "Kette".Schritt <= 4;
"Senken"    := "Kette".Schritt = 2;
"Heben"     := "Kette".Schritt = 4;
```

Zeiten in einem Schritt: Der Zeitbaustein läuft immer mit, sein Eingang ist „Schritt aktiv“:
`"Verweilzeit"(IN := "Kette".Schritt = 3, PT := T#300ms);`. Je Zyklus schaltet die Kette höchstens
einen Schritt weiter – auch wenn die nächste Transition schon erfüllt wäre.

## Verzweigungen

- **Alternative (ODER-Verzweigung)**: Ein Schritt hat mehrere Transitionen zu verschiedenen Zielen,
  z. B. Metallteil → Schritt 10, sonst → Schritt 20. In SCL ein `IF … ELSIF …` im Schritt; in GRAPH
  mehrere Transitionen unter dem Schritt (die erste erfüllte gilt).
- **Rücksprung**: Eine Transition darf auf einen früheren Schritt zeigen (Schleife, z. B. „nächstes
  Teil“).
- **Gleichzeitige Abläufe (UND-Verzweigung)**: zwei unabhängige Teilabläufe, etwa Bohren und
  Prüfen. Am einfachsten als zwei Ketten mit eigener Schrittvariable, die sich über einen
  Warteschritt treffen („beide fertig“).

## Betriebsarten

Echte Anlagen haben mehr als „läuft“:

- **Automatik**: Die Kette schaltet selbst weiter.
- **Einzelschritt**: Jede Transition braucht zusätzlich einen Tastendruck (Flanke) – zum Einrichten
  und Fehlersuchen: `IF "Unten" AND ("Auto" OR "Weiter_Flanke".Q) THEN …`
- **Hand**: Die Kette steht, einzelne Ausgänge werden direkt über Taster bedient (mit
  Verriegelungen!).
- **Grundstellungsfahrt**: Bevor die Automatik startet, fährt die Anlage in die Grundstellung
  (Zylinder ein, Bohrer hoch).

## Not-Halt, Störung, Überwachung

- **Not-Halt** (Öffner): schaltet die gefährlichen Ausgänge sofort ab – am besten unabhängig von der
  Kette, als letzte UND-Bedingung der Ausgänge – und setzt die Kette in die Grundstellung.
  Weiter geht es erst nach Entriegeln und neuem Start.
- **Schrittüberwachung**: Dauert ein Schritt länger als erwartet (z. B. Bohrer 5 s nicht unten), ist
  etwas kaputt. Ein TON mit `IN := Schritt = 2` und großzügiger Zeit meldet dann eine Störung.
- **Störung**: Kette anhalten (nicht weiterschalten), Ausgänge in einen sicheren Zustand, Meldung
  anzeigen. Nach dem Quittieren geht es in der Grundstellung weiter.

```
IF NOT "NotHalt" OR "Stoerung" THEN
    "Kette".Schritt := 0;
END_IF;
"Senken" := "Kette".Schritt = 2 AND "NotHalt" AND NOT "Stoerung";
```

## Typische Fehler

| Fehlerbild                                  | Ursache                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Kette läuft bei gehaltenem Start mehrmals   | Start ohne Flanke                                                 |
| Kette bleibt in einem Schritt hängen        | Meldung der Transition kommt nie (Sensor, falscher Name)          |
| Ausgang flackert oder ist wirkungslos       | Ausgang an mehreren Stellen zugewiesen                            |
| Zeit im Schritt läuft nicht ab              | Zeitbaustein nur innerhalb eines IF/CASE-Zweigs aufgerufen        |
| Nach Neustart startet die Kette mitten drin | Schrittvariable remanent – Grundstellung im Anlauf (OB100) setzen |
| Zwei Abläufe gleichzeitig aktiv             | einzelne Merker statt einer Schrittnummer                         |

## GRAPH und SCL

GRAPH zeichnet dieselbe Kette: Schritte, Transitionen, Aktionen mit **N** (solange aktiv), **S/R**
(setzen/rücksetzen) und **D** (verzögert), `Schrittzeit` für Zeiten im Schritt. Das Spiel übersetzt
GRAPH in genau das CASE oben. Ob GRAPH oder SCL – die Methode bleibt gleich. Üben lässt sie sich in
**Auftrag 10 (Bohrstation)**.
