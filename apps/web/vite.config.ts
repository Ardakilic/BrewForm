import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// When running inside Docker Compose, the API is reachable via the service name
// "app" (http://app:8000). Outside Docker (local pnpm), it's localhost:8000.
// The compose.yml web-dev service sets VITE_API_PROXY_TARGET=http://app:8000.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000';

// Validate VITE_PUBLIC_APP_URL to ensure %VITE_PUBLIC_APP_URL% in index.html always resolves.
// For production, the deploy pipeline must set this env var before running vite build.
const vitePublicAppUrl = (process.env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');

// Resolve the monorepo root relative to this file's location.
// vite.config.ts lives at apps/web/, so the root is two levels up.
const monorepoRoot = resolve(import.meta.dirname!, '../..');
const sharedSrc = join(monorepoRoot, 'packages/shared/src');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'build-robots-txt',
      // The sitemap index lives at the site root (served by the API, proxied by the web edge), the
      // directory of the /recipes/… and /u/… URLs it lists. Without a public URL the line is
      // relative; the web entrypoint replaces the build-time origin with PUBLIC_APP_URL.
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: `User-agent: *
Allow: /

Disallow: /settings
Disallow: /admin
Disallow: /onboarding
Disallow: /setups
Disallow: /beans
Allow: /equipments
Allow: /equipment/
Disallow: /equipment

Sitemap: ${vitePublicAppUrl}/sitemap.xml
`,
        });
      },
    },
  ],
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
      '@brewform/shared/logger': join(sharedSrc, 'logger/index.ts'),
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
      // The API serves the sitemap index and its pages at the site root.
      '/sitemap.xml': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 800,
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || '/api/v1'),
    'import.meta.env.VITE_PUBLIC_APP_URL': JSON.stringify(
      vitePublicAppUrl || 'http://localhost:5173',
    ),
  },
});
