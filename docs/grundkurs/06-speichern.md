# Merken: Setzen und Rücksetzen

Ein Förderband soll mit **Start** anlaufen und weiterlaufen, auch wenn man den Taster loslässt.
Erst **Stopp** hält es an. Die SPS muss sich also **merken**, dass Start gedrückt wurde.

Das geht mit zwei IFs ohne ELSE:

```
IF "Start" THEN
    "Band" := TRUE;     // setzen
END_IF;
IF NOT "Stopp" THEN     // Stopp ist ein Öffner: 0 = gedrückt
    "Band" := FALSE;    // rücksetzen
END_IF;
```

Weil die Rücksetz-Zeile **unten** steht, gewinnt Stopp, wenn beide gleichzeitig gedrückt sind. Das
nennt man **rücksetzdominant** – bei Maschinen fast immer die richtige Wahl.

<!-- Seite -->

## Selbsthaltung in einer Zeile

Dasselbe als eine Formel – der Ausgang „hält sich selbst“:

```
"Band" := ("Start" OR "Band") AND "Stopp";
```

Lies: Das Band läuft, wenn Start gedrückt ist **oder** es schon läuft – und Stopp nicht gedrückt
ist (Öffner = 1).

In **FUP/KOP** gibt es dafür fertige Kästchen: **SR** (Setzen dominant) und **RS** (Rücksetzen
dominant).

<!-- Seite -->

## Wo merkt man sich etwas?

Nicht jeder Merkwert ist ein Ausgang. Für Zwischenwerte gibt es:

- **Merker** – Bits im Speicher der CPU, z. B. `%M10.0`
- **Datenbausteine** (DB) – Variablen mit Namen, z. B. `"Daten".Laeuft`. Im Spiel legst du sie im
  Tab **Datenbausteine** an.

Im OB „Main“ selbst bleibt nichts von einem Zyklus zum nächsten – was erhalten bleiben soll, gehört
in einen Datenbaustein.
