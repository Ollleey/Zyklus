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

describe('Meldungen auf Englisch', () => {
  it('übersetzt typische Compiler-, Schaltschrank- und Prüfmeldungen', async () => {
    const { translateMessage } = await import('../src/i18n/messages');
    const { compileScl } = await import('@zyklus/scl-compiler');
    const broken = [
      '"Gibts" := TRUE;',
      '#x := 1;',
      'IF TRUE "Motor" := TRUE; END_IF;',
      '"T"(IN := TRUE);',
      '%MW0 := 1.5 AND 2;',
    ];
    const msgs = broken.flatMap((src) => compileScl(src).diagnostics.map((d) => d.message));
    expect(msgs.length).toBeGreaterThan(3);
    const german = /[äöüß„]|\b(ist|nicht|fehlt|erwartet|kein|der|die|das)\b/;
    const left = msgs.map(translateMessage).filter((m) => german.test(m));
    expect(left).toEqual([]);
    expect(translateMessage('Kabelkanal in Spalte 3 ist überfüllt (5 von 4 Leitungen)')).toBe(
      'Cable duct in column 3 is overfull (5 of 4 cables)',
    );
    expect(translateMessage('„THEN“ erwartet nach der IF-Bedingung')).toBe(
      '“THEN” expected after the IF condition',
    );
    expect(translateMessage('etwas Unbekanntes')).toBe('etwas Unbekanntes');
  });
});
