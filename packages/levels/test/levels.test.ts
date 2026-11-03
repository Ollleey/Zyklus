import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LevelRun,
  analyzeBoard,
  syncDeviceTags,
  verifySolution,
  type Level,
  type PlacedModule,
  type PlcProject,
  type Solution,
  type Wire,
} from '@zyklus/sim-core';
import { formatDiagnostic, sourceToProject } from '@zyklus/scl-compiler';
import { LEVELS, compileSolution, givenSolution, levelById, lineChanges } from '../src';
import { FUP_REFERENCES } from './fup-references';

const DATA = join(__dirname, '..', 'data', 'reference');
const BOARDS = JSON.parse(readFileSync(join(DATA, 'boards.json'), 'utf8')) as Record<
  string,
  { modules: PlacedModule[]; wires: Wire[] }
>;

const cpusOf = (board: { modules: PlacedModule[] }) =>
  board.modules.filter((m) => m.type.startsWith('cpu')).map((m) => m.id);

/**
 * Lösung aus Aufbau + SCL-Quelle(n); Variablentabelle kommt aus der Verdrahtung.
 * `scl`: eine Quelle für die einzige CPU oder je CPU-Modul eine Quelle.
 */
function solutionFor(
  level: Level,
  scl: string | Record<string, string>,
  board = BOARDS[level.id]!,
): Solution {
  const base: Solution = { version: 2, ...board, projects: {} };
  const analysis = analyzeBoard(level, base);
  const cpus = cpusOf(board);
  const sources = typeof scl === 'string' ? { [cpus[0]!]: scl } : scl;
  const projects: Record<string, PlcProject> = {};
  for (const cpu of cpus) {
    const imported = sourceToProject(sources[cpu] ?? ob(''));
    if (!imported.project) throw new Error(imported.diagnostics.map(formatDiagnostic).join('\n'));
    projects[cpu] = syncDeviceTags(level, analysis, cpu, imported.project);
  }
  return { ...base, projects };
}

/** Referenz: `<id>.scl` oder bei mehreren CPUs `<id>.<cpu>.scl` */
function reference(level: Level): Solution {
  const single = join(DATA, `${level.id}.scl`);
  if (existsSync(single)) return solutionFor(level, readFileSync(single, 'utf8'));
  const cpus = cpusOf(BOARDS[level.id]!);
  return solutionFor(
    level,
    Object.fromEntries(
      cpus.map((c) => [c, readFileSync(join(DATA, `${level.id}.${c}.scl`), 'utf8')]),
    ),
  );
}

