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
import { platform } from '@zyklus/platform';
import { applyTheme } from './theme';
import './monaco-setup';
import './styles.css';

applyTheme();

// Plattform zuerst bereitstellen (Desktop lädt die Spielstände aus Dateien), dann die Oberfläche
// laden – Module, die beim Laden schon lesen (z. B. Einstellungen), sehen so den echten Speicher
await platform.init();
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
