import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const API = process.env.VITE_API_TARGET ?? 'http://localhost:3100'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Caches go to the one node_modules at the root, not to one of this package's own.
  cacheDir: '../node_modules/.vite/web',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The web reads the shared rules straight from source; the server uses the built package.
      '@erp/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Listens on every network interface, so a phone or a handheld terminal on the same Wi-Fi can open
    // the system at this computer's address (http://192.168.x.x:5190). The API is reached through the
    // proxy below, so only this port needs to be open.
    host: true,
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': { target: API, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
