import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeBoard,
  autoWire,
  emptyProject,
  emptySolution,
  moduleType,
  syncDeviceTags,
  type Solution,
} from '@zyklus/sim-core';
import { sourceToProject } from '@zyklus/scl-compiler';
import { compileSolution } from '@zyklus/levels';
import {
  TEMPLATES,
  levelFromLayout,
  parseAnlageFile,
  toAnlageFile,
  type TemplateDef,
} from '../src';

const DIR = join(__dirname, '..', 'vorlagen');
const STAMP = '2026-10-30T00:00:00.000Z';

/** Vorlage verdrahten und (mit Programm) übersetzen */
function build(def: TemplateDef, withProgram: boolean): Solution {
  const level = levelFromLayout(def.layout);
  const wired = autoWire(level, { ...emptySolution(), modules: def.modules }).solution;
  const analysis = analyzeBoard(level, wired);
  const projects: Solution['projects'] = {};
  for (const m of def.modules) {
    if (moduleType(m.type).kind !== 'cpu') continue;
    let p = syncDeviceTags(level, analysis, m.id, emptyProject());
    if (withProgram) {
      const r = sourceToProject(def.source, p.tags);
      if (!r.project) throw new Error(r.diagnostics.map((d) => d.message).join('\n'));
      p = { tags: p.tags, blocks: r.project.blocks };
    }
    projects[m.id] = p;
  }
  return { ...wired, projects };
}

function fileText(def: TemplateDef, withProgram: boolean): string {
  return toAnlageFile({
    name: withProgram ? def.name : `${def.name} (ohne Programm)`,
    description: def.description,
    author: 'ZYKLUS',
    created: STAMP,
    modified: STAMP,
    layout: def.layout,
    solution: build(def, withProgram),
    sim: { speed: 10, signals: null },
  });
}

describe('Vorlagen', () => {
  for (const def of TEMPLATES) {
    for (const withProgram of [true, false]) {
      const name = `${def.id}${withProgram ? '' : '-leer'}.anlage.json`;
      it(`${name} ist aktuell, vollständig verdrahtet und übersetzbar`, () => {
        const text = fileText(def, withProgram);
        const path = join(DIR, name);
        // Neu schreiben mit ZYKLUS_VORLAGEN=1 (oder wenn die Datei fehlt)
        if (process.env.ZYKLUS_VORLAGEN || !existsSync(path)) writeFileSync(path, text);
        expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(text);
        const parsed = parseAnlageFile(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const level = levelFromLayout(parsed.file.layout);
        const c = compileSolution(level, parsed.file.solution);
        expect(c.analysis.issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(parsed.file.solution.wires).toHaveLength(level.devices.length);
        expect(c.ok, JSON.stringify([...c.cpus.values()].flatMap((x) => x.diagnostics))).toBe(true);
      });
    }
  }
});
