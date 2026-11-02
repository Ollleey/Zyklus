/** Versionsnummer aus der Root-package.json (vite.config.ts) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** „desktop“ im Build für die Tauri-Anwendung */
  readonly VITE_PLATFORM?: 'web' | 'desktop';
}
