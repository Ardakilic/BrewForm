import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import deno from '@deno/vite-plugin';
import { join, resolve } from 'node:path';

const monorepoRoot = resolve(import.meta.dirname!, '../..');
const sharedSrc = join(monorepoRoot, 'packages/shared/src');

export default defineConfig({
  plugins: [deno(), react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname!, './src'),
      '@brewform/shared/types': join(sharedSrc, 'types/index.ts'),
      '@brewform/shared/schemas': join(sharedSrc, 'schemas/index.ts'),
      '@brewform/shared/constants': join(sharedSrc, 'constants/index.ts'),
      '@brewform/shared/utils': join(sharedSrc, 'utils/index.ts'),
      '@brewform/shared/i18n': join(sharedSrc, 'i18n/index.ts'),
      '@brewform/shared/logger': join(sharedSrc, 'logger/index.ts'),
      '@brewform/shared': join(sharedSrc, 'index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Deno-native test files that use jsr: imports (not compatible with Vitest).
    // NOTE: `__tests__/*.integration.test.ts` is intentionally NOT excluded — the
    // recipe-coffee-dates integration test was converted to Vitest imports so it
    // runs in CI (it was previously invisible because of that exclude pattern).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.exploration.test.ts',
      '**/*.preservation.test.ts',
    ],
    coverage: {
      provider: 'v8',
      // Count ALL production source files, not just the ones a test transitively
      // imports. In Vitest 4, setting `include` reports BOTH covered and uncovered
      // files matching the pattern (the old `coverage.all` flag was removed). This
      // makes the 14 previously-invisible prod files visible in the report:
      // router.tsx, the collection pages, the routes/*.ts actions,
      // SessionRestoreBanner, EmailVerificationBanner, Layout.tsx,
      // RecipeNotAvailablePage, App.tsx, main.tsx.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Test files and fixtures
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.exploration.test.ts',
        'src/**/*.preservation.test.ts',
        'src/test-setup.ts',
        // Type-only / declaration files
        'src/**/*.d.ts',
      ],
      // RATCHET RULE: this threshold only moves UP. It is the honest measured
      // line coverage (rounded DOWN to a whole percent) at the time of the last
      // ratchet. Any PR whose changes raise measured coverage by ≥1 point MUST
      // bump `thresholds.lines` to the new floor in the SAME PR. Never lower it.
      // Baseline 78% measured 2026-07-27 (78.4% lines, 3185/4062) after making
      // all src files visible and adding the router / routes / api / dropdown
      // quick-win tests.
      thresholds: {
        lines: 78,
      },
    },
  },
});
