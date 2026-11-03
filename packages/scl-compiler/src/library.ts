import type { CodeBlock, PlcProject, VarDecl } from '@zyklus/sim-core';

/**
 * Technologie-Bibliothek: fertige, geschützte FBs (in SCL geschrieben), die der Compiler
 * dazunimmt, sobald ein Projekt sie verwendet (Instanz-DB oder Multiinstanz) und selbst
 * keinen Baustein dieses Namens hat. Sie zählen nicht zur Programmgröße.
 */

const v = (name: string, type: string, init?: string, comment?: string): VarDecl => ({
  name,
  type,
  ...(init !== undefined ? { init } : {}),
  ...(comment ? { comment } : {}),
});

/**
 * PID_Compact: PID-Regler mit Hand-/Automatikbetrieb, Stellwert als Analogwert (%) und als
 * Pulsweite, und Selbstoptimierung nach dem Zweipunkt-Verfahren (Schwingversuch).
 */
const PID_COMPACT: CodeBlock = {
  kind: 'FB',
  name: 'PID_Compact',
  number: 1130,
  lang: 'SCL',
  title: 'PID-Regler mit Selbstoptimierung',
  comment:
    'Stellwert Output in % (OutputLow…OutputHigh), Output_PWM als Pulsweite über PwmPeriod.\n' +
    'Tune (steigende Flanke) startet die Selbstoptimierung: Zweipunktbetrieb um den Sollwert,\n' +
    'aus Periodendauer und Amplitude der Schwingung werden Gain und Ti bestimmt.\n' +
    'State: 0 inaktiv (Reset), 2 Selbstoptimierung, 3 Automatik, 4 Handbetrieb.',
  protected: true,
  iface: {
    Input: [
      v('Setpoint', 'Real', undefined, 'Sollwert'),
      v('Input', 'Real', undefined, 'Istwert'),
      v('ManualEnable', 'Bool', undefined, 'Handbetrieb'),
      v('ManualValue', 'Real', undefined, 'Stellwert im Handbetrieb in %'),
      v('Reset', 'Bool', undefined, 'Regler inaktiv, Stellwert 0'),
      v('Tune', 'Bool', undefined, 'steigende Flanke: Selbstoptimierung starten'),
    ],
    Output: [
      v('Output', 'Real', undefined, 'Stellwert in %'),
      v('Output_PWM', 'Bool', undefined, 'Stellwert als Pulsweite'),
      v('State', 'Int', undefined, '0 inaktiv, 2 Selbstoptimierung, 3 Automatik, 4 Hand'),
      v('Error', 'Bool', undefined, 'Selbstoptimierung abgebrochen oder Grenzen ungültig'),
    ],
    Static: [
      v('Gain', 'Real', '1.0', 'Proportionalbeiwert'),
      v('Ti', 'Real', '20.0', 'Integrationszeit in s (0 = kein I-Anteil)'),
      v('Td', 'Real', '0.0', 'Differenzierzeit in s'),
      v('OutputLow', 'Real', '0.0', 'untere Stellwertgrenze in %'),
      v('OutputHigh', 'Real', '100.0', 'obere Stellwertgrenze in %'),
      v('PwmPeriod', 'Real', '2.0', 'Periodendauer von Output_PWM in s'),
      v('TuneHyst', 'Real', '1.0', 'Schalthysterese der Selbstoptimierung (Istwert-Einheit)'),
      v('TuneTimeout', 'Real', '3600.0', 'Abbruch der Selbstoptimierung nach s'),
      v('sInit', 'Bool'),
      v('sMem', 'LReal'),
      v('sSum', 'Real'),
      v('sLastIn', 'Real'),
      v('sPwm', 'Real'),
      v('sTuneOld', 'Bool'),
      v('sRelay', 'Bool'),
      v('sCross', 'Int'),
      v('sT', 'Real'),
      v('sT0', 'Real'),
      v('sMax', 'Real'),
      v('sMin', 'Real'),
    ],
    Temp: [v('dt', 'Real'), v('e', 'Real'), v('p', 'Real'), v('d', 'Real'), v('a', 'Real')],
  },
  source: `#dt := LREAL_TO_REAL(RUNTIME(MEM := #sMem));
IF NOT #sInit THEN
    #sInit := TRUE;
    #dt := 0.0;
    #sLastIn := #Input;
    #State := 3;
END_IF;
IF #dt > 1.0 THEN
    #dt := 1.0;
END_IF;

IF #OutputHigh <= #OutputLow THEN
    #Error := TRUE;
    #Output := 0.0;
ELSIF #Reset THEN
    #State := 0;
    #Output := 0.0;
    #sSum := 0.0;
ELSIF #ManualEnable THEN
    #State := 4;
    #Output := LIMIT(MN := #OutputLow, IN := #ManualValue, MX := #OutputHigh);
    #sSum := #Output - #Gain * (#Setpoint - #Input);
ELSE
    IF #Tune AND NOT #sTuneOld THEN
        #State := 2;
        #Error := FALSE;
        #sRelay := #Input < #Setpoint;
        #sCross := 0;
        #sT := 0.0;
    END_IF;
    IF #State = 2 THEN
        // Zweipunktbetrieb: Schwingung um den Sollwert messen
        #sT := #sT + #dt;
        #sMax := MAX(IN1 := #sMax, IN2 := #Input);
        #sMin := MIN(IN1 := #sMin, IN2 := #Input);
        IF #sRelay AND #Input > #Setpoint + #TuneHyst THEN
            #sRelay := FALSE;
            #sCross := #sCross + 1;
            IF #sCross = 1 THEN
                #sT0 := #sT;
                #sMax := #Input;
                #sMin := #Input;
            ELSIF #sCross = 3 THEN
                // zwei volle Perioden gemessen
                #a := (#sMax - #sMin) / 2.0;
                IF #a > 0.0 THEN
                    #p := 4.0 * (#OutputHigh - #OutputLow) / 2.0 / (3.14159 * #a);
                    #Gain := 0.35 * #p;
                    #Ti := 1.2 * (#sT - #sT0) / 2.0;
                    #Td := 0.0;
                    #State := 3;
                    #sSum := (#OutputHigh + #OutputLow) / 2.0;
                    #sLastIn := #Input;
                ELSE
                    #Error := TRUE;
                    #State := 3;
                END_IF;
            END_IF;
        ELSIF NOT #sRelay AND #Input < #Setpoint - #TuneHyst THEN
            #sRelay := TRUE;
        END_IF;
        IF #sT > #TuneTimeout THEN
            #Error := TRUE;
            #State := 3;
        END_IF;
        IF #sRelay THEN
            #Output := #OutputHigh;
        ELSE
            #Output := #OutputLow;
        END_IF;
    END_IF;
    IF #State <> 2 THEN
        #State := 3;
        #e := #Setpoint - #Input;
        #p := #Gain * #e;
        IF #Td > 0.0 AND #dt > 0.0 THEN
            #d := -#Gain * #Td * (#Input - #sLastIn) / #dt;
        ELSE
            #d := 0.0;
        END_IF;
        // I-Anteil nur, solange der Stellwert nicht in Richtung der Abweichung anschlägt
        IF #Ti <= 0.0 THEN
            #sSum := 0.0;
        ELSIF NOT ((#p + #sSum + #d >= #OutputHigh AND #e > 0.0)
                   OR (#p + #sSum + #d <= #OutputLow AND #e < 0.0)) THEN
            #sSum := #sSum + #Gain * #e * #dt / #Ti;
        END_IF;
        #sSum := LIMIT(MN := #OutputLow, IN := #sSum, MX := #OutputHigh);
        #Output := LIMIT(MN := #OutputLow, IN := #p + #sSum + #d, MX := #OutputHigh);
    END_IF;
END_IF;
#sTuneOld := #Tune;
#sLastIn := #Input;

// Pulsweite
IF #PwmPeriod > 0.0 AND #OutputHigh > #OutputLow THEN
    #sPwm := #sPwm + #dt;
    IF #sPwm >= #PwmPeriod THEN
        #sPwm := 0.0;
    END_IF;
    #Output_PWM := #sPwm < #PwmPeriod * (#Output - #OutputLow) / (#OutputHigh - #OutputLow);
ELSE
    #Output_PWM := FALSE;
END_IF;`,
};

