// Where an AI job may write, and the undo snapshot of every file it touches.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { realPath } from '@mdlearn/core/node'

const PROTECTED = new Set(['.git', '.claude', '.agents', '.mdlearn', 'node_modules', '.venv'])
/** Is `abs` a Markdown file inside one of the allowed folders (symlinks resolved, protected folders excluded)? */
export function writeAllowed(abs: string, scope: string[], keepOut: string[] = []): string | null {
  const target = realPath(resolve(abs))
  if (!/\.md$/i.test(target)) return 'Only Markdown (.md) files can be written by AI jobs.'
  for (const k of keepOut) {
    const rel = relative(realPath(k), target)
    if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return 'This job may read that file but not change it.'
  }
  for (const s of scope) {
    const base = realPath(s)
    if (/\.md$/i.test(base)) { if (base === target) return null; continue } // a single file
    const rel = relative(base, target)
    if (rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) {
      if (rel.split(sep).some((seg) => PROTECTED.has(seg))) return 'That folder is protected.'
      return null
    }
  }
  return `Outside the folders this job may change (${scope.map((s) => s.split(sep).slice(-2).join('/')).join(', ')}).`
}

export interface Snapshot { path: string; existed: boolean; hash: string | null }
/** Records the original content of each file the first time a job writes it, so the job can be undone. */
export class Snapshots {
  private taken = new Map<string, Snapshot>()
  constructor(private dir: string, private root: string) {}
  take(abs: string): void {
    const rel = relative(this.root, abs).split(sep).join('/')
    if (this.taken.has(rel)) return
    const existed = existsSync(abs) && statSync(abs).isFile()
    const store = join(this.dir, 'before', rel)
    mkdirSync(dirname(store), { recursive: true })
    if (existed) writeFileSync(store, readFileSync(abs))
    this.taken.set(rel, { path: rel, existed, hash: null })
  }
  /** After the job: remember what the job left, so undo can tell whether you edited a file since. */
  seal(): Snapshot[] {
    for (const s of this.taken.values()) {
      const abs = join(this.root, s.path)
      s.hash = existsSync(abs) ? readFileSync(abs, 'utf8').length + ':' + quickHash(readFileSync(abs, 'utf8')) : null
    }
    const list = [...this.taken.values()]
    writeFileSync(join(this.dir, 'snapshots.json'), JSON.stringify(list, null, 1))
    return list
  }
  static load(dir: string): Snapshot[] {
    const f = join(dir, 'snapshots.json')
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as Snapshot[] : []
  }
  /** Restore every file to its state before the job. Files you changed since are skipped (and reported). */
  static undo(dir: string, root: string): { restored: string[]; removed: string[]; skipped: string[] } {
    const out = { restored: [] as string[], removed: [] as string[], skipped: [] as string[] }
    for (const s of Snapshots.load(dir)) {
      const abs = join(root, s.path)
      // a snapshot names files inside the folder only; anything else is ignored
      const rel = relative(root, abs)
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || writeAllowed(abs, [root]) !== null) { out.skipped.push(s.path); continue }
      const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null
      const nowHash = now === null ? null : now.length + ':' + quickHash(now)
      if (nowHash !== s.hash) { out.skipped.push(s.path); continue }
      if (s.existed) { writeFileSync(abs, readFileSync(join(dir, 'before', s.path))); out.restored.push(s.path) }
      else if (now !== null) { unlinkSync(abs); out.removed.push(s.path) }
    }
    return out
  }
}
function quickHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}
