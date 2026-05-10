import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const monorepoRoot = path.resolve(__dirname, '../..');
const sharedSrc = path.join(monorepoRoot, 'packages/shared/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brewform/shared/types': path.join(sharedSrc, 'types/index.ts'),
      '@brewform/shared/schemas': path.join(sharedSrc, 'schemas/index.ts'),
      '@brewform/shared/constants': path.join(sharedSrc, 'constants/index.ts'),
      '@brewform/shared/utils': path.join(sharedSrc, 'utils/index.ts'),
      '@brewform/shared/i18n': path.join(sharedSrc, 'i18n/index.ts'),
      '@brewform/shared': path.join(sharedSrc, 'index.ts'),
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
