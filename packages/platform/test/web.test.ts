import { describe, expect, it } from 'vitest';
import { webStore } from '../src';

/** einfacher Ersatz für localStorage */
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
    Object.defineProperty(this, k, { value: v, enumerable: true, configurable: true });
  }
  removeItem(k: string) {
    this.m.delete(k);
    delete (this as Record<string, unknown>)[k];
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}

describe('Web-Speicher', () => {
  it('liest und schreibt unter denselben Schlüsseln wie bisher', () => {
    const ls = new MemoryStorage() as unknown as Storage;
    ls.setItem('zyklus.fortschritt', '{"a":1}');
    const s = webStore(ls);
    expect(s.getItem('zyklus.fortschritt')).toBe('{"a":1}');
    s.setItem('zyklus.ui.split.x', '0.5');
    expect(ls.getItem('zyklus.ui.split.x')).toBe('0.5');
    expect(s.keys().sort()).toEqual(['zyklus.fortschritt', 'zyklus.ui.split.x']);
    s.removeItem('zyklus.fortschritt');
    expect(s.getItem('zyklus.fortschritt')).toBeNull();
  });

  it('fällt bei gesperrtem Speicher auf einen flüchtigen Speicher zurück', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('x');
      },
    } as unknown as Storage;
    const s = webStore(broken);
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    expect(webStore(undefined).getItem('nichts')).toBeNull();
  });
});
