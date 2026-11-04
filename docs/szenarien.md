# Szenarien – Prüfläufe mit Zeitleiste

Im Sandkasten gibt es den Tab **„Szenarien“**. Ein Szenario ist ein Prüflauf für die eigene Anlage:
Was passiert wann, und welche Regeln müssen trotzdem gelten?

## Ablauf

Jedes Ereignis hat einen Zeitpunkt in Sekunden. Ereignisse bei **0 s** legen den Startzustand fest.

| Ereignis         | Wirkung                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Bedienen         | Taster, Schalter, Not-Halt, Wahlschalter (0/Hand/Auto) oder Poti (0…100)                          |
| Störung          | Sensor dauernd 0/1, Drahtbruch, Zylinder klemmt, Band blockiert – bis Ende oder bis zu einer Zeit |
| Stromausfall     | Die Steuerung ist bis zu einer Zeit ohne Spannung und startet danach neu (OB100)                  |
| Teil einlegen    | Ein Werkstück (Werkstoff, Farbe, Größe) fällt von oben auf ein Bauteil                            |
| Magazin gibt aus | Ein Magazin gibt sofort ein Teil aus                                                              |
| Füllstand setzen | Ein Tank hat plötzlich den angegebenen Füllstand (Leck, Nachfüllen)                               |

Das Feld **„+“** hinter der Zeit ist ein **Zufallsversatz**: Das Ereignis kommt je Seed bis zu so
viele Sekunden später. So tritt eine Störung nicht immer an derselben Stelle im Zyklus auf. Mit
mehreren Startwerten (Seeds) läuft das Szenario mehrmals mit verschiedenen Zufallswerten. Eine
Störung mit Ende wird als Ganzes verschoben.

Die **Zeitleiste** zeigt alle Ereignisse: Marken für Zeitpunkte, Balken für die Dauer von Störungen
und Stromausfällen, helle Flächen für den Zufallsbereich. Beim Abspielen läuft eine Linie mit.

## Regeln

Dieselben Regeln wie beim Veröffentlichen, dazu zwei für Abläufe mit Störungen:

- **ab Zeitpunkt aus**: ein Ausgang ist ab einer Zeit bis zum Ende aus (z. B. Band nach Not-Halt)
- **in Zeitraum an**: ein Ausgang ist in einem Zeitraum durchgehend an (z. B. Störlampe)

Bei Ereignissen mit Zufallsversatz sollten Regelzeiten genug Abstand lassen.

## Abspielen, prüfen, weitergeben

- **▶ Abspielen** wählt das Szenario in der Simulationsleiste und startet es: Du siehst Anlage,
  Signale und Programm live. In der Simulationsleiste kannst du auch direkt zwischen „Freier Lauf“
  und den Szenarien wechseln.
- **✓ Prüfen** rechnet das Szenario für jeden Seed mit deinem Programm durch und zeigt jede Regel
  mit ✓ oder ✗.
- Szenarien werden mit der Anlage gespeichert (auch in der `.anlage`-Datei). **Exportieren** schreibt
  ein einzelnes Szenario als `.szenario`-Datei; **Importieren** übernimmt es in eine Anlage mit
  denselben Kennzeichnungen. Verweise auf fehlende Bauteile werden rot angezeigt.
- **Als Auftrag veröffentlichen** übernimmt alle Szenarien als Testfälle. Das Datenblatt des Auftrags
  nennt den Ablauf jedes Testfalls.
