/** Mehrsprachiger Text. Deutsch ist Pflicht, weitere Sprachen optional. */
export interface Text {
  de: string;
  en?: string;
}

export type Lang = 'de' | 'en';

export function tr(text: Text | undefined, lang: Lang = 'de'): string {
  if (!text) return '';
  return text[lang] ?? text.de;
}
