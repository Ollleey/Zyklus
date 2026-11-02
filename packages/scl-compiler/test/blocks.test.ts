import { describe, expect, it } from 'vitest';
import { Cpu, Simulation, type Block, type CodeBlock, type VarDecl } from '@zyklus/sim-core';
import {
  compileProject,
  compileSource,
  formatDiagnostic,
  projectToSource,
  sourceToProject,
  type CompileResult,
} from '../src';
import { IDB, TAGS } from './harness';

type Row = [name: string, type: string, init?: string];
const rows = (r: Row[] = []): VarDecl[] => r.map(([name, type, init]) => ({ name, type, init }));

function block(
  kind: CodeBlock['kind'],
  name: string,
  source: string,
  iface: Partial<Record<keyof CodeBlock['iface'], Row[]>> = {},
  extra: Partial<CodeBlock> = {},
): CodeBlock {
  return {
    kind,
    name,
    number: kind === 'OB' ? 1 : 1,
    lang: 'SCL',
    iface: Object.fromEntries(Object.entries(iface).map(([k, v]) => [k, rows(v)])),
    source,
    ...extra,
  };
}

const MOTOR = block(
  'FB',
  'Antrieb',
  `#Laeuft := (#Start OR #Laeuft) AND #Stopp;
#T1(IN := #Laeuft, PT := #Anlauf);
#Bereit := #T1.Q;
IF #Laeuft THEN #Starts := #Starts + 1; END_IF;`,
  {
    Input: [
      ['Start', 'Bool'],
      ['Stopp', 'Bool'],
      ['Anlauf', 'Time', 'T#20ms'],
    ],
    Output: [
      ['Laeuft', 'Bool'],
      ['Bereit', 'Bool'],
    ],
    Static: [
      ['T1', 'TON_TIME'],
      ['Starts', 'Int'],
    ],
  },
);

function project(blocks: Block[]): CompileResult {
  return compileProject({ tags: TAGS, blocks });
}

function cpu(r: CompileResult, cycleMs = 1): Cpu {
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 'T', cycleMs, maxOpsPerCycle: 10_000 }, r.program!);
}

const errors = (r: CompileResult) =>
  r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

