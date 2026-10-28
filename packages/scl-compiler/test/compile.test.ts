import { describe, expect, it } from 'vitest';
import { Simulation } from '@zyklus/sim-core';
import { DB, IDB, compile, cpuFor } from './harness';

describe('Bitlogik und Selbsthaltung', () => {
  it('Förderband Start/Stopp mit Selbsthaltung (Stopp als Öffner)', () => {
    const cpu = cpuFor('"Motor" := ("Start" OR "Motor") AND "Stopp";');
    const step = (t: number, start: boolean, stopp: boolean) => {
      cpu.setInput('%I0.0', start);
      cpu.setInput('%I0.1', stopp);
      cpu.scan(t);
      return cpu.read('%Q0.0');
    };
    expect(step(0, false, true)).toBe(false);
    expect(step(1, true, true)).toBe(true);
    expect(step(2, false, true)).toBe(true);
    expect(step(3, false, false)).toBe(false);
    expect(step(4, true, false)).toBe(false);
  });

  it('XOR, NOT und Klammern; Namen ohne Anführungszeichen', () => {
    const cpu = cpuFor('Lampe := NOT (Start XOR Stopp);');
    for (const [a, b] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      cpu.setInput('%I0.0', a);
      cpu.setInput('%I0.1', b);
      cpu.scan(0);
      expect(cpu.read('%Q0.1')).toBe(a === b);
    }
  });

  it('absolute Adressen mit TIA-Typen (%IW = Word, implizit nach Int)', () => {
    const cpu = cpuFor('%Q1.3 := %I2.0 AND %M5.1; %MW100 := %IW10 + 1; %MB7 := %IB3;');
    cpu.setInput('%I2.0', true);
    cpu.setInput('%M5.1', true);
    cpu.setInput('%IW10', 41);
    cpu.setInput('%IB3', 200);
    cpu.scan(0);
    expect(cpu.read('%Q1.3')).toBe(true);
    expect(cpu.read('%MW100')).toBe(42);
    expect(cpu.read('%MB7')).toBe(200);
  });

  it('REGION gliedert, ohne Code zu erzeugen', () => {
    const r = compile('REGION Band ansteuern\n  "Motor" := "Start";\nEND_REGION');
    expect(r.ok).toBe(true);
    expect(r.program!.code).toHaveLength(1);
    expect(r.statementCount).toBe(1);
  });
});

