// `mdlearn studio [folder]`: start the local server, open the browser.
import { createServer, type Server } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { spawn } from 'node:child_process'
import { getRequestListener } from '@hono/node-server'
import type { FSWatcher } from 'chokidar'
import { createApp } from './app.js'
import type { PictureFetch } from './web-pictures.js'
import { EventBus } from './bus.js'
import { settingsStore } from './settings.js'
import { Workspaces } from './workspaces.js'
import { watchWorkspace } from './watcher.js'
import { lanAddresses, pageCsp } from './security.js'
import { JobManager } from './ai/jobs.js'
import { ClaudeEngine, claudeStatus, claudeOnce } from './ai/claude.js'
import { Latex, fakeEngines, fakeRunner } from './latex.js'
import { FakeEngine, fakeOnce } from './ai/fake.js'

export { installMcp, mcpCommands, prepareFolder, READ_THE_SKILL } from './agents.js'

export interface StudioOptions {
  root?: string
  port?: number
  lan?: boolean
  lanFull?: boolean
  open?: boolean
  /** Serve the web app from Vite (development) instead of the built files. */
  dev?: boolean
  settingsFile?: string
  /** Use the scripted demo engine instead of Claude Code (tests, demos without a Claude login). */
  fakeAi?: boolean
  /** Use the stand-in TeX engine instead of one installed on this computer (tests). */
  fakeTex?: boolean
  /** A stand-in for the network behind web pictures (tests). */
  pictureFetch?: PictureFetch
}
export interface Studio { url: string; lanUrl?: string; qr?: string; port: number; close(): Promise<void> }

/** The package folder, from source (server/) or from the build (dist/server/). */
const PKG = ((): string => {
  for (let d = import.meta.dirname; ; d = resolve(d, '..')) {
    const f = join(d, 'package.json')
    if (existsSync(f) && (JSON.parse(readFileSync(f, 'utf8')) as { name?: string }).name === '@mdlearn/studio') return d
    if (resolve(d, '..') === d) throw new Error('cannot find the @mdlearn/studio package folder')
  }
})()
const VERSION = (JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { version: string }).version
const WEB_DIST = join(PKG, 'dist', 'web')
const STATIC_TYPES: Record<string, string> = { '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' }

export async function startStudio(opts: StudioOptions = {}): Promise<Studio> {
  const bus = new EventBus()
  const watchers = new Map<string, FSWatcher>()
  const settings = settingsStore(opts.settingsFile)
  const workspaces = new Workspaces(settings, (h) => watchers.set(h.id, watchWorkspace(h, bus)))
  const token = randomBytes(32).toString('base64url')
  const port0 = opts.port ?? 4747
  const security = { port: port0, lan: !!opts.lan, lanFull: !!opts.lanFull, token, dev: !!opts.dev }
  const jobs = new JobManager(bus)
  const engine = () => (opts.fakeAi ? new FakeEngine() : new ClaudeEngine(settings.get().claude))
  const deps = { version: VERSION, security, settings, workspaces, bus, serverId: randomUUID(), jobs, engine,
    claudeStatus: () => (opts.fakeAi ? Promise.resolve({ available: true, version: 'demo' }) : claudeStatus(settings.get().claude)),
    claudeOnce: opts.fakeAi ? fakeOnce : (req: { system: string; prompt: string; signal?: AbortSignal }) => claudeOnce(settings.get().claude, req),
    latex: new Latex(opts.fakeTex ? { runner: fakeRunner, engines: fakeEngines } : {}), pictureFetch: opts.pictureFetch }
  const app = createApp(deps)
  const api = getRequestListener(app.fetch)

  const server = createServer()
  // the web app: Vite in development, the built files otherwise; everything else goes to the API
  let vite: { middlewares: (req: never, res: never, next: () => void) => void; close(): Promise<void> } | undefined
  if (opts.dev) {
    const { createServer: createVite } = await import('vite')
    vite = await createVite({ configFile: join(PKG, 'vite.config.ts'), server: { middlewareMode: { server }, hmr: { server } }, appType: 'spa' }) as never
  }
  server.on('request', (req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith('/api/') || url.startsWith('/sandbox/')) return api(req, res)
    if (vite) return vite.middlewares(req as never, res as never, () => api(req, res))
    // static files go through the API's security layer too (Host check, LAN token)
    return api(req, res)
  })
  if (!opts.dev) {
    app.get('*', (c) => {
      const p = new URL(c.req.url).pathname
      // an unknown API address is an error, not the web app
      if (p.startsWith('/api/')) return c.json({ error: { code: 'not-found', message: 'No such API route.' } }, 404)
      const file = join(WEB_DIST, p === '/' ? 'index.html' : p)
      const safe = file.startsWith(WEB_DIST) && existsSync(file) && statSync(file).isFile() ? file : join(WEB_DIST, 'index.html')
      if (!existsSync(safe)) return c.text('The web app is not built. Run `npm run build -w @mdlearn/studio`.', 500)
      c.header('Content-Type', STATIC_TYPES[extname(safe)] ?? 'application/octet-stream')
      if (safe.endsWith('index.html')) c.header('Content-Security-Policy', pageCsp(false))
      else c.header('Cache-Control', 'public, max-age=31536000, immutable')
      return c.body(readFileSync(safe))
    })
  }

  const port = await listen(server, port0, opts.lan ? '0.0.0.0' : '127.0.0.1')
  security.port = port
  let first: string | undefined
  if (opts.root) first = workspaces.open(opts.root).id
  const url = `http://localhost:${port}/${first ? `w/${first}` : ''}`
  const lanIp = lanAddresses()[0]
  const lanUrl = opts.lan && lanIp ? `http://${lanIp}:${port}/api/auth?t=${token}` : undefined
  Object.assign(deps, { lanUrl })
  const qr = lanUrl ? (await import('uqr')).renderUnicodeCompact(lanUrl, { border: 1 }) : undefined
  if (opts.open) openBrowser(url)
  return {
    url, lanUrl, port, ...(qr ? { qr } : {}),
    async close() {
      for (const w of watchers.values()) await w.close()
      await vite?.close()
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

function listen(server: Server, port: number, host: string, tries = 10): Promise<number> {
  return new Promise((ok, fail) => {
    const attempt = (p: number, left: number) => {
      const onError = (e: NodeJS.ErrnoException) => { server.off('listening', onListening); if (e.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1); else fail(e) }
      const onListening = () => { server.off('error', onError); ok(p) }
      server.once('error', onError); server.once('listening', onListening)
      server.listen(p, host)
    }
    attempt(port, tries)
  })
}
function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref() } catch { /* no browser: the URL is printed */ }
}
