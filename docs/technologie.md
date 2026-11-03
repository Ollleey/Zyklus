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

## NORM_X und SCALE_X

Skalierung als Box-Paar (FUP/KOP unter Übertragen, in SCL als Funktion):
`NORM_X(MIN := 0, VALUE := "Rohwert", MAX := 27648)` liefert 0.0 … 1.0,
`SCALE_X(MIN := 0.0, VALUE := #norm, MAX := 200.0)` bildet auf den Messbereich ab.
