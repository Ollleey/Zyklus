import de from './i18n/de.json';

export type MessageKey = keyof typeof de;

const catalogs: Record<string, Record<string, string>> = { de };
let lang = 'de';

export function setLanguage(l: string): void {
  if (catalogs[l]) lang = l;
}

/** Übersetzt einen UI-Schlüssel; fehlt er in der aktuellen Sprache, gilt Deutsch. */
export function t(key: MessageKey): string {
  return catalogs[lang]?.[key] ?? de[key] ?? key;
}