/** OB1 mit nur einem Anweisungsteil (für Fehllösungen) */
const ob = (body: string, dbs = '') =>
  `${dbs}\nORGANIZATION_BLOCK "Main"\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;

function verify(level: Level, solution: Solution) {
  const c = compileSolution(level, solution);
  if (!c.ok) {
    const msgs = [...c.cpus.values()].flatMap((x) => x.diagnostics.map(formatDiagnostic));
    throw new Error(
      `Lösung übersetzt nicht:\n${[...c.analysis.issues.map((i) => i.message), ...msgs].join('\n')}`,
    );
  }
  return verifySolution(level, solution, c.programs, c.size, undefined, c.changes);
}

describe('Kampagne', () => {
  it('alle Level sind gültig und fortlaufend nummeriert', () => {
    expect(LEVELS.map((l) => l.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    ]);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))(
    'Referenzlösung %s besteht alle Tests',
    (_, level) => {
      const v = verify(level, reference(level));
      const failed = v.runs
        .filter((r) => !r.passed)
        .map(
          (r) =>
            `${r.testId}/Seed ${r.seed}: ${JSON.stringify(Object.fromEntries(Object.entries(r.checks).filter(([, c]) => !c.ok)))} ` +
            `${JSON.stringify(r.criteria.filter((c) => !c.ok))} ${r.stop ?? ''}`,
        );
      expect(failed).toEqual([]);
      expect(v.passed).toBe(true);
      // Richtwerte im Level entsprechen der Referenzlösung
      expect(v.metrics).toEqual(level.par);
    },
  );

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s ist deterministisch', (_, level) => {
    const a = verify(level, reference(level));
    const b = verify(level, reference(level));
    expect(a.metrics).toEqual(b.metrics);
    expect(a.runs.map((r) => r.traces)).toEqual(b.runs.map((r) => r.traces));
  });
});

/** FUP-Lösung: gleicher Aufbau, OB1 in FUP, Variablentabelle aus der Verdrahtung. */
function fupReference(level: Level): Solution {
  const board = BOARDS[level.id]!;
  const ref = FUP_REFERENCES[level.id]!;
  const base: Solution = { version: 2, ...board, projects: {} };
  const analysis = analyzeBoard(level, base);
  const cpu = board.modules.find((m) => m.type.startsWith('cpu'))!.id;
  const project: PlcProject = {
    tags: [],
    blocks: [
      { kind: 'OB', name: 'Main', number: 1, lang: 'FUP', iface: {}, source: '', fup: ref.fup },
      ...ref.blocks,
    ],
  };
  return { ...base, projects: { [cpu]: syncDeviceTags(level, analysis, cpu, project) } };
}

const WITH_FUP = LEVELS.filter((l) => FUP_REFERENCES[l.id]);

describe('FUP-Referenzlösungen', () => {
  it.each(WITH_FUP.map((l) => [l.id, l] as const))('%s in FUP besteht alle Tests', (_, level) => {
    const v = verify(level, fupReference(level));
    expect(v.runs.filter((r) => !r.passed).map((r) => `${r.testId}/${r.seed}`)).toEqual([]);
    const c = compileSolution(level, fupReference(level));
    expect(c.cpus.get('cpu1')!.lang).toBe('FUP');
  });

  it.each(WITH_FUP.map((l) => [l.id, l] as const))(
    '%s: FUP und SCL verhalten sich identisch',
    (_, level) => {
      const scl = verify(level, reference(level));
      const fup = verify(level, fupReference(level));
      expect(fup.runs.map((r) => r.traces)).toEqual(scl.runs.map((r) => r.traces));
    },
  );

  it('Programmgröße in FUP = Anzahl Boxen, Grenze = Netzwerke', () => {
    const level = levelById('02-zweihand')!;
    const c = compileSolution(level, fupReference(level));
    const cpu = c.cpus.get('cpu1')!;
    // 2 + 2 + 1 + 2 + 4 + 1 Boxen in 6 Netzwerken
    expect(cpu).toMatchObject({ size: 12, used: 6, limit: 10 });
  });
});

describe('Typische Fehllösungen fallen durch', () => {
  const fails = (id: string, src: string, board?: { modules: PlacedModule[]; wires: Wire[] }) => {
    const level = levelById(id)!;
    const v = verify(level, solutionFor(level, src, board));
    expect(v.passed).toBe(false);
    return v;
  };
  const failedCriteria = (v: ReturnType<typeof fails>) => [
    ...new Set(v.runs.flatMap((r) => r.criteria.filter((c) => !c.ok).map((c) => c.name.de))),
  ];

  it('Level 4: Gelbphasen vergessen', () => {
    fails(
      '04-ampel',
      ob(
        '"Takt".TON(IN := "Betrieb" AND NOT "Takt".Q, PT := T#8s);\n"Rot" := "Betrieb" AND "Takt".ET < T#3s;\n"Gruen" := "Betrieb" AND "Takt".ET >= T#4s AND "Takt".ET < T#7s;',
        'DATA_BLOCK "Takt"\nNON_RETAIN\nIEC_TIMER\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
  });

  it('Level 5: Zählen ohne Entprellung', () => {
    const v = fails(
      '05-zaehler',
      ob(
        '"Teile"(CU := "Lichtschranke", R := "Quittieren", PV := 5);\n"Karton_voll" := "Teile".Q;',
        'DATA_BLOCK "Teile"\nNON_RETAIN\nCTU_INT\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
    expect(v.runs.filter((r) => !r.passed).length).toBeGreaterThan(v.runs.length / 2);
  });

  it('Level 6: Umschalten ohne Pause schließt kurz', () => {
    const v = fails(
      '06-stern-dreieck',
      ob(
        'IF "Start" AND "Stopp" THEN "Anlauf".ein := TRUE; END_IF;\nIF NOT "Stopp" THEN "Anlauf".ein := FALSE; END_IF;\n"T_Stern"(IN := "Anlauf".ein, PT := T#2s);\n"Netz" := "Anlauf".ein;\n"Stern" := "Anlauf".ein AND NOT "T_Stern".Q;\n"Dreieck" := "Anlauf".ein AND "T_Stern".Q;',
        'DATA_BLOCK "T_Stern"\nNON_RETAIN\nTON_TIME\nBEGIN\nEND_DATA_BLOCK\nDATA_BLOCK "Anlauf"\nNON_RETAIN\nVAR ein : Bool; END_VAR\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
    expect(failedCriteria(v)).toEqual(['Stern- und Dreieckschütz nie gleichzeitig']);
  });

  it('Level 6: Schütze am Digitalausgang statt am Relais', () => {
    const level = levelById('06-stern-dreieck')!;
    const board = {
      modules: [
        { id: 'cpu1', type: 'cpu-klein', x: 0 },
        { id: 'di1', type: 'di8', x: 6 },
        { id: 'do1', type: 'do8', x: 7 },
      ],
      wires: BOARDS['06-stern-dreieck']!.wires.map((w) =>
        w.module === 'rel1' ? { ...w, module: 'do1' } : w,
      ),
    };
    const c = compileSolution(
      level,
      solutionFor(level, readFileSync(join(DATA, '06-stern-dreieck.scl'), 'utf8'), board),
    );
    expect(c.analysis.issues.filter((i) => i.code === 'needs-relay')).toHaveLength(3);
  });

  it('Level 7: ein Schaltpunkt ohne Hysterese taktet', () => {
    const v = fails('07-tank', ob('"Pumpe" := "Fuellstand" < 16589;  // 60 %'));
    expect(failedCriteria(v)).toEqual(['Pumpe schaltet höchstens 10-mal']);
  });

  it('Level 8: ohne Geberfehlererkennung', () => {
    const v = fails(
      '08-drahtbruch',
      ob(
        '#grad := SCALE_X(MIN := 0.0, VALUE := NORM_X(MIN := 0, VALUE := "Temperatur", MAX := 27648), MAX := 150.0);\nIF #grad < 60.0 THEN "Heizung" := TRUE; END_IF;\nIF #grad > 65.0 THEN "Heizung" := FALSE; END_IF;',
      ).replace('BEGIN', 'VAR_TEMP grad : Real; END_VAR\nBEGIN'),
    );
    expect(v.runs.every((r) => !r.passed)).toBe(true);
  });

  it('Level 9: Messwert ungefiltert ausgeben', () => {
    const v = fails('09-mittelwert', ob('"Anzeige" := "Durchfluss";'));
    expect(v.runs.every((r) => !r.passed)).toBe(true);
  });

  it('Level 1: ohne Selbsthaltung', () => {
    fails('01-foerderband', ob('"Bandmotor" := "Start" AND "Stopp";'));
  });
  it('Level 1: Stopp als Schließer behandelt', () => {
    fails('01-foerderband', ob('"Bandmotor" := ("Start" OR "Bandmotor") AND NOT "Stopp";'));
  });
  it('Level 1: Start hat Vorrang statt Stopp', () => {
    fails('01-foerderband', ob('"Bandmotor" := "Start" OR ("Bandmotor" AND "Stopp");'));
  });

  it('Level 2: einfache UND-Verknüpfung (kein Zeitfenster)', () => {
    const v = fails('02-zweihand', ob('"Presse" := "Links" AND "Rechts";'));
    expect(v.runs.filter((r) => !r.passed).map((r) => r.testId)).toEqual([
      'zu-spaet',
      'nachgreifen',
    ]);
  });

  it('Level 3: ohne Entprellung', () => {
    const v = fails(
      '03-stromstoss',
      ob(
        '"Flanke"(CLK := "Taster");\n"Licht" := "Licht" XOR "Flanke".Q;',
        'DATA_BLOCK "Flanke"\nNON_RETAIN\nR_TRIG\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
    // mindestens ein Seed erwischt das Prellen
    expect(v.runs.some((r) => !r.passed)).toBe(true);
  });

  it('Level 3: ohne Entprellung auf schneller CPU fällt bei allen Seeds durch', () => {
    const board = {
      ...BOARDS['03-stromstoss']!,
      modules: BOARDS['03-stromstoss']!.modules.map((m) =>
        m.type === 'cpu-klein' ? { ...m, type: 'cpu-schnell' } : m,
      ),
    };
    board.modules = board.modules.map((m) => (m.id === 'cpu1' ? m : { ...m, x: m.x + 1 }));
    const v = fails(
      '03-stromstoss',
      ob(
        '"Flanke"(CLK := "Taster");\n"Licht" := "Licht" XOR "Flanke".Q;',
        'DATA_BLOCK "Flanke"\nNON_RETAIN\nR_TRIG\nBEGIN\nEND_DATA_BLOCK',
      ),
      board,
    );
    expect(v.runs.every((r) => !r.passed)).toBe(true);
  });
});

describe('Übersetzen von Lösungen', () => {
  it('meldet Programme, die zu groß für die CPU sind', () => {
    const level = levelById('01-foerderband')!;
    const body = Array.from({ length: 41 }, () => '"Bandmotor" := "Start";').join('\n');
    const c = compileSolution(level, solutionFor(level, ob(body)));
    expect(c.ok).toBe(false);
    expect(c.cpus.get('cpu1')!.diagnostics[0]!.message).toMatch(/zu groß für CPU klein: 41 von 40/);
  });
});

describe('Fehllösungen der Level 10–15', () => {
  const run = (
    id: string,
    src: string | Record<string, string>,
    board?: { modules: PlacedModule[]; wires: Wire[] },
  ) => {
    const level = levelById(id)!;
    return verify(level, solutionFor(level, src, board));
  };
  const failed = (v: ReturnType<typeof run>) => [
    ...new Set(v.runs.flatMap((r) => r.criteria.filter((c) => !c.ok).map((c) => c.name.de))),
  ];
  const ref = (id: string) => readFileSync(join(DATA, `${id}.scl`), 'utf8');

  it('Level 10: Start ohne Flanke startet bei gehaltenem Taster neu', () => {
    const src = ref('10-bohrstation').replace('"StartFlanke".Q AND "Oben"', '"Start" AND "Oben"');
    const v = run('10-bohrstation', src);
    expect(v.passed).toBe(false);
    expect(failed(v)).toContain('Festhalten von Start löst keinen neuen Ablauf aus');
  });

  it('Level 10: ohne Verweilzeit wird die Bohrung unsauber', () => {
    const src = ref('10-bohrstation').replace('IF "Verweilzeit".Q THEN', 'IF TRUE THEN');
    expect(failed(run('10-bohrstation', src))).toContain('Keine Bohrung ohne Verweilzeit');
  });

  it('Level 10: Lösen vor dem Heben beschädigt das Werkstück', () => {
    const src = ref('10-bohrstation').replace(
      '"Spannen" := "Kette".Schritt >= 1 AND "Kette".Schritt <= 4;',
      '"Spannen" := "Kette".Schritt >= 1 AND "Kette".Schritt <= 3;',
    );
    expect(failed(run('10-bohrstation', src))).toContain('Kein Schaden an Bohrer oder Werkstück');
  });

  it('Level 11: Weiche direkt nach der Messung stellen reicht nicht bei dichtem Betrieb', () => {
    const v = run('11-sortierweiche', ob('IF "Mess_LS" THEN "Weiche" := "Hoehe" > 11059; END_IF;'));
    expect(v.runs.filter((r) => r.testId === 'dicht').every((r) => !r.passed)).toBe(true);
  });

  it('Level 12: Schwellwert statt Pulsweite', () => {
    const v = run('12-pwm', ob('"Heizband" := "Freigabe" AND "Leistung" > 13824;'));
    expect(failed(v)).toEqual(['Tastverhältnis = Sollwert (± 3 %)']);
  });

  it('Level 13: Leitungen durch die Trennwand gehen nicht', () => {
    const level = levelById('13-koppel')!;
    const board = BOARDS['13-koppel']!;
    const wires = board.wires.map((w) =>
      w.device === 'H1' ? { ...w, module: 'rel1', channel: 1 } : w,
    );
    const c = compileSolution(level, solutionFor(level, {}, { ...board, wires }));
    expect(c.analysis.issues.map((i) => i.code)).toContain('wall');
  });

  it('Level 14: Zählen im OB1 verpasst Impulse', () => {
    const v = run(
      '14-impulse',
      ob(
        '"Zaehler"(CU := "Durchfluss", R := "Start", PV := 120);\nIF "Start" THEN "Ventil" := TRUE; END_IF;\nIF "Zaehler".Q THEN "Ventil" := FALSE; END_IF;',
        'DATA_BLOCK "Zaehler"\nNON_RETAIN\nCTU_INT\nBEGIN\nEND_DATA_BLOCK',
      ),
    );
    expect(v.runs.every((r) => !r.passed)).toBe(true);
  });

  it('Level 14: Prozessalarm braucht einen DI 8 HF', () => {
    const level = levelById('14-impulse')!;
    const board = {
      ...BOARDS['14-impulse']!,
      modules: BOARDS['14-impulse']!.modules.map((m) =>
        m.type === 'di8hf' ? { ...m, type: 'di8' } : m,
      ),
    };
    const c = compileSolution(level, solutionFor(level, ref('14-impulse'), board));
    expect(c.ok).toBe(false);
    expect(c.cpus.get('cpu1')!.diagnostics[0]!.message).toMatch(
      /nicht auf einem alarmfähigen Eingang/,
    );
  });

  it('Level 15: CPU klein kennt keinen Weckalarm', () => {
    const level = levelById('15-pi-regler')!;
    const board = {
      ...BOARDS['15-pi-regler']!,
      modules: BOARDS['15-pi-regler']!.modules.map((m) =>
        m.type === 'cpu-mittel' ? { ...m, type: 'cpu-klein' } : m,
      ),
    };
    const c = compileSolution(level, solutionFor(level, ref('15-pi-regler'), board));
    expect(c.cpus.get('cpu1')!.diagnostics[0]!.message).toMatch(/kennt keine Weckalarme/);
  });

  it('Level 15: reiner P-Regler bleibt unter dem Sollwert', () => {
    const src = ref('15-pi-regler').replace('#u := #Kp * (#e + #Integral);', '#u := #Kp * #e;');
    const v = run('15-pi-regler', src);
    expect(v.passed).toBe(false);
    expect(failed(v).some((n) => n.startsWith('120 °C'))).toBe(true);
  });

  it('Level 15: zu hohe Verstärkung schwingt', () => {
    const src = ref('15-pi-regler').replace('Kp : Real := 1.5;', 'Kp : Real := 8.0;');
    expect(run('15-pi-regler', src).passed).toBe(false);
  });
});

describe('Fehllösungen der Level 16–17', () => {
  const ref = (id: string) => readFileSync(join(DATA, `${id}.scl`), 'utf8');
  const runWith = (
    id: string,
    board: { modules: PlacedModule[]; wires: Wire[] },
    src = ref(id),
  ) => {
    const level = levelById(id)!;
    return verify(level, solutionFor(level, src, board));
  };

  it('Level 16: ohne Messbereich 4–20 mA liefern die Sonden nur Überlauf', () => {
    const board = { ...BOARDS['16-zwei-behaelter']! } as {
      modules: PlacedModule[];
      wires: Wire[];
      config?: unknown;
    };
    delete board.config;
    const c = compileSolution(
      levelById('16-zwei-behaelter')!,
      solutionFor(levelById('16-zwei-behaelter')!, ref('16-zwei-behaelter'), board),
    );
    expect(c.analysis.issues.filter((i) => i.code === 'range-mismatch')).toHaveLength(2);
    expect(runWith('16-zwei-behaelter', board).passed).toBe(false);
  });

  it('Level 17: gleicher Rampenschritt auf der 5-ms-CPU ist zu schnell', () => {
    const b = BOARDS['17-frequenzumrichter']!;
    const board = {
      ...b,
      modules: b.modules.map((m) =>
        m.type === 'cpu-klein' ? { ...m, type: 'cpu-mittel' } : { ...m, x: m.x + 1 },
      ),
    };
    const v = runWith('17-frequenzumrichter', board);
    expect(v.runs.flatMap((r) => r.criteria.filter((c) => !c.ok).map((c) => c.name.de))).toContain(
      'Keine Überlastung',
    );
  });

  it('Level 17: Sollwert ohne Rampe überlastet das Band', () => {
    const src = ref('17-frequenzumrichter').replace(
      /\/\/ Rampe[\s\S]*?END_IF;\n/,
      '"Antrieb".f_soll := #ziel;\n',
    );
    expect(runWith('17-frequenzumrichter', BOARDS['17-frequenzumrichter']!, src).passed).toBe(
      false,
    );
  });

  it('Level 17: Rückmeldung ohne 4–20 mA – H1 meldet nie', () => {
    const board = { ...BOARDS['17-frequenzumrichter']! } as {
      modules: PlacedModule[];
      wires: Wire[];
      config?: unknown;
    };
    delete board.config;
    const v = runWith('17-frequenzumrichter', board);
    expect(v.runs.flatMap((r) => r.criteria.filter((c) => !c.ok).map((c) => c.name.de))).toContain(
      'H1 meldet erreicht (30 Hz)',
    );
  });

  const fails = (id: string, src: string) => {
    const level = levelById(id)!;
    const v = verify(level, solutionFor(level, src));
    expect(v.passed).toBe(false);
    return v;
  };
  const refText = (id: string) => readFileSync(join(DATA, `${id}.scl`), 'utf8');
  const testsFailing = (v: ReturnType<typeof fails>) => [
    ...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId)),
  ];

  it('Level 18: Rezeptwahl nicht remanent → nach Spannungsausfall Rezept 1', () => {
    const src = refText('18-lackmischer').replace('VAR RETAIN', 'VAR');
    expect(testsFailing(fails('18-lackmischer', src))).toEqual(['stromausfall']);
  });

  it('Level 18: Rezept nicht kopiert → Auswahl ändert die laufende Mischung', () => {
    const src = refText('18-lackmischer').replaceAll(
      '"Ablauf".R.',
      '"Rezepte".Liste["Rezepte".Auswahl].',
    );
    expect(testsFailing(fails('18-lackmischer', src))).toContain('auswahl');
  });

  it('Level 19: Schichtbuch nicht remanent, Stunde ohne führende Null', () => {
    const lost = fails(
      '19-schichtbuch',
      refText('19-schichtbuch').replace(/^RETAIN$/m, 'NON_RETAIN'),
    );
    expect(testsFailing(lost)).toEqual(['ringpuffer']);
    const unpadded = fails(
      '19-schichtbuch',
      refText('19-schichtbuch').replace(
        '"Zweistellig"(#jetzt.HOUR)',
        'USINT_TO_STRING(#jetzt.HOUR)',
      ),
    );
    const detail = unpadded.runs[0]!.criteria.find((c) => !c.ok)?.detail;
    expect(detail).toMatch(/'6:00:02 Extruder' statt '06:00:02 Extruder'/);
  });
});

describe('Forcen bei der Prüfung', () => {
  it('aktive Forceaufträge machen die Abnahme ungültig', () => {
    const level = levelById('01-foerderband')!;
    const solution = reference(level);
    const c = compileSolution(level, solution);
    const v = verifySolution(level, solution, c.programs, c.size, { cpu1: [['%Q0.0', true]] });
    expect(v.passed).toBe(false);
    expect(v.runs[0]!.criteria.map((x) => x.name.de)).toContain('Keine Forceaufträge aktiv');
  });
});

describe('Trace von Programmvariablen', () => {
  it('zeichnet eine Variable als Spur auf', () => {
    const level = levelById('05-zaehler')!;
    const solution = reference(level);
    const c = compileSolution(level, solution);
    const run = new LevelRun(level, solution, c.programs, { test: level.tests[0], seed: 1 });
    run.traceVariable('var.zaehler', { cpu: 'cpu1', target: { address: '%Q0.0' } });
    run.runToEnd();
    const trace = run.traces.get('var.zaehler')!;
    expect(trace.length).toBeGreaterThan(1);
    expect(trace).toEqual(run.traces.get('H1'));
  });
});

describe('Haltepunkte', () => {
  it('hält nach dem Zyklus an, in dem die Zeile lief', () => {
    const level = levelById('18-lackmischer')!;
    const solution = reference(level);
    const c = compileSolution(level, solution);
    const run = new LevelRun(level, solution, c.programs, { test: level.tests[0], seed: 1 });
    run.setBreakpoints('cpu1', [{ block: 'Main', line: 7 }]);
    run.runTo(20_000);
    expect(run.breakHit).toMatchObject({ cpu: 'cpu1', block: 'Main', line: 7 });
    expect(run.breakHit!.time).toBeGreaterThanOrEqual(500);
    expect(run.breakHit!.time).toBeLessThan(520);
    run.clearBreak();
    run.runTo(20_000);
    // nächster Start bei 7 s (der bei 4 s fällt in die laufende Mischung)
    expect(run.breakHit!.time).toBeGreaterThanOrEqual(7000);
    run.clearBreak();
    run.setBreakpoints('cpu1', []);
    run.runTo(20_000);
    expect(run.breakHit).toBeNull();
    expect(run.done).toBe(true);
  });
});

describe('Fehllösungen M10', () => {
  const fails = (id: string, src: string) => {
    const level = levelById(id)!;
    const v = verify(level, solutionFor(level, src));
    expect(v.passed).toBe(false);
    return v;
  };
  const refText = (id: string) => readFileSync(join(DATA, `${id}.scl`), 'utf8');

  it('Level 20: ohne OB86 kühlt die Pumpe bei ausgefallener Baugruppe nicht', () => {
    const src = refText('20-kuehlpumpe').replace(
      /ORGANIZATION_BLOCK "Ausfall"[\s\S]*?END_ORGANIZATION_BLOCK/,
      '',
    );
    const v = fails('20-kuehlpumpe', src);
    expect([...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))]).toEqual([
      'baugruppe',
    ]);
  });

  it('Level 21: Schleife über alle 800 Werte → Zykluszeitüberschreitung', () => {
    const src = ob(
      `"Filter".Werte["Filter".Pos] := "Durchfluss";
