import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // DB-backed test files share one database and assert table counts/deltas;
    // run files serially so one file's inserts never skew another file's counts.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // Source files only (explicit extension keeps JSON, MJML, package.json and configs out).
      // Test files, setup files and this config are always excluded by Vitest itself.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        // Test-only support code (imported manually by tests, not via setupFiles)
        'src/test-setup.ts',
        'src/**/test-helpers.ts',
        'src/test-fixtures/**',
        // Generated from MJML by `pnpm run email-build`
        'src/templates/email/generated/**',
      ],
      // json-summary + json feed the single PR coverage comment (.github/workflows/ci.yml).
      reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
      reportOnFailure: true,
      // RATCHET RULE: honest measured line coverage, rounded DOWN; only ever raise it.
      thresholds: {
        lines: 79,
      },
    },
  },
});
