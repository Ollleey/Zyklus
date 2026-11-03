import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Cpu,
  LevelRun,
  ProgramBuilder,
  analyzeBoard,
  c,
  io,
  syncDeviceTags,
  verifySolution,
  type PlacedModule,
  type Solution,
  type Wire,
} from '@zyklus/sim-core';
import { formatDiagnostic, sourceToProject } from '@zyklus/scl-compiler';
import { compileSolution, levelById } from '../src';

const DATA = join(__dirname, '..', 'data', 'reference');
const BOARDS = JSON.parse(readFileSync(join(DATA, 'boards.json'), 'utf8')) as Record<
  string,
  { modules: PlacedModule[]; wires: Wire[] }
>;

function solution(id: string, scl: string, config: Solution['config'] = {}): Solution {
  const level = levelById(id)!;
  const base: Solution = { version: 2, ...BOARDS[id]!, projects: {}, config };
  const analysis = analyzeBoard(level, base);
  const p = sourceToProject(scl);
  if (!p.project) throw new Error(p.diagnostics.map(formatDiagnostic).join('\n'));
  return { ...base, projects: { cpu1: syncDeviceTags(level, analysis, 'cpu1', p.project) } };
}

const ob = (body: string, dbs = '') =>
  `${dbs}\nORGANIZATION_BLOCK "Main"\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;

describe('Gerätekonfiguration', () => {
  it('Eingangsverzögerung entprellt in der Hardware (Auftrag 5 ohne Entprellung im Programm)', () => {
    const level = levelById('05-zaehler')!;
    const src = ob(
      '"Teile"(CU := "Lichtschranke", R := "Quittieren", PV := 5);\n"Karton_voll" := "Teile".Q;',
      'DATA_BLOCK "Teile"\nNON_RETAIN\nCTU_INT\nBEGIN\nEND_DATA_BLOCK',
    );
    const verify = (s: Solution) => {
      const c = compileSolution(level, s);
      return verifySolution(level, s, c.programs, c.size).passed;
    };
    expect(verify(solution('05-zaehler', src))).toBe(false);
    expect(verify(solution('05-zaehler', src, { di1: { inputDelay: 3.2 } }))).toBe(true);
  });

  it('Anfangsadresse ändern, Überschneidungen werden gemeldet', () => {
    const level = levelById('05-zaehler')!;
    const base = { version: 2 as const, ...BOARDS['05-zaehler']!, projects: {} };
    const a = analyzeBoard(level, { ...base, config: { di1: { start: { di: 4 } } } });
    expect(a.bindings.get('B1')?.address).toBe('%I4.0');
    expect(a.ok).toBe(true);
    const twoDi = {
      ...base,
      modules: [...base.modules, { id: 'di2', type: 'di8', x: 8 }],
      config: { di2: { start: { di: 0 } } },
    };
    const b = analyzeBoard({ ...level, allowedModules: [...level.allowedModules] }, twoDi);
    expect(b.issues.find((i) => i.code === 'address')?.message).toMatch(/überschneiden sich/);
  });

  it('Ausgänge bei STOP: letzten Wert halten bzw. Ersatzwert', () => {
    const level = levelById('01-foerderband')!;
    const id = '01-foerderband';
    const src = ob('"Bandmotor" := TRUE;');
    for (const [cfg, expected] of [
      [{}, false],
      [{ do1: { onStop: 'hold' as const } }, true],
      [{ do1: { onStop: 'substitute' as const, substitute: { 0: true } } }, true],
    ] as const) {
      const s = solution(id, src, cfg);
      const c = compileSolution(level, s);
      const run = new LevelRun(level, s, c.programs, {});
      run.runTo(100);
      expect(run.outputValue(level.devices.find((d) => d.id === 'M1')!)).toBe(true);
      run.setCpuSwitch('cpu1', 'STOP');
      run.runTo(200);
      expect(run.outputValue(level.devices.find((d) => d.id === 'M1')!)).toBe(expected);
    }
  });
});

describe('System- und Taktmerker', () => {
  it('FirstScan nur im ersten Zyklus, Taktmerker 1 Hz auf Bit 5', () => {
    const b = new ProgramBuilder();
    const first = b.slot('Erster', 'INT');
    const jz = b.emit({ op: 'jz', cond: io('%M1.0'), to: -1 });
    b.emit({ op: 'bin', fn: 'add', t: 'INT', dst: first, a: first, b: c.int(1) });
    jz.to = b.pc;
    const cpu = new Cpu(
      { name: 'A', cycleMs: 1, maxOpsPerCycle: 100, systemByte: 1, clockByte: 0 },
      b.build(),
    );
    const seen: boolean[] = [];
    for (let t = 0; t < 1000; t += 250) {
      cpu.scan(t);
      seen.push(cpu.read('%M0.5') as boolean);
    }
    expect(cpu.readSlot('Erster')).toBe(1);
    expect(seen).toEqual([true, true, false, false]);
    expect(cpu.read('%M1.2')).toBe(true);
    expect(cpu.read('%M1.3')).toBe(false);
  });
});
