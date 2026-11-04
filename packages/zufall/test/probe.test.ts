import { appendFileSync } from 'node:fs';
const OUT = process.env.ZYKLUS_PROBE ?? '';
import { describe, it } from 'vitest';
import { Rng, deriveSeed } from '@zyklus/sim-core';
import { publishLevel } from '@zyklus/plant-sim';
import { sortier, tank } from '../src/blueprints';
import { buildRack, verify, withProgram } from '../src/build';
import { customerOf } from '../src/texts';

// Diagnose: welche Regeln der Musterlösung scheitern (nur mit ZYKLUS_PROBE=1)
describe.runIf(process.env.ZYKLUS_PROBE)('Probe', () => {
  for (const [name, make] of (
    [
      ['S', sortier],
      ['T', tank],
    ] as const
  ).filter(([n]) => (process.env.ZYKLUS_B ?? 'ST').includes(n))) {
    for (const d of (process.env.ZYKLUS_D ?? 'LGM').split('') as ('L' | 'G' | 'M')[]) {
      it(`${name}${d}`, () => {
        for (let seed = 1; seed <= 12; seed++) {
          const rng = new Rng(deriveSeed(seed, `${name}${d}`));
          const draft = make(rng, d, customerOf(rng));
          const level = publishLevel(
            draft.layout,
            { title: 'x', customer: 'x', mail: '', notes: '' },
            draft.tests,
          );
          const rack = buildRack(level, draft.cpu);
          const v = verify(level, withProgram(level, rack, draft.source));
          const fails = v
            ? v.runs.flatMap((r) => [
                ...(r.stop ? [`${r.testId}: ${r.stop}`] : []),
                ...r.criteria
                  .filter((c) => !c.ok)
                  .map((c) => `${r.testId}: ${c.name.de} – ${c.detail}`),
              ])
            : ['übersetzt nicht'];
          appendFileSync(
            OUT,
            `${name}${d} seed ${seed}: ${v?.passed ? 'OK' : fails.join(' | ')}
`,
          );
        }
      }, 300_000);
    }
  }
});
