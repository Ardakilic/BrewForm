import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Source files only (explicit extension keeps i18n JSON, package.json and configs out).
      // Test files, setup files and this config are always excluded by Vitest itself.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      // json-summary + json feed the single PR coverage comment (.github/workflows/ci.yml).
      reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
      reportOnFailure: true,
      // RATCHET RULE: honest measured line coverage, rounded DOWN; only ever raise it.
      thresholds: {
        lines: 97,
        functions: 95,
        branches: 93,
        statements: 97,
      },
    },
  },
});
