import { defineConfig } from 'vitest/config';

// Die Level-Tests simulieren bis zu 90 s Anlagenzeit je Testfall; unter Last (Build parallel)
// reicht das Standardlimit von 5 s nicht.
export default defineConfig({
  test: { testTimeout: 60_000 },
});
