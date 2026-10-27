import { describe, expect, it } from 'vitest';
import { c, io, type InstanceKind } from '../src';
import { makeCpu } from './harness';

/** Timer an %I0.0 (IN), %I0.1 (R bei TONR), PT konstant; Q → %Q0.0, ET → %QD4 */
function timer(kind: InstanceKind, pt: number) {
  const cpu = makeCpu((b) => {
    const t = b.instance('T1', kind);
    b.emit({
      op: 'tmr',
      i: t.i,
      in: io('%I0.0'),
      pt: c.time(pt),
      r: kind === 'TONR' ? io('%I0.1') : undefined,
    });
    b.emit({ op: 'mov', dst: io('%Q0.0'), src: t.field('Q') });
    b.emit({ op: 'mov', dst: io('%QD4', 'TIME'), src: t.field('ET') });
  });
  /** Führt einen Zyklus bei `now` aus und liefert [Q, ET]. */
  return (now: number, IN: boolean, R = false): [boolean, number] => {
    cpu.setInput('%I0.0', IN);
    cpu.setInput('%I0.1', R);
    cpu.scan(now);
    return [cpu.read('%Q0.0') as boolean, cpu.read('%QD4', 'TIME') as number];
  };
}

describe('TON – Einschaltverzögerung', () => {
  it('Q nach PT, ET begrenzt auf PT', () => {
    const s = timer('TON', 100);
    expect(s(0, true)).toEqual([false, 0]);
    expect(s(50, true)).toEqual([false, 50]);
    expect(s(99, true)).toEqual([false, 99]);
    expect(s(100, true)).toEqual([true, 100]);
    expect(s(500, true)).toEqual([true, 100]);
    expect(s(510, false)).toEqual([false, 0]);
  });
  it('IN kürzer als PT → kein Q, Neustart von vorn', () => {
    const s = timer('TON', 100);
    s(0, true);
    expect(s(80, false)).toEqual([false, 0]);
    expect(s(90, true)).toEqual([false, 0]);
    expect(s(180, true)).toEqual([false, 90]);
    expect(s(190, true)).toEqual([true, 100]);
  });
  it('PT = 0 → Q sofort im selben Zyklus', () => {
    const s = timer('TON', 0);
    expect(s(0, false)).toEqual([false, 0]);
    expect(s(1, true)).toEqual([true, 0]);
  });
  it('Auflösung = Zykluszeit: Q erst im ersten Zyklus mit el ≥ PT', () => {
    const s = timer('TON', 25);
    s(0, true);
    expect(s(20, true)[0]).toBe(false);
    expect(s(30, true)).toEqual([true, 25]);
  });
});

describe('TOF – Ausschaltverzögerung', () => {
  it('Q sofort mit IN, fällt PT nach fallender Flanke', () => {
    const s = timer('TOF', 100);
    expect(s(0, false)).toEqual([false, 0]);
    expect(s(10, true)).toEqual([true, 0]);
    expect(s(20, false)).toEqual([true, 0]);
    expect(s(70, false)).toEqual([true, 50]);
    expect(s(119, false)).toEqual([true, 99]);
    expect(s(120, false)).toEqual([false, 100]);
    expect(s(300, false)).toEqual([false, 100]); // ET bleibt auf PT stehen
  });
  it('erneutes IN während Nachlauf setzt zurück (Retrigger)', () => {
    const s = timer('TOF', 100);
    s(0, true);
    s(10, false);
    expect(s(60, true)).toEqual([true, 0]);
    expect(s(70, false)).toEqual([true, 0]);
    expect(s(160, false)).toEqual([true, 90]);
    expect(s(170, false)).toEqual([false, 100]);
  });
  it('ET wird beim nächsten IN wieder 0', () => {
    const s = timer('TOF', 10);
    s(0, true);
    s(1, false);
    expect(s(20, false)).toEqual([false, 10]);
    expect(s(21, true)).toEqual([true, 0]);
  });
  it('PT = 0 → Q fällt mit IN', () => {
    const s = timer('TOF', 0);
    s(0, true);
    expect(s(1, false)).toEqual([false, 0]);
  });
});

