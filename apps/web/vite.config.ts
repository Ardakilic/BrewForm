import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// When running inside Docker Compose, the API is reachable via the service name
// "app" (http://app:8000). Outside Docker (bare Deno), it's localhost:8000.
// The compose.yml web-dev service sets VITE_API_PROXY_TARGET=http://app:8000.
const apiProxyTarget = Deno.env.get('VITE_API_PROXY_TARGET') || 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
