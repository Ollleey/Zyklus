import { defineConfig } from 'vitest/config';

// Aufruf aus dem Wurzelverzeichnis (`npx vitest run`): gleiche Grenze wie in packages/levels
export default defineConfig({
  test: { testTimeout: 60_000 },
});