describe('Eigene Funktionsbausteine (FB)', () => {
  it('zwei Instanzen mit eigenem Gedächtnis und Multiinstanz-Timer', () => {
    const r = project([
      block(
        'OB',
        'Main',
        `"M1_DB"(Start := "Start", Stopp := "Stopp", Laeuft => "Motor");
"M2_DB"(Start := "Sensor", Stopp := "Stopp", Anlauf := T#5ms, Bereit => "Lampe");`,
      ),
      MOTOR,
      IDB('M1_DB', 'Antrieb'),
      IDB('M2_DB', 'Antrieb'),
    ]);
    const c = cpu(r);
    const sim = new Simulation([c], {
      beforeScans: (t) => {
        c.setInput('%I0.0', t === 2);
        c.setInput('%I0.1', true);
        c.setInput('%I0.2', t === 10);
      },
    });
    sim.run(5);
    expect(c.read('%Q0.0')).toBe(true); // M1 hält sich selbst
    expect(c.readSlot('M1_DB.Laeuft')).toBe(true);
    expect(c.readSlot('M2_DB.Laeuft')).toBe(false);
    sim.run(12); // t = 16: M2 läuft seit t = 10, Anlaufzeit 5 ms
    expect(c.read('%Q0.1')).toBe(true);
    expect(c.readSlot('M1_DB.Bereit')).toBe(false); // 20 ms noch nicht um
    sim.run(10);
    expect(c.readSlot('M1_DB.Bereit')).toBe(true);
  });

  it('Instanzdaten sind von außen lesbar, Ausgänge nicht beschreibbar', () => {
    const ok = project([
      block(
        'OB',
        'Main',
        `"M1_DB"(Start := "Start", Stopp := TRUE);\n"Zahl" := "M1_DB".Starts;\n"Lampe" := "M1_DB".T1.Q;`,
      ),
      MOTOR,
      IDB('M1_DB', 'Antrieb'),
    ]);
    expect(ok.ok).toBe(true);
    const bad = project([
      block('OB', 'Main', `"M1_DB"(Start := "Start", Stopp := TRUE);\n"M1_DB".Laeuft := TRUE;`),
      MOTOR,
      IDB('M1_DB', 'Antrieb'),
    ]);
    expect(errors(bad)[0]).toMatch(/kann nur gelesen werden/);
  });

  it('Programmgröße zählt den FB-Rumpf einmal, nicht je Aufruf', () => {
    const one = project([
      block('OB', 'Main', `"M1_DB"(Stopp := TRUE);`),
      MOTOR,
      IDB('M1_DB', 'Antrieb'),
    ]);
    const two = project([
      block('OB', 'Main', `"M1_DB"(Stopp := TRUE);\n"M2_DB"(Stopp := TRUE);`),
      MOTOR,
      IDB('M1_DB', 'Antrieb'),
      IDB('M2_DB', 'Antrieb'),
    ]);
    expect(one.statementCount).toBe(1 + 5);
    expect(two.statementCount).toBe(2 + 5);
  });

  it('Fehler im FB-Rumpf werden einmal am FB gemeldet', () => {
    const fb = block('FB', 'Kaputt', '#x := #gibtsnicht;', { Static: [['x', 'Int']] });
    const r = project([
      block('OB', 'Main', `"K1"();\n"K2"();`),
      fb,
      IDB('K1', 'Kaputt'),
      IDB('K2', 'Kaputt'),
    ]);
    const errs = r.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.location).toMatchObject({ block: 'Kaputt', part: 'code' });
  });

  it('typische Fehler beim Aufruf', () => {
    const base = [MOTOR, IDB('M1_DB', 'Antrieb')];
    const err = (src: string) => errors(project([block('OB', 'Main', src), ...base]))[0];
    expect(err('"Antrieb"(Start := TRUE);')).toMatch(/braucht eine Instanz/);
    expect(err('"M1_DB"(Gas := TRUE);')).toMatch(/hat keinen Parameter GAS.*Start, Stopp/);
    expect(err('"M1_DB"(Laeuft := TRUE);')).toMatch(/ist ein Ausgang/);
    expect(err('"M1_DB"(Start => "Motor");')).toMatch(/ist ein Eingang/);
    expect(err('"Zahl" := "M1_DB";')).toMatch(/z\. B\. "M1_DB"\.Laeuft|M1_DB\.Laeuft/);
  });

  it('Rekursion und Selbst-Multiinstanz werden abgelehnt', () => {
    const a = block('FB', 'A', '#b();', { Static: [['b', '"B"']] });
    const b = block('FB', 'B', '#a();', { Static: [['a', '"A"']] });
    const r = project([block('OB', 'Main', '"A_DB"();'), a, b, IDB('A_DB', 'A')]);
    expect(errors(r).some((m) => /Rekursiver Aufruf/.test(m))).toBe(true);
    const self = block('FB', 'S', '', { Static: [['s', '"S"']] });
    const r2 = project([block('OB', 'Main', '"S_DB"();'), self, IDB('S_DB', 'S')]);
    expect(errors(r2)[0]).toMatch(/nicht selbst/);
  });

  it('verschachtelte Multiinstanz eines eigenen FB', () => {
    const anlage = block('FB', 'Anlage', '#Band(Start := #Ein, Stopp := TRUE, Laeuft => #Lauf);', {
      Input: [['Ein', 'Bool']],
      Output: [['Lauf', 'Bool']],
      Static: [['Band', '"Antrieb"']],
    });
    const r = project([
      block('OB', 'Main', '"A1"(Ein := "Start", Lauf => "Motor");\n"Lampe" := "A1".Band.Laeuft;'),
      MOTOR,
      anlage,
      IDB('A1', 'Anlage'),
    ]);
    const c = cpu(r);
    c.setInput('%I0.0', true);
    c.scan(0);
    expect(c.read('%Q0.0')).toBe(true);
    expect(c.read('%Q0.1')).toBe(true);
    expect(c.readSlot('A1.Band.Laeuft')).toBe(true);
  });
});

