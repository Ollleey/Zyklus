# GRAPH – Schrittketten

Ein **Funktionsbaustein** kann statt in SCL, FUP oder KOP als **Schrittkette** (GRAPH) geschrieben
werden: Sprachwahl **GRAPH** über dem Editor (nur bei FBs). Aufgerufen wird er wie jeder FB über
seinen Instanz-DB, z. B. `"Bohren_DB"();` in OB1. Wie man eine Kette entwirft, steht unter
„Schrittketten verstehen“.

## Aufbau

- **Schritte** mit Nummer und Name. Genau ein Schritt ist der **Initialschritt** (doppelter Rahmen);
  mit ihm beginnt die Kette nach dem Anlauf.
- Unter jedem Schritt stehen **Verriegelung** (C), **Überwachung** (V), seine **Aktionen** und seine
  abgehenden **Transitionen**.
- Eine **Transition** hat eine Bedingung in SCL und einen Zielschritt. Ist die Bedingung erfüllt,
  wird der Zielschritt aktiv. Hat ein Schritt mehrere abgehende Transitionen
  (**Alternativverzweigung**), gilt die erste erfüllte (Reihenfolge im Editor).

## Simultanverzweigung und Synchronisation

- **Simultanverzweigung**: Als Ziel mehrere Schritte eintragen, z. B. `3, 4` – beide werden
  gleichzeitig aktiv und laufen unabhängig weiter.
- **Synchronisation**: Im Feld **und** weitere Schritte eintragen, die ebenfalls aktiv sein müssen,
  z. B. `5`. Die Transition steht unter ihrem ersten Vorgänger und schaltet erst, wenn alle
  Vorgänger aktiv sind und die Bedingung erfüllt ist; dann werden alle Vorgänger inaktiv.

## Aktionen

| Zeichen | Wirkung                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| **N**   | Operand ist 1, solange der Schritt aktiv ist (sonst 0)                        |
| **S**   | Operand wird beim aktiven Schritt gesetzt und bleibt 1                        |
| **R**   | Operand wird beim aktiven Schritt zurückgesetzt                               |
| **D**   | wie N, aber erst, wenn der Schritt seit der angegebenen Zeit aktiv ist (T#2s) |

Kommt ein Operand in mehreren Schritten mit N bzw. D vor, ist er 1, solange einer davon aktiv
ist. Ein Operand ist entweder N/D oder S/R, nicht beides.

## Verriegelung und Überwachung

- **C – Verriegelung**: Bedingung in SCL, z. B. `"Tuer_zu"`. Die Aktionen des Schritts wirken nur,
  solange sie erfüllt ist. Fehlt sie bei aktivem Schritt, ist `ERR_FLT` gesetzt.
- **V – Überwachung**: Bedingung in SCL, z. B. `Schrittzeit > T#5s` (Bohrer nicht rechtzeitig
  unten). Wird sie wahr, meldet der Schritt eine **Störung**: `ERR_FLT` = 1, die Kette schaltet nicht
  weiter, beim Beobachten ist der Schritt rot. **Quittieren** mit `ACK_EF` hebt die Störung auf; für
  diese Aktivierung des Schritts gilt sie dann als erledigt.

## Betriebsarten und Steuerung der Kette

Jeder Ketten-FB hat zusätzlich diese Parameter (wie bei S7-GRAPH), z. B.
`"Bohren_DB"(ACK_EF := "Quittieren", SW_TAP := "Tippbetrieb", T_PUSH := "Weiter");`

| Eingang                       | Wirkung                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `SW_AUTO`, `SW_TAP`, `SW_MAN` | Flanke wählt **Automatik** (Standard), **Tippen** bzw. **Hand**           |
| `T_PUSH`                      | Tippen: eine erfüllte Transition schaltet nur mit einer Flanke an T_PUSH  |
| `S_SEL`, `S_ON`               | Hand: Flanke an S_ON aktiviert den Schritt S_SEL, alle anderen werden aus |
| `INIT_SQ`                     | Kette in die Grundstellung (nur der Initialschritt aktiv), solange 1      |
| `OFF_SQ`                      | Kette aus (kein Schritt aktiv), solange 1                                 |
| `ACK_EF`                      | Störung quittieren                                                        |

| Ausgang                       | Bedeutung                                        |
| ----------------------------- | ------------------------------------------------ |
| `ERR_FLT`                     | Störung (Überwachung oder fehlende Verriegelung) |
| `S_NO`                        | Nummer des (niedrigsten) aktiven Schritts        |
| `AUTO_ON`, `TAP_ON`, `MAN_ON` | aktuelle Betriebsart                             |

In der Hand-Betriebsart schaltet keine Transition. Beim Beobachten steht die Betriebsart über der
Kette.

## Dauernde Anweisungen

Über und unter der Kette lassen sich **dauernde Anweisungen** in SCL eintragen. Sie laufen in jedem
Zyklus vor bzw. nach der Kette, unabhängig vom aktiven Schritt – z. B. eine Freigabe berechnen oder
eine Meldeleuchte aus `S_NO` ableiten.

## Schrittzeit

In Bedingungen steht `Schrittzeit` für die Zeit, seit der Schritt aktiv ist (bei Transitionen: der
erste Vorgänger): `"Unten" AND Schrittzeit >= T#300ms`. Sie beginnt mit dem Zyklus nach dem
Weiterschalten.

## Absenkung und Größe

Die Kette wird in SCL übersetzt: je Schritt ein Aktiv-Bit `__X<n>` und eine Schrittzeit `__Z<n>`
(TON), dazu `__Schritt` (= `S_NO`), `__Fehler` (gestörter Schritt) und `__Betrieb`. Alles steht im
Instanz-DB und lässt sich beobachten, z. B. `"Bohren_DB".__X3`. Zur Programmgröße zählen Schritte,
Transitionen und Aktionen.
