# Changelog

## M13c – Bibliothek mit Versionen (2026-11-03)

- **Bibliothek**: eigene FBs, FCs (📚 am Baustein) und PLC-Datentypen (Reiter Datenbausteine) als
  Versionen ablegen; „Aus Bibliothek …“ fügt die neueste Version ein bzw. aktualisiert einen
  gleichnamigen Baustein; Einträge entfernbar
- Eingefügte Bausteine tragen Name, Version und Fingerabdruck; **unverändert zählen sie nicht zur
  Programmgröße** (Anzeige „Bibliothek v2“, nach Änderung „geändert“)
- Desktop: eigene Datei `bibliothek.json`
- 783 Tests

## M13b – Erweiterung (2026-11-03)

- Neue Auftragsart **Erweiterung** (`kind: 'erweiterung'`, `extends`): Ausgangsstand ist die eigene
  Lösung des Vorgängers (sonst der gelieferte Stand); dessen Tests laufen als
  **Regressionstests** (`regression: true`) mit
- **Auftrag 26 – Schnitt an der Ablängsäge**: Erweiterung von Auftrag 23 um Spannen und Sägen mit
  Schrittkette, Verriegelung gegen Fahren während des Schnitts, zweite Ausgangsbaugruppe
- Änderungsumfang nur noch bei Bestandsanlagen
- Fehllösungen: alte Lösung ohne Schnitt, Schnitt ohne Verriegelung
- 781 Tests

## M13a – Bestandsanlage (2026-11-03)

- Neue Auftragsart **Bestandsanlage** (`kind: 'bestand'`, `given`): Aufbau und Programm werden
  geliefert, „Neu beginnen“ stellt sie wieder her
- Bewertungsgröße **Änderungen**: hinzugefügte plus entfernte Programmzeilen gegenüber dem
  gelieferten Programm (Leer- und Kommentarzeilen zählen nicht), im Kopf und im Ergebnis
- **Auftrag 25 – Rolltor Halle 2**: fehlende Verriegelung, Mehrfachzuweisung der Warnleuchte,
  Zähler ohne Flanke und prellender Endschalter (Eingangsverzögerung)
- Fehllösungen: gelieferter Stand, Korrektur ohne Eingangsverzögerung
- 775 Tests

## M12f – Aufträge 22–24 (2026-11-03)

- **Auftrag 22 – Ofenregelung mit PID_Compact**: Einbrennofen mit Totzeit, Startwerte im
  Instanz-DB, Störgrößenaufschaltung über den Türkontakt
- **Auftrag 23 – Positionieren mit schnellem Zähler**: Anschlag mit Inkrementalgeber
  (2 Impulse/mm), Eil- und Schleichgang, ± 1 mm – ohne HSC verpasst der Zyklus Impulse
- **Auftrag 24 – Pumpstation mit Bedienpanel**: Station hinter der Trennwand am IM PN, Bedienung
  über Panel, Meldung per Program_Alarm, Stationsausfall (OB86) vom Motorschutz unterscheiden
- PID_Compact: I-Anteil nur, solange der Stellwert nicht in Richtung der Abweichung anschlägt
  (kein Überschwingen nach dem Anfahren aus der Begrenzung)
- Kriterium-Signal `alarm.active` (Anzahl anstehender Meldungen); Testfall-Störungsart `station`
- Fehllösungen: ohne Aufschaltung, reiner P-Regler, Zählen im Zyklus, ohne OB86, ohne Meldung
- 770 Tests

## M12e – Bedienpanel und Program_Alarm (2026-11-03)

- **Bedienpanel**: Geräte mit `hmi` (Taster/Schalter, Lampe, Eingabefeld, Anzeige) werden nicht
  verdrahtet, sondern über Merker verbunden (automatisch ab `%M200.0` bzw. `%MW220`, je Lösung
  änderbar); das Panel schreibt nur bei Bedienung und liest im Bildtakt von 50 ms
- **Program_Alarm** (Instanz-DB): Flanken an SIG melden TEXT kommend/gehend mit Zeitstempel;
  Meldepuffer und anstehende Meldungen in der CPU, gelöscht beim Neustart
- Panel-Ansicht unter der Anlage mit Tastern, Lampen, Feldern und Meldeanzeige; Panel-Elemente
  erscheinen nicht im Schaltschrank
- 759 Tests

## M12d – CPU-CPU-Kommunikation mit TSEND_C/TRCV_C (2026-11-03)

- Neue Systembausteine **TSEND_C** und **TRCV_C** (Instanz-DB): Daten über eine Verbindung (ID)
  zwischen CPUs ohne Koppelmodul; DATA ist eine beliebige Variable (elementar, Feld, Struktur)
- Laufzeit über mehrere Zyklen: Übertragungszeit 5 ms + 1 ms je 8 Elemente, BUSY bis zur
  Zustellung, DONE bzw. NDR für einen Aufruf, ein Empfangsfach je Verbindung (Rückstau)
- STATUS 16#7000/7001/7002/0000, Fehler 16#80A3 (keine Verbindung) und 16#80B3 (DATA passt
  nicht); Aufträge verfallen beim Neustart
- Verbindungen: bei zwei CPUs ID 1 automatisch, weitere im Schaltschrank an der CPU
- FUP/KOP-Boxen unter „Kommunikation“, Instanztypen in der DB-Auswahl, Vorschläge im Editor
- 756 Tests

## M12c – Dezentrale Peripherie (2026-11-03)

- Neues **Interfacemodul IM PN**: Baugruppen rechts davon bilden eine dezentrale Station, die über
  PROFINET zu einer wählbaren CPU gehört (auch hinter einer Trennwand); Adressen schließen an die
  zentralen Baugruppen an
- **Aktualisierungszeit** 1…16 ms (Standard 4): Eingänge und Ausgänge der Station werden nur in
  diesem Takt übertragen
- **Stationsausfall** im Testfall (`moduleFaults` mit `kind: 'station'`) bzw. Interfacemodul
  ziehen im Sandkasten: alle Baugruppen der Station ohne Funktion, ein Baugruppenträgerausfall
  (OB86, kommend/gehend) je Station
- Schaltschrank: Interfacemodul mit eigener Farbe, Inspektor für zugeordnete CPU und
  Aktualisierungszeit; Handbuch „Geräte und Fehler“ ergänzt
- 753 Tests

## M12b – Schneller Zähler, PWM/PTO, Positionierachse (2026-11-03)

- **HSC auf DI 8 HF**: Kanal 0 zählt jede steigende Flanke im 1-ms-Raster, unabhängig von
  Zyklus und Eingangsverzögerung; Zählwert `%ID112` (DInt), Rücksetzen mit `%Q112.0`, Adresse
  einstellbar – Auftrag 14 ist damit auch ohne Prozessalarm lösbar
- Neue Baugruppe **DQ 4 HF**: je Kanal Standardausgang, **PWM** (Periodendauer in ms,
  Tastverhältnis in Promille aus `%QW120…`) oder **PTO** (Impulsfolge 0…500 Hz)
- Anlagenmodell **Positionierachse** (`axis`): Eilgang, Schleichgang, Richtung, Rampe,
  Inkrementalgeber; Darstellung mit Schlitten, Zielmarken und Positionsanzeige
- Schaltschrank: Einstellungen für HSC und PWM/PTO im Baugruppen-Inspektor
- 751 Tests

## M12a – Technologie-Bibliothek, PID_Compact (2026-11-03)

- **Technologie-Bibliothek**: fertige, geschützte FBs, die der Compiler dazunimmt, sobald ein
  Projekt sie verwendet (Instanz-DB oder Multiinstanz); in FUP/KOP unter „Technologie“, zählen
  nicht zur Programmgröße
- **PID_Compact**: PID-Regler mit Hand-/Automatikbetrieb, Stellwertgrenzen ohne Aufziehen des
  I-Anteils, Output_PWM für Schaltausgänge, D-Anteil auf den Istwert und **Selbstoptimierung**
  per Schwingversuch (Gain = 0,35 · Ku, Ti = 1,2 · Tu)
- **Startwerte im Instanz-DB** (`start`): Konfigurationstabelle im Reiter Datenbausteine für
  Technologiebausteine und eigene FBs; geprüft vom Compiler, in der SCL-Quelle im `BEGIN`-Teil
- Handbuchseite „Technologie“
- 747 Tests

## M11c – Eigene Bausteine als Box, Kommentare, Bausteinschutz (2026-11-03)

- **Eigene FB/FC als Boxen** in FUP (Palette „Eigene Bausteine“) und KOP (Box-Auswahl): Pins
  aus der Schnittstelle (Input/InOut, Output, `Ret_Val`), EN/ENO; FB mit automatisch angelegtem
  Instanz-DB oder Multiinstanz (`#Static`-Variable vom FB-Typ), FC ohne Instanz
- Absenkung: FB-Aufruf mit Instanz, Ausgänge aus der Instanz gelesen; FC-Aufruf mit Ret_Val;
  EN = 0 überspringt den Aufruf
- **Bausteinkommentar** im Editor und als `//`-Kopfzeilen in der SCL-Quelle
- **Bausteinschutz** (`protected`): nur die Schnittstelle sichtbar, Code und Sprache gesperrt,
  zählt nicht zur Programmgröße; die Quelle enthält keinen Code
- 741 Tests

## M11b – KOP-Editor (2026-11-03)

- Sprachwahl je Baustein **SCL / FUP / KOP**; FUP → KOP wird umgewandelt, wo darstellbar (sonst
  Hinweis mit Grund), KOP → FUP immer
- **KOP-Editor**: linke und rechte Stromschiene, Elemente in Reihe, Parallelzweige, Spulen rechts;
  Werkzeugleiste fügt hinter der Auswahl ein: Schließer, Öffner, P-/N-Kontakt, Parallelzweig,
  Boxen (Zeiten mit Instanz-DB, Zähler, Vergleicher, MOVE, Arithmetik), Spulen `( )`, `(/)`, `(S)`,
  `(R)`, `(P)`, `(N)`; Netzwerktitel und -kommentar; Meldungen am Element
