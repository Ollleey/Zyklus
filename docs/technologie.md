# Technologie

Technologiebausteine sind fertige, **geschützte** FBs: Du siehst ihre Schnittstelle, nicht ihren
Code. Sie stehen in FUP und KOP unter **Technologie**, in SCL rufst du sie über einen Instanz-DB
auf. Sie zählen nicht zur Programmgröße, kosten aber Rechenzeit wie eigener Code.

Die **Konfiguration** steht im Instanz-DB (Reiter Datenbausteine, DB aufklappen): Startwerte der
Parameter. Leere Felder nutzen die Vorgabe. In der SCL-Quelle stehen die Startwerte im
Anweisungsteil des DB (`Gain := 2.5;`).

## PID_Compact

PID-Regler mit Hand- und Automatikbetrieb und Selbstoptimierung.

```
"Ofen_PID"(Setpoint := "Sollwert", Input := "Temperatur",
           Tune := "Optimieren", Output => "Heizung");
```

| Eingang      | Bedeutung                                      |
| ------------ | ---------------------------------------------- |
| Setpoint     | Sollwert                                       |
| Input        | Istwert (gleiche Einheit wie der Sollwert)     |
| ManualEnable | Handbetrieb: Output = ManualValue              |
| ManualValue  | Stellwert im Handbetrieb in %                  |
| Reset        | Regler inaktiv, Output = 0, I-Anteil gelöscht  |
| Tune         | steigende Flanke startet die Selbstoptimierung |

| Ausgang    | Bedeutung                                                                |
| ---------- | ------------------------------------------------------------------------ |
| Output     | Stellwert in % (OutputLow … OutputHigh)                                  |
| Output_PWM | Stellwert als Pulsweite für einen Schaltausgang (PwmPeriod)              |
| State      | 0 inaktiv, 2 Selbstoptimierung, 3 Automatik, 4 Handbetrieb               |
| Error      | Selbstoptimierung abgebrochen (Zeitüberschreitung) oder Grenzen ungültig |

| Parameter   | Vorgabe | Bedeutung                                               |
| ----------- | ------- | ------------------------------------------------------- |
| Gain        | 1.0     | Proportionalbeiwert                                     |
| Ti          | 20.0    | Integrationszeit in s (0 = kein I-Anteil)               |
| Td          | 0.0     | Differenzierzeit in s (wirkt auf den Istwert)           |
| OutputLow   | 0.0     | untere Stellwertgrenze in %                             |
| OutputHigh  | 100.0   | obere Stellwertgrenze in %                              |
| PwmPeriod   | 2.0     | Periodendauer von Output_PWM in s                       |
| TuneHyst    | 1.0     | Schalthysterese der Selbstoptimierung (Istwert-Einheit) |
| TuneTimeout | 3600.0  | Abbruch der Selbstoptimierung nach s                    |

**Regelgesetz:** Output = Gain · (e + 1/Ti · ∫e dt) − Gain · Td · dInput/dt mit e = Setpoint − Input.
Der I-Anteil ist auf die Stellwertgrenzen begrenzt (kein Aufziehen). Die Zeit zwischen zwei
Aufrufen misst der Baustein selbst – er darf im OB1 oder in einem Weckalarm-OB laufen.

**Selbstoptimierung:** Der Regler schaltet den Stellwert zwischen OutputHigh und OutputLow, sobald
der Istwert den Sollwert ± TuneHyst überschreitet. Nach einer Einschwingperiode misst er zwei volle
Schwingungen: aus Periodendauer Tu und Amplitude a ergibt sich die kritische Verstärkung
Ku = 4 · d / (π · a) mit d = halber Stellbereich. Daraus: **Gain = 0,35 · Ku**, **Ti = 1,2 · Tu**,
Td = 0. Danach regelt er in Automatik weiter. Die ermittelten Werte stehen im Instanz-DB
(`"Ofen_PID".Gain`) – übernimm sie als Startwerte, damit sie nach dem Laden gelten.

Tipps: TuneHyst etwas größer als das Rauschen des Istwerts wählen. Bei langsamen Strecken dauert
die Optimierung mehrere Minuten Anlagenzeit – im Testpult mit ×10 oder ×100 laufen lassen.

## Schneller Zähler (HSC)

Auf der **DI 8 HF** lässt sich Kanal 0 als schneller Zähler einstellen (Baugruppe im Schaltschrank
anklicken, „Kanal 0 als schneller Zähler“). Die Baugruppe zählt dann jede steigende Flanke im
1-ms-Raster – unabhängig vom Zyklus und von der Eingangsverzögerung.

| Adresse (Standard) | Inhalt                                            |
| ------------------ | ------------------------------------------------- |
| `%ID112`           | Zählwert (DInt), läuft bei 2³¹ über               |
| `%Q112.0`          | 1 = Zähler auf 0 setzen (solange das Bit ansteht) |

Die Byteadresse ist einstellbar (0…124). Der Kanal bleibt zusätzlich ein normaler Eingang
(`%I…0` mit Eingangsverzögerung), ein Prozessalarm ist weiterhin möglich.

```
%Q112.0 := "Start" AND NOT "Start_alt";   // mit der Startflanke zurücksetzen
"Start_alt" := "Start";
"Ventil" := %ID112 < 120;
```

## PWM und PTO (DQ 4 HF)

Jeder Kanal der **DQ 4 HF** ist ein normaler Ausgang oder ein schneller Ausgang, dessen Signal die
Baugruppe selbst erzeugt. Das Programm schreibt nur ein **Stellwort** je Kanal (Standard ab
`%QW120`, Kanal n bei `%QW120 + 2·n`, Anfangsadresse einstellbar):

- **PWM:** feste Periodendauer (ms, im Schaltschrank), Tastverhältnis aus dem Stellwort in
  Promille (0…1000). `%QW120 := 250;` → 25 % ein.
- **PTO:** Impulsfolge mit der Frequenz aus dem Stellwort in Hz (0…500), Tastverhältnis 50 %.

Bei CPU-STOP sind schnelle Ausgänge aus. Das Prozessabbild-Bit des Kanals hat keine Wirkung.

## NORM_X und SCALE_X

Skalierung als Box-Paar (FUP/KOP unter Übertragen, in SCL als Funktion):
`NORM_X(MIN := 0, VALUE := "Rohwert", MAX := 27648)` liefert 0.0 … 1.0,
`SCALE_X(MIN := 0.0, VALUE := #norm, MAX := 200.0)` bildet auf den Messbereich ab.