"Filter".Pos := ("Filter".Pos + 1) MOD 800;
#s := 0;
FOR #i := 0 TO 799 DO #s := #s + "Filter".Werte[#i]; END_FOR;
"Anzeige" := DINT_TO_INT(#s / 800);`,
      `DATA_BLOCK "Filter"\nVAR\n  Werte : Array[0..799] of Int;\n  Pos : Int;\nEND_VAR\nBEGIN\nEND_DATA_BLOCK`,
    ).replace('BEGIN\n"Filter"', 'VAR_TEMP\n  s : DInt;\n  i : Int;\nEND_VAR\nBEGIN\n"Filter"');
    const v = fails('21-ruhige-anzeige', src);
    expect(v.runs[0]!.stop).toMatch(/Zykluszeitüberschreitung/);
  });
});

describe('Fehllösungen M12', () => {
  const refText = (id: string) => readFileSync(join(DATA, `${id}.scl`), 'utf8');
  const failedTests = (id: string, src: string, board = BOARDS[id]!) => {
    const level = levelById(id)!;
    const v = verify(level, solutionFor(level, src, board));
    return [...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))];
  };

  it('Level 22: ohne Störgrößenaufschaltung bricht die Temperatur bei offener Tür ein', () => {
    const src = refText('22-ofen-pid').replace('#y := #y + 17.0;', '');
    expect(failedTests('22-ofen-pid', src)).toEqual(['tuer']);
  });

  it('Level 22: reiner P-Regler (Ti = 0) bleibt unter dem Sollwert', () => {
    const src = refText('22-ofen-pid').replace('Ti := 18.0;', 'Ti := 0.0;');
    expect(failedTests('22-ofen-pid', src)).toEqual(['anfahren', 'tuer']);
  });

  it('Level 23: ohne schnellen Zähler verpasst der Zyklus Geberimpulse', () => {
    const board = { ...BOARDS['23-positionieren']!, config: {} };
    const src = refText('23-positionieren')
      .replace(
        'ziel : DInt;',
        `ziel : DInt;
      zaehler : DInt;
      geber_alt : Bool;`,
      )
      .replace(
        '#rest := "Achse".ziel - %ID112;',
        `IF "Geber" AND NOT "Achse".geber_alt THEN "Achse".zaehler := "Achse".zaehler + 1; END_IF;
	"Achse".geber_alt := "Geber";
	#rest := "Achse".ziel - "Achse".zaehler;`,
      );
    expect(failedTests('23-positionieren', src, board)).toEqual(['einmal', 'drei']);
  });

  it('Level 24: ohne OB86 sieht der Stationsausfall wie ein Motorschutzfehler aus', () => {
    const src = refText('24-pumpstation').replace(
      /ORGANIZATION_BLOCK "Ausfall"[\s\S]*?END_ORGANIZATION_BLOCK/,
      '',
    );
    expect(failedTests('24-pumpstation', src)).toEqual(['station']);
  });

  it('Level 24: ohne Meldung fehlt die Anzeige im Panel', () => {
    const src = refText('24-pumpstation').replace(/\t"Stoermeldung"\(.*\);\r?\n/, '');
    expect(failedTests('24-pumpstation', src)).toEqual(['motorschutz', 'station']);
  });
});

