import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/persistence/test/postgres/**/*.integration.ts'],
  },
});
