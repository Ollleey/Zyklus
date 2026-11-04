# Zeiten

Viele Abläufe brauchen Zeit: Ein Lüfter soll nachlaufen, eine Ampel 8 s grün bleiben, ein Motor
erst nach 2 s anlaufen. Dafür gibt es **Zeitbausteine**. Jeder braucht – wie R_TRIG – einen
Instanz-DB, hier vom Typ `TON_TIME`, `TOF_TIME` oder `TP_TIME`.

| Baustein | Name                 | Ausgang Q …                                |
| -------- | -------------------- | ------------------------------------------ |
| **TON**  | Einschaltverzögerung | wird 1, wenn IN schon PT lang 1 ist        |
| **TOF**  | Ausschaltverzögerung | bleibt nach dem Ende von IN noch PT lang 1 |
| **TP**   | Impuls               | ist ab einer Flanke an IN genau PT lang 1  |

Zeiten schreibt man als `T#2s`, `T#500ms`, `T#1m30s`.

<!-- Seite -->

## Beispiele

```
// Motor läuft 2 s nach dem Einschalten an
"Anlauf"(IN := "Ein", PT := T#2s);
"Motor" := "Anlauf".Q;

// Lüfter läuft 30 s nach, wenn das Licht ausgeht
"Nachlauf"(IN := "Licht", PT := T#30s);
"Luefter" := "Nachlauf".Q;
```

`.Q` ist der Ausgang, `.ET` die schon abgelaufene Zeit.

<!-- Seite -->

## Wichtig

- Der Zeitbaustein muss **in jedem Zyklus** aufgerufen werden, sonst zählt er nicht weiter. Ruf ihn
  deshalb nicht in einem IF auf, das nur manchmal ausgeführt wird.
- Ein TON beginnt von vorn, sobald IN zwischendurch 0 wird.
- Im Spiel siehst du den Ablauf im **Zeitdiagramm** und unter **Beobachten**: `"Anlauf".ET` zeigt,
  wie weit die Zeit ist.
