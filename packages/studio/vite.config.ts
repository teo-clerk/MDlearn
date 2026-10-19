import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname, 'web'),
  plugins: [react(), tailwind()],
  resolve: { conditions: ['development'] },
  build: { outDir: resolve(import.meta.dirname, 'dist/web'), emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: { strictPort: false },
})