describe('Bestandsanlage', () => {
  const level = levelById('25-rolltor')!;

  it('der gelieferte Stand ist vollständig aufgebaut, scheitert aber an den Tests', () => {
    const given = givenSolution(level)!;
    const c = compileSolution(level, given);
    expect(c.ok).toBe(true);
    expect(c.changes).toBe(0);
    // Mehrfachzuweisung meldet der Compiler als Warnung
    expect(c.cpus.get('cpu1')!.diagnostics.some((d) => /zugewiesen/.test(d.message))).toBe(true);
    const v = verifySolution(level, given, c.programs, c.size, undefined, c.changes);
    expect(v.passed).toBe(false);
    expect([...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))]).toEqual([
      'auf_zu',
      'verriegelung',
      'lichtschranke',
      'zaehler',
    ]);
  });

  it('Programm korrigiert, aber ohne Eingangsverzögerung zählt der prellende Schalter mehrfach', () => {
    const src = readFileSync(join(DATA, '25-rolltor.scl'), 'utf8');
    const board = { ...BOARDS['25-rolltor']!, config: {} };
    const s = solutionFor(level, src, board);
    const v = verify(level, s);
    expect([...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))]).toEqual(['zaehler']);
  });

  it('Änderungsumfang: hinzugefügte plus entfernte Zeilen, Kommentare zählen nicht', () => {
    expect(lineChanges(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(2);
    expect(lineChanges(['a'], ['a', 'b'])).toBe(1);
    const given = givenSolution(level)!;
    const p = given.projects.cpu1!;
    const main = p.blocks.find((b) => b.name === 'Main') as { source: string };
    main.source = `// nur ein Kommentar\n${main.source}`;
    expect(compileSolution(level, given).changes).toBe(0);
  });
});

