import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // DB-backed tests assert global table counts/deltas; run files serially
    // (matches Deno-era `deno test` default) so files can't race each other.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
    },
  },
});
