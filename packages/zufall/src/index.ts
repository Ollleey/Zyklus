import { Rng, deriveSeed, type Level, type Solution, type Text } from '@zyklus/sim-core';
import {
  connectionsOf,
  eventText,
  publishLevel,
  ruleTextEn,
  type PublishTest,
} from '@zyklus/plant-sim';
import { sortier, tank, type Draft } from './blueprints';
import { buildRack, verify, withProgram } from './build';
import { formatCode, parseCode, type JobCode } from './code';
import { customerOf } from './texts';

export * from './code';
export { buildRack, verify, withProgram } from './build';

/**
 * Zufallsaufträge: aus einem Auftragscode entsteht deterministisch ein gewöhnlicher Auftrag.
 * Jeder erzeugte Auftrag ist mit der Musterlösung des Bauplans geprüft; deren Kennzahlen sind
 * die Richtwerte. Varianten: neue Anlage (Lehrling mit fertig verdrahtetem Schrank) oder
 * Bestandsanlage mit einem eingebauten Fehler, der in mindestens einem Testfall auffällt.
 */

export interface RandomJob {
  code: string;
  level: Level;
  /** geprüfte Musterlösung (nicht für die Spielenden, für Tests und Richtwerte) */
  reference: Solution;
}

const TEST_EN: Record<string, string> = {
  Normalbetrieb: 'Normal operation',
  'Not-Halt': 'Emergency stop',
  Automatik: 'Auto',
  Handbetrieb: 'Manual',
  Störungen: 'Faults',
};

const EMPTY_MAIN = `ORGANIZATION_BLOCK "Main"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
	// Programm hier schreiben
END_ORGANIZATION_BLOCK
`;

function datasheetEn(draft: Draft, tests: PublishTest[]): string {
  const rows = connectionsOf(draft.layout).map(
    (c) => `| ${c.device.label} | ${c.device.kind} | ${c.device.tag} |`,
  );
  const checks = tests.map((t) => {
    const ev = (t.events ?? []).map((e) => `- ${eventText(e, true)}`);
    return [
      `**${TEST_EN[t.name] ?? t.name}** (${t.durationMs / 1000} s)`,
      ...(ev.length ? [`Sequence:\n\n${ev.join('\n')}`] : []),
      `Verification:\n\n${t.rules.map((r) => `- ${ruleTextEn(r)}`).join('\n')}`,
    ].join('\n\n');
  });
  return [
    draft.notes.en,
    '# Devices',
    '| Device | Kind | Tag |\n|---|---|---|\n' + rows.join('\n'),
    '# Verification',
    ...checks,
  ].join('\n\n');
}

const both = (t: Text): Text => ({ de: t.de, en: t.en ?? t.de });

/** Auftrag zu einem Code; wirft, wenn kein prüfbarer Auftrag entsteht (sollte nicht vorkommen) */
export function generateJob(input: JobCode | string): RandomJob {
  const job = typeof input === 'string' ? parseCode(input) : input;
  if (!job) throw new Error('Ungültiger Auftragscode');
  const code = formatCode(job);
  const rng = new Rng(deriveSeed(job.seed, `${job.blueprint}${job.difficulty}${job.variant}`));
  const customer = customerOf(rng);
  const make = job.blueprint === 'S' ? sortier : tank;

  // Zufallswerte, die die Musterlösung nicht schafft, werden neu gewürfelt
  for (let attempt = 0; attempt < 8; attempt++) {
    const draft = make(rng, job.difficulty, customer);
    const base = publishLevel(
      draft.layout,
      {
        title: draft.title.de,
        customer: customer.firm.de,
        mail: draft.mail.de,
        notes: draft.notes.de,
      },
      draft.tests,
    );
    let level: Level = {
      ...base,
      id: `zufall-${code}`,
      title: both(draft.title),
      customer: both(customer.firm),
      mail: {
        from: {
          de: `${customer.person.de}, ${customer.firm.de}`,
          en: `${customer.person.en}, ${customer.firm.en}`,
        },
        subject: both(draft.title),
        body: both(draft.mail),
      },
      datasheet: { de: base.datasheet.de, en: datasheetEn(draft, draft.tests) },
      tests: base.tests.map((t) => ({
        ...t,
        name: { de: t.name.de, en: TEST_EN[t.name.de] ?? t.name.de },
      })),
    };
    const rack = buildRack(level, draft.cpu);
    const reference = withProgram(level, rack, draft.source);
    const v = verify(level, reference);
    if (!v?.passed) continue;

    if (job.variant === 'F') {
      // Fehler einbauen, der in einem Testfall auffällt
      const order = draft.mutations
        .map((m, i) => [m, rng.next() + i * 0] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
      let done = false;
      for (const m of order) {
        if (!draft.source.includes(m.from)) continue;
        const broken = draft.source.replace(m.from, m.to);
        const bad = verify(level, withProgram(level, rack, broken));
        if (!bad || bad.passed) continue;
        level = {
          ...level,
          kind: 'bestand',
          given: { modules: rack.modules, wires: rack.wires, sources: { cpu1: broken } },
          mail: {
            ...level.mail,
            subject: { de: `Störung: ${draft.title.de}`, en: `Trouble: ${draft.title.en}` },
            body: {
              de: `Die Anlage läuft seit einem Umbau nicht mehr richtig: ${m.symptom.de}\n\nBitte das vorhandene Programm korrigieren und dabei so wenig wie möglich ändern. Zur Erinnerung die ursprüngliche Beschreibung:\n\n${draft.mail.de}`,
              en: `Since a modification the plant no longer works properly: ${m.symptom.en}\n\nPlease correct the existing program and change as little as possible. As a reminder, the original description:\n\n${draft.mail.en}`,
            },
          },
        };
        done = true;
        break;
      }
      if (!done) continue;
    } else if (job.difficulty === 'L') {
      // Lehrling: Schrank fertig bestückt und verdrahtet, nur das Programm fehlt
      level = {
        ...level,
        given: { modules: rack.modules, wires: rack.wires, sources: { cpu1: EMPTY_MAIN } },
      };
    }
    // Richtwerte aus der Musterlösung (Bestandsanlage: mit Änderungsumfang gegenüber dem Fehlerstand)
    const ref = verify(level, reference);
    if (!ref?.passed) continue;
    return { code, level: { ...level, par: ref.metrics }, reference };
  }
  throw new Error(`Zum Code ${code} entsteht kein prüfbarer Auftrag`);
}
