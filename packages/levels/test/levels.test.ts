import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
import { LEVELS, compileSolution, levelById } from '../src';
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
  return verifySolution(level, solution, c.programs, c.size);
}

describe('Kampagne', () => {
  it('alle Level sind gültig und fortlaufend nummeriert', () => {
    expect(LEVELS.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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