describe('Eigene Funktionen (FC)', () => {
  const ADD = block(
    'FC',
    'Begrenzt',
    `IF #x + #schritt > #max THEN
  #ueberlauf := TRUE;
  RETURN;
END_IF;
#x := #x + #schritt;
#ueberlauf := FALSE;`,
    {
      Input: [['schritt', 'Int']],
      Output: [['ueberlauf', 'Bool']],
      InOut: [['x', 'Int']],
      Constant: [['max', 'Int', '10']],
    },
  );

  it('Durchgangsparameter wirkt direkt, RETURN springt ans FC-Ende', () => {
    const r = project([
      block(
        'OB',
        'Main',
        `"Begrenzt"(schritt := 4, x := "Zahl", ueberlauf => "Lampe");\n"Motor" := TRUE;`,
      ),
      ADD,
    ]);
    const c = cpu(r);
    const seen: boolean[] = [];
    for (let t = 0; t < 4; t++) {
      c.scan(t);
      seen.push(c.read('%Q0.1') as boolean);
    }
    expect(c.read('%MW10')).toBe(8);
    expect(seen).toEqual([false, false, true, true]);
    expect(c.read('%Q0.0')).toBe(true); // Code nach dem Aufruf läuft weiter
  });

  it('Aufruf in einer Schleife; Temp startet bei jedem Aufruf neu', () => {
    const fc = block('FC', 'Zaehl', '#t := #t + 1;\n#x := #x + #t;', {
      InOut: [['x', 'Int']],
      Temp: [['t', 'Int']],
    });
    const r = project([
      block('OB', 'Main', 'FOR #i := 1 TO 5 DO\n  "Zaehl"(x := "Zahl");\nEND_FOR;', {
        Temp: [['i', 'Int']],
      }),
      fc,
    ]);
    const c = cpu(r);
    c.scan(0);
    expect(c.read('%MW10')).toBe(5);
  });

  it('typische Fehler', () => {
    const err = (src: string, blocks: Block[] = [ADD]) =>
      errors(project([block('OB', 'Main', src), ...blocks]))[0];
    expect(err('"Begrenzt"(x := "Zahl");')).toMatch(/Eingang schritt .* fehlt/);
    expect(err('"Begrenzt"(schritt := 1);')).toMatch(/Durchgangsparameter x .* fehlt/);
    expect(err('"Begrenzt"(schritt := 1, x := 5);')).toMatch(/braucht eine Variable/);
    expect(err('"Begrenzt"(schritt := 1, x := "Gross");')).toMatch(/DInt passt nicht zu Int/);
    expect(err('"Zahl" := Begrenzt(1);')).toMatch(/keinen Wert \(Rückgabetyp Void\)/);
    const withStatic = block('FC', 'S', '', { Static: [['s', 'Int']] });
    expect(err('"S"();', [withStatic])).toMatch(/keinen Bereich Static/);
    expect(err('"B_DB"();', [ADD, IDB('B_DB', 'Begrenzt')])).toMatch(/hat keinen Instanz-DB/);
  });

  it('nicht aufgerufener Baustein gibt eine Warnung', () => {
    const r = project([block('OB', 'Main', '"Motor" := TRUE;'), ADD]);
    expect(r.ok).toBe(true);
    expect(r.diagnostics.map((d) => d.message)).toContain(
      'Baustein „Begrenzt“ wird nirgends aufgerufen',
    );
  });
});

