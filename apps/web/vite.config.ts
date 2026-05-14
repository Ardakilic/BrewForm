import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, join } from 'jsr:@std/path';

// When running inside Docker Compose, the API is reachable via the service name
// "app" (http://app:8000). Outside Docker (bare Deno), it's localhost:8000.
// The compose.yml web-dev service sets VITE_API_PROXY_TARGET=http://app:8000.
const apiProxyTarget = Deno.env.get('VITE_API_PROXY_TARGET') || 'http://localhost:8000';

// Resolve the monorepo root relative to this file's location.
// vite.config.ts lives at apps/web/, so the root is two levels up.
const monorepoRoot = resolve(import.meta.dirname!, '../..');
const sharedSrc = join(monorepoRoot, 'packages/shared/src');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Local path alias
      '@': resolve(import.meta.dirname!, './src'),
      // Workspace package aliases — Vite (Node.js) cannot resolve TypeScript
      // source files from package.json exports directly, so we map each
      // @brewform/shared/* sub-path to the actual source directory.
      '@brewform/shared/types': join(sharedSrc, 'types/index.ts'),
      '@brewform/shared/schemas': join(sharedSrc, 'schemas/index.ts'),
      '@brewform/shared/constants': join(sharedSrc, 'constants/index.ts'),
      '@brewform/shared/utils': join(sharedSrc, 'utils/index.ts'),
      '@brewform/shared/i18n': join(sharedSrc, 'i18n/index.ts'),
      '@brewform/shared': join(sharedSrc, 'index.ts'),
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
