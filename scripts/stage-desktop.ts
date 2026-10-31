// Prepares the Studio server for the desktop app: packages/desktop/build/server/ holds start.mjs and a
// node_modules with exactly what the server needs at run time, copied from this checkout's node_modules (the
// versions in package-lock.json, nothing downloaded). Web-only packages are not there (Vite already bundled them
// into dist/web), nor the Agent SDK's bundled `claude` (234 MB; the user's own Claude Code is used).
// Run after `npm run build`: tsx scripts/stage-desktop.ts
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'packages/desktop/build/server')
const SKIP = /^@anthropic-ai\/claude-agent-sdk-|^electron$/

interface Pkg { name: string; version: string; files?: string[]; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
const readPkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Pkg

/** Node's lookup: the nearest node_modules/<name> going up from `from`. */
function locate(name: string, from: string): string | null {
  for (let d = from; ; d = dirname(d)) {
    const hit = join(d, 'node_modules', name)
    if (existsSync(join(hit, 'package.json'))) return realpathSync(hit)
    if (dirname(d) === d || d === dirname(ROOT)) return null
  }
}

/** Where a package found on disk goes in the staged tree, keeping nested node_modules where they were. */
function target(dir: string, name: string, workspaces: Map<string, string>): string {
  for (const [wsDir, wsName] of workspaces) {
    if (dir === wsDir) return join(OUT, 'node_modules', wsName)
    if (dir.startsWith(wsDir + sep)) return join(OUT, 'node_modules', wsName, relative(wsDir, dir))
  }
  const rel = relative(join(ROOT, 'node_modules'), dir)
  if (rel.startsWith('..')) throw new Error(`${name} is outside node_modules: ${dir}`)
  return join(OUT, 'node_modules', rel)
}

function size(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0
  return n
}

export function stage(): { packages: number; bytes: number } {
  const workspaces = new Map<string, string>()
  for (const d of readdirSync(join(ROOT, 'packages'))) {
    const dir = join(ROOT, 'packages', d)
    if (existsSync(join(dir, 'package.json'))) workspaces.set(realpathSync(dir), readPkg(dir).name)
  }
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const seen = new Set<string>()
  const queue = [realpathSync(join(ROOT, 'packages/studio'))]
  while (queue.length) {
    const dir = queue.shift()!
    if (seen.has(dir)) continue
    seen.add(dir)
    const pkg = readPkg(dir)
    const to = target(dir, pkg.name, workspaces)
    if (workspaces.has(dir)) {
      // a workspace package: its published files only (dist, sandbox, help…)
      mkdirSync(to, { recursive: true })
      cpSync(join(dir, 'package.json'), join(to, 'package.json'))
      for (const f of pkg.files ?? []) if (existsSync(join(dir, f))) cpSync(join(dir, f), join(to, f), { recursive: true, dereference: true })
    } else {
      // links become files: a link copied as is would point into this checkout
      cpSync(dir, to, { recursive: true, dereference: true, filter: (src) => !relative(dir, src).split(sep).includes('node_modules') })
    }
    const wanted = { ...pkg.peerDependencies, ...pkg.optionalDependencies, ...pkg.dependencies }
    for (const name of Object.keys(wanted)) {
      if (SKIP.test(name)) continue
      const found = locate(name, dir)
      if (found) queue.push(found)
      else if (pkg.dependencies?.[name]) throw new Error(`${pkg.name} needs ${name}, which is not installed`)
    }
  }
  cpSync(join(ROOT, 'packages/desktop/server/start.mjs'), join(OUT, 'start.mjs'))
  cpSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'))
  writeFileSync(join(OUT, 'package.json'), JSON.stringify({ name: 'mdlearn-desktop-server', private: true, type: 'module' }, null, 2) + '\n')
  return { packages: seen.size, bytes: size(OUT) }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (!existsSync(join(ROOT, 'packages/studio/dist/web/index.html'))) throw new Error('Build first: npm run build')
  const r = stage()
  console.log(`staged ${r.packages} packages, ${(r.bytes / 1024 / 1024).toFixed(1)} MB, in ${relative(ROOT, OUT)}`)
}
