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
import { applyTheme } from './theme';
import './monaco-setup';
import './styles.css';
import { App } from './App';
import { migrate } from './state/persistence';

applyTheme();
migrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
