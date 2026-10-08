import { defineConfig } from 'vitest/config'

// Caches go to the one node_modules at the root, not to one of this package's own.
export default defineConfig({ cacheDir: '../node_modules/.vite/agent' })
