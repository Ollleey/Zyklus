import { describe, expect, it } from 'vitest';
import { Cpu, type Block, type PlcProject } from '@zyklus/sim-core';
import { compileProject, formatDiagnostic, usedLibrary } from '../src';

const TAGS = [
  { name: 'Ist', address: '%MD10', t: 'REAL' as const },
  { name: 'Soll', address: '%MD14', t: 'REAL' as const },
  { name: 'Stell', address: '%MD18', t: 'REAL' as const },
  { name: 'Tune', address: '%M0.0', t: 'BOOL' as const },
  { name: 'Hand', address: '%M0.1', t: 'BOOL' as const },
  { name: 'Puls', address: '%Q0.0', t: 'BOOL' as const },
];

function project(start?: Record<string, string>): PlcProject {
  const blocks: Block[] = [
    {
      kind: 'OB',
      name: 'Main',
      number: 1,
      lang: 'SCL',
      iface: {},
      source:
        '"PID"(Setpoint := "Soll", Input := "Ist", Tune := "Tune", ManualEnable := "Hand", ManualValue := 40.0, Output => "Stell", Output_PWM => "Puls");',
    },
    { kind: 'IDB', name: 'PID', number: 1, of: 'PID_Compact', ...(start ? { start } : {}) },
  ];
  return { tags: TAGS, blocks };
}

function cpu(p: PlcProject): Cpu {
  const r = compileProject(p);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return new Cpu({ name: 't', cycleMs: 10, maxOpsPerCycle: 100_000 }, r.program!);
}

/** Strecke 1. Ordnung mit Totzeit: T = 20 s, K = 1 (Stellwert % → Istwert), Totzeit 2 s */
function plant(c: Cpu, seconds: number, state: { y: number; hist: number[] }, t0 = 0) {
  const dt = 0.1;
  for (let i = 0; i < seconds / dt; i++) {
    const t = t0 + i * dt;
    state.hist.push(c.read('%MD18', 'REAL') as number);
    const u = state.hist.length > 20 ? state.hist[state.hist.length - 21]! : 0;
    state.y += ((u - state.y) / 20) * dt;
    c.modify({ address: '%MD10', t: 'REAL' }, state.y);
    c.scan(Math.round(t * 1000));
  }
  return t0 + seconds;
}

describe('Technologie-Bibliothek: PID_Compact', () => {
  it('wird nur dazugenommen, wenn das Projekt ihn verwendet', () => {
    expect(usedLibrary(project()).map((b) => b.name)).toEqual(['PID_Compact']);
    expect(usedLibrary({ tags: [], blocks: [] })).toEqual([]);
  });

  it('Handbetrieb gibt den Handwert aus, Automatik regelt auf den Sollwert', () => {
    const c = cpu(project({ Gain: '2.0', Ti: '15.0' }));
    c.modify({ address: '%MD14', t: 'REAL' }, 50);
    c.modify({ address: '%M0.1' }, true);
    const s = { y: 0, hist: [] as number[] };
    let t = plant(c, 1, s);
    expect(c.read('%MD18', 'REAL')).toBeCloseTo(40, 3);
    expect(c.readSlot('PID.State')).toBe(4);
    c.modify({ address: '%M0.1' }, false);
    t = plant(c, 200, s, t);
    expect(c.readSlot('PID.State')).toBe(3);
    expect(Math.abs(s.y - 50)).toBeLessThan(1);
  });

  it('Selbstoptimierung bestimmt Gain und Ti und regelt danach stabil', () => {
    const c = cpu(project({ TuneHyst: '0.5' }));
    c.modify({ address: '%MD14', t: 'REAL' }, 30);
    const s = { y: 0, hist: [] as number[] };
    let t = plant(c, 1, s);
    c.modify({ address: '%M0.0' }, true);
    t = plant(c, 1, s, t);
    expect(c.readSlot('PID.State')).toBe(2);
    t = plant(c, 400, s, t);
    expect(c.readSlot('PID.State')).toBe(3);
    expect(c.readSlot('PID.Error')).toBe(false);
    const gain = c.readSlot('PID.Gain') as number;
    expect(gain).toBeGreaterThan(1);
    expect(c.readSlot('PID.Ti') as number).toBeGreaterThan(2);
    t = plant(c, 300, s, t);
    expect(Math.abs(s.y - 30)).toBeLessThan(1);
    // passt mit Reserve in das Befehlsbudget der kleinsten CPU (1000 je Zyklus)
    expect(c.metrics.maxOpsInCycle).toBeLessThan(400);
  });

  it('Startwerte im Instanz-DB werden geprüft', () => {
    const r = compileProject(project({ Gibts: '1.0' }));
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.message).join(' | ')).toMatch(
      /PID_Compact hat kein Element Gibts/i,
    );
  });
});

describe('Startwerte in der SCL-Quelle', () => {
  it('werden exportiert und wieder eingelesen', async () => {
    const { projectToSource, sourceToProject } = await import('../src');
    const src = projectToSource(project({ Gain: '2.5', Ti: '30.0' }));
    expect(src).toContain('Gain := 2.5;');
    const back = sourceToProject(src, TAGS).project!;
    expect(back.blocks.find((b) => b.name === 'PID')).toMatchObject({
      kind: 'IDB',
      start: { Gain: '2.5', Ti: '30.0' },
    });
    // der Bibliotheksbaustein selbst gehört nicht in die Quelle
    expect(src).not.toContain('FUNCTION_BLOCK "PID_Compact"');
  });
});

describe('Bibliothek ohne Aufruf', () => {
  it('meldet für den Bibliotheksbaustein selbst keine Warnung', () => {
    const p = project();
    (p.blocks[0] as { source: string }).source = '';
    const r = compileProject(p);
    expect(r.diagnostics.filter((d) => d.location.block === 'PID_Compact')).toEqual([]);
  });
});
