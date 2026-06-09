import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/evolution-lab/src/**/*.test.ts',
      'database/tests/**/*.test.mjs',
    ],
  },
});
