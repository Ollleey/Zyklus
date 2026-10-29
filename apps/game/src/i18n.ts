import de from './i18n/de.json';

export type MessageKey = keyof typeof de;

const catalogs: Record<string, Record<string, string>> = { de };
let lang = 'de';

export function setLanguage(l: string): void {
  if (catalogs[l]) lang = l;
}

/**
 * Übersetzt einen UI-Schlüssel; fehlt er in der aktuellen Sprache, gilt Deutsch.
 * Platzhalter `{name}` werden durch `vars` ersetzt.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = catalogs[lang]?.[key] ?? de[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : text;
}
