import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Schriften lokal gebündelt (offline)
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { platform, setPlatform } from '@zyklus/platform';
import { applyTheme } from './theme';
import './styles.css';

applyTheme();

/** Startfehler im Fenster zeigen statt einer leeren Fläche */
function showBootError(e: unknown) {
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:24px;white-space:pre-wrap;color:#f0f0f0;font:13px monospace';
  pre.textContent =
    'ZYKLUS konnte nicht starten / could not start:\n\n' +
    (e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e));
  document.getElementById('root')!.replaceChildren(pre);
}

async function boot() {
  // Plattform zuerst bereitstellen (Desktop lädt die Spielstände aus Dateien), dann die Oberfläche
  // laden – Module, die beim Laden schon lesen (z. B. Einstellungen), sehen so den echten Speicher
  if (import.meta.env.VITE_PLATFORM === 'desktop') {
    // nur im Desktop-Build: Spielstände als Dateien, native Dialoge
    const { createDesktopPlatform } = await import('@zyklus/platform/desktop');
    await setPlatform(await createDesktopPlatform());
  } else {
    await platform.init();
  }
  const { initLanguage } = await import('./i18n');
  initLanguage();
  const [{ App }, { LEVELS }, { SANDBOX }, { migrate }] = await Promise.all([
    import('./App'),
    import('@zyklus/levels'),
    import('./sandbox'),
    import('./state/persistence'),
  ]);
  migrate([...LEVELS, SANDBOX]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch(showBootError);
