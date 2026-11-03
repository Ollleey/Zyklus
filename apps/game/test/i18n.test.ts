import { describe, expect, it } from 'vitest';
import de from '../src/i18n/de.json';
import en from '../src/i18n/en.json';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Übersetzungen', () => {
  it('Englisch hat dieselben Schlüssel und Platzhalter wie Deutsch', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const [k, v] of Object.entries(de)) {
      expect([k, vars((en as Record<string, string>)[k]!)]).toEqual([k, vars(v)]);
    }
  });
});