describe('Alarm-OBs', () => {
  it('Weckalarm-OB läuft im eigenen Takt, OB1 im Zyklus', () => {
    const r = project([
      block('OB', 'Main', '"Lampe" := TRUE;'),
      block(
        'OB',
        'Takt',
        '"Zahl" := "Zahl" + 1;',
        {},
        {
          number: 30,
          event: { kind: 'cyclic', intervalMs: 3 },
        },
      ),
    ]);
    expect(r.program!.tasks).toHaveLength(1);
    const c = cpu(r, 10);
    new Simulation([c]).run(30);
    expect(c.read('%MW10')).toBe(10);
    expect(c.metrics.cycles).toBe(3);
  });

  it('Prozessalarm-OB am Eingang „Sensor“ mit eigenen Temp-Variablen', () => {
    const r = project([
      block('OB', 'Main', '#x := 1;\n"Gross" := #x;', { Temp: [['x', 'DInt']] }),
      block(
        'OB',
        'Impuls',
        '#x := "Zahl" + 1;\n"Zahl" := #x;',
        { Temp: [['x', 'Int']] },
        {
          number: 40,
          event: { kind: 'process', input: 'Sensor', edge: 'rising' },
        },
      ),
    ]);
    const c = cpu(r, 10);
    const sim = new Simulation([c], { beforeScans: (t) => c.setInput('%I0.2', t % 10 === 4) });
    sim.run(50);
    expect(c.read('%MW10')).toBe(5);
    expect(c.read('%MD20')).toBe(1);
  });

  it('Fehler: zweiter OB ohne Ereignis, falsche Nummer, falscher Eingang', () => {
    const main = block('OB', 'Main', '');
    const err = (ob: CodeBlock) => errors(project([main, ob]))[0];
    expect(err(block('OB', 'Zwei', ''))).toMatch(/Nur OB1/);
    expect(
      err(block('OB', 'W', '', {}, { number: 40, event: { kind: 'cyclic', intervalMs: 5 } })),
    ).toMatch(/Nummern 30 … 38/);
    expect(
      err(block('OB', 'W', '', {}, { number: 30, event: { kind: 'cyclic', intervalMs: 0 } })),
    ).toMatch(/Takt/);
    expect(
      err(
        block(
          'OB',
          'P',
          '',
          {},
          { number: 40, event: { kind: 'process', input: 'Motor', edge: 'rising' } },
        ),
      ),
    ).toMatch(/kein Eingangsbit/);
  });
});

