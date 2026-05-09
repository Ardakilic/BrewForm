import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// When running inside Docker Compose, the API is reachable via the service name
// "app" (http://app:8000). Outside Docker (bare Deno), it's localhost:8000.
// The compose.yml web-dev service sets VITE_API_PROXY_TARGET=http://app:8000.
const apiProxyTarget = Deno.env.get('VITE_API_PROXY_TARGET') || 'http://localhost:8000';

// Resolve the monorepo root relative to this file's location.
// vite.config.ts lives at apps/web/, so the root is two levels up.
const monorepoRoot = path.resolve(__dirname, '../..');
const sharedSrc = path.join(monorepoRoot, 'packages/shared/src');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Local path alias
      '@': path.resolve(__dirname, './src'),
      // Workspace package aliases — Vite (Node.js) cannot resolve TypeScript
      // source files from package.json exports directly, so we map each
      // @brewform/shared/* sub-path to the actual source directory.
      '@brewform/shared/types': path.join(sharedSrc, 'types/index.ts'),
      '@brewform/shared/schemas': path.join(sharedSrc, 'schemas/index.ts'),
      '@brewform/shared/constants': path.join(sharedSrc, 'constants/index.ts'),
      '@brewform/shared/utils': path.join(sharedSrc, 'utils/index.ts'),
      '@brewform/shared/i18n': path.join(sharedSrc, 'i18n/index.ts'),
      '@brewform/shared': path.join(sharedSrc, 'index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      Deno.env.get('VITE_API_URL') || '/api/v1',
    ),
  },
});
