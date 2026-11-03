import {
  analyzeBoard,
  autoWire as autoWireBoard,
  emptyProject,
  moduleType,
  syncDeviceTags,
  type AnalogRange,
  type Level,
  type ModuleConfig,
  type PlcProject,
  type Solution,
} from '@zyklus/sim-core';

/** Reine Bearbeitungsfunktionen für eine Lösung. Danach wird die Variablentabelle nachgeführt. */

/** Variablentabelle nach Änderungen an den Geräten nachführen (Sandkasten) */
export function withTags(level: Level, s: Solution): Solution {
  const analysis = analyzeBoard(level, s);
  const projects: Solution['projects'] = {};
  for (const m of s.modules) {
    if (moduleType(m.type).kind !== 'cpu') continue;
    projects[m.id] = syncDeviceTags(level, analysis, m.id, s.projects[m.id] ?? emptyProject());
  }
  return { ...s, projects };
}

function nextId(s: Solution, type: string): string {
  const prefix = type.startsWith('cpu') ? 'cpu' : type.replace(/\d+$/, '');
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!s.modules.some((m) => m.id === id)) return id;
  }
}

export function placeModule(level: Level, s: Solution, type: string, x: number): Solution {
  const id = nextId(s, type);
  return withTags(level, { ...s, modules: [...s.modules, { id, type, x }] });
}

export function moveModule(level: Level, s: Solution, id: string, x: number): Solution {
  return withTags(level, { ...s, modules: s.modules.map((m) => (m.id === id ? { ...m, x } : m)) });
}

export function removeModule(level: Level, s: Solution, id: string): Solution {
  const projects = { ...s.projects };
  delete projects[id];
  const config = { ...s.config };
  delete config[id];
  return withTags(level, {
    ...s,
    modules: s.modules.filter((m) => m.id !== id),
    wires: s.wires.filter((w) => w.module !== id),
    projects,
    config,
  });
}

/** Verbindet ein Gerät mit einem Kanal; alte Leitungen des Geräts und des Kanals entfallen. */
export function connect(
  level: Level,
  s: Solution,
  device: string,
  module: string,
  channel: number,
): Solution {
  const wires = s.wires.filter(
    (w) => w.device !== device && !(w.module === module && w.channel === channel),
  );
  return withTags(level, { ...s, wires: [...wires, { device, module, channel }] });
}

export function disconnect(level: Level, s: Solution, device: string): Solution {
  return withTags(level, { ...s, wires: s.wires.filter((w) => w.device !== device) });
}

/** Messbereich eines Analogkanals setzen (Modul-Inspektor) */
/** Einstellungen einer Baugruppe ändern; `undefined` entfernt einen Eintrag */
export function setModuleConfig(
  s: Solution,
  moduleId: string,
  patch: Partial<ModuleConfig>,
): Solution {
  const next: ModuleConfig = { ...s.config?.[moduleId], ...patch };
  for (const k of Object.keys(next) as (keyof ModuleConfig)[]) {
    if (next[k] === undefined) delete next[k];
  }
  return { ...s, config: { ...s.config, [moduleId]: next } };
}

export function setChannelRange(
  s: Solution,
  moduleId: string,
  ch: number,
  range: AnalogRange,
): Solution {
  const cfg = s.config?.[moduleId] ?? {};
  return {
    ...s,
    config: { ...s.config, [moduleId]: { ...cfg, ranges: { ...cfg.ranges, [ch]: range } } },
  };
}

export function updateProject(
  s: Solution,
  cpu: string,
  f: (p: PlcProject) => PlcProject,
): Solution {
  return { ...s, projects: { ...s.projects, [cpu]: f(s.projects[cpu] ?? emptyProject()) } };
}

/** Automatisch verdrahten (siehe sim-core) und Variablentabelle nachführen */
export function autoWire(level: Level, s: Solution): ReturnType<typeof autoWireBoard> {
  const r = autoWireBoard(level, s);
  return { ...r, solution: withTags(level, r.solution) };
}