- Beobachten in KOP: Kontakte und Spulen grün (1) bzw. blau (0)
- **Fehler behoben**: die FUP-Absenkung klammerte `(a) OR (b)` vor einem UND nicht – betraf
  ODER-Boxen, deren Ausgang in ein UND lief (Rangfolge falsch)
- Auftrag 1 als KOP-Lösung: besteht, gleiche Verläufe wie SCL
- 734 Tests

## M11a – KOP-Modell (2026-11-03)

- Sprache **KOP** (Kontaktplan) für Codebausteine: je Netzwerk ein Strompfad aus Schließern,
  Öffnern, P-/N-Kontakten, Parallelzweigen und Boxen (Zeiten, Zähler, Vergleicher, MOVE …) zu
  einer oder mehreren Spulen (`=`, `/=`, `S`, `R`, P-/N-Spule)
- KOP wird in das FUP-Netzwerkmodell umgeformt und darüber nach SCL abgesenkt: gleiche Semantik,
  Meldungen zeigen auf das KOP-Element; Programmgröße in KOP = Kontakte, Boxen und Spulen
- Umwandlung FUP → KOP, wenn das Netzwerk ein Baum ist (sonst mit Begründung abgelehnt)
- Projektmodell: `lang: 'KOP'`, Strompfade in `kop`
- 732 Tests

## M10d – Aufträge 20–21, Startinformation, Handbuch (2026-11-03)

