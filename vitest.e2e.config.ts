import { defineConfig } from 'vitest/config';

/** End-to-end suite: real soja-backend + PostgreSQL + CLI processes (see test/e2e). */
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
