import { createPart, type Layout, type Params, type Part, type PartType, type Rot } from '../src';

/** Anlage aus Bauteilangaben; Kennzeichnungen werden automatisch vergeben */
export function layoutOf(
  specs: {
    type: PartType;
    x: number;
    y: number;
    z?: number;
    rot?: Rot;
    params?: Params;
    tag?: string;
  }[],
  seed = 1,
): Layout {
  const parts: Part[] = [];
  for (const s of specs) {
    const p = createPart(s.type, parts, s);
    p.rot = s.rot ?? 0;
    Object.assign(p.params, s.params ?? {});
    if (s.tag) p.tag = s.tag;
    parts.push(p);
  }
  return { formatVersion: 1, parts, seed, area: { w: 2000, h: 1200 } };
}

export const STEEL = { material: 'stahl', color: 'silber', size: 'mittel' } as const;
export const WOOD = { material: 'holz', color: 'natur', size: 'mittel' } as const;
