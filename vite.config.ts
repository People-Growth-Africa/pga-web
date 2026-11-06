import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.ANALYZE === '1'
      ? [
          visualizer({
            filename: 'dist/stats.json',
            template: 'raw-data',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'router-vendor',
              test: /[\\/]node_modules[\\/](?:react-router|react-router-dom)[\\/]/,
              priority: 20,
            },
            {
              name: 'motion-vendor',
              test: /[\\/]node_modules[\\/](?:framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 10,
            },
            {
              name: 'gsap-vendor',
              test: /[\\/]node_modules[\\/]gsap[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    // The site calls /api/* on its own origin, which is how Vercel serves it.
    // The dev server has nothing behind that path, so it is forwarded to the
    // local API server (`npm run serve:api`) when one is running on 4173.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4173',
        // Keep the browser's Host header: the API checks Origin against it.
        changeOrigin: false,
      },
    },
  },
})
