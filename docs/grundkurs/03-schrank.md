# Schaltschrank, Adressen und Namen

Im Schaltschrank sitzt die **CPU** auf einer Hutschiene, daneben **Baugruppen** mit Klemmen:

- **DI** (digitale Eingänge) – hier kommen Taster und Sensoren an
- **DO** (digitale Ausgänge) – hier gehen Lampen, Motoren und Ventile ab
- **AI/AO** – analoge Ein- und Ausgänge für Zahlenwerte

Jedes Gerät bekommt einen Draht zu genau einer Klemme. Im Spiel klickst du erst auf das Gerät am
Schrankrand und dann auf eine freie Klemme.

<!-- Seite -->

## Adressen

Jede Klemme hat eine **Adresse**. Das Programm erreicht das Gerät über diese Adresse:

| Adresse | bedeutet                          |
| ------- | --------------------------------- |
| `%I0.0` | Eingang (Input), Byte 0, Bit 0    |
| `%I0.1` | Eingang, Byte 0, Bit 1            |
| `%Q0.0` | Ausgang (Q), Byte 0, Bit 0        |
| `%IW64` | analoger Eingang, ein Wort (Zahl) |

Acht Bits ergeben ein Byte: `%I0.0` bis `%I0.7`, danach geht es mit `%I1.0` weiter.

<!-- Seite -->

## Namen statt Adressen

Niemand möchte sich merken, dass `%I0.3` der Not-Halt ist. Deshalb bekommt jede Adresse in der
**Variablentabelle** (PLC-Variablen) einen **Namen**:

| Name       | Adresse | Datentyp |
| ---------- | ------- | -------- |
| `"Taster"` | `%I0.0` | Bool     |
| `"Lampe"`  | `%Q0.0` | Bool     |

Im Programm schreibst du dann `"Lampe"` statt `%Q0.0`. Im Spiel legt das Verdrahten diese Namen
automatisch an – du findest sie im Programmbereich unter **PLC-Variablen**.

> Merksatz: Erst verdrahten, dann programmieren – das Programm benutzt die Namen aus der Tabelle.
