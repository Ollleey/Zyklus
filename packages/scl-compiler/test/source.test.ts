import { describe, expect, it } from 'vitest';
import { Cpu } from '@zyklus/sim-core';
import { compileProject, compileSource, projectToSource, sourceToProject } from '../src';
import { DB, IDB, TAGS } from './harness';
import type { InstanceDb, PlcProject } from '@zyklus/sim-core';

const PROJECT: PlcProject = {
  tags: TAGS,
  blocks: [
    {
      kind: 'OB',
      name: 'Main',
      number: 1,
      lang: 'SCL',
      title: 'Main Program Sweep (Cycle)',
      iface: {
        Temp: [{ name: 'tmp', type: 'Int', comment: 'Hilfswert' }],
        Constant: [{ name: 'GRENZE', type: 'Int', init: '3' }],
      },
      source:
        'REGION Zählen\n  "Zaehler".CTU(CU := "Sensor", R := "Stopp", PV := GRENZE);\nEND_REGION\n#tmp := "Zaehler".CV;\n"Daten".Anzahl := #tmp;\n"Lampe" := "Zaehler".QU;',
    },
    DB('Daten', [['Anzahl', 'Int', '0']]),
    IDB('Zaehler', 'IEC_COUNTER'),
  ],
};

describe('Austausch mit TIA-Quellen', () => {
  it('Export erzeugt TIA-Quelltext mit Datenbausteinen vor dem OB', () => {
    const src = projectToSource(PROJECT);
    expect(src.indexOf('DATA_BLOCK "Daten"')).toBeLessThan(
      src.indexOf('ORGANIZATION_BLOCK "Main"'),
    );
    expect(src).toContain(
      `DATA_BLOCK "Zaehler"\n{ S7_Optimized_Access := 'TRUE' }\nVERSION : 0.1\nNON_RETAIN\nIEC_COUNTER`,
    );
    expect(src).toContain('      Anzahl : Int := 0;');
    expect(src).toContain('   VAR_TEMP \n      tmp : Int;   // Hilfswert\n   END_VAR');
    expect(src).toContain('   VAR CONSTANT \n      GRENZE : Int := 3;');
    expect(src).toContain('BEGIN\n\tREGION Zählen\n\t  "Zaehler".CTU(');
    expect(src.trimEnd().endsWith('END_ORGANIZATION_BLOCK')).toBe(true);
  });

  it('Export → Import ergibt dasselbe Projekt', () => {
    const back = sourceToProject(projectToSource(PROJECT), TAGS);
    expect(back.diagnostics).toEqual([]);
    const strip = (p: PlcProject) =>
      p.blocks
        .map((b) => {
          if (b.kind === 'OB' || b.kind === 'FB' || b.kind === 'FC') {
            const iface = Object.fromEntries(
              Object.entries(b.iface).map(([s, rows]) => [
                s,
                rows!.map((r) => ({ name: r.name, type: r.type, init: r.init })),
              ]),
            );
            return { kind: b.kind, name: b.name, iface, source: b.source };
          }
          if (b.kind === 'DB') return { kind: b.kind, name: b.name, vars: b.vars };
          return { kind: b.kind, name: b.name, of: (b as InstanceDb).of };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    expect(strip(back.project!)).toEqual(strip(PROJECT));
  });

  it('Projekt und exportierte Quelle verhalten sich gleich', () => {
    const a = compileProject(PROJECT);
    const b = compileSource(projectToSource(PROJECT), { tags: TAGS });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.statementCount).toBe(4);
    expect(b.statementCount).toBe(4);
    for (const r of [a, b]) {
      const cpu = new Cpu({ name: 'x', cycleMs: 1, maxOpsPerCycle: 1000 }, r.program!);
      for (let t = 0; t < 6; t++) {
        cpu.setInput('%I0.2', t % 2 === 1);
        cpu.scan(t);
      }
      expect(cpu.readSlot('Daten.Anzahl')).toBe(3);
      expect(cpu.read('%Q0.1')).toBe(true);
    }
  });

  it('Fehlermeldungen aus einer Quelle zeigen auf die Zeile in der Quelle', () => {
    const r = compileSource(
      'ORGANIZATION_BLOCK "Main"\nBEGIN\n  "Motor" := 5;\nEND_ORGANIZATION_BLOCK',
      { tags: TAGS },
    );
    expect(r.diagnostics[0]).toMatchObject({
      start: { line: 3, col: 14 },
      location: { part: 'code', block: 'Main' },
    });
  });
});
