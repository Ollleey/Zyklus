# Schrittketten

Viele Maschinen arbeiten einen **Ablauf** ab: Bei einer Bohrstation wird das Werkstück gespannt,
der Bohrer fährt herunter, wartet kurz, fährt wieder hoch, das Werkstück wird gelöst. Mit lauter
Merkern und IFs wird so etwas schnell unübersichtlich – und gefährlich, wenn zwei Teile des Ablaufs
gleichzeitig aktiv werden.

Die Lösung ist eine **Schrittkette**: Der Ablauf wird in **Schritte** zerlegt, und es ist immer
**genau ein Schritt aktiv**.

<!-- Seite -->

## Die drei Bausteine einer Schrittkette

| Begriff        | Bedeutung                                   | Bohrstation                   |
| -------------- | ------------------------------------------- | ----------------------------- |
| **Schritt**    | ein Zustand des Ablaufs                     | „Bohrer senken“               |
| **Aktion**     | was in diesem Schritt eingeschaltet ist     | Vorschub senken, Bohrmotor an |
| **Transition** | Bedingung, um zum nächsten Schritt zu gehen | „Bohrer ist unten“            |

Die Bohrstation als Kette:

| Schritt | Name          | Aktionen                   | weiter, wenn …          |
| ------- | ------------- | -------------------------- | ----------------------- |
| 0       | Grundstellung | –                          | Start gedrückt UND oben |
| 1       | Spannen       | Spannen                    | gespannt                |
| 2       | Senken        | Spannen, Bohrmotor, Senken | unten                   |
| 3       | Verweilen     | Spannen, Bohrmotor         | 300 ms vergangen        |
| 4       | Heben         | Spannen, Bohrmotor, Heben  | oben                    |
| 5       | Lösen         | –                          | nicht mehr gespannt     |

Nach Schritt 5 geht es zurück zu 0. Schritt 0 heißt **Grundstellung** (oder Initialschritt): Hier
beginnt die Kette nach dem Einschalten.

<!-- Seite -->

## In SCL: eine Zahl für den Schritt

Die Nummer des aktiven Schritts steht in einer Variablen, z. B. `"Kette".Schritt` (Int in einem
Datenbaustein). Mit **CASE** prüft das Programm nur die Transition des aktiven Schritts:

```
CASE "Kette".Schritt OF
    0:  IF "Start_Flanke".Q AND "Oben" THEN
            "Kette".Schritt := 1;
        END_IF;
    1:  IF "Gespannt" THEN
            "Kette".Schritt := 2;
        END_IF;
    2:  IF "Unten" THEN
            "Kette".Schritt := 3;
        END_IF;
    // … und so weiter bis 5
END_CASE;
```

Danach – getrennt davon – die **Ausgänge aus dem Schritt**:

```
"Spannen"   := "Kette".Schritt >= 1 AND "Kette".Schritt <= 4;
"Bohrmotor" := "Kette".Schritt >= 2 AND "Kette".Schritt <= 4;
"Senken"    := "Kette".Schritt = 2;
"Heben"     := "Kette".Schritt = 4;
```

So ist jeder Ausgang an genau einer Stelle zugewiesen, und man sieht sofort, in welchem Schritt er an
ist.

<!-- Seite -->

## In GRAPH: die Kette zeichnen

Noch übersichtlicher ist die Sprache **GRAPH**: Du zeichnest Schritte (Kästchen), darunter ihre
Aktionen und die Transitionen mit ihren Bedingungen. Das Spiel übersetzt das intern genau in das
CASE von eben.

- **N** – Aktion ist an, solange der Schritt aktiv ist (der Normalfall)
- **S / R** – Aktion setzen bzw. rücksetzen (bleibt über den Schritt hinaus)
- **D** – Aktion mit Verzögerung
- `Schrittzeit` – wie lange der aktuelle Schritt schon aktiv ist: `Schrittzeit >= T#300ms`

GRAPH gibt es für **Funktionsbausteine** (FB): Baustein anlegen, oben **GRAPH** wählen, im OB „Main“
aufrufen.

<!-- Seite -->

## Regeln für gute Schrittketten

1. **Genau ein Schritt aktiv.** Eine Zahl als Schrittvariable sorgt automatisch dafür.
2. **Jede Transition ist eine klare Meldung** der Anlage: Endschalter, Sensor, abgelaufene Zeit –
   nicht „wird schon passen“.
3. **Start mit Flanke** – sonst läuft die Kette bei gedrücktem Taster gleich nochmal los.
4. **Grundstellung prüfen**: Die Kette startet nur, wenn die Maschine wirklich in Ausgangslage ist
   (z. B. Bohrer oben).
5. **Not-Halt und Störung**: Die Ausgänge abschalten und die Kette in einen sicheren Schritt (oder
   zurück in die Grundstellung) setzen.
6. **Beobachten**: Im Spiel siehst du den aktiven Schritt live – bei GRAPH grün markiert, sonst als
   Wert von `"Kette".Schritt`. Bleibt die Kette hängen, fehlt die Meldung der Transition.

Ausführlicher steht das im Handbuch unter **Schrittketten verstehen**. Ausprobieren kannst du es in
Auftrag 10 (Bohrstation).
