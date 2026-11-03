# Geräte und Fehlerbehandlung

## Gerätekonfiguration

Baugruppe im Schaltschrank anklicken: die Eigenschaften stehen unter dem Schrank.

| Eigenschaft         | Wirkung                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Anfangsadresse      | erste Adresse je Kanalart (DI/DO Byte, AI/AO gerade Byteadresse); leer = automatisch fortlaufend; Überschneidungen sind ein Aufbaufehler |
| Eingangsverzögerung | 0,05 … 20 ms: ein Pegelwechsel gilt erst, wenn er so lange ansteht – entprellt Taster und Lichtschranken in der Hardware                 |
| Ausgänge bei STOP   | abschalten (Standard), letzten Wert halten oder Ersatzwert je Kanal                                                                      |
| Diagnose            | Drahtbruch am 4–20-mA-Kanal und fehlende Lastspannung melden                                                                             |
| Messbereich (AI)    | 0–10 V oder 4–20 mA                                                                                                                      |
| CPU: Systemmerker   | Bit 0 FirstScan (erster Zyklus), 1 DiagStatusUpdate, 2 AlwaysTRUE, 3 AlwaysFALSE                                                         |
| CPU: Taktmerker     | Bit 0 10 Hz, 1 5 Hz, 2 2,5 Hz, 3 2 Hz, 4 1,25 Hz, 5 1 Hz, 6 0,625 Hz, 7 0,5 Hz                                                           |

Beispiel: Taktmerker auf `%MB0` → `%M0.5` blinkt mit 1 Hz.

## Teilprozessabbilder (TPA)

Ohne Einstellung gilt die **Spielregel**: Ein Alarm-OB (Weck- oder Prozessalarm) liest vor dem
Start alle Eingänge neu und schreibt danach alle Ausgänge.

Sobald eine Baugruppe einem **Teilprozessabbild** (TPA 1 … 4, Eigenschaft „Prozessabbild“)
zugeordnet ist, arbeitet die CPU wie eine echte:

- OB1 aktualisiert nur die Kanäle **ohne** TPA (Prozessabbild von OB1 = TPA 0).
- Ein Alarm-OB mit **TPA n** (im Ereignis des OB einstellen) liest vor dem Start die Eingänge von
  TPA n und schreibt danach dessen Ausgänge.
- Ein Alarm-OB ohne TPA liest und schreibt dann gar keine Peripherie – er arbeitet nur mit dem
  Prozessabbild, das OB1 aktualisiert.

So reagiert eine schnelle Teilaufgabe im Weckalarm mit eigener Ein-/Ausgabe, ohne auf den Zyklus
von OB1 zu warten. Schreibt OB1 auf einen Ausgang in einem TPA, kommt das an der Klemme erst an,
wenn der zugehörige Alarm-OB läuft. In der Quelle steht das TPA in der Ereigniszeile
(`// Ereignis: Weckalarm, Takt 5 ms, Phase 0 ms, TPA 1`).

## Dezentrale Peripherie

Ein **Interfacemodul (IM PN)** macht die Baugruppen rechts davon zu einer dezentralen Station –
bis zur nächsten CPU, zum nächsten Interfacemodul oder zur Trennwand. Die Station gehört über
PROFINET zu einer CPU (Eigenschaft „Zugeordnete CPU“, Standard: erste CPU), auch über eine
Trennwand hinweg und ohne Kabelkanal zur CPU. Ihre Adressen schließen an die zentralen Baugruppen
der CPU an.

- **Aktualisierungszeit** 1, 2, 4 (Standard), 8 oder 16 ms: so oft tauschen Station und CPU
  Eingänge und Ausgänge aus. Das ist zusätzliche Verzögerung – schnelle Signale gehören an
  zentrale Baugruppen (oder an einen HSC in der Station).
- **Stationsausfall** (Leitung unterbrochen, Station ohne Spannung): alle Baugruppen der Station
  liefern 0 bzw. schalten ab, die CPU meldet einen Baugruppenträgerausfall – OB86 mit
  `#Event_Class = 16#39` (kommend) und `16#38` (gehend); ohne OB86 geht die CPU in STOP.
- Im Sandkasten: Interfacemodul ziehen = Stationsausfall.

## Fehler-OBs

| OB    | Ereignis          | Ohne OB                 | Mit OB                                                             |
| ----- | ----------------- | ----------------------- | ------------------------------------------------------------------ |
| OB80  | Zykluszeitfehler  | STOP                    | einmal toleriert (Zyklus abgebrochen), zweimal hintereinander STOP |
| OB82  | Diagnosealarm     | RUN, nur Diagnosepuffer | läuft bei kommender und gehender Diagnose                          |
| OB86  | Baugruppenausfall | RUN, nur Diagnosepuffer | läuft beim Ziehen und Stecken                                      |
| OB121 | Programmierfehler | STOP                    | RUN; der fehlerhafte Zugriff liefert 0 bzw. schreibt nichts        |

- OB82 und OB86 haben die Startinformation **`#Event_Class`**: `16#39` kommend, `16#38` gehend.
- Eine ausgefallene Baugruppe liefert an allen Eingängen 0 – das kann ein gültiger Messwert
  sein. Sicher erkennt den Ausfall nur OB86.

## Lokale Fehlerbehandlung

`GET_ERR_ID()` (Word) liefert die Kennung des letzten Programmierfehlers im laufenden OB:
`16#2522` Bereichslängenfehler beim Lesen, `16#2523` beim Schreiben, `0` kein Fehler. **Spielregel:**
Verwendet das Programm `GET_ERR_ID`, führen Programmierfehler nirgends mehr zu STOP oder OB121.

```
#wert := "Daten".Feld[#i];
IF GET_ERR_ID() <> 0 THEN
    #wert := 0;   // Ersatzwert
END_IF;
```

## RUNTIME

`#dauer := RUNTIME(MEM := #merker);` (LReal, `#merker` statisch) liefert die Zeit seit dem letzten
Aufruf in Sekunden. **Spielregel:** Rechenzeit ergibt sich aus der Zahl der ausgeführten Befehle
(Zykluszeit / Befehlsbudget je Befehl).

## Diagnosepuffer und LEDs

- Der **Diagnosepuffer** (CPU im Schaltschrank anklicken) zeigt Anlauf, STOP, Programmierfehler,
  Zykluszeitfehler und Baugruppenmeldungen mit Zeit.
- **ERROR** (rot): STOP durch einen Fehler oder anstehende Diagnose. **MAINT** (gelb): Forcen aktiv.

## Störungen testen

- Aufträge geben Störungen im Testfall vor: Drahtbruch am Geber, **Baugruppe gezogen**,
  **Lastspannung fehlt**.
- Im Sandkasten: in den Eigenschaften einer E/A-Baugruppe „Baugruppe ziehen“ bzw.
  „Lastspannung aus“, während die Simulation läuft.
