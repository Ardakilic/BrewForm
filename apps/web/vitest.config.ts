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
    // Exclude Deno-native test files that use jsr: imports (not compatible with Vitest)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.exploration.test.ts',
      '**/*.preservation.test.ts',
      '**/__tests__/*.integration.test.ts',
    ],
  },
});
