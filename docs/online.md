# Online-Funktionen – Testen wie am Gerät

Alle Funktionen arbeiten mit der laufenden Simulation (Handbetrieb, Testfall oder Sandkasten).

## Beobachten

Über dem Programmeditor schaltet **👓 Beobachten ein/aus** die Anzeige um (wie die Brille im
TIA-Portal; die Einstellung bleibt gespeichert). Solange die Simulation läuft oder angehalten ist,
stehen die Werte direkt im Programm – beim Anhalten oder im Einzelzyklus der Stand dieses Zyklus.

- **SCL**: rechts neben jeder Zeile eine Spalte mit allen Operanden der Zeile und ihren Werten
  (**1 grün**, **0 blau**, Zahlen gelb). Bedingungen von `IF`, `ELSIF`, `WHILE` und `UNTIL` sind
  eingefärbt: grün erfüllt, blau nicht erfüllt.
- **KOP**: der **Stromfluss** von der linken Schiene – Kontakte, Leitungen, Boxen und Spulen grün,
  wo Strom fließt, blau (gestrichelt), wo nicht. An den Pins der Boxen stehen die Werte, bei Zeiten
  und Zählern auch `ET`, `Q`, `CV` aus dem Instanz-DB.
- **FUP**: Werte an Operanden und Pins, **Verbindungslinien** grün (1) bzw. blau gestrichelt (0);
  unbelegte Ausgänge von Zeiten und Zählern zeigen ihren Wert aus dem Instanz-DB.
- **GRAPH**: Der aktive Schritt ist grün umrandet.
- **FB**: Lokale Variablen (`#…`) zeigt das Spiel aus dem Instanz-DB der gewählten
  **Aufrufumgebung** (Auswahl neben dem Schalter). In einer **FC** sind nur globale Operanden
  sichtbar.

Lässt sich ein Wert nicht bestimmen (z. B. eine Flanke mitten im Strompfad), bleibt die Stelle
neutral grau statt falsch eingefärbt.

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
Wird ein Baustein in FUP, KOP oder GRAPH umgeschrieben, zählt sein übersetzter Code – ein
Sprachwechsel ist also ein Umschreiben.
„Neu beginnen“ stellt den gelieferten Stand wieder her. Hilfreich: Querverweise, Beobachten,
Haltepunkte und die Compiler-Warnung bei Mehrfachzuweisungen.

## Erweiterungen

Eine **Erweiterung** baut auf einem gelösten Auftrag auf: Du beginnst mit deiner eigenen Lösung
des Vorgängers (ohne eigene Lösung mit der gelieferten). Dessen Tests laufen als
**Regressionstests** mit („Regression: …“) – die neue Funktion darf nichts Bestehendes brechen.

## Bibliothek

Eigene FBs und FCs legst du mit 📚 neben dem Bausteinnamen in der **Bibliothek** ab, PLC-Datentypen
im Reiter Datenbausteine. Jedes Ablegen ist eine neue **Version**. Über „+ Baustein → Aus
Bibliothek …“ fügst du in einem späteren Auftrag die neueste Version ein; ein gleichnamiger
Baustein wird dabei aktualisiert. Solange ein eingefügter Baustein **unverändert** ist (Anzeige
„Bibliothek v2“), zählt er nicht zur Programmgröße – Wiederverwendung lohnt sich.

## Sprache

Oben im Posteingang wählst du **Deutsch** oder **English**. Übersetzt sind die Oberfläche, alle
Aufträge, die Meldungen und das Handbuch.
