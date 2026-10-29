import { describe, expect, it } from 'vitest';
import { formatBool, formatValue } from '../src/state/prefs';

describe('Anzeige von BOOL-Werten', () => {
  it('0/1 ist Standard, TRUE/FALSE wählbar', () => {
    expect(formatBool(true, '01')).toBe('1');
    expect(formatBool(false, '01')).toBe('0');
    expect(formatBool(true, 'text')).toBe('TRUE');
    expect(formatBool(false, 'text')).toBe('FALSE');
  });

  it('Zahlen bleiben Zahlen', () => {
    expect(formatValue(27648, 'text')).toBe('27648');
    expect(formatValue(12.345, '01', 1)).toBe('12.3');
    expect(formatValue(undefined, '01')).toBe('');
  });
});