describe('Variablen und Typen', () => {
  it('Daten im Global-DB bleiben erhalten, Temp nicht', () => {
    const cpu = cpuFor(
      `#tmp := #tmp + 1;
       "Daten".zaehler := "Daten".zaehler + #tmp;
       "Zahl" := "Daten".zaehler;`,
      { blocks: [DB('Daten', [['zaehler', 'Int', '10']])], temp: [['tmp', 'Int']] },
    );
    cpu.scan(0);
    cpu.scan(1);
    cpu.scan(2);
    expect(cpu.read('%MW10')).toBe(13);
  });

  it('Konstanten werden eingesetzt', () => {
    const cpu = cpuFor('"Lampe" := "Zahl" > GRENZE; "Wert" := FAKTOR * 2;', {
      constants: [
        ['GRENZE', 'Int', '100'],
        ['FAKTOR', 'Real', '2.5'],
      ],
    });
    cpu.setInput('%MW10', 101);
    cpu.scan(0);
    expect(cpu.read('%Q0.1')).toBe(true);
    expect(cpu.read('%MD24', 'REAL')).toBe(5);
  });

  it('implizite Erweiterung Int → DInt → Real', () => {
    const cpu = cpuFor(
      `#d := #i;
       "Gross" := #d * 100000;
       "Wert" := #i / 2;       // Int-Division, dann nach Real`,
      {
        temp: [
          ['i', 'Int', '7'],
          ['d', 'DInt'],
        ],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MD20')).toBe(700000);
    expect(cpu.read('%MD24', 'REAL')).toBe(3);
  });

  it('gemischte Ausdrücke rechnen im größeren Typ', () => {
    const cpu = cpuFor('"Wert" := #i / 2.0; "Gross" := #i + DINT#100000;', {
      temp: [['i', 'Int', '7']],
    });
    cpu.scan(0);
    expect(cpu.read('%MD24', 'REAL')).toBe(3.5);
    expect(cpu.read('%MD20')).toBe(100007);
  });

  it('Int-Überlauf wie echt', () => {
    const cpu = cpuFor('#i := #i + 1; "Zahl" := #i;', { temp: [['i', 'Int', '32767']] });
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(-32768);
  });

  it('Literale passen sich dem Ziel an (DInt, Real)', () => {
    const cpu = cpuFor('"Gross" := 40000 + 1; "Wert" := 1 + 2;');
    cpu.scan(0);
    expect(cpu.read('%MD20')).toBe(40001);
    expect(cpu.read('%MD24', 'REAL')).toBe(3);
  });

  it('Word ↔ Int implizit (Bitmuster)', () => {
    const cpu = cpuFor('"Muster" := "Zahl"; "Sollwert" := "Muster";');
    cpu.setInput('%MW10', -1);
    cpu.scan(0);
    expect(cpu.read('%MW30', 'WORD')).toBe(0xffff);
    expect(cpu.read('%QW64')).toBe(-1);
  });

  it('Wortlogik und Schieben', () => {
    const cpu = cpuFor(`
      "Muster" := SHL(IN := 16#00F0, N := 4) OR 16#0001;
      %MW50 := SHR(WORD#16#8000, 15) XOR NOT 16#FFFE;
      %MB60 := SHL(IN := B#16#81, N := 1);`);
    cpu.scan(0);
    expect(cpu.read('%MW30', 'WORD')).toBe(0x0f01);
    expect(cpu.read('%MW50', 'WORD')).toBe(0);
    expect(cpu.read('%MB60', 'BYTE')).toBe(0x02);
  });
});

describe('Kontrollstrukturen', () => {
  it('IF / ELSIF / ELSE', () => {
    const cpu = cpuFor(`
      IF "Zahl" < 0 THEN "Sollwert" := -1;
      ELSIF "Zahl" = 0 THEN "Sollwert" := 0;
      ELSIF "Zahl" < 100 THEN "Sollwert" := 1;
      ELSE "Sollwert" := 2;
      END_IF;`);
    const out = [-5, 0, 50, 100].map((z) => {
      cpu.setInput('%MW10', z);
      cpu.scan(0);
      return cpu.read('%QW64');
    });
    expect(out).toEqual([-1, 0, 1, 2]);
  });

  it('IF ohne ELSE lässt Ziel unverändert', () => {
    const cpu = cpuFor(
      'IF "Start" THEN "Motor" := TRUE; END_IF; IF "Stopp" THEN "Motor" := FALSE; END_IF;',
    );
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.setInput('%I0.0', false);
    cpu.scan(1);
    expect(cpu.read('%Q0.0')).toBe(true);
    cpu.setInput('%I0.1', true);
    cpu.scan(2);
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('CASE mit Einzelwerten, Listen, Bereichen und ELSE', () => {
    const cpu = cpuFor(`
      CASE "Zahl" OF
        0: "Sollwert" := 100;
        1, 3: "Sollwert" := 200;
        5..9: "Sollwert" := 300;
        -10..-1: "Sollwert" := -1;
      ELSE
        "Sollwert" := 999;
      END_CASE;`);
    const out = [0, 1, 2, 3, 5, 9, 10, -1, -10, -11].map((z) => {
      cpu.setInput('%MW10', z);
      cpu.scan(0);
      return cpu.read('%QW64');
    });
    expect(out).toEqual([100, 200, 999, 200, 300, 300, 999, -1, -1, 999]);
  });

  it('CASE ohne ELSE: kein Zweig → nichts passiert', () => {
    const cpu = cpuFor('CASE "Zahl" OF 1: "Sollwert" := 1; 2: "Sollwert" := 2; END_CASE;');
    cpu.setInput('%MW10', 2);
    cpu.scan(0);
    cpu.setInput('%MW10', 7);
    cpu.scan(1);
    expect(cpu.read('%QW64')).toBe(2);
  });

  it('Schrittkette mit CASE, Schritt im Global-DB', () => {
    const cpu = cpuFor(
      `CASE "Kette".Schritt OF
        0: IF "Start" THEN "Kette".Schritt := 1; END_IF;
        1: "Motor" := TRUE;
           IF "Sensor" THEN "Kette".Schritt := 2; END_IF;
        2: "Motor" := FALSE;
           "Kette".Schritt := 0;
      END_CASE;
      "Zahl" := "Kette".Schritt;`,
      { blocks: [DB('Kette', [['Schritt', 'Int']])] },
    );
    const step = (t: number, inputs: Record<string, boolean> = {}) => {
      cpu.setInput('%I0.0', !!inputs.start);
      cpu.setInput('%I0.2', !!inputs.sensor);
      cpu.scan(t);
      return [cpu.read('%MW10'), cpu.read('%Q0.0')];
    };
    expect(step(0)).toEqual([0, false]);
    expect(step(1, { start: true })).toEqual([1, false]);
    expect(step(2)).toEqual([1, true]);
    expect(step(3, { sensor: true })).toEqual([2, true]);
    expect(step(4)).toEqual([0, false]);
  });

  it('FOR mit und ohne BY, auch rückwärts', () => {
    const cpu = cpuFor(
      `FOR #i := 1 TO 10 DO #s := #s + #i; END_FOR;
      "Zahl" := #s;
      #s := 0;
      FOR #i := 10 TO 1 BY -3 DO #s := #s * 10 + #i; END_FOR;  // 10, 7, 4, 1
      "Sollwert" := #s;`,
      {
        temp: [
          ['i', 'Int'],
          ['s', 'Int'],
        ],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(55);
    expect(cpu.read('%QW64')).toBe(((10 * 10 + 7) * 10 + 4) * 10 + 1);
  });

  it('FOR-Endwert wird nur einmal ausgewertet', () => {
    const cpu = cpuFor(
      `#n := 3;
      FOR #i := 1 TO #n DO #n := 10; #s := #s + 1; END_FOR;
      "Zahl" := #s;`,
      {
        temp: [
          ['i', 'Int'],
          ['n', 'Int'],
          ['s', 'Int'],
        ],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(3);
  });

  it('WHILE, REPEAT, EXIT, CONTINUE', () => {
    const cpu = cpuFor(
      `WHILE TRUE DO
        #i := #i + 1;
        IF #i MOD 2 = 0 THEN CONTINUE; END_IF;
        IF #i > 9 THEN EXIT; END_IF;
        #s := #s + #i;   // 1+3+5+7+9
      END_WHILE;
      "Zahl" := #s;
      #i := 0;
      REPEAT #i := #i + 5; UNTIL #i >= 12 END_REPEAT;
      "Sollwert" := #i;`,
      {
        temp: [
          ['i', 'Int'],
          ['s', 'Int'],
        ],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(25);
    expect(cpu.read('%QW64')).toBe(15);
  });

  it('EXIT verlässt nur die innere Schleife', () => {
    const cpu = cpuFor(
      `FOR #i := 1 TO 3 DO
        FOR #j := 1 TO 100 DO
          IF #j > 2 THEN EXIT; END_IF;
          #s := #s + 1;
        END_FOR;
      END_FOR;
      "Zahl" := #s;`,
      {
        temp: [
          ['i', 'Int'],
          ['j', 'Int'],
          ['s', 'Int'],
        ],
      },
    );
    cpu.scan(0);
    expect(cpu.read('%MW10')).toBe(6);
  });

  it('RETURN beendet den Baustein', () => {
    const cpu = cpuFor('"Motor" := TRUE; IF "Start" THEN RETURN; END_IF; "Lampe" := TRUE;');
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(false);
  });

  it('Endlosschleife → Zykluszeitüberschreitung → STOP', () => {
    const cpu = cpuFor('"Motor" := TRUE; WHILE "Start" DO ; END_WHILE;');
    const sim = new Simulation([cpu]);
    sim.run(3);
    expect(cpu.mode).toBe('RUN');
    cpu.setInput('%I0.0', true);
    sim.run(1);
    expect(cpu.mode).toBe('STOP');
    expect(cpu.read('%Q0.0')).toBe(false);
  });
});

describe('Systembausteine mit Instanz-DB', () => {
  it('IEC_TIMER: "DB".TON(…) mit Ausgangszuweisung und Elementzugriff', () => {
    const cpu = cpuFor(
      `"T1_DB".TON(IN := "Start", PT := T#100ms, Q => "Daten".fertig, ET => "Dauer");
       "Motor" := "Daten".fertig;
       "Lampe" := "T1_DB".Q;`,
      { blocks: [IDB('T1_DB', 'IEC_TIMER'), DB('Daten', [['fertig', 'Bool']])] },
    );
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.scan(60);
    expect(cpu.read('%MD40', 'TIME')).toBe(60);
    expect(cpu.read('%Q0.0')).toBe(false);
    cpu.scan(100);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('Elementzugriff vor dem Aufruf kennt bereits die Anweisung', () => {
    const cpu = cpuFor(
      `"Lampe" := "T_DB".Q;
       "T_DB".TOF(IN := "Start", PT := T#10ms);`,
      { blocks: [IDB('T_DB', 'IEC_TIMER')] },
    );
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.scan(1);
    expect(cpu.read('%Q0.1')).toBe(true);
  });

  it('Entprellen mit typisierten Instanz-DBs TON_TIME / TOF_TIME', () => {
    const cpu = cpuFor(
      `"Ein"(IN := "Sensor", PT := T#20ms);
       "Aus"(IN := "Ein".Q, PT := T#20ms);
       "Lampe" := "Aus".Q;`,
      { blocks: [IDB('Ein', 'TON_TIME'), IDB('Aus', 'TOF_TIME')] },
    );
    const sim = new Simulation([cpu], {
      // Prellen 0..15 ms, dann stabil bis 100 ms
      beforeScans: (t) => cpu.setInput('%I0.2', t < 15 ? t % 3 === 0 : t < 100),
    });
    sim.run(30);
    expect(cpu.read('%Q0.1')).toBe(false);
    sim.run(10);
    expect(cpu.read('%Q0.1')).toBe(true);
    sim.run(70);
    expect(cpu.read('%Q0.1')).toBe(true);
    sim.run(20);
    expect(cpu.read('%Q0.1')).toBe(false);
  });

  it('Zähler: CTU_INT, IEC_COUNTER.CTD, CTUD_INT', () => {
    const cpu = cpuFor(
      `"Z"(CU := "Sensor", R := "Stopp", PV := 3);
       "Ab".CTD(CD := "Sensor", LD := "Start", PV := 2);
       "UD"(CU := "Sensor", CD := FALSE, PV := 5, QU => "Lampe");
       "Motor" := "Z".Q;
       "Zahl" := "Z".CV;
       "Sollwert" := "Ab".CV;`,
      { blocks: [IDB('Z', 'CTU_INT'), IDB('Ab', 'IEC_COUNTER'), IDB('UD', 'CTUD_INT')] },
    );
    const pulse = (t: number) => {
      cpu.setInput('%I0.2', true);
      cpu.scan(t);
      cpu.setInput('%I0.2', false);
      cpu.scan(t + 1);
    };
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.setInput('%I0.0', false);
    pulse(1);
    pulse(3);
    pulse(5);
    expect(cpu.read('%MW10')).toBe(3);
    expect(cpu.read('%Q0.0')).toBe(true);
    expect(cpu.read('%QW64')).toBe(-1);
    expect(cpu.readInstance('UD', 'CV')).toBe(3);
    expect(cpu.readInstance('Ab', 'QD')).toBe(true);
    cpu.setInput('%I0.1', true);
    cpu.scan(7);
    expect(cpu.read('%MW10')).toBe(0);
  });

  it('R_TRIG / F_TRIG', () => {
    const cpu = cpuFor(
      `"Hoch"(CLK := "Start");
       "Runter"(CLK := "Start");
       IF "Hoch".Q OR "Runter".Q THEN "Daten".n := "Daten".n + 1; END_IF;
       "Zahl" := "Daten".n;`,
      { blocks: [IDB('Hoch', 'R_TRIG'), IDB('Runter', 'F_TRIG'), DB('Daten', [['n', 'Int']])] },
    );
    [false, true, true, false, true, false].forEach((v, t) => {
      cpu.setInput('%I0.0', v);
      cpu.scan(t);
    });
    expect(cpu.read('%MW10')).toBe(4);
  });

  it('IEC_TIMER.TONR mit Reset', () => {
    const cpu = cpuFor(
      `"T".TONR(IN := "Start", R := "Stopp", PT := T#50ms);
       "Motor" := "T".Q;`,
      { blocks: [IDB('T', 'IEC_TIMER')] },
    );
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.scan(30);
    cpu.setInput('%I0.0', false);
    cpu.scan(40);
    cpu.setInput('%I0.0', true);
    cpu.scan(50);
    cpu.scan(70);
    expect(cpu.read('%Q0.0')).toBe(true);
    cpu.setInput('%I0.1', true);
    cpu.scan(71);
    expect(cpu.read('%Q0.0')).toBe(false);
  });

  it('Instanz als Variable im Global-DB ("Daten".T1(…) und "Daten".T2.TON(…))', () => {
    const cpu = cpuFor(
      `"Daten".T1(IN := "Start", PT := T#5ms);
       "Daten".T2.TON(IN := "Daten".T1.Q, PT := T#5ms);
       "Lampe" := "Daten".T2.Q;`,
      {
        blocks: [
          DB('Daten', [
            ['T1', 'TON_TIME'],
            ['T2', 'IEC_TIMER'],
          ]),
        ],
      },
    );
    cpu.setInput('%I0.0', true);
    for (let t = 0; t <= 10; t++) cpu.scan(t);
    expect(cpu.read('%Q0.1')).toBe(true);
  });
});

describe('Funktionen', () => {
  it('Analogwert: NORM_X / SCALE_X auf Real und Int', () => {
    const cpu = cpuFor(`
      "Wert" := SCALE_X(MIN := 0.0, VALUE := NORM_X(MIN := 0, VALUE := "Rohwert", MAX := 27648), MAX := 100.0);
      "Sollwert" := SCALE_X(MIN := 0, VALUE := "Wert" / 100.0, MAX := 27648);`);
    cpu.setInput('%IW64', 6912);
    cpu.scan(0);
    expect(cpu.read('%MD24', 'REAL')).toBeCloseTo(25, 5);
    expect(cpu.read('%QW64')).toBe(6912);
  });

  it('NORM_X direkt auf %IW (Word wird als Int gerechnet)', () => {
    const cpu = cpuFor('"Wert" := NORM_X(MIN := 0, VALUE := %IW64, MAX := 27648);');
    cpu.setInput('%IW64', 13824);
    cpu.scan(0);
    expect(cpu.read('%MD24', 'REAL')).toBe(0.5);
  });

  it('LIMIT, MIN, MAX (positional und benannt), ABS', () => {
    const cpu = cpuFor(`
      %MW0 := LIMIT(0, "Zahl", 100);
      %MW2 := MIN(IN1 := "Zahl", IN2 := 5, IN3 := -3);
      %MW4 := MAX("Zahl", 50);
      %MW6 := ABS("Zahl");
      "Wert" := MAX(1.5, 2);`);
    cpu.setInput('%MW10', -20);
    cpu.scan(0);
    expect([0, 2, 4, 6].map((b) => cpu.read(`%MW${b}`))).toEqual([0, -20, 50, 20]);
    expect(cpu.read('%MD24', 'REAL')).toBe(2);
  });

  it('SEL und MUX (mit INELSE)', () => {
    const cpu = cpuFor(`
      "Sollwert" := SEL(G := "Start", IN0 := 10, IN1 := 20);
      "Gross" := MUX(K := "Zahl", IN0 := 100, IN1 := 200, IN2 := 300, INELSE := -1);`);
    cpu.setInput('%I0.0', true);
    cpu.setInput('%MW10', 2);
    cpu.scan(0);
    expect(cpu.read('%QW64')).toBe(20);
    expect(cpu.read('%MD20')).toBe(300);
    cpu.setInput('%MW10', 3);
    cpu.scan(1);
    expect(cpu.read('%MD20')).toBe(-1);
  });

  it('Konvertierungen, ROUND, TRUNC', () => {
    const cpu = cpuFor(`
      "Wert" := INT_TO_REAL("Zahl") / 4.0;
      %MW0 := REAL_TO_INT("Wert");
      "Gross" := ROUND(2.5) + TRUNC(-2.7);
      "Sollwert" := WORD_TO_INT(16#FFFF);
      "Dauer" := DINT_TO_TIME("Gross" * 1000);`);
    cpu.setInput('%MW10', 10);
    cpu.scan(0);
    expect(cpu.read('%MD24', 'REAL')).toBe(2.5);
    expect(cpu.read('%MW0')).toBe(2);
    expect(cpu.read('%MD20')).toBe(0);
    expect(cpu.read('%QW64')).toBe(-1);
    expect(cpu.read('%MD40', 'TIME')).toBe(0);
  });

  it('Time-Arithmetik', () => {
    const cpu = cpuFor('"Dauer" := T#1s + T#250ms * 2 - "Dauer" / 2;');
    cpu.setInput('%MD40', 1000, 'TIME');
    cpu.scan(0);
    expect(cpu.read('%MD40', 'TIME')).toBe(1000);
  });
});

describe('Codequalität', () => {
  it('Ergebnis wird direkt ins Ziel geschrieben (keine überflüssigen MOVEs)', () => {
    expect(compile('"Motor" := "Start" AND "Stopp";').program!.code).toHaveLength(1);
    expect(compile('"Zahl" := "Zahl" + 1;').program!.code).toHaveLength(1);
  });

  it('Temporäre Hilfsvariablen werden wiederverwendet', () => {
    const r = compile(`
      "Motor" := ("Start" AND "Stopp") OR ("Sensor" AND "Lampe");
      "Lampe" := ("Start" OR "Stopp") AND ("Sensor" OR "Lampe");`);
    expect(r.program!.slots.filter((s) => s.name.startsWith('$'))).toHaveLength(2);
  });

  it('Programmgröße zählt Anweisungen', () => {
    const r = compile(`
      IF "Start" THEN
        "Motor" := TRUE;
      END_IF;
      "Lampe" := "Motor";`);
    expect(r.statementCount).toBe(3);
  });
});
