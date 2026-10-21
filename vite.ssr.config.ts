import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The build-time renderer only.
 *
 * Kept apart from vite.config.ts so the client build is exactly what it was:
 * this config produces `dist-ssr/server.js` (the app, rendered in Node) and
 * `dist-ssr/meta.js` (the page metadata), which scripts/prerender.mjs imports
 * after the normal build has written dist/index.html. No plugin here emits CSS
 * or assets; the shipped page reuses the client's.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    ssr: true,
    outDir: 'dist-ssr',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    rollupOptions: {
      input: {
        server: 'src/entry-server.tsx',
        meta: 'src/lib/pageMeta.ts',
      },
    },
  },
});
