import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** The bundler drops licence comments, and these licences ask that their notices travel with the code. */
function thirdPartyNotices(): Plugin {
  const notice = (name: string, dir: string) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string; license?: string; repository?: string | { url?: string } }
    const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)/i.test(f))
    const from = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    return [`${name} ${pkg.version} (${pkg.license ?? `see ${from ?? 'its package'}`})`, file ? readFileSync(join(dir, file), 'utf8').trim() : ''].filter(Boolean).join('\n\n')
  }
  return {
    name: 'third-party-notices', apply: 'build',
    generateBundle(_, bundle) {
      const packages = new Map<string, string>()
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue
        for (const id of out.moduleIds) {
          const found = /^(.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(id.replace(/\\/g, '/').split('?')[0])
          if (found) packages.set(found[2], found[1])
        }
      }
      const source = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => notice(name, dir)).join(`\n\n${'-'.repeat(72)}\n\n`)
      this.emitFile({ type: 'asset', fileName: 'third-party-notices.txt', source })
    },
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'web'),
  plugins: [react(), tailwind(), thirdPartyNotices()],
  resolve: { conditions: ['development'] },
  build: { outDir: resolve(import.meta.dirname, 'dist/web'), emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: { strictPort: false },
})
