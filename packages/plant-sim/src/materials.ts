/**
 * Werkstoffe, Farben und Größen der Werkstücke. Zentral hier, damit neue Werkstoffe nur an einer
 * Stelle ergänzt werden müssen. Die Kennwerte sind für das Spiel gerundet.
 */

export type MaterialId = 'stahl' | 'aluminium' | 'messing' | 'holz' | 'kunststoff' | 'glas';
export type ColorId = 'rot' | 'blau' | 'schwarz' | 'silber' | 'weiss' | 'natur';
export type SizeId = 'klein' | 'mittel' | 'gross';

export interface Material {
  id: MaterialId;
  name: string;
  /** Dichte in g/cm³ */
  density: number;
  metal: boolean;
  /** Reduktionsfaktor für induktive Sensoren (Stahl = 1); 0 bei Nichtmetallen */
  inductive: number;
  /** relative Dielektrizitätszahl εr (Metalle wirken wie sehr hohe εr) */
  dielectric: number;
  /** Licht geht durch (Einweg-Lichtschranke erkennt es nicht) */
  transparent: boolean;
  /** glänzende Oberfläche (spiegelt Licht zurück) */
  glossy: boolean;
}

export const MATERIALS: Record<MaterialId, Material> = {
  stahl: {
    id: 'stahl',
    name: 'Stahl',
    density: 7.85,
    metal: true,
    inductive: 1,
    dielectric: 100,
    transparent: false,
    glossy: true,
  },
  aluminium: {
    id: 'aluminium',
    name: 'Aluminium',
    density: 2.7,
    metal: true,
    inductive: 0.4,
    dielectric: 100,
    transparent: false,
    glossy: true,
  },
  messing: {
    id: 'messing',
    name: 'Messing',
    density: 8.5,
    metal: true,
    inductive: 0.5,
    dielectric: 100,
    transparent: false,
    glossy: true,
  },
  holz: {
    id: 'holz',
    name: 'Holz',
    density: 0.6,
    metal: false,
    inductive: 0,
    dielectric: 3,
    transparent: false,
    glossy: false,
  },
  kunststoff: {
    id: 'kunststoff',
    name: 'Kunststoff',
    density: 1.2,
    metal: false,
    inductive: 0,
    dielectric: 2.5,
    transparent: false,
    glossy: false,
  },
  glas: {
    id: 'glas',
    name: 'Glas',
    density: 2.5,
    metal: false,
    inductive: 0,
    dielectric: 6,
    transparent: true,
    glossy: true,
  },
};

/** Flüssigkeit im Tank (für kapazitive Sensoren und Ultraschall) */
export const WATER = { dielectric: 80 };

export interface Color {
  id: ColorId;
  name: string;
  /** Anzeige */
  hex: string;
  /** diffuser Reflexionsgrad 0…1 */
  reflectance: number;
  /** Farbcode für den Farbsensor (INT-Ausgang) */
  code: number;
}

export const COLORS: Record<ColorId, Color> = {
  rot: { id: 'rot', name: 'Rot', hex: '#C9302C', reflectance: 0.45, code: 1 },
  blau: { id: 'blau', name: 'Blau', hex: '#2D5FAE', reflectance: 0.3, code: 2 },
  schwarz: { id: 'schwarz', name: 'Schwarz', hex: '#1E2124', reflectance: 0.06, code: 3 },
  silber: { id: 'silber', name: 'Silber', hex: '#C3C9CF', reflectance: 0.85, code: 4 },
  weiss: { id: 'weiss', name: 'Weiß', hex: '#F2F3F4', reflectance: 0.9, code: 5 },
  natur: { id: 'natur', name: 'Natur', hex: '#C49A6C', reflectance: 0.55, code: 6 },
};

/** Abmessungen in mm: Breite × Tiefe (Grundfläche) × Höhe */
export const SIZES: Record<SizeId, { name: string; w: number; d: number; h: number }> = {
  klein: { name: 'klein', w: 30, d: 30, h: 20 },
  mittel: { name: 'mittel', w: 40, d: 40, h: 30 },
  gross: { name: 'groß', w: 50, d: 50, h: 45 },
};

export interface WorkpieceSpec {
  material: MaterialId;
  color: ColorId;
  size: SizeId;
}

/** Masse in g aus Werkstoff und Größe (Vollkörper) */
export function massOf(spec: WorkpieceSpec): number {
  const s = SIZES[spec.size];
  return Math.round((MATERIALS[spec.material].density * s.w * s.d * s.h) / 1000);
}

/** Wirksamer Reflexionsgrad: Metalle glänzen unabhängig von der Farbe stärker */
export function reflectanceOf(spec: WorkpieceSpec): number {
  const r = COLORS[spec.color].reflectance;
  return MATERIALS[spec.material].metal ? Math.max(r, 0.7) : r;
}

export function describe(spec: WorkpieceSpec): string {
  return `${MATERIALS[spec.material].name}, ${COLORS[spec.color].name.toLowerCase()}, ${SIZES[spec.size].name}`;
}
