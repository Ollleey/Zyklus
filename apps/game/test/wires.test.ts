import { describe, expect, it } from 'vitest';
import { roundedPath } from '../src/components/cabinet/wires';

describe('Leitungszug mit Biegeradius', () => {
  it('rundet jede Ecke mit dem Radius ab', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      2,
    );
    expect(d).toBe('M0,0 L8,0 Q10,0 10,2 L10,10');
  });

  it('kurze Stücke begrenzen den Radius, doppelte Punkte fallen weg', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 8 },
      ],
      5,
    );
    expect(d).toBe('M0,0 L1,0 Q2,0 2,1 L2,8');
  });

  it('ein Punkt ergibt keinen Pfad', () => {
    expect(roundedPath([{ x: 1, y: 1 }])).toBe('');
  });
});