describe('Meisterstück', () => {
  const level = levelById('27-hochbehaelter')!;
  const ref = readFileSync(join(DATA, '27-hochbehaelter.scl'), 'utf8');
  const failedTests = (src: string, board = BOARDS[level.id]!) => {
    const v = verify(level, solutionFor(level, src, board));
    return [...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))];
  };

  it('ohne Drahtbrucherkennung läuft die Pumpe bei 32767 nicht – Störung fehlt', () => {
    expect(failedTests(ref.replace('#stoerung := "Fuellstand" > 30000;', '#stoerung := FALSE;'))).toEqual(
      ['drahtbruch'],
    );
  });

  it('falscher Messbereich (0–10 V) liefert Überlauf', () => {
    const board = { ...BOARDS[level.id]!, config: {} };
    expect(failedTests(ref, board)).toEqual(['normal', 'drahtbruch']);
  });

  it('Automatik-Schalter missachtet', () => {
    expect(failedTests(ref.replace('IF NOT "P_Auto" OR #stoerung THEN', 'IF #stoerung THEN'))).toEqual([
      'aus',
    ]);
  });
});

describe('Erweiterung', () => {
  const level = levelById('26-saege')!;
  const failedTests = (src: string) => {
    const v = verify(level, solutionFor(level, src));
    return [...new Set(v.runs.filter((r) => !r.passed).map((r) => r.testId))];
  };

  it('Regressionstests stammen aus Auftrag 23 und sind markiert', () => {
    const reg = level.tests.filter((t) => t.regression).map((t) => t.id);
    expect(reg).toEqual(levelById('23-positionieren')!.tests.map((t) => `alt_${t.id}`));
  });

  it('die alte Lösung besteht die Regression, aber nicht den Schnitt', () => {
    const old = readFileSync(join(DATA, '23-positionieren.scl'), 'utf8');
    expect(failedTests(old)).toEqual(['schnitt', 'sperre']);
  });

  it('ohne Verriegelung fährt der Anschlag während des Schnitts', () => {
    const src = readFileSync(join(DATA, '26-saege.scl'), 'utf8')
      .replace(
        'IF "Start" AND NOT "Achse".start_alt AND "Kette".schritt = 0 THEN',
        'IF "Start" AND NOT "Achse".start_alt THEN',
      )
      .replace(/ AND "Kette"\.schritt = 0;/g, ';');
    expect(failedTests(src)).toEqual(['sperre']);
  });

  it('ohne eigenen Stand beginnt die Erweiterung mit dem gelieferten Vorgänger', () => {
    const g = givenSolution(level)!;
    expect(g.modules.map((m) => m.type)).toEqual(['cpu-klein', 'di8hf', 'do4']);
    expect(compileSolution(level, g).changes).toBeUndefined();
  });
});

