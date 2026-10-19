// Python in the browser (Pyodide): the runtime files come from the installed `pyodide` package; extra
// packages (numpy, scipy, matplotlib, …) are downloaded once from the pinned Pyodide release into a cache
// and served from there, so after the first use everything runs offline.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const MAX_FILE = 200 * 1024 * 1024
const CORE = new Set(['pyodide.js', 'pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'])
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.whl': 'application/octet-stream', '.zip': 'application/octet-stream', '.tar': 'application/octet-stream' }

export interface PyodideOptions {
  /** Folder holding the npm package's files. */
  coreDir?: string
  cacheDir?: string
  /** Where extra packages come from, e.g. https://cdn.jsdelivr.net/pyodide/v314.0.7/full/ */
  cdn?: string
  fetchImpl?: typeof fetch
}
export interface PyodideFile { data: Uint8Array; type: string }

export class PyodideStore {
  readonly version: string
  private coreDir: string
  private cacheDir: string
  private cdn: string
  private fetchImpl: typeof fetch
  private allowed: Set<string> | null = null
  private inflight = new Map<string, Promise<Uint8Array>>()
  constructor(o: PyodideOptions = {}) {
    this.coreDir = o.coreDir ?? dirname(require.resolve('pyodide/package.json'))
    this.version = (JSON.parse(readFileSync(join(this.coreDir, 'package.json'), 'utf8')) as { version: string }).version
    this.cacheDir = o.cacheDir ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'mdlearn', 'pyodide', this.version)
    this.cdn = o.cdn ?? `https://cdn.jsdelivr.net/pyodide/v${this.version}/full/`
    this.fetchImpl = o.fetchImpl ?? fetch
  }
  /** Files we may serve: the runtime itself and what the release's package index lists. */
  private files(): Set<string> {
    if (!this.allowed) {
      const lock = JSON.parse(readFileSync(join(this.coreDir, 'pyodide-lock.json'), 'utf8')) as { packages: Record<string, { file_name: string }> }
      this.allowed = new Set([...CORE, ...Object.values(lock.packages).map((p) => p.file_name)])
    }
    return this.allowed
  }
  /** Names of the packages that can be imported in the browser. */
  packageNames(): string[] {
    const lock = JSON.parse(readFileSync(join(this.coreDir, 'pyodide-lock.json'), 'utf8')) as { packages: Record<string, { package_type?: string }> }
    return Object.entries(lock.packages).filter(([, p]) => p.package_type !== 'cpython_module').map(([n]) => n).sort()
  }
  async get(name: string): Promise<PyodideFile | null> {
    if (!/^[A-Za-z0-9._+-]+$/.test(name) || !this.files().has(name)) return null
    const type = TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream'
    const core = join(this.coreDir, name)
    if (existsSync(core)) return { data: readFileSync(core), type }
    const cached = join(this.cacheDir, name)
    if (existsSync(cached)) return { data: readFileSync(cached), type }
    let p = this.inflight.get(name)
    if (!p) {
      p = this.download(name, cached).finally(() => this.inflight.delete(name))
      this.inflight.set(name, p)
    }
    return { data: await p, type }
  }
  private async download(name: string, to: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(`${this.cdn}${name}`, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`Could not download ${name} (${res.status}). Python packages need an internet connection the first time.`)
    const data = new Uint8Array(await res.arrayBuffer())
    if (data.length > MAX_FILE) throw new Error(`${name} is too large.`)
    mkdirSync(dirname(to), { recursive: true })
    const tmp = `${to}.${process.pid}.tmp`
    writeFileSync(tmp, data)
    renameSync(tmp, to)
    return data
  }
}
