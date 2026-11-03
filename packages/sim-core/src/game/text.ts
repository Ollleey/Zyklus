/** Mehrsprachiger Text. Deutsch ist Pflicht, weitere Sprachen optional. */
export interface Text {
  de: string;
  en?: string;
}

export type Lang = 'de' | 'en';

let current: Lang = 'de';

/** Anzeigesprache für Texte ohne ausdrückliche Sprache (fehlende Übersetzung: Deutsch) */
export function setTextLanguage(lang: Lang): void {
  current = lang;
}

export function textLanguage(): Lang {
  return current;
}

export function tr(text: Text | undefined, lang: Lang = current): string {
  if (!text) return '';
  return text[lang] ?? text.de;
}