describe('KOP-Lösung', () => {
  it('Level 1 in KOP besteht und verhält sich wie SCL', () => {
    const level = levelById('01-foerderband')!;
    const board = BOARDS[level.id]!;
    const base: Solution = { version: 2, ...board, projects: {} };
    const analysis = analyzeBoard(level, base);
    const project: PlcProject = {
      tags: [],
      blocks: [
        {
          kind: 'OB',
          name: 'Main',
          number: 1,
          lang: 'KOP',
          iface: {},
          source: '',
          kop: {
            lad: [
              {
                id: 'nw1',
                title: 'Selbsthaltung',
                items: [
                  {
                    k: 'parallel',
                    id: 'p',
                    branches: [
                      [{ k: 'contact', id: 'a', operand: '"Start"' }],
                      [{ k: 'contact', id: 'b', operand: '"Bandmotor"' }],
                    ],
                  },
                  { k: 'contact', id: 'c', operand: '"Stopp"' },
                ],
                coils: [{ id: 'q', kind: '=', operand: '"Bandmotor"' }],
              },
            ],
          },
        },
      ],
    };
    const kop = { ...base, projects: { cpu1: syncDeviceTags(level, analysis, 'cpu1', project) } };
    const a = verify(level, kop);
    expect(a.passed).toBe(true);
    const b = verify(level, reference(level));
    expect(a.runs.map((r) => r.traces)).toEqual(b.runs.map((r) => r.traces));
    expect(compileSolution(level, kop).cpus.get('cpu1')).toMatchObject({
      lang: 'KOP',
      size: 4,
      used: 1,
    });
  });
});