describe('Externe Quelle mit FB', () => {
  it('FUNCTION_BLOCK, Instanz-DB und OB aus einer Quelle', () => {
    const src = `FUNCTION_BLOCK "Blinker"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
   VAR_INPUT
      Ein : Bool;
   END_VAR
   VAR_OUTPUT
      Q : Bool;
   END_VAR
   VAR
      T : TON_TIME;
   END_VAR

BEGIN
	#T(IN := #Ein AND NOT #T.Q, PT := T#4ms);
	IF #T.Q THEN
	  #Q := NOT #Q;
	END_IF;
END_FUNCTION_BLOCK

DATA_BLOCK "Blinker_DB"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
NON_RETAIN
"Blinker"

BEGIN

END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
VERSION : 0.1

BEGIN
	"Blinker_DB"(Ein := TRUE, Q => "Lampe");
END_ORGANIZATION_BLOCK
`;
    const r = compileSource(src, { tags: TAGS });
    const c = cpu(r);
    const sim = new Simulation([c]);
    const trace: boolean[] = [];
    sim.env.afterScans = () => trace.push(c.read('%Q0.1') as boolean);
    sim.run(12);
    expect(trace.filter((v, i) => i > 0 && v !== trace[i - 1]).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Ereignisse in der externen Quelle', () => {
  it('Weck- und Prozessalarm überstehen Export und Import', async () => {
    const { projectToSource, sourceToProject } = await import('../src');
    const blocks: Block[] = [
      block('OB', 'Main', ''),
      block(
        'OB',
        'Takt',
        '',
        {},
        { number: 30, event: { kind: 'cyclic', intervalMs: 50, phaseMs: 2 } },
      ),
      block(
        'OB',
        'Flanke',
        '',
        {},
        {
          number: 40,
          event: { kind: 'process', input: '"Sensor"', edge: 'falling' },
        },
      ),
    ];
    const back = sourceToProject(projectToSource({ tags: [], blocks })).project!;
    const obs = back.blocks.filter((b): b is CodeBlock => b.kind === 'OB');
    expect(obs.map((b) => [b.name, b.number, b.event])).toEqual([
      ['Main', 1, undefined],
      ['Takt', 30, { kind: 'cyclic', intervalMs: 50, phaseMs: 2 }],
      ['Flanke', 40, { kind: 'process', input: '"Sensor"', edge: 'falling' }],
    ]);
  });
});

describe('FC mit Rückgabewert (Ret_Val)', () => {
  const SKAL = block(
    'FC',
    'Skalieren',
    `IF #Roh < 0 THEN #Ret_Val := 0.0; RETURN; END_IF;
#Ret_Val := INT_TO_REAL(#Roh) * #Faktor;
#Doppelt := #Roh * 2;`,
    {
      Input: [
        ['Roh', 'Int'],
        ['Faktor', 'Real'],
      ],
      Output: [['Doppelt', 'Int']],
    },
    { returnType: 'Real' },
  );

  it('Aufruf im Ausdruck, benannt und als Positionsparameter', () => {
    const r = project([
      block(
        'OB',
        'Main',
        `"Wert" := "Skalieren"(Roh := "Rohwert", Faktor := 0.5) + Skalieren(10, 1.0);
"Sollwert" := REAL_TO_INT("Skalieren"("Rohwert", 2.0, Doppelt => "Zahl"));`,
      ),
      SKAL,
    ]);
    const c = cpu(r);
    c.setInput('%IW64', 8);
    c.scan(0);
    expect(c.read('%MD24', 'REAL')).toBe(14);
    expect(c.read('%QW64')).toBe(16);
    expect(c.read('%MW10')).toBe(16);
    c.setInput('%IW64', -3);
    c.scan(1);
    expect(c.read('%MD24', 'REAL')).toBe(10);
  });

  it('verschachtelt und in Bedingungen; Aufruf als Anweisung verwirft den Wert', () => {
    const r = project([
      block(
        'OB',
        'Main',
        `IF "Skalieren"("Skalieren"(2, 3.0) > 5.0, 1.0) > 0.0 THEN "Motor" := TRUE; END_IF;
"Skalieren"(Roh := 1, Faktor := 1.0, Doppelt => "Zahl");`,
      ),
      SKAL,
    ]);
    expect(errors(r)[0]).toMatch(/Bool.*Int|Typkonflikt/);
    const ok = project([
      block(
        'OB',
        'Main',
        `IF "Skalieren"(REAL_TO_INT("Skalieren"(2, 3.0)), 1.0) > 5.0 THEN "Motor" := TRUE; END_IF;
"Skalieren"(Roh := 1, Faktor := 1.0, Doppelt => "Zahl");`,
      ),
      SKAL,
    ]);
    const c = cpu(ok);
    c.scan(0);
    expect(c.read('%Q0.0')).toBe(true);
    expect(c.read('%MW10')).toBe(2);
  });

  it('Fehler', () => {
    const err = (src: string) => errors(project([block('OB', 'Main', src), SKAL]))[0];
    expect(err('"Wert" := "Skalieren"(1);')).toMatch(/Eingang Faktor .* fehlt/);
    expect(err('"Wert" := "Skalieren"(1, 2.0, 3);')).toMatch(/2 Eingänge.*angegeben 3/);
    expect(err('"Wert" := "Skalieren"(Roh := 1, 2.0);')).toMatch(/Eingänge entweder alle benannt/);
    expect(err('"Wert" := "Gibtsnicht"(1);')).toMatch(/nicht definiert/);
    expect(err('"Zahl" := ABS(IN => "Zahl");')).toMatch(/keine Ausgänge/);
    expect(err('"T"(TRUE, T#1s);')).toMatch(/benannte Parameter/);
    const bad = block('FC', 'B', '#Ret_Val := 1;', {}, { returnType: 'Array[0..1] of Int' });
    expect(errors(project([block('OB', 'Main', '"Zahl" := "B"();'), bad]))[0]).toMatch(
      /nur elementare/,
    );
  });

  it('Quelle: FUNCTION "X" : Real', () => {
    const src = `FUNCTION "Halb" : Real
VAR_INPUT
  x : Real;
END_VAR
BEGIN
  #Ret_Val := #x / 2.0;
END_FUNCTION

ORGANIZATION_BLOCK "Main"
BEGIN
  "Wert" := "Halb"(5.0);
END_ORGANIZATION_BLOCK`;
    const c = cpu(compileSource(src, { tags: TAGS }));
    c.scan(0);
    expect(c.read('%MD24', 'REAL')).toBe(2.5);
    const p = sourceToProject(src, TAGS).project!;
    expect(p.blocks.find((b) => b.name === 'Halb')).toMatchObject({ returnType: 'Real' });
    expect(projectToSource(p)).toContain('FUNCTION "Halb" : Real');
  });
});
