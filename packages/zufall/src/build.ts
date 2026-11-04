import {
  MODULE_TYPES,
  analyzeBoard,
  autoWire,
  emptyProject,
  emptySolution,
  moduleType,
  syncDeviceTags,
  verifySolution,
  type Level,
  type PlacedModule,
  type Solution,
  type Verification,
} from '@zyklus/sim-core';
import { sourceToProject } from '@zyklus/scl-compiler';
import { compileSolution } from '@zyklus/levels';

/**
 * Schrank für einen erzeugten Auftrag: CPU und so viele Baugruppen, wie die Geräte brauchen,
 * automatisch verdrahtet. Die Variablentabelle kommt aus den Namensvorschlägen der Geräte.
 */
export function buildRack(level: Level, cpuType: string): Solution {
  const modules: PlacedModule[] = [{ id: 'cpu1', type: cpuType, x: 0 }];
  let x = MODULE_TYPES[cpuType]!.width;
  const add = (type: string) => {
    modules.push({ id: `m${modules.length}`, type, x });
    x += MODULE_TYPES[type]!.width;
  };
  add('dio8');
  for (let i = 0; i < 8; i++) {
    const r = autoWire(level, { ...emptySolution(), modules: [...modules] });
    const miss = r.missing;
    if (!Object.values(miss).some((n) => (n ?? 0) > 0)) return r.solution;
    if ((miss.DI ?? 0) > 0) add('di8');
    if ((miss.DO ?? 0) > 0) add('do8');
    if ((miss.AI ?? 0) > 0) add('ai2');
    if ((miss.REL ?? 0) > 0) add('rel4');
  }
  throw new Error('Schrank lässt sich nicht bestücken');
}

/** Lösung aus Schrank und SCL-Quelle (externe Quelle wie beim Export) */
export function withProgram(level: Level, rack: Solution, source: string | null): Solution {
  const analysis = analyzeBoard(level, rack);
  const projects: Solution['projects'] = {};
  for (const m of rack.modules) {
    if (moduleType(m.type).kind !== 'cpu') continue;
    let p = syncDeviceTags(level, analysis, m.id, emptyProject());
    if (source) {
      const r = sourceToProject(source, p.tags);
      if (!r.project) throw new Error(r.diagnostics.map((d) => d.message).join('\n'));
      p = { tags: p.tags, blocks: r.project.blocks };
    }
    projects[m.id] = p;
  }
  return { ...rack, projects };
}

/** Lösung gegen alle Testfälle prüfen; `null`, wenn sie nicht übersetzt */
export function verify(level: Level, solution: Solution): Verification | null {
  const c = compileSolution(level, solution);
  if (!c.ok) return null;
  return verifySolution(level, solution, c.programs, c.size, undefined, c.changes);
}
