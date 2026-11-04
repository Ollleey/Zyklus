import { describe, expect, it } from 'vitest';
import { emptySolution, validateLevel } from '@zyklus/sim-core';
import { givenSolution } from '@zyklus/levels';
import {
  BLUEPRINTS,
  DIFFICULTIES,
  dailyCode,
  formatCode,
  generateJob,
  parseCode,
  randomCode,
  verify,
  type JobCode,
} from '../src';

describe('Auftragscode', () => {
  it('lässt sich lesen und schreiben, verwechselbare Zeichen sind erlaubt', () => {
    const c: JobCode = { blueprint: 'S', difficulty: 'G', variant: 'N', seed: 123456789 };
    const text = formatCode(c);
    expect(text).toMatch(/^SGN-[0-9A-Z]{6}$/);
    expect(parseCode(text)).toEqual(c);
    expect(parseCode(text.toLowerCase().replace('-', ' '))).toEqual(c);
    expect(parseCode('TMF-0O1IL0')).toEqual(parseCode('TMF-001110'));
    expect(parseCode('XGN-123456')).toBeNull();
    expect(parseCode('SGN-12345')).toBeNull();
  });

  it('Zufallscode und Tagesauftrag', () => {
    let x = 0.3;
    const r = randomCode({ blueprint: 'T' }, () => (x = (x * 7.13) % 1));
    expect(r.blueprint).toBe('T');
    expect(r.seed).toBeLessThan(2 ** 30);
    const a = dailyCode(new Date(2026, 10, 4));
    expect(dailyCode(new Date(2026, 10, 4, 18))).toEqual(a);
    expect(formatCode(dailyCode(new Date(2026, 10, 5)))).not.toBe(formatCode(a));
  });
});

describe('Zufallsaufträge', () => {
  for (const b of BLUEPRINTS)
    for (const d of DIFFICULTIES)
      it(`${b}${d}: gleicher Code, gleicher Auftrag; Musterlösung besteht, leeres Programm nicht`, () => {
        const code = formatCode({
          blueprint: b,
          difficulty: d,
          variant: 'N',
          seed: 4242 + d.charCodeAt(0),
        });
        const job = generateJob(code);
        expect(generateJob(code).level).toEqual(job.level);
        const level = validateLevel(job.level);
        expect(level.id).toBe(`zufall-${code}`);
        expect(level.title.en).toBeTruthy();
        expect(level.datasheet.en).toMatch(/# Devices/);
        expect(level.par).toBeDefined();
        expect(verify(level, job.reference)?.passed).toBe(true);
        // Lehrling: Schrank fertig verdrahtet; sonst leer
        const start = givenSolution(level) ?? emptySolution();
        expect(start.wires.length > 0).toBe(d === 'L');
        expect(verify(level, start)?.passed ?? false).toBe(false);
      }, 120_000);

  for (const b of BLUEPRINTS)
    it(`${b}: Bestandsanlage mit eingebautem Fehler fällt durch, die Musterlösung ändert wenig`, () => {
      const job = generateJob({ blueprint: b, difficulty: 'G', variant: 'F', seed: 777 });
      const level = job.level;
      expect(level.kind).toBe('bestand');
      expect(level.mail.body.de).toMatch(/Umbau/);
      const given = givenSolution(level)!;
      expect(verify(level, given)?.passed).toBe(false);
      const ref = verify(level, job.reference)!;
      expect(ref.passed).toBe(true);
      expect(ref.metrics.changes).toBeGreaterThan(0);
      expect(ref.metrics.changes).toBeLessThanOrEqual(4);
    }, 120_000);

  it('ungültiger Code', () => {
    expect(() => generateJob('kein code')).toThrow(/Ungültig/);
  });
});
