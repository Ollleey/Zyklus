/**
 * Design-Tokens: einzige Quelle für Farben, Abstände, Radien, Schatten und Schrift.
 * `applyTheme` schreibt sie als CSS-Variablen auf :root; SVG, Canvas und Monaco lesen dieselben
 * Werte aus `TOKENS`. Leitidee: Der Schaltschrank ist das auffällige Element, das Werkzeug drumherum
 * bleibt ruhig. Federzug-Orange gibt es nur an Klemmen und an der Primäraktion „Prüfen“.
 */

export interface Palette {
  /** Arbeitsfläche */
  bg: string;
  /** tiefere Flächen: Editor, Diagramm, Schrankhintergrund */
  bgDeep: string;
  /** Panels */
  surface: string;
  /** Knöpfe, Eingabefelder, Tabellenköpfe */
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Auswahl, Fokus, aktive Tabs (aufgehelltes Aderblau) */
  select: string;
  selectDim: string;
  /** Federzug-Orange: Klemmen und „Prüfen“ */
  accent: string;
  accentText: string;
  /** Montageplatte */
  zinc: string;
  /** DC-Steuerleitung */
  wireDc: string;
  /** Analogsignal */
  analog: string;
  ledGreen: string;
  ledYellow: string;
  red: string;
  /** Ist-Signal im Zeitdiagramm */
  signal: string;
  /** Typstreifen der Baugruppen */
  kindDi: string;
  kindDo: string;
  kindCpu: string;
}

export const DARK: Palette = {
  bg: '#1A1E23',
  bgDeep: '#14171B',
  surface: '#21262D',
  surface2: '#2A3038',
  surface3: '#323943',
  line: '#353C46',
  lineStrong: '#4A535E',
  text: '#E4E7EA',
  textMuted: '#9AA4AE',
  textFaint: '#858F9A',
  select: '#6E9EE6',
  selectDim: '#2F4A73',
  accent: '#F08A1C',
  accentText: '#1A1E23',
  zinc: '#BFC5CA',
  wireDc: '#2D5FAE',
  analog: '#8E63CF',
  ledGreen: '#3FD98A',
  ledYellow: '#F4C443',
  red: '#E5484D',
  signal: '#3CC8DC',
  kindDi: '#3CC8DC',
  kindDo: '#F4C443',
  kindCpu: '#8E63CF',
};

/** Vorbereitet, noch ohne Umschalter in der Oberfläche */
export const LIGHT: Palette = {
  ...DARK,
  bg: '#E9ECEF',
  bgDeep: '#DDE1E5',
  surface: '#F6F7F8',
  surface2: '#E6E9EC',
  surface3: '#DADFE3',
  line: '#C9CFD5',
  lineStrong: '#AEB6BE',
  text: '#1C2126',
  textMuted: '#55606B',
  textFaint: '#7D8893',
  select: '#2D5FAE',
  selectDim: '#C5D6F0',
  accentText: '#1A1E23',
  signal: '#127C8C',
  kindDi: '#127C8C',
  kindDo: '#A87800',
};

export const TOKENS = {
  color: DARK,
  /** 4-px-Raster */
  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px' },
  radius: { sm: '3px', md: '5px', lg: '8px' },
  shadow: {
    /** Menüs, Dialoge */
    pop: '0 8px 24px rgba(0, 0, 0, 0.45), 0 1px 0 rgba(255, 255, 255, 0.04) inset',
    /** Baugruppen auf der Schiene (D2) */
    hardware: '0 3px 0 rgba(0, 0, 0, 0.35), 0 6px 14px rgba(0, 0, 0, 0.3)',
  },
  font: {
    ui: "'IBM Plex Sans', system-ui, sans-serif",
    condensed: "'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
    mono: "'IBM Plex Mono', Consolas, monospace",
  },
  /** Schriftgrade (px) */
  size: { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 26 },
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS-Variablen für eine Palette (auch für Tests und Screenshots nutzbar). */
export function cssVariables(p: Palette = DARK): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) vars[`--c-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(TOKENS.space)) vars[`--s-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.radius)) vars[`--r-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.font)) vars[`--font-${k}`] = v;
  for (const [k, v] of Object.entries(TOKENS.size)) vars[`--t-${k}`] = `${v}px`;
  return vars;
}

export function applyTheme(p: Palette = DARK, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(cssVariables(p))) root.style.setProperty(k, v);
  root.style.colorScheme = p === LIGHT ? 'light' : 'dark';
}
