import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versionsnummer an einer Stelle: Root-package.json (auch für Tauri und den „Über“-Dialog)
const version = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Workspace-Pakete liegen als TypeScript-Quellen vor und werden direkt übersetzt
  optimizeDeps: {
    exclude: [
      '@zyklus/sim-core',
      '@zyklus/scl-compiler',
      '@zyklus/fup-model',
      '@zyklus/levels',
      '@zyklus/plant-sim',
      '@zyklus/platform',
    ],
  },
  // Desktop-Build getrennt vom Web-Build, damit beide nebeneinander bestehen
  build: {
    outDir: mode === 'desktop' ? 'dist-desktop' : 'dist',
    // Monaco (SCL-Editor) ist ein großer, zusammenhängender Block; er wird erst beim ersten
    // Öffnen des SCL-Editors nachgeladen. Die übrigen Teile bleiben unter 500 kB.
    chunkSizeWarningLimit: 3000,
  },
  server: { port: 5173, strictPort: true },
}));
