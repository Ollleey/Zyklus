import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  server: { port: 5173 },
});
