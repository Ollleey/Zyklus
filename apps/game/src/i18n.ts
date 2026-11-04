import { setTextLanguage, type Lang } from '@zyklus/sim-core';
import { platform } from '@zyklus/platform';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { translateMessage } from './i18n/messages';

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

/** gespeicherte Sprache, sonst Deutsch */
export function initLanguage(): void {
  let l: string | null = null;
  try {
    l = platform.storage.getItem(KEY);
  } catch {
    l = null;
  }
  setLanguage(l ?? 'de');
}

/** Sprache wechseln und merken; die Oberfläche wird neu geladen */
export async function chooseLanguage(l: Lang): Promise<void> {
  try {
    platform.storage.setItem(KEY, l);
    // Desktop schreibt verzögert in Dateien – vor dem Neuladen sichern, sonst gilt wieder Deutsch
    await platform.flush();
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

/** Meldung aus Compiler, Schaltschrankprüfung oder CPU in der Anzeigesprache */
export function msg(text: string): string {
  return lang === 'en' ? translateMessage(text) : text;
}

/** kurzer Oberflächentext in beiden Sprachen (für einzelne Beschriftungen ohne eigenen Schlüssel) */
export function tx(de: string, en: string): string {
  return lang === 'en' ? en : de;
}