export const LIBRARY: readonly CodeBlock[] = [PID_COMPACT];

const unq = (s: string) =>
  s
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .toLowerCase();

/** Bibliotheksbaustein zu einem Namen (Groß-/Kleinschreibung egal) */
export function libraryBlock(name: string): CodeBlock | undefined {
  const k = unq(name);
  return LIBRARY.find((b) => b.name.toLowerCase() === k);
}

/**
 * Bibliotheksbausteine, die das Projekt verwendet und nicht selbst definiert
 * (Instanz-DB `of`, Typ einer Variable in Schnittstelle oder Global-DB).
 */
export function usedLibrary(project: PlcProject): CodeBlock[] {
  const own = new Set(project.blocks.map((b) => b.name.toLowerCase()));
  const used = new Set<string>();
  const note = (type: string) => {
    const b = libraryBlock(type);
    if (b && !own.has(b.name.toLowerCase())) used.add(b.name);
  };
  for (const b of project.blocks) {
    if (b.kind === 'IDB') note(b.of);
    else if (b.kind === 'DB') b.vars.forEach((x) => note(x.type));
    else Object.values(b.iface).forEach((rows) => rows?.forEach((x) => note(x.type)));
  }
  return LIBRARY.filter((b) => used.has(b.name));
}

/** Projekt mit den verwendeten Bibliotheksbausteinen */
export function withLibrary(project: PlcProject): PlcProject {
  const lib = usedLibrary(project);
  return lib.length ? { ...project, blocks: [...project.blocks, ...lib] } : project;
}