describe('TP – Impuls', () => {
  it('fester Impuls unabhängig von IN-Länge', () => {
    const s = timer('TP', 100);
    expect(s(0, true)).toEqual([true, 0]);
    expect(s(10, false)).toEqual([true, 10]); // IN schon weg, Impuls läuft weiter
    expect(s(99, false)).toEqual([true, 99]);
    expect(s(100, false)).toEqual([false, 0]); // Ende, IN = 0 → ET zurück
  });
  it('nicht nachtriggerbar', () => {
    const s = timer('TP', 100);
    s(0, true);
    s(10, false);
    expect(s(50, true)).toEqual([true, 50]); // neue Flanke wird ignoriert
    expect(s(100, true)).toEqual([false, 100]); // ET bleibt PT solange IN = 1
    expect(s(150, true)).toEqual([false, 100]);
    expect(s(160, false)).toEqual([false, 0]);
    expect(s(170, true)).toEqual([true, 0]); // neuer Impuls
  });
  it('IN dauerhaft 1 startet keinen zweiten Impuls', () => {
    const s = timer('TP', 10);
    s(0, true);
    expect(s(10, true)[0]).toBe(false);
    expect(s(50, true)[0]).toBe(false);
  });
  it('PT = 0 → kein Impuls', () => {
    const s = timer('TP', 0);
    expect(s(0, true)).toEqual([false, 0]);
  });
});

describe('TONR – speichernde Einschaltverzögerung', () => {
  it('summiert Zeit über mehrere IN-Phasen', () => {
    const s = timer('TONR', 100);
    expect(s(0, true)).toEqual([false, 0]);
    expect(s(40, true)).toEqual([false, 40]);
    expect(s(50, false)).toEqual([false, 40]); // Lücke zählt nicht
    expect(s(200, false)).toEqual([false, 40]);
    expect(s(210, true)).toEqual([false, 40]);
    expect(s(260, true)).toEqual([false, 90]);
    expect(s(275, true)).toEqual([true, 100]);
    expect(s(300, false)).toEqual([true, 100]); // Q bleibt ohne IN
  });
  it('R setzt ET und Q zurück und hat Vorrang vor IN', () => {
    const s = timer('TONR', 50);
    s(0, true);
    expect(s(60, true)).toEqual([true, 50]);
    expect(s(70, true, true)).toEqual([false, 0]);
    expect(s(80, true)).toEqual([false, 0]); // Zählung beginnt neu
    expect(s(130, true)).toEqual([true, 50]);
  });
  it('PT = 0 → Q mit IN, nicht ohne', () => {
    const s = timer('TONR', 0);
    expect(s(0, false)).toEqual([false, 0]);
    expect(s(1, true)).toEqual([true, 0]);
  });
});

describe('Timer allgemein', () => {
  it('negative PT wirken wie 0', () => {
    const s = timer('TON', -5);
    expect(s(0, true)).toEqual([true, 0]);
  });
  it('PT aus Variable, Änderung wirkt sofort', () => {
    const cpu = makeCpu((b) => {
      const t = b.instance('T', 'TON');
      b.emit({ op: 'tmr', i: t.i, in: io('%I0.0'), pt: io('%MD0', 'TIME') });
      b.emit({ op: 'mov', dst: io('%Q0.0'), src: t.field('Q') });
    });
    cpu.setInput('%MD0', 1000, 'TIME');
    cpu.setInput('%I0.0', true);
    cpu.scan(0);
    cpu.scan(100);
    expect(cpu.read('%Q0.0')).toBe(false);
    cpu.setInput('%MD0', 50, 'TIME');
    cpu.scan(101);
    expect(cpu.read('%Q0.0')).toBe(true);
  });
});
