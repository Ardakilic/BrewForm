import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',
        'prisma/**',
        // Exclude utilities and modules that are mocked globally in test setup
        'src/utils/auth/index.ts',
        'src/utils/database/index.ts',
        'src/utils/email/index.ts',
        'src/utils/logger/index.ts',
        'src/utils/redis/index.ts',
        'src/utils/prisma/index.ts',
        'src/types/index.ts',
        'src/config/index.ts',
        'src/middleware/**',
        'src/test-setup.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 85,
        lines: 85,
      },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': './src',
      '@modules': './src/modules',
      '@utils': './src/utils',
      '@config': './src/config',
    },
  },
});
