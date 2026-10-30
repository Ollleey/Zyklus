import {
  analyzeBoard,
  channelInfo,
  emptyProject,
  ioGroups,
  moduleType,
  syncDeviceTags,
  type AnalogRange,
  type ChannelKind,
  type Level,
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

/**
 * Automatisch verdrahten: jedes nicht angeschlossene Gerät auf den ersten freien passenden Kanal
 * (Leistungsverbraucher nur auf Relais, sonst Relais zuletzt). Messbereiche analoger Kanäle werden
 * auf die Signalart des Geräts gestellt. `missing` zählt Geräte, für die kein Kanal frei war.
 */
export function autoWire(
  level: Level,
  s: Solution,
): { solution: Solution; wired: number; missing: Partial<Record<ChannelKind | 'REL', number>> } {
  const used = new Set(s.wires.map((w) => `${w.module}:${w.channel}`));
  const wiredDevices = new Set(s.wires.map((w) => w.device));
  const modules = [...s.modules].sort((a, b) => a.x - b.x);
  const wires = [...s.wires];
  let next: Solution = s;
  const missing: Partial<Record<ChannelKind | 'REL', number>> = {};
  let wired = 0;
  for (const d of level.devices) {
    if (wiredDevices.has(d.id)) continue;
    let found: { module: string; channel: number; ranges?: AnalogRange[] } | undefined;
    for (const pass of d.kind === 'DO' && !d.power ? [false, true] : [d.power === true]) {
      for (const m of modules) {
        const t = moduleType(m.type);
        if (d.kind === 'DO' && (t.kind === 'rel') !== pass) continue;
        const total = ioGroups(t).reduce((n, g) => n + g.count, 0);
        for (let ch = 0; ch < total; ch++) {
          const info = channelInfo(t, ch);
          if (info?.group.kind !== d.kind || used.has(`${m.id}:${ch}`)) continue;
          if (d.signal && info.group.ranges && !info.group.ranges.includes(d.signal)) continue;
          found = { module: m.id, channel: ch, ranges: info.group.ranges };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      const k = d.power ? 'REL' : d.kind;
      missing[k] = (missing[k] ?? 0) + 1;
      continue;
    }
    used.add(`${found.module}:${found.channel}`);
    wires.push({ device: d.id, module: found.module, channel: found.channel });
    wired++;
    if (d.signal && found.ranges?.includes(d.signal))
      next = setChannelRange(next, found.module, found.channel, d.signal);
  }
  return { solution: withTags(level, { ...next, wires }), wired, missing };
}
