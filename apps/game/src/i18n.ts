import { setTextLanguage, type Lang } from '@zyklus/sim-core';
import { platform } from '@zyklus/platform';
import de from './i18n/de.json';
import en from './i18n/en.json';

export type MessageKey = keyof typeof de;

const catalogs: Record<Lang, Record<string, string>> = { de, en };
const KEY = 'zyklus.ui.lang';
let lang: Lang = 'de';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
];

export function setLanguage(l: string): void {
  if (!(l in catalogs)) return;
  lang = l as Lang;
  setTextLanguage(lang);
  document.documentElement.lang = lang;
}

export function language(): Lang {
  return lang;
}

/** gespeicherte Sprache, sonst die des Browsers (Deutsch, wenn sie nicht angeboten wird) */
export function initLanguage(): void {
  let l: string | null = null;
  try {
    l = platform.storage.getItem(KEY);
  } catch {
    l = null;
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'de';
  setLanguage(l ?? (nav in catalogs ? nav : 'de'));
}

/** Sprache wechseln und merken; die Oberfläche wird neu geladen */
export function chooseLanguage(l: Lang): void {
  try {
    platform.storage.setItem(KEY, l);
  } catch {
    /* nur für diese Sitzung */
  }
  setLanguage(l);
  location.reload();
}

/**
 * Übersetzt einen UI-Schlüssel; fehlt er in der aktuellen Sprache, gilt Deutsch.
 * Platzhalter `{name}` werden durch `vars` ersetzt.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = catalogs[lang]?.[key] ?? de[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : text;
}
