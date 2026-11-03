# GRAPH – Schrittketten

Ein **Funktionsbaustein** kann statt in SCL, FUP oder KOP als **Schrittkette** (GRAPH) geschrieben
werden: Sprachwahl **GRAPH** über dem Editor (nur bei FBs). Aufgerufen wird er wie jeder FB über
seinen Instanz-DB, z. B. `"Bohren_DB"();` in OB1.

## Aufbau

- **Schritte** mit Nummer und Name. Genau ein Schritt ist der **Initialschritt** (doppelter Rahmen);
  mit ihm beginnt die Kette nach dem Anlauf. Der aktive Schritt ist beim Beobachten grün.
- Unter jedem Schritt stehen seine **Aktionen** und seine abgehenden **Transitionen**.
- Eine **Transition** hat eine Bedingung in SCL und einen Zielschritt. Ist die Bedingung erfüllt,
  wird der Zielschritt aktiv. Je Zyklus schaltet höchstens eine Transition; bei mehreren gilt die
  erste erfüllte (Reihenfolge im Editor).

## Aktionen

| Zeichen | Wirkung                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| **N**   | Operand ist 1, solange der Schritt aktiv ist (sonst 0)                        |
| **S**   | Operand wird beim aktiven Schritt gesetzt und bleibt 1                        |
| **R**   | Operand wird beim aktiven Schritt zurückgesetzt                               |
| **D**   | wie N, aber erst, wenn der Schritt seit der angegebenen Zeit aktiv ist (T#2s) |

Kommt ein Operand in mehreren Schritten mit N bzw. D vor, ist er 1, solange einer davon aktiv
ist. Ein Operand ist entweder N/D oder S/R, nicht beides.

## Schrittzeit

In Bedingungen steht `Schrittzeit` für die Zeit, seit der aktuelle Schritt aktiv ist:
`"Unten" AND Schrittzeit >= T#300ms`. Sie beginnt mit dem Zyklus nach dem Weiterschalten.

## Absenkung und Größe

Die Kette wird in SCL übersetzt: `CASE` über die Nummer des aktiven Schritts (statische Variable
`__Schritt`), die Schrittzeit ist ein TON (`__Zeit`). Beide stehen im Instanz-DB und lassen sich
beobachten, z. B. `"Bohren_DB".__Schritt`. Zur Programmgröße zählen Schritte, Transitionen und
Aktionen.
