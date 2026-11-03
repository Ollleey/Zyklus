# Online-Funktionen – Testen wie am Gerät

Alle Funktionen arbeiten mit der laufenden Simulation (Handbetrieb, Testfall oder Sandkasten).

## Beobachten

- **SCL**: Werte der Operanden stehen am Zeilenende. Bedingungen von `IF`, `ELSIF`, `WHILE` und
  `UNTIL` sind eingefärbt: **grün** erfüllt, **blau** nicht erfüllt (Wert aus dem letzten Zyklus).
- **FUP**: Werte an den Operanden der Ein- und Ausgänge; Bool-Pins grün (1) bzw. blau gestrichelt
  (0).

## Beobachtungstabelle und Forcetabelle

Reiter **„Beobachten & Forcen“** im Programmbereich, je CPU und Auftrag gespeichert.

| Spalte     | Bedeutung                                                             |
| ---------- | --------------------------------------------------------------------- |
| Operand    | `"Motor"`, `%IW64`, `"Daten".Wert`, `"Lager".Fach[2].Teil`, `"T1".ET` |
| Format     | DEZ, HEX (`16#…`), BIN (`2#…`), Zeit (`T#…`)                          |
| Steuerwert | `TRUE`, `42`, `16#FF`, `T#2s`, `'Text'`                               |

- **⚡ Steuern** schreibt den Wert einmalig: Eingänge ins PAE, Ausgänge ins PAA, Merker und
  Variablen direkt. Der nächste Zyklus kann ihn wieder überschreiben. **Zyklisch steuern**
  schreibt in jedem Bild neu.
- **Forcen** gibt es nur an Ein- und Ausgängen: ein geforcter Eingang ersetzt das Feldsignal, ein
  geforcter Ausgang gilt an der Klemme – auch in STOP. Die **MAINT-LED** der CPU leuchtet gelb.
- **Mit aktiven Forceaufträgen wird kein Auftrag abgenommen** (Kriterium „Keine Forceaufträge
  aktiv“).

## Trace

Der Logikanalysator unter der Simulation zeichnet jedes Signal mit 1 ms auf.

- **Signale**: Spuren ein- und ausblenden, Programmvariablen hinzufügen (`"Daten".Wert`, `%MW10`).
- **Trigger** auf ein Signal: steigende oder fallende Flanke, Wert `=`, `>` oder `<`. **Vorlauf**
  und **Nachlauf** legen das Fenster fest.
- **Scharf schalten** wartet ab jetzt; nach dem Auslösen bleibt das Fenster stehen (gestrichelte
  Triggerlinie). **Freigeben** kehrt zur laufenden Anzeige zurück.

## Querverweise

Reiter **„Querverweise“**:

- **Querverweisliste**: jedes Symbol mit Adresse, Stelle (Klick springt hin) und Zugriff; ✎n zeigt
  mehrere Schreibstellen.
- **Aufrufstruktur**: welcher OB welche FB/FC und Systembausteine aufruft.
- **Zuordnungsliste**: belegte Bits in E, A und Merkern (■ im Programm verwendet, □ nur angelegt).
- Wird ein Ausgang an zwei Stellen **unbedingt** zugewiesen, warnt der Compiler: die frühere
  Zuweisung wirkt nie.

## Übersetzen und Laden

Im Handbetrieb und im Sandkasten arbeitet die CPU nach einer Programmänderung mit dem geladenen
Stand weiter. Die Simulationsleiste zeigt „Programm geändert“:

- **Laden (in RUN)** bei reinen Codeänderungen: Istwerte, Zeiten und Zähler bleiben, kein Anlauf.
- **Laden (STOP nötig)**, wenn sich Variablen oder Instanzen geändert haben: Istwerte gleichnamiger
  Variablen behalten oder auf Startwerte zurücksetzen; danach Anlauf (OB100).

Aufbauänderungen und Testfälle starten wie bisher einen neuen Versuch.

## Schrittbetrieb und Haltepunkte

- **Zyklus** rechnet genau einen Zyklus weiter.
- **Haltepunkt**: Klick in den linken Rand des SCL-Editors (roter Punkt). **Spielregel:** Die
  Simulation hält nach dem Zyklus an, in dem die Zeile ausgeführt wurde (in TIA mitten im Zyklus);
  die Zeile ist rot hinterlegt. **Start** läuft bis zum nächsten Treffer weiter.

## Bestandsanlagen

Manche Aufträge liefern Aufbau und Programm einer laufenden Anlage mit. Ziel ist, die Fehler zu
finden und **möglichst wenig zu ändern**: Neben Kosten, Energie und Größe zählt der
**Änderungsumfang** – hinzugefügte plus entfernte Programmzeilen gegenüber dem gelieferten
Programm (Leer- und Kommentarzeilen zählen nicht, Einstellungen im Schaltschrank auch nicht).
„Neu beginnen“ stellt den gelieferten Stand wieder her. Hilfreich: Querverweise, Beobachten,
Haltepunkte und die Compiler-Warnung bei Mehrfachzuweisungen.

## Erweiterungen

Eine **Erweiterung** baut auf einem gelösten Auftrag auf: Du beginnst mit deiner eigenen Lösung
des Vorgängers (ohne eigene Lösung mit der gelieferten). Dessen Tests laufen als
**Regressionstests** mit („Regression: …“) – die neue Funktion darf nichts Bestehendes brechen.
