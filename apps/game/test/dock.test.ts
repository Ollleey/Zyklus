import { describe, expect, it } from 'vitest';
import { closePanel, movePanel, type DockLayout } from '../src/ui/Dock';

const BASE: DockLayout = {
  areas: { left: ['plant', 'cabinet'], right: ['program'], bottom: ['sim'] },
  active: { left: 'plant' },
};

describe('Andockbereiche', () => {
  it('verschiebt ein Panel in einen anderen Bereich und macht es dort aktiv', () => {
    const l = movePanel(BASE, 'cabinet', 'right');
    expect(l.areas).toEqual({ left: ['plant'], right: ['program', 'cabinet'], bottom: ['sim'] });
    expect(l.active.right).toBe('cabinet');
  });

  it('ordnet beim Ablegen auf einem Tab davor ein', () => {
    const l = movePanel(BASE, 'sim', 'left', 'cabinet');
    expect(l.areas.left).toEqual(['plant', 'sim', 'cabinet']);
    expect(l.areas.bottom).toEqual([]);
  });

  it('schließt ein Panel, die übrigen bleiben', () => {
    const l = closePanel(BASE, 'program');
    expect(l.areas.right).toEqual([]);
    expect(movePanel(l, 'program', 'right').areas.right).toEqual(['program']);
  });
});