- **Startinformation** in OB82 und OB86: `#Event_Class` (16#39 kommend, 16#38 gehend)
- **Auftrag 20 „Kühlpumpe mit Ersatzbetrieb“**: bei Drahtbruch oder ausgefallener Messbaugruppe
  läuft die Pumpe weiter und die Störleuchte geht an – den Ausfall der Baugruppe meldet nur OB86
  (die Eingänge liefern dann 0 wie ein gültiger Messwert)
- **Auftrag 21 „Ruhige Anzeige ohne Zykluszeitfehler“**: gleitender Mittelwert über 800 Werte;
  eine Schleife über alle Werte je Zyklus sprengt das Befehlsbudget, die laufende Summe nicht;
  das Feld braucht den Arbeitsspeicher der mittleren CPU
- Handbuch: neue Seite **„Geräte und Fehler“** (Gerätekonfiguration, Fehler-OBs, lokale
  Fehlerbehandlung, RUNTIME, Diagnosepuffer, Störungen)
- M10 damit abgeschlossen; nicht umgesetzt: Teilprozessabbilder (TPA) für Alarm-OBs
- 727 Tests

## M10c – Baugruppenstörungen (2026-11-03)

- Testfälle können Störungen vorgeben: `moduleFaults: [{ device, kind, from, to }]` – die
  Baugruppe, an der das Gerät hängt, ist **gezogen** (`pulled`) oder **ohne Lastspannung**
  (`noLoad`); Drahtbruch zur Laufzeit gab es schon (`faults`)
- Gestörte Baugruppe: Eingänge liefern 0, Ausgänge sind aus; gezogen → Baugruppenausfall (OB86,
  Diagnosepuffer, ERROR-LED), fehlende Lastspannung → Diagnose (OB82), wenn an der Baugruppe
  freigegeben
- Sandkasten: in den Eigenschaften einer E/A-Baugruppe „Baugruppe ziehen/stecken“ und
  „Lastspannung aus/ein“ während der Simulation
- 720 Tests

## M10b – Fehler-OBs, Diagnosepuffer, GET_ERR_ID, RUNTIME (2026-11-03)

- Neue OB-Arten im Menü „+ Baustein“:
  - **OB80 Zykluszeitfehler**: eine Überschreitung wird toleriert (Zyklus abgebrochen, OB80
    läuft), zweimal hintereinander → STOP
  - **OB121 Programmierfehler** (z. B. Feldindex): die CPU bleibt in RUN, der fehlerhafte Zugriff
    liefert 0 bzw. schreibt nichts, OB121 läuft einmal je Durchlauf
  - **OB82 Diagnosealarm** und **OB86 Baugruppenausfall**: laufen bei kommender und gehender
    Meldung; ohne sie bleibt die CPU in RUN (wie S7-1500)
  - ohne OB80/OB121 geht die CPU wie bisher in STOP
- **Lokale Fehlerbehandlung**: `GET_ERR_ID()` liefert die Kennung des letzten Fehlers
  (16#2522 lesen, 16#2523 schreiben); wer es verwendet, behandelt Programmierfehler selbst
- **`RUNTIME(MEM := #m)`**: Zeit seit dem letzten Aufruf in s (LReal), Spielzeit aus Zyklusbeginn
  und Rechenzeit der bisherigen Befehle
- **Diagnosepuffer** der CPU (Anlauf, STOP, Programmierfehler, Zykluszeit, Baugruppendiagnose) im
  Schaltschrank bei der gewählten CPU; **ERROR-LED** bei anstehender Diagnose
- Diagnose freigegeben: Drahtbruch am 4–20-mA-Kanal meldet die Baugruppe (OB82, Diagnosepuffer,
  Systemmerker DiagStatusUpdate)
- 718 Tests

## M10a – Gerätekonfiguration (2026-11-03)

- Eigenschaften der gewählten Baugruppe im Schaltschrank (wie die Gerätesicht in TIA):
  - **Anfangsadresse** je Kanalart (DI/DO byteweise, AI/AO als gerade Byteadresse); leer =
    automatisch; Überschneidungen werden als Aufbaufehler gemeldet
  - **Eingangsverzögerung** der Digitaleingänge 0,05 … 20 ms: ein Pegelwechsel gilt erst, wenn er
    so lange ansteht – Hardwareentprellung (Auftrag 5 lässt sich damit ohne Entprellung im
    Programm lösen)
  - **Ausgänge bei STOP**: abschalten, letzten Wert halten oder Ersatzwert je Kanal
  - **Diagnose** freigeben (wirkt ab M10b)
  - CPU: **Systemmerker** (FirstScan, DiagStatusUpdate, AlwaysTRUE, AlwaysFALSE) und
    **Taktmerker** (10 Hz … 0,5 Hz, z. B. `%M0.5` = 1 Hz) auf ein frei wählbares Merkerbyte
- Standardwerte ändern nichts am bisherigen Verhalten; alle Aufträge und Lösungen bleiben gültig
- 711 Tests

## M9f – Haltepunkte, Handbuch „Online-Funktionen“ (2026-11-03)

- **Haltepunkte** im SCL-Editor: Klick in den linken Rand setzt bzw. löscht einen roten Punkt.
  Die Simulation hält nach dem Zyklus an, in dem die Zeile lief (Spielregel; in TIA mitten im
  Zyklus); die Zeile ist rot hinterlegt, die Simulationsleiste nennt Baustein, Zeile und Zeit.
  **Start** läuft bis zum nächsten Treffer, **Zyklus** rechnet genau einen Zyklus weiter.
  Haltepunkte überstehen „Laden“ und gelten auch im Web Worker des Sandkastens
- Kern: `LevelRun.setBreakpoints`, `breakHit`, `clearBreak` (über die Messpunkte aus M9b)
- Handbuch: neue Seite **„Online-Funktionen“** (Beobachten, Beobachtungs- und Forcetabelle, Trace,
  Querverweise, Laden, Haltepunkte)
- M9 damit abgeschlossen
- 707 Tests

## M9e – Übersetzen und Laden getrennt (2026-11-03)

- Im **Handbetrieb und Sandkasten** startet eine Programmänderung den Versuch nicht mehr neu: die
  CPU arbeitet mit dem geladenen Stand weiter, die Simulationsleiste zeigt „Programm geändert“
  - **Laden (in RUN)**, wenn sich nur Code geändert hat: Istwerte, Zeiten, Zähler bleiben,
    kein Anlauf
  - **Laden (STOP nötig)**, wenn sich Variablen oder Instanzen geändert haben: Wahl
    **Istwerte behalten** (gleicher Name und Typ) oder **zurücksetzen**, danach Anlauf (OB100)
  - übersetzt die Änderung nicht, läuft der alte Stand weiter („Laden“ erst nach Korrektur)
- Aufbauänderungen und Testfälle verhalten sich wie bisher (neuer Versuch)
- Kern: `loadCompatible`, `Cpu.adoptFrom`, `LevelRun.load` (auch im Web Worker)
- 706 Tests

## M9d – Querverweise, Aufrufstruktur, Zuordnungsliste (2026-11-03)

- Neuer Reiter **„Querverweise“** im Programmbereich:
  - **Querverweisliste**: jedes Symbol (`"Motor"`, `"Daten".Wert`, `#t`, `%Q0.1`) mit Adresse,
    Stelle (Baustein, Zeile – Klick springt hin) und Zugriff lesen/schreiben; Filter; Kennzeichen
    ✎n bei mehreren Schreibstellen
  - **Aufrufstruktur**: je OB die aufgerufenen FB/FC (verschachtelt) und Systembausteine mit Instanz
  - **Zuordnungsliste**: belegte Bits in E/A/Merker (■ im Programm verwendet, □ nur als
    PLC-Variable angelegt)
- **Warnung bei Mehrfachzuweisung**: wird ein Ausgang an zwei Stellen unbedingt zugewiesen, wirkt
  die frühere nie – die Meldung nennt die erste Stelle
- Compiler: `xref` und `calls` im Übersetzungsergebnis
- 703 Tests

## M9c – Trace mit Trigger (2026-11-03)

- Der Logikanalysator wird zum **Trace**: Leiste über dem Zeitdiagramm
  - **Signale** ein-/ausblenden, **Programmvariablen** hinzufügen (`"Daten".Wert`, `%MW10`,
    `"Lager".Fach[2].Teil`) – Bool als Stufe, Zahlen als Linie, Aufzeichnung mit 1 ms
  - **Trigger** auf ein Signal: steigende/fallende Flanke oder Wert `=`, `>`, `<`; **Vorlauf** und
    **Nachlauf** in ms; „Scharf schalten“ wartet ab jetzt, nach dem Auslösen bleibt das Fenster
    stehen (Triggerlinie), „Freigeben“ kehrt zur laufenden Anzeige zurück
- Kern: `LevelRun.traceVariable` (auch im Web Worker des Sandkastens)
- 700 Tests

## M9b – Beobachten im SCL- und FUP-Editor (2026-11-03)

- SCL: Bedingungen von `IF`/`ELSIF`/`WHILE`/`UNTIL` werden wie in TIA eingefärbt – erfüllt grün,
  nicht erfüllt blau (Zeilenhintergrund und Randmarke); Werte der Operanden am Zeilenende wie bisher
- FUP: Werte an den Operanden der Ein- und Ausgänge; Bool-Pins grün (1) bzw. blau gestrichelt (0)
- IR: Befehl `probe` (Messpunkt je Anweisung und Bedingung, `IrProgram.probes`). Messpunkte
  kosten nichts: kein Befehl, keine Energie, kein Zyklusbudget – alle Richtwerte bleiben gleich.
  Compiler-Option `probes`, in Aufträgen eingeschaltet; Grundlage für Haltepunkte
- 695 Tests

## M9a – Beobachtungs- und Forcetabelle (2026-11-03)

- Neuer Reiter **„Beobachten & Forcen“** im Programmbereich, je CPU, gespeichert je Auftrag
- **Beobachtungstabelle**: Operanden (`"Motor"`, `%IW64`, `"Daten".Wert`, `"Lager".Fach[2].Teil`,
  `"T1".ET`) mit Anzeigeformat DEZ/HEX/BIN/Zeit; **Steuern** einmalig je Zeile, „Alle steuern“
  oder **zyklisch** (in jedem Bild neu); Eingänge ins PAE, Ausgänge ins PAA, Merker und Variablen
  direkt
- **Forcetabelle** für Ein- und Ausgänge an der Peripherie: Eingänge ersetzen das Feldsignal,
  Ausgänge gelten an der Klemme, auch in STOP; **MAINT-LED** gelb an der CPU, Kennzeichen „F“ am
  Reiter
- Mit aktiven Forceaufträgen wird ein Auftrag nicht abgenommen (Kriterium „Keine Forceaufträge
  aktiv“)
- Kern: `Cpu.force`, `Cpu.modify`, `LevelRun.setForce/modify`, Forcen beim Prüfen über
  `verifySolution(…, forces)`; Web Worker des Sandkastens unterstützt beides
- 693 Tests

## M8g – Arbeitsspeicher, Aufträge 18–19, Handbuch (2026-11-03)

- **Arbeitsspeicher in Byte** je CPU (klein/kompakt 1024, schnell 4096, mittel 8192 Byte): Daten
  aus Datenbausteinen und Instanzen zählen (String[n] = n + 2 Byte, Zeit/Zähler 16 Byte); Anzeige
  „x / y Byte“ neben der Programmgröße, Fehler beim Überschreiten
- **Auftrag 18 „Lackmischer mit Rezepturen“**: drei Rezepte als `Array[1..3] of "Rezept"`,
  Rezeptwahl remanent, Kopie beim Start, Spannungsausfall als Testschritt
- **Auftrag 19 „Schichtbuch für Störmeldungen“**: Meldungen mit Uhrzeit (`RD_SYS_T`) als String im
  Ringpuffer, remanent über einen Spannungsausfall, Löschen bei Schichtübergabe
- Prüfkriterium `value`: Wert einer Programmvariablen zu einem Zeitpunkt (z. B.
  `Schichtbuch.Eintrag[0] = '06:00:02 Extruder'`); CPUs ohne Spannung gelten nicht als STOP-Fehler
- Handbuch: SCL-Seite mit Datentypen, Feldern, Strukturen, Zeichenketten, Datum/Uhrzeit,
  Blockbefehlen, Teilzugriffen, FC-Rückgabewert; Semantik-Seite mit Programmierfehler, Neustart,
  Remanenz und Arbeitsspeicher
- 689 Tests

## M8f – Zeichenketten, Datum/Uhrzeit, Blockbefehle, Teilzugriffe (2026-11-03)

- **String** (`String`, `String[20]`, Höchstlänge 1 … 254, längere Werte werden abgeschnitten) und
  **Char**; Literale `'Text'` mit Fluchtzeichen `$'`, `$$`, `$N`; Vergleiche `=`, `<`, …
- Funktionen `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `DELETE`, `INSERT`, `REPLACE`;
  Umwandlungen `INT_TO_STRING`, `STRING_TO_INT`, `REAL_TO_STRING`, `CHAR_TO_INT` … (Spielregel:
  Zahlen ohne Vorzeichen-Platzhalter)
- **Date** (`D#2026-01-05`), **Time_Of_Day** (`TOD#06:30:00`), **DTL** als Standardstruktur
  (YEAR … NANOSECOND); `RD_SYS_T`/`RD_LOC_T` lesen die Spielzeit (Start: Montag, 5. Januar 2026,
  06:00 Uhr), als Anweisung oder `#ret := RD_SYS_T(OUT => #jetzt);`
- `MOVE_BLK`, `UMOVE_BLK`, `FILL_BLK`, `UFILL_BLK` (auch für Felder von PLC-Datentypen, Startindex
  variabel; über das Feldende → Programmierfehler), `SWAP` (Word, DWord, LWord)
- Teilzugriffe `#w.%X3`, `#w.%B1`, `#d.%W0` lesen und schreiben (Bitfolgen und Ganzzahlen)
- IR: Befehl `clock`, Funktionen für Zeichenketten und `swap`; Slots mit Höchstlänge
- 680 Tests

## M8e – weitere Elementartypen (2026-11-02)

- Neue Typen **SInt, USInt, UInt, UDInt, LInt, ULInt, LReal, LWord** in Datenbausteinen,
  Schnittstellen, Feldern und Datentypen; SInt/USInt/UInt/UDInt auch als PLC-Variable
  (`%MB`, `%MW`, `%MD`)
- Überlauf wie auf der Hardware (Zweierkomplement bzw. modulo); typisierte Literale
  (`USINT#5`, `LREAL#1.5`, `LWORD#16#FF`), alle `X_TO_Y`-Konvertierungen
- Implizite Erweiterungen nach S7-1500 (z. B. SInt → Int → DInt → LInt, Real → LReal,
  USInt → UInt → UDInt → ULInt); Verengungen brauchen eine Konvertierungsfunktion
- FOR-Laufvariable, CASE-Ausdruck und Feldindex: jede Ganzzahl
- **Spielvereinfachung:** LInt/ULInt/LWord sind auf ±(2^53 − 1) begrenzt (Sättigung statt
  Überlauf); 64-bit-Typen gibt es nicht im E/A- und Merkerbereich
- 668 Tests

## M8d – Anlauf-OB100, Remanenz, Neustart (Kern und Compiler, 2026-11-02)

- Ereignis **Anlauf** (OB100): läuft einmal nach jedem Neustart vor dem ersten OB1-Zyklus
- **Remanenz** je Variable (`retain` in Global-DBs und FB-Input/Output/Static, Quellen
  `VAR RETAIN`, `DATA_BLOCK … RETAIN`); Fehler bei Remanenz an anderer Stelle
- **Warmstart** wie an der S7: STOP → RUN und Spannung aus/ein setzen nicht remanente Daten auf
  Startwerte, Zeiten/Zähler zurück und löschen Merker (vorher blieben Merker und DBs erhalten –
  betrifft nur den Betriebsartenschalter im Sandkasten)
- `Cpu.powerOff/powerOn`, `GameRun.powerCycle`, Testschritt `power: [[aus, ein], …]` in Aufträgen
- Oberfläche: Spalte „Remanent“ in Global-DBs und FB-Input/Output/Static, „+ Baustein → Anlauf-OB
  (OB100)“, Taster „⏻ Neustart“ an der CPU im Sandkasten (Spannung aus/ein)
- 662 Tests

## M8c – FC mit Rückgabewert (2026-11-02)

- FC-Schnittstelle mit **Return `Ret_Val`** (Datentyp in der Oberfläche, `Void` = keiner); im
  Baustein `#Ret_Val := …;`
- Aufruf im Ausdruck: `"Wert" := "Skalieren"(Roh := "Rohwert", Faktor := 0.5) + 1.0;`, auch
  verschachtelt und in Bedingungen; Ausgänge im Ausdruck mit `Doppelt => "Zahl"`; als Anweisung
  wird der Rückgabewert verworfen
- **Positionsparameter** bei eigenen FB/FC: `"Skalieren"("Rohwert", 2.0)` (der Reihe nach auf
  Eingänge und Durchgangsparameter, Ausgänge benannt); Systembausteine (TON, CTU …) brauchen
  weiter benannte Parameter
- Externe Quellen: `FUNCTION "Name" : Real` lesen und schreiben
- 655 Tests

## M8b – STRUCT und PLC-Datentypen (2026-11-02)

- **PLC-Datentypen** (eigene Strukturen) als eigener Ordner im Projekt (`types` im Projektmodell,
  ältere Spielstände ohne das Feld bleiben gültig); in der Oberfläche unter „Datenbausteine“ →
  „+ PLC-Datentyp hinzufügen“, Elemente mit Datentyp, Startwert und Kommentar
- verwendbar in Global-DBs, FB-Statics, Ein-/Ausgängen, Durchgangsparametern, Temp und als
  Feldelement (`Array[1..10] of "Rezept"`), auch verschachtelt (UDT in UDT); Typvorschläge
  `"Name"` in allen Variablentabellen
- Startwerte der Elemente gelten für jede Variable dieses Typs; ganze Variablen gleichen
  Datentyps lassen sich zuweisen (`"Daten".Aktuell := "Daten".Liste[#nr];`)
- Prüfungen: Datentyp enthält sich selbst, keine Elemente, doppelte Elemente, Instanzen im
  Datentyp, Name schon vergeben, unbekanntes Element mit Liste der vorhandenen
- Externe Quellen: `TYPE "Name" … STRUCT … END_STRUCT; END_TYPE` lesen und schreiben
- Fehlerzeilen in Global-DBs und Datentypen werden in der Tabelle markiert
- Vereinfachung: PLC-Variablen (Eingänge/Ausgänge/Merker) bleiben elementar
- 652 Tests

## M8a – Felder (ARRAY) (2026-11-02)

- Datentyp `Array[lo..hi] of Typ`, auch mehrdimensional (`Array[0..2, 1..4] of Int`) und
  verschachtelt; in Datenbausteinen, FB-Statics, Ein-/Ausgängen, Durchgangsparametern und Temp
- Zugriff `"DB".Werte[#i]`, `#Feld[#i, #j]`, `"Lager".Faecher[#i].Teil`; konstanter Index wird beim
  Übersetzen geprüft, variabler zur Laufzeit: außerhalb der Grenzen → **Programmierfehler**, CPU geht
  in STOP (Fehler-LED, Meldung „Programmierfehler: … Index 4 außerhalb 0…3“)
- Startwertlisten `[1, 2, 3(0)]` (mit Wiederholung), ganze Felder gleichen Typs zuweisen und als
  Parameter übergeben (Eingang/Ausgang kopiert, Durchgangsparameter als Verweis)
- Strukturen inline in Quellen (`Struct … END_STRUCT` als Feldelement)
- IR: Operand `islot` (Slot = Basis + Index · Schrittweite + Versatz) und Befehl `chk`
  (Indexprüfung); zusammengesetzte Daten liegen flach in aufeinanderfolgenden Slots
- Variablentabellen: Datentyp als freier Text mit Vorschlägen (für `Array[…] of …`)
- 639 Tests

## P6 – Desktop: Build, Release-Workflow, E2E (2026-11-02)

- `npm run build:desktop` erzeugt für Windows:
  - `ZYKLUS_0.1.0_x64-setup.exe` (NSIS, Benutzerinstallation, deutsch, 5,7 MB)
  - `ZYKLUS_0.1.0_x64_de-DE.msi` (6,6 MB)
  - `ZYKLUS_0.1.0_x64_portable.exe` (ohne Installation)
- GitHub Actions `.github/workflows/release.yml`: bei Tag `v*` Version prüfen, Typprüfung und Tests,
  bauen, Release-Entwurf mit Installer, MSI und portabler `.exe`; Linux (`.AppImage`, `.deb`)
  vorbereitet und über die Repository-Variable `ZYKLUS_LINUX` zuschaltbar
- E2E-Test der gebauten App (`npm run e2e -w @zyklus/desktop`, tauri-driver + msedgedriver,
  eigene Testordner über `ZYKLUS_DATA_DIR`/`ZYKLUS_DOCS_DIR`):
  - Start bis Posteingang 0,9 s
  - Auftrag 1 prüfen → erfüllt
  - Neustart → Fortschritt aus Dateien
  - Anlagendatei an das laufende Spiel → Sandkasten, Titel, Datei unter „Meine Anlagen“
  - Offline-Kaltstart mit Anlagendatei (toter Proxy für die WebView)
- Offline-Prüfung `scripts/offline-check.mjs` jetzt gegen den Web-Build (das Desktop-Bundle
  braucht Tauri); Posteingang nach 0,3 s, keine externen Anfragen
- Doku `docs/desktop/README.md` (Bauen, Speicherorte, Dateien, Umzug, Offline, Startzeit,
  Code-Signierung und SmartScreen, Linux, Release) und Checkliste `docs/desktop/CHECKLIST.md`
- 616 Tests

## P5 – Desktop: Umzug der Web-Spielstände (2026-11-02)

- Posteingang, Menü **Spielstand** (Browser und Desktop):
  - **Alles exportieren** schreibt `spielstand-export.json` mit Fortschritt, Lösungen,
    Einstellungen, eigenen Aufträgen, Sandkasten und allen Anlagen
  - **Spielstand importieren …** prüft die Datei (zod, deutsche Meldungen, neuere Versionen
    werden abgewiesen, beschädigte Einträge erkannt), fragt vor dem Ersetzen nach und lädt das
    Spiel mit dem übernommenen Stand neu
- Desktop, erster Start ohne Fortschritt: „Spielstand aus der Web-Version übernehmen?“ mit
  Dateiauswahl; die Antwort wird gemerkt, später geht es über das Menü
- Gerätebezogene Einstellungen (Anlagen-Ordner, zuletzt geöffnet) wandern nicht mit
- Tests: Round-Trip Web → Datei → Desktop, Fehlerfälle; im Browser geprüft (2/17 erledigt →
  exportiert → Speicher geleert → importiert → 2/17); Angebot beim ersten Desktop-Start geprüft;
  616 Tests

## P4 – Desktop: Menü, Kürzel, Dateizuordnung (2026-11-02)

- Native Menüleiste:
  - **Datei:** Neue Anlage, Öffnen …, Zuletzt geöffnet, Speichern, Exportieren …, Beenden
  - **Ansicht:** Vollbild, Vergrößern/Verkleinern/Originalgröße
  - **Hilfe:** Handbuch, Über ZYKLUS
- Tastenkürzel (Desktop über das Menü, im Browser über die Seite): Strg+N, Strg+O, Strg+S,
  Strg+Umschalt+S, F1, F11, Strg +/−/0; Leertaste startet bzw. hält die Simulation (nicht beim
  Tippen, auf Knöpfen oder im Editor); Strg+Z/Y bleiben bei Editor und Anlageneditor
- Öffnen leitet je Dateiart weiter: `.anlage` in den Sandkasten, `.auftrag` in „Eigene Aufträge“,
  `.zyklus.json` in den offenen Auftrag
- Dateizuordnung `.anlage` und `.auftrag` (Installer): Doppelklick startet das Spiel mit der Datei;
  läuft es schon, geht die Datei an das offene Fenster (eine Instanz)
- „Zuletzt geöffnet“ (10 Dateien) im Menü, verschobene Dateien fallen heraus
- Fenstertitel mit Auftrag bzw. Anlage, `*` bei ungespeicherten Änderungen im Sandkasten
- Schließen mit ungespeicherten Änderungen: Rückfrage „Speichern und beenden / Nicht speichern /
  Abbrechen“; danach werden alle Spielstände geschrieben
- „Über ZYKLUS“ mit Version aus der Root-`package.json`
- Erfolgsmeldungen („Lösung gespeichert.“) als kurzer Hinweis statt Fehlerleiste
- Geprüft in der gebauten App: Menüleiste, Start mit `.anlage`-Datei öffnet den Sandkasten,
  Titel, sauberes Schließen; 613 Tests

## P3 – Desktop: Speicherung in Dateien (2026-11-02)

- Desktop-Implementierung der Plattformschicht (`packages/platform/src/desktop.ts`):
  - Spielstände als JSON-Dateien im App-Datenordner (`%APPDATA%\de.zyklus.spiel\`):
    `einstellungen.json`, `fortschritt.json`, `sandkasten.json`, `auftraege.json`,
    `loesungen/<auftrag>.json`
  - Lesen synchron aus einem Speicher-Cache, der beim Start gefüllt wird; Schreiben gebündelt
    (300 ms) und **atomar**: erst `.tmp`, alte Datei als `.bak`, dann umbenennen. Kaputte oder
    halb geschriebene Dateien werden aus `.bak` bzw. `.tmp` gelesen.
  - „Meine Anlagen“ als einzelne `.anlage`-Dateien in `Dokumente\ZYKLUS\Anlagen\`; Ordner im Spiel
    änderbar, Knopf „Ordner öffnen“; von Hand in den Ordner gelegte Dateien erscheinen in der
    Liste, gelöschte Anlagen bleiben als `.bak` erhalten
  - Speichern und Öffnen über die nativen Dialoge, Ziehen ins Fenster über die WebView
  - Beim Schließen werden ausstehende Spielstände geschrieben; Autosave weiter alle 30 s
- Endungen auf dem Desktop: `.anlage` und `.auftrag` (`.anlage.json`/`.auftrag.json` werden
  weiter gelesen)
- Tauri-Hülle: Plugins `fs`, `dialog`, `opener`, `persisted-scope`; Rechte nur für App-Datenordner
  und Dokumente (per Dialog gewählte Ordner bleiben freigegeben)
- Das Web-Bundle enthält keinen Tauri-Code (Einstieg `@zyklus/platform/desktop` nur im
  Desktop-Build)
- Tests mit Dateisystem im Speicher: Zuordnung, Neustart, atomares Schreiben mit Sicherung,
  Absturz zwischen den Schritten, kaputte Datei, Anlagen-Ordner, Dialoge; 610 Tests
- In der gebauten App geprüft: Spielstände landen in Dateien und werden beim Start gelesen

## P2 – Desktop: Tauri-Hülle (2026-11-02)

- Neue Desktop-Anwendung `apps/desktop` (Tauri 2, System-WebView): lädt den Build aus
  `apps/game` im Modus `desktop` (eigener Ordner `dist-desktop`, Web-Build bleibt unberührt).
  Kein doppelter Code, Spiellogik und Oberfläche unverändert.
- Fenster 1440 × 900 (mindestens 1100 × 680); Größe, Position und Maximiert-Zustand werden über
  Neustarts gemerkt (Plugin `window-state`)
- Sicherheitsrichtlinie (CSP) ohne externe Quellen: Skripte, Schriften, Bilder und Worker nur aus
  der App selbst
- Root-Skripte: `npm run dev:desktop`, `npm run build:desktop`, `npm run build:web`
- Versionsnummer an einer Stelle (Root-`package.json`): Tauri liest sie direkt, die Oberfläche über
  `__APP_VERSION__`
- App-Icon aus Code (`scripts/make-icon.mjs`): stilisierte Baugruppe mit Anzeige, LEDs und Klemmen;
  `npm run icon -w @zyklus/desktop` erzeugt alle Größen
- Offline-Prüfung `scripts/offline-check.mjs`: Build über lokalen Server, jede externe Anfrage wird
  gesperrt und gemeldet; Posteingang, Auftrag mit Monaco und Sandkasten mit Worker ohne externe
  Anfrage und ohne Fehler, Posteingang nach 0,8 s
- Release-Build: `zyklus.exe` 10 MB, Fenster nach 0,2 s, 36 MB Arbeitsspeicher für die Hülle

## P1 – Desktop: Plattformschicht (2026-11-02)

- Neues Paket `packages/platform`: eine Schnittstelle für alles, was Browser und
  Desktop-Anwendung unterscheidet – synchroner Schlüssel-Wert-Speicher, Datei speichern/öffnen,
  Dateien ins Fenster ziehen, Start und Beenden. Web-Implementierung auf `localStorage`
  (mit flüchtigem Rückfall bei gesperrtem Speicher), Download und Dateiauswahl.
- Die Oberfläche nutzt nur noch diese Schnittstelle: alle Speicherzugriffe (Fortschritt,
  Lösungen, Einstellungen, Panels, Sandkasten, Meine Anlagen, eigene Aufträge, Patience), alle
  Downloads (Lösung, `.scl`, Anlage, Auftrag) und Importe (Lösung, Anlage, Auftrag, Ziehen
  ins Fenster). Speicherschlüssel und Verhalten im Browser sind unverändert, vorhandene
  Spielstände bleiben lesbar.
- Start: erst `platform.init()`, dann wird die Oberfläche geladen (Desktop lädt dort später die
  Spielstände aus Dateien)
- Dateitypen zentral (`FILE_TYPES`): `.anlage`/`.auftrag` vorbereitet, `.anlage.json` und
  `.auftrag.json` werden weiter gelesen
- 602 Tests

## W4 – Werkstücke drehen sich mit (2026-10-30)

- Werkstücke haben einen Drehwinkel: Auf dem Drehtisch drehen sie mit dem Teller, in der Kurve
  richten sie sich nach der Fahrtrichtung aus; die Draufsicht zeigt sie gedreht (auch über den
  Web Worker). Die Kollision bleibt achsparallel (quadratische Grundflächen).
- Tests: 90° auf dem Drehtisch, Kurve dreht mit der Fahrtrichtung; 600 Tests

## W3 – Geführter Einstieg im Sandkasten (2026-10-30)

- Beim ersten Besuch wird eine Einführung angeboten, danach jederzeit über „Mehr → Einführung
  starten“. Sie legt eine neue Anlage an und führt in acht Schritten von Band, Sensor und
  Schalter über CPU, Baugruppen, Verdrahtung und Programm bis zum laufenden Band.
- Jeder Schritt wird selbst erkannt („✓ Weiter“), Schritte lassen sich überspringen; der Stand
  bleibt gespeichert.
- Behoben: Die Farbvariablen `--panel-2`/`--panel-3` verwiesen auf nicht vorhandene Namen.
  Menüs, Segmentknöpfe, Eingabefelder und Bauteilkörper waren dadurch durchsichtig; die
  Screenshots in `docs/design/after` und `docs/sandbox` sind neu erzeugt.
- Test: alle Schritte werden der Reihe nach erkannt; 598 Tests

## W2 – Anlage als Auftrag veröffentlichen (2026-10-30)

- Sandkasten, Menü „Mehr → Als Auftrag veröffentlichen“:
  - Titel, Kunde, Auftragstext, Hinweise
  - Testfälle mit Dauer, Startwerten und Bedienfolge der Taster, Schalter, Wahlschalter und Potis
  - Prüfregeln: richtig sortiert, nichts verloren, mindestens N im Behälter, Füllstand im Bereich,
    nie gleichzeitig, bleibt aus
- Die eigene Lösung muss den Auftrag bestehen; ihre Kennzahlen werden die Richtwerte
- Daraus entsteht ein gewöhnliches Level (`publishLevel`) mit Datenblatt (Geräte und Regeln);
  die Bedienfolge stellt die Anlage im Prüflauf selbst
- Posteingang: Abschnitt „Eigene Aufträge“ mit Öffnen, Herunterladen (`*.auftrag.json`), Import
  und Löschen; Prüfen und Bewertung wie in der Kampagne, die Anlage als Ansicht ohne Bearbeitung
- Tests: Beispiellösung besteht, leere Lösung und verletzte Regel fallen durch; Leistungstest
  misst drei Runden; 597 Tests

## W1 – Sandkasten-Simulation im Web Worker (2026-10-30)

- Der Sandkasten rechnet SPS und Anlage in einem eigenen Thread. Die Oberfläche spiegelt den Lauf
  (`RemoteRun`) aus Schnappschüssen: neue Flanken der Spuren, CPU-Zustand, Forcewerte, Anlage
  und Werkstücke. Bedienungen gehen als Befehle an den Worker.
- Kanal-LEDs und Beobachten melden ihre Lesewünsche an; der Worker beantwortet sie nach jedem
  Rechenblock.
- Gemeinsame Ansichten `RunView` und `PlantView`: `LevelRun` und `SandboxPlant` erfüllen sie
  direkt, die Aufträge rechnen wie bisher im Hauptthread.
- Leistungstest (50 Werkstücke, 30 Bauteile, ×100, Produktions-Build): 60 Bilder/s, Simulation
  ×71 statt ×47
- Test: Spiegel und direkter Lauf liefern denselben Verlauf; 593 Tests

## S6 – Sandkasten: Vorlagen, Störungen, Zähler, Feinschliff (2026-10-30)

- Vorlagen als `*.anlage.json` (je mit und ohne Beispielprogramm) in
  `packages/plant-sim/vorlagen`, erreichbar über „Meine Anlagen“:
  - Sortierstation Metall/Holz
  - Materialprüfung mit kapazitivem, induktivem und optischem Sensor, drei Behälter
  - Tankanlage mit Pumpe, Ventil, Ultraschall, Grenzwertschalter und Hand/Auto
  - Beim ersten Öffnen des Sandkastens ist die Sortierstation geladen
- Testpult-Bauteile in der Bibliothek, neu das Zeigerinstrument (AO)
- Störungen im Inspektor: Sensor dauernd 0 bzw. 1, Drahtbruch (Eingang elektrisch 0,
  Analogeingang Geberfehler, Ausgang ohne Wirkung), Zylinder klemmt, Band blockiert
- Behälter mit Soll-Regel (Metall, kein Metall, Werkstoff, Farbe); Zähler-Overlay mit Teilen je
  Behälter, Fehlsortierungen, Durchsatz je Minute, ausgegebenen und verlorenen Teilen
- Leistung:
  - Raster für die Nachbarsuche, Stau-Hinweis, Flächen und feste Hindernisse einmal aufgebaut
  - Sensoren nur nach Mechanikschritten ausgewertet
  - Adressen in der CPU zwischengespeichert (auch für die Kampagne)
  - Rechenzeit je Bild passt sich an, damit die Bildrate über 50 bleibt; unter Volllast läuft die
    Simulation langsamer als eingestellt (Messwerte in `docs/sandbox/leistung.txt`)
- Tests:
  - Vorlage 1 sortiert 100 Teile ohne Fehlsortierung
  - Materialprüfung und Tankregelung
  - Vorlagendateien aktuell und übersetzbar
  - Störungen, Soll-Regeln, Leistung als Rückschrittschutz
  - 591 Tests insgesamt
- Screenshots und Bildratenmessung: `scripts/sandbox-shots.mjs` → `docs/sandbox/`

## S5 – Sandkasten: Export, Import, Speichern (2026-10-30)

- Dateiformat `*.anlage.json` mit `formatVersion`: Anlage, Schaltschrank mit allen
  CPU-Programmen, Simulationseinstellungen (Geschwindigkeit, gewählte Signale), Name,
  Beschreibung, Autor und Zeitpunkte
- Import mit zod-Prüfung und deutschen Meldungen mit Fundstelle (z. B. „layout.parts.1.x“: Zahl
  erwartet); unbekannte Felder werden ignoriert, fehlende Parameter mit Standardwerten
  aufgefüllt, ältere Versionen (nackte Anlage) und alte Schaltschränke migriert
- Menü „Mehr“ im Sandkasten: Meine Anlagen, Jetzt speichern, Anlage herunterladen, Anlage
  importieren, Neue Anlage; `.scl` je CPU wie bisher; Dateien lassen sich auch ins Fenster ziehen
- „Meine Anlagen“: Vorschaubild, Öffnen, Umbenennen, Duplizieren, Löschen mit Bestätigung;
  Angaben der aktuellen Anlage bearbeiten; Autosave alle 30 s und beim Verlassen
- Tests: Round-Trip Export → Import ergibt exakt denselben Zustand, Migration, Fehlermeldungen;
  578 Tests

## S4 – Sandkasten: Kopplung und Live-Simulation (2026-10-30)

- Elektrische Bauteile der Anlage erscheinen als Feldgeräte am Schrankrand, angezeigt mit ihrer
  Kennzeichnung (neues Feld `Device.label`)
- Panel **Signale**:
  - „Automatisch verdrahten“ belegt für jedes offene Gerät den ersten freien passenden Kanal
    (Leistungsverbraucher nur auf Relais, Messbereich nach Signalart) und meldet fehlende Kanäle
  - Liste der nicht angeschlossenen Geräte, Adresse, PLC-Variable mit Namensvorschlag
    (`B1_Induktiv`), einzeln oder alle übernehmen
  - Live-Werte (Analog mit Rohwert und physikalischem Wert)
  - Forcetabelle: Eingänge und Ausgänge auf festen Wert (Analog als Rohwert), „F“ in der Tabelle
    und am Gerät im Schaltschrank, alle Forcewerte aufheben
  - Spuren des Zeitdiagramms frei wählbar, Anlagenwerte (Zähler, Füllstände) zuschaltbar
- sim-core: `LevelRun.force()` – ein Eingang bekommt den Wert statt des Feldsignals, ein Ausgang
  gibt ihn statt des Prozessabbilds ans Gerät; Prüfläufe der Kampagne sind nicht betroffen
- Live-Simulation in der Anlagenansicht: Bänder laufen, Zylinder fahren, Werkstücke fließen,
  Sensor-LEDs und Erfassungszonen leuchten, Tanks füllen sich; Taster, Schalter, Not-Halt,
  Wahlschalter und Magazin per Klick, Poti im Inspektor, Werkstücke mit der Maus versetzen,
  einlegen und entfernen; Änderungen an der Anlage setzen den Lauf zurück
- 573 Tests

## S3 – Sandkasten: Arbeitsbereich und Anlageneditor (2026-10-29)

- Bewegliche Panels für Aufträge, Testpult und Sandkasten:
  - Andockbereiche links, rechts und unten; mehrere Panels in einem Bereich werden zu Tabs
  - Verschieben durch Ziehen des Tabs oder über „⋯“, Schließen mit „✕“
  - Menü „Ansicht“ öffnet geschlossene Panels wieder und stellt die Standardanordnung her
  - Anordnung und Größen werden gespeichert; die Aufträge behalten ihre bisherige Anordnung und
    Panelgrößen
- Neuer Modus **Sandkasten**, der bisherige heißt jetzt **Testpult** (gespeicherte Stände bleiben)
- Anlageneditor:
  - Draufsicht und Seitenansicht, Raster mit Einrasten, Zoom mit dem Mausrad, Verschieben der
    Fläche, Einpassen
  - Bibliothek mit allen Bauteilen zum Ziehen oder Klicken
  - Drehen (R), Kopieren (Strg+C/V, Strg+D), Löschen (Entf), Pfeiltasten verschieben;
    Rückgängig/Wiederholen mit 100 Schritten, Ziehen zählt als ein Schritt
  - Inspektor mit Kennzeichnung (automatisch, editierbar, auf Eindeutigkeit geprüft), Lage,
    Drehung, allen Parametern, Störung und der Liste der Anschlüsse
  - Erfassungszonen der Sensoren halbtransparent; Werkstücke per Rechtsklick einlegen
- 570 Tests

## S2 – Sandkasten: Sensor-Physik (2026-10-29)

- Alle Sensoren als reine Funktion `detect(sensor, szene, vorher)`:
  - induktiv mit Reduktionsfaktor (Stahl 1, Messing 0,5, Aluminium 0,4; Holz, Kunststoff und Glas
    nie)
  - kapazitiv nach Dielektrizitätszahl, auch Flüssigkeit durch die Tankwand
  - optischer Taster nach Reflexionsgrad (schwarz nur nah, Glas kaum)
  - Einweg-Lichtschranke (Glas geht durch) und Reflexions-Lichtschranke mit Polfilter (ohne Filter
    täuscht glänzendes Metall einen freien Strahl vor)
  - Farbsensor als DI je eingelernter Farbe oder Farbcode, nur auf kurzen Abstand
  - Ultraschall waagrecht oder von oben (Flüssigkeitsspiegel, Werkstücke, Bänder) mit Blindzone
  - Endschalter (betätigt durch Werkstück oder Zylinder), Zylinderschalter, Wägezelle,
    Füllstand analog und Grenzwertschalter
- Schaltabstand mit Hysterese, Ansprechzeit je Sensor, Prellen des Endschalters nach Seed;
  Öffner, Rauschen und Normbereich 0…27648 über die bestehende Signalverarbeitung
- Erfassungszonen (`zoneOf`) für die Darstellung
- Pflichttests aus der Anweisung und Grenzfälle; 567 Tests

## S1 – Sandkasten: Anlagenmodell und Physik-Core (2026-10-29)

- Neues Paket `packages/plant-sim` ohne UI: Datenmodell einer frei gebauten Anlage (Bauteile mit
  Lage, Drehung, Parametern und Kennzeichnung), Werkstofftabelle (Stahl, Aluminium, Messing, Holz,
  Kunststoff, Glas) mit Dichte, Reduktionsfaktor, Dielektrizitätszahl und Reflexionsgrad, Farben
  und drei Werkstückgrößen
- Bauteilkatalog mit automatischer Kennzeichnung (B1, M1, S1, Y1, H1, 1A1 …) und den elektrischen
  Anschlüssen je Bauteil
- Mechanik mit festem 2-ms-Schritt: Förderband (Motor, Wendeschütz oder Umrichter mit Sollwert),
  Rollenbahn, Kurve, Rutsche, Magazin (Liste oder Zufallsmix nach Seed, Hand- oder Taktbetrieb),
  Auffangbehälter mit Zählung nach Werkstoff und Farbe, Weiche, Drehtisch, Hubtisch, Anschlag,
  Tank mit Pumpe, Ventil und Verbrauch; Zylinder mit 3/2-, 5/2- und bistabilem 5/2-Ventil;
  Schwerkraft, Stau ohne Überlappung, höhere Bandkanten als Wand
- Bedienelemente: Taster (Schließer/Öffner), Schalter, verrastender Not-Halt, Wahlschalter
  Hand/Auto, Poti
- `SandboxPlant` hängt die Anlage als gewöhnliches Anlagenmodell an `LevelRun`; sim-core bekommt
  dafür eine erweiterbare Modellliste (`registerPlantModel`), die Kampagne bleibt unverändert
- 548 Tests

## D6.1 – E/A-Baugruppen im Gehäuse der CPU (2026-10-29)

- E/A-Baugruppen, Koppelmodul und E/A-Feld der Kompakt-CPU im selben anthrazitfarbenen Gehäuse wie
  die CPU: Lüftungsschlitze, schmale Kennfarbe statt farbigem Kopf, helle Beschriftung auf dunkler
  Front, Kanal-LEDs auf der Front neben weißen Beschriftungsstreifen, dunkler Klemmenblock mit
  orangen Betätigern
- Kanal- und Typbeschriftung als dunkle Anzeige im Stil des CPU-Displays (mintfarbene Schrift)

## D6 – Zeitdiagramm, Prozessansicht, Feinschliff, Abnahme (2026-10-29)

- Zeitdiagramm neu: Ist kräftig (Bool cyan, Analog violett, Anlagenwerte gelb), Soll als helles
  Band dahinter, Abweichungen rot schraffiert – Klick setzt den Zeiger an den Anfang; Analogspuren
  mit Wertebereich; Zeiger mit Zeit und den Werten aller Spuren (Klick heftet ihn an); Spurhöhe passt
  sich an, das Diagramm füllt den Simulationsbereich
- Prozessansicht: Drucktaster als Grafik mit Kragen und Hub, Öffner rot, Wahlschalter als Knebel,
  Kennzeichnung und elektrisches Signal am Taster; Bereich verstellbar (Standard ein Drittel)
- Beobachten: Werte von PLC-Variablen, Datenbausteinen, Instanzen und Temp-Variablen am Zeilenende
  im SCL-Editor, Wertspalte in der PLC-Variablentabelle (nur während einer Simulation), BOOL nach
  Einstellung
- Feinschliff: Kopfzeilen von Patience und Posteingang ohne Punkt-Aufzählungen, Handbuchfuß,
  Zeigerstil
- Abnahme: Screenshots in `docs/design/after/`, Gegenüberstellung in `docs/design/README.md`;
  ×100 mit Zeitdiagramm und Live-Werten 55–61 Bilder je Sekunde
- 524 Tests

## D5 – BOOL-Literale 0/1 (2026-10-29)

- SCL: `0` und `1` gelten überall als Bool, wo ein Bool erwartet wird – Zuweisung (`"Motor" := 1;`),
  Vergleich und Verknüpfung (`IF "Start" = 1 THEN`, `"Stopp" <> 0`), Parameter (`IN := 1`),
  Startwerte in Datenbausteinen und Schnittstellen; `TRUE`/`FALSE` in jeder Schreibweise
- Andere Zahlen an Bool: „BOOL erwartet: nur 0, 1, TRUE oder FALSE erlaubt.“ mit Zeile und
  Spalte; Int-Variablen werden weiterhin nicht zu Bool
- `.scl`-Export schreibt an diesen Stellen `TRUE`/`FALSE` (auch Bool-Startwerte), Zahlen an Int
  bleiben stehen
- FUP: Konstanten `0/1/TRUE/FALSE` an Bool-Pins, auch negiert; andere Zahlen werden am Pin gemeldet
- Einstellung „BOOL als 0/1 oder TRUE/FALSE“ (Standard 0/1) in der Simulationsleiste, gilt für
  alle Ansichten; Zeitdiagramm zeigt den aktuellen Bool-Wert je Spur
- 524 Tests

## D4 – Neue Baugruppen, Analogtechnik, Level 16–17 (2026-10-29)

- Baugruppen mit Kanalgruppen: DI 4, DO 4 (je 15 mm), DI 8/DO 8 (30 mm), AI 4 (30 mm) und CPU kompakt
  (120 mm) mit E/A auf der CPU (DI 6, DO 4, AI 2 0–10 V); Adressvergabe je Gruppe, E/A auf der CPU
  zuerst (%I0.0, %Q0.0, %IW64)
- Messbereich je Analogkanal (0–10 V oder 4–20 mA) im Modul-Inspektor (Baugruppe anklicken);
  Feldgeräte haben eine feste Signalart. Falscher Bereich: Eingang liefert 32767, Ausgang kommt
  beim Stellglied nicht an, Warnung im Schrank. Drahtbruch erkennt nur 4–20 mA (32767), bei 0–10 V
  fällt das Signal auf 0. Ältere Aufträge ohne Signalart verhalten sich wie bisher
- Analogfront: Balken je Kanal, rote Fehler-LED bei Überlauf/Drahtbruch, Messbereich in der
  Beschriftung; Kompakt-CPU mit eigenem E/A-Feld; DI 8/DO 8 mit zweispaltigem Streifen
- Level 16 „Zwei Behälter, eine Steuerung“ (AI 4 auf 4–20 mA, Drahtbrucherkennung, FC zweimal
  aufgerufen) und Level 17 „Förderband am Frequenzumrichter“ (Rampe 10 Hz/s im festen Zyklus,
  Freigabe, Rückmeldung über 4–20 mA); Anlagenmodelle „zwei Behälter“ und „Antrieb am Umrichter“
  mit Überlastungszählung, Anlagenansichten; Referenzlösungen, Richtwerte, Tests typischer
  Fehllösungen (Messbereich vergessen, Rampe zu steil auf 5-ms-CPU, Sollwert ohne Rampe)
- Erlaubnislisten der Level 1–15 um passende neue Baugruppen ergänzt; alle Referenzen bestehen
- Handbuch zeigt Kanalgruppen und Messbereiche der Baugruppen
- 511 Tests

## D3 – Leitungen und Feldgeräte (2026-10-29)

- Leitungen als Adern mit Biegeradius: vom Gerät zum Plattenrand, durch den unteren Kanal unter dem
  Deckel, von unten in die Baugruppe; an der Federzugklemme sitzt eine Aderendhülse in Aderfarbe
- Farben nach Schaltschrank-Praxis: DC-Steuerleitungen dunkelblau, Analogleitungen violett mit
  gestricheltem Schirm; aktives Signal hellt die Ader auf und pulsiert leicht (aus bei reduzierter
  Bewegung)
- Hover auf Gerät, Leitung oder Klemme hebt die ganze Strecke samt Gerät und Klemme hervor
- Feldgeräte als Symbole statt Karten: Taster grün, Stopp/Öffner rot, Not-Halt mit Pilz,
  Wahlschalter, Lichtschranke, Endlagen-/Näherungsschalter, Messumformer mit Messbereich, Motor
  (M, 3~ bei Leistung), Ventil, Leuchtmelder, Stellglied; Kennzeichnung wie im Schaltplan,
  Signalart darunter; Zustand live (Motor grün, Leuchte an, Ventil betätigt, Strahl unterbrochen)
- Verdrahtung bleibt Aufgabe des Spielers (Gerät anklicken, dann Klemme)
- Nicht umgesetzt: eigene 0-V-Rückleitung (das Modell kennt keine Bezugsleiter)
- 496 Tests

## D2 – Hardware-Optik und Maßstab (2026-10-29)

- Maßstab: ein Rasterschritt der Hutschiene sind 15 mm. CPU klein 90 mm, CPU mittel/schnell
  105 mm, DI 8/DO 8/DI 8 HF/AI 2/AO 2 je 15 mm, REL 4 und KOP je 30 mm, Trennwand 30 mm.
  Schrankbreiten der Level und Referenzaufbauten umgerechnet; Preise und Richtwerte unverändert
- Lösungsformat Version 2 mit Migration: alte Stände werden beim Start (localStorage, Version 3) und
  beim Import von Lösungsdateien umgerechnet, Reihenfolge und Lücken bleiben erhalten, Level 13 je
  Seite der Trennwand. Was nicht mehr passt, lädt und wird als „ragt über die Hutschiene“ gemeldet.
  Tests mit dem alten Referenzaufbau jedes Levels
- Engine: Betriebsartenschalter RUN/STOP (Neustart mit erhaltenen Merkern und Datenbausteinen),
  mittlere Auslastung des Befehlsbudgets je CPU
- Schaltschrank maßstäblich in mm gezeichnet: verzinkte Montageplatte, 35-mm-Hutschiene mit
  Langlöchern und Lichtkante, Verdrahtungskanäle oben und unten mit Fingern, Deckel und
  Belegungsschild (überfüllte Spalten rot), Trennwand als Schottblech, Buskabel der Koppelmodule
  im oberen Kanal
- CPU: Gehäuse mit Lüftungsschlitzen und Fronttür, LEDs RUN/STOP/ERROR/MAINT mit Leuchten aus der
  Simulation, Anzeige mit Typ, Name, Zykluszeit und Last, Betriebsartenschalter (bedienbar im
  Sandkasten), Kartenschacht, RJ45 mit Link-LED
- E/A-Baugruppen: Beschriftungsstreifen mit LED, Adresse und Symbolname je Kanal (Tooltip mit vollem
  Namen), Analogbalken, Federzugklemmen mit orangen Betätigern als Verdrahtungsziel
- Zoom mit Mausrad um den Zeiger, Verschieben durch Ziehen, „Einpassen“, Vorschau beim Stecken,
  Einrast-Animation (aus bei reduzierter Bewegung); Leitungen laufen unter dem Kanaldeckel und
  hinter den Fronten
- Noch offen für D3: Leitungsführung mit Biegeradius und Aderendhülsen, Gerätesymbole; bei
  „Einpassen“ ist die Modulbeschriftung klein, lesbar mit Zoom
- 493 Tests

## D1 – Designsystem und Grundlayout (2026-10-29)

- Plan für die Design-Überarbeitung D1–D6 (`docs/design/PLAN.md`) und Ausbauplan M8–M13 (`PLAN.md`)
- Screenshots per Playwright über das installierte Edge (`scripts/screenshots.mjs`), Ist-Stand in
  `docs/design/before/`, aktueller Stand in `docs/design/after/`
- Design-Tokens in `apps/game/src/theme.ts` (Farben, 4-px-Abstände, Radien, Schatten, Schrift), als
  CSS-Variablen gesetzt; Light-Palette vorbereitet. Bestehende Styles laufen über die Tokens,
  Monaco-Theme und Editor-Schrift ebenfalls
- Schriften IBM Plex Sans, Plex Sans Condensed und Plex Mono lokal gebündelt
- Kopfzeile neu: Auftrag und Kunde, Auftrag/Datenblatt als Umschalter, Kosten und Größe gruppiert,
  Speichern/Laden/Export im Menü „Mehr“, „Lösung verwerfen“ dort abgesetzt mit eigenem
  Bestätigungsdialog; „Prüfen“ ist die einzige Primäraktion (Federzug-Orange)
- Eigene Dialoge statt Browser-`confirm`/`alert` (Verwerfen, Import ersetzen, Baustein löschen)
- Verstellbare Bereiche: Schrank/Programm, Höhe der Simulation, Prozessansicht; Größen werden
  gespeichert, Trenner auch per Tastatur bedienbar; Mindestbreite 1280 px
- Anweisungszähler als Balken; Überschriften in Satzschreibung statt gesperrter Großbuchstaben;
  Datenblatt- und Handbuchpapier kühl statt cremefarben; Favicon
- Testzeitlimit für die Level-Tests auf 60 s (unter Last liefen zwei Determinismus-Tests in das
  Standardlimit von 5 s)

## M7 – Alarme, eigene Bausteine, mehrere CPUs, Level 10–15, Werkstatt (2026-10-29)

- Engine:
  - Alarm-OBs: Weckalarm (OB30…38, Takt und Phase) und Prozessalarm (OB40…47, Flanke an einem
    Eingangsbit) als eigene Codebereiche im IR; frisches PAE, sofort wirksame Ausgänge, gleiches
    Befehlsbudget wie ein Zyklus
  - Baugruppen DI 8 HF (alarmfähig) und KOP (Koppelmodul, je 2 Wörter in beide Richtungen ab
    %QW100/%IW100); Trennwand im Schaltschrank (kein Modul darauf, keine Leitung hindurch, Baugruppen
    rechts davon brauchen eine eigene CPU)
  - Anlagenmodelle Bohrstation, Sortierstrecke und Wärmestrecke PT1 mit Totzeit; Anlagen können
    Digitaleingänge liefern (Endlagen, Lichtschranken); Kriterium Tastverhältnis (`duty`)
- SCL-Compiler:
  - mehrere OBs mit Ereignis, Prüfung von Nummernbereich, Takt und Eingang; eigene Temp-Variablen je OB
  - eigene FB und FC: Ein-/Ausgänge, Durchgangsparameter (auf die Variable abgebildet), statische
    Daten, Multiinstanzen von Systembausteinen und eigenen FBs, Instanz-DBs eigener FBs, Zugriff
    von außen (`"Motor_DB".Laeuft`), RETURN; Rekursion wird erkannt. Bausteine werden an der
    Aufrufstelle eingesetzt, Meldungen kommen einmal am Baustein, die Programmgröße zählt den Rumpf
    einmal
  - Ereignisse überstehen Export und Import der `.scl`-Quelle (Kommentarzeile im Bausteinkopf)
- Lösungen: CPU-Fähigkeiten werden geprüft (Weck-/Prozessalarm, Alarmeingang auf DI 8 HF)
- Level 10–15: Bohrstation als Schrittkette, Sortierweiche mit Bit-Warteschlange, PWM über
  Zeitglieder, Pumpenhaus und Leitwarte mit zwei CPUs, Abfüllen mit Prozessalarm, PI-Regler als FB
  im Weckalarm – jeweils mit Referenzlösung, Richtwerten und Tests typischer Fehllösungen
- App:
  - Bausteinauswahl je CPU (FB, FC, Weckalarm-OB, Prozessalarm-OB anlegen, umbenennen, löschen),
    Ereigniseinstellungen, Schnittstelle je Bausteinart, eigene FBs als Instanz- und Multiinstanztyp
  - Trennwand, Koppelmodule mit Buskabel und Alarmkennzeichnung im Schaltschrank
  - Anlagenansichten für Bohrstation, Sortierband, Ofen, Heizband, Pumpenhaus, Abfüllung
  - Handbuch mit Seiten zu Bedienung, Baugruppen-Datenblättern, Laufzeitregeln, SCL, FUP und
    Boxreferenz (aus `docs/` und den Katalogen erzeugt)
  - Sandkasten: alle Baugruppen, Testgeräte, nur Handbetrieb
  - Bonusspiel Klemmen-Patience (nach 3 erledigten Aufträgen): Reihenklemmen nach Aderfarbe und
    Querschnitt auf Sammelschienen sortieren, Spiel je Seed, Rückgängig
  - `.scl`-Export je CPU
- Nicht umgesetzt aus dem Plan: Sound, eigenes Onboarding (das Handbuch erklärt die Bedienung);
  Aufruf eigener FB/FC aus FUP
- 472 Tests

## M6 – Metriken, Histogramme, Speichern (2026-10-29)

- Richtwerte (`par`) je Level aus den Metriken der Referenzlösungen; ein Test hält beides synchron
- Vergleichsverteilungen: lokal und deterministisch aus Level-id und Richtwert erzeugt
  (die meisten Lösungen etwas schlechter, langer Schwanz, wenige besser); Histogramm-Klassen,
  „besser als x %“
- Lösungsdatei `*.zyklus.json` (Format `zyklus-loesung`, Version 1): Export, Import mit Prüfung von
  Format, Version, Auftrag und Grobstruktur, deutsche Fehlermeldungen
- Spielstand mit Versionsschlüssel und Migration, Verlauf der letzten 10 bestandenen Prüfungen
- App: Histogramme für Kosten, Energie und Größe im Prüfdialog (eigener Wert und Bestwert),
  Knöpfe „Lösung speichern“ / „Lösung laden“
- 411 Tests

## M5 – Signalstörungen und Analogtechnik (2026-10-28)

- Engine:
  - Analogeingänge mit Messbereich (physikalisch ↔ 0…27648), linear interpolierten Stimuli,
    Rauschen, Ausreißern und Geberfehlern (Drahtbruch/Überlauf 32767, Unterlauf −32768), alles per Seed
    reproduzierbar; Über-/Untersteuerbereich begrenzt wie S7
  - Relaisbaugruppe REL 4 (Ansprechzeit 15 ms, Abfallzeit 30 ms); Leistungsverbraucher (Schütze, Pumpen)
    brauchen einen Relaisausgang
  - Anlagenmodell Tank (Pumpe, veränderlicher Verbrauch) mit Rückkopplung auf den Messwert
  - Kriterien statt fester Soll-Verläufe: `always`, `range`, `exclusive`, `maxChanges`, `track`;
    Aufzeichnung von Anlagenzustand (`plant.*`) und störungsfreiem Messwert (`true.*`)
- Level 4–9: Baustellenampel, Teilezähler mit flatternder Lichtschranke, Stern-Dreieck-Anlauf mit
  Verriegelung, Hochbehälter mit Hysterese, Drahtbruch mit Ersatzreaktion, Glättung eines verrauschten
  Messwerts – jeweils mit Referenzlösung und Tests für typische Fehllösungen
- App: Analogspuren im Logic Analyzer (Messwert und wahrer Wert), Anlagenzeilen, Anlagenansichten
  (Ampel, Lichtschranke, Stern-Dreieck, Tank, Ofen, Durchfluss), Schalter und Schieberegler im
  Handbetrieb, verletzte Kriterien im Prüfdialog
- 398 Tests

## M4 – FUP-Editor (2026-10-28)

- `@zyklus/fup-model`: Netzwerk-/Box-/Verbindungsmodell im TIA-Stil (Bool-Verbindungen, Operanden an
  Pins, Negation, erweiterbare Eingänge), Katalog mit 40 Boxen in 6 Kategorien, Absenkung nach SCL mit
  topologischer Auswertungsreihenfolge, Validierung (offene Pins, Rückkopplung, Wert-Verbindungen …),
  Rückführung aller Meldungen auf Netzwerk/Box/Pin, Programmgröße = Boxen
- SCL-Compiler: interne FUP-Funktionen (SR, RS, P_TRIG, N_TRIG, IN_RANGE, OUT_RANGE, CONV) nur für aus
  FUP erzeugte Bausteine
- Levels: Übersetzung von SCL und FUP, CPU-Grenze in Netzwerken bzw. Anweisungen; FUP-Referenzlösungen
  für Level 1–3, Äquivalenztest FUP ⇔ SCL (identische Verläufe über alle Seeds)
- App: Sprachwahl SCL/FUP je OB, FUP-Editor mit Anweisungsliste (Ziehen oder Klick), Boxen verschieben,
  Verbindungen ziehen, Negation per Klick, Operandenfelder, automatische Instanz-DBs, Fehler an der Box,
  Sprung aus der Meldungsliste zur Box; breiteres Programmfeld bei FUP
- 371 Tests

## M3 – Level 1–3 spielbar (2026-10-28)

- Spiel-Engine in `sim-core/game`:
  - Baugruppenkatalog (CPU klein/mittel/schnell, DI 8, DO 8, AI 2, AO 2), Level-Format mit Validierung
  - Schaltschrank: Steckplätze, Zuordnung zur CPU, automatische Adressvergabe wie TIA (DI/DO ab Byte 0,
    AI/AO ab Wort 64), Verdrahtung mit Kanalprüfung, Kabelkanal mit Kapazität je Spalte
  - PLC-Variablen angeschlossener Geräte werden automatisch angelegt und beim Umstecken nachgeführt
  - Eingangssignale mit Öffner-Logik und reproduzierbarem Prellen (Seed)
  - Simulationslauf (Testfall oder Handbetrieb, Einzelzyklus), Soll/Ist-Vergleich mit Toleranzfenster
    und Prüfung der Schaltanzahl, Verifikation über alle Testfälle und Seeds, Metriken
- `@zyklus/levels`: Aufträge 1–3 (Förderband mit Selbsthaltung, Zweihandbedienung, Stromstoßschalter mit
  prellendem Taster) mit Referenzlösungen als TIA-Quellen; Tests prüfen Referenzlösungen, typische
  Fehllösungen und Determinismus; Speichergrenze je CPU-Typ
- `apps/game` (React + Vite + Monaco, offline):
  - Posteingang mit Freischaltung, Auftrags-Mail und Datenblatt
  - Schaltschrank (SVG): Baugruppen stecken/verschieben/entfernen, Geräte verdrahten, Kanalbelegung, Live-LEDs
  - Bausteineditor: Main [OB1] mit Schnittstelle (Temp/Constant), SCL-Editor mit Hervorhebung,
    Fehlermarkierung und Autovervollständigung, PLC-Variablentabelle, Global-/Instanz-DBs, Meldungsliste
  - Simulation: Start/Pause/Zyklus/×10/×100, Logic Analyzer (Soll grau, Ist farbig, Abweichung rot),
    Anlagenansicht (Förderband, Presse, Lampe), Handbetrieb mit Tastern
  - Prüfen mit Ergebnis je Testfall, fehlgeschlagene Seeds direkt ansehen, Bestwerte, Export als `.scl`
  - Lösungen und Fortschritt im `localStorage`
- 336 Tests

## S7-Treue (2026-10-28, zwischen M2 und M3)

Auf Wunsch: SCL und FUP sollen echtes S7 sein (TIA-Bausteineditor-Stil, Referenz S7-1500).

- Projektmodell wie TIA: PLC-Variablentabelle, OB1 „Main“ mit Schnittstelle (nur Temp/Constant),
  Global-DBs, Instanz-DBs (`IEC_TIMER`, `IEC_COUNTER`, `TON_TIME`, `CTU_INT`, `R_TRIG` …)
- SCL: Aufrufe `"DB".TON(…)` / `"DB"(…)`, Pfadzugriffe `"Daten".T1.Q`, `REGION`, `MUX … INELSE`,
  TIA-Typen für Absolutadressen (`%IW` = Word), neue Typen Byte und DWord, Literale `B#`, `W#`, `DW#`,
  implizite Konvertierungen nach S7-1500-Tabelle, Umlaute in Namen
- SR/RS, IN_RANGE/OUT_RANGE in SCL entfernt (gibt es in TIA nur in FUP/KOP)
- Externe Quellen: Import (`sourceToProject`), Export (`projectToSource`), direkte Übersetzung
  (`compileSource`)
- Meldungen mit Ort (Codeteil, Schnittstellenzeile, Variablentabelle) und TIA-Typnamen
- 297 Tests

## M2 – SCL-Compiler (2026-10-28)

- `@zyklus/scl-compiler`:
  - Handgeschriebener Lexer: Kommentare `//`, `(* *)`, `/* */`; lokale (`#x`), globale (`"x"`) Namen,
    Absolutadressen; Zahlen in allen Basen, typisierte Literale, Zeitangaben (`T#1s200ms`)
  - Recursive-Descent-Parser mit IEC-Präzedenz und Fehler-Recovery (mehrere Fehler pro Lauf)
  - Deklarationen VAR / VAR_TEMP / VAR CONSTANT, FB-Instanzen inkl. SR/RS
  - IF/ELSIF/ELSE, CASE (Listen, Bereiche, ELSE), FOR (BY), WHILE, REPEAT, EXIT, CONTINUE, RETURN
  - FB-Aufrufe mit `:=`/`=>`, Elementzugriff `#T1.Q`; alle M1-Funktionen und Konvertierungen
  - Typprüfung mit impliziter Erweiterung (INT → DINT → REAL), kontextabhängigen Literalen,
    deutschen Fehlermeldungen inkl. Lösungshinweis, Warnungen (unbenutzt, Schreiben auf Eingang)
  - Codegenerierung → IR mit direktem Schreiben ins Ziel und wiederverwendeten Hilfsvariablen
  - Programmgröße = Anzahl Anweisungen
  - Monaco: Monarch-Tokenizer, Sprachkonfiguration, Umwandlung Diagnosen → Marker
- 155 Tests (Lexer, Präzedenz, Recovery, Ausführung auf der Sim-CPU, Fehlermeldungen).
- Sprachumfang dokumentiert in `docs/scl.md`.

## M1 – Sim-Core (2026-10-27)

- Monorepo mit npm workspaces, TypeScript (strict), Vitest, Prettier.
- `@zyklus/sim-core`:
  - Datentypen BOOL/INT/DINT/REAL/WORD/TIME mit Überlauf- und Konvertierungsregeln
  - Speicherbereiche `%I/%Q/%M` (big-endian), Absolutadressen, symbolische Variablentabelle
  - IR (lineare, typisierte Befehlsliste) mit Builder und statischem Validator (deutsche Fehlermeldungen)
  - Interpreter: Bitlogik, S/R, SR/RS, P_TRIG/N_TRIG, R_TRIG/F_TRIG, TP/TON/TOF/TONR, CTU/CTD/CTUD,
    Vergleiche, IN_RANGE/OUT_RANGE, Arithmetik, ABS/NEG, LIMIT/MIN/MAX, SEL/MUX, NORM_X/SCALE_X,
    WORD-Logik, SHL/SHR, CONV, Sprünge
  - CPU-Zyklus PAE → OB1 → PAA, Zykluszeitüberwachung mit STOP, mehrere CPUs auf einer Zeitachse
  - CPU-Katalog (klein/mittel/schnell), gewichtete Energie-Metrik, seedbarer Zufallsgenerator
- 115 Unit-Tests inkl. Timer-Randfälle, SR/RS-Dominanz, verpasste Kurzimpulse, Zykluszeitüberschreitung,
  Determinismus.
- Semantik dokumentiert in `docs/semantik.md`.
