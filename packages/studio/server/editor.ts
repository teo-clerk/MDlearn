// Editing Markdown (and LaTeX) files from the browser: read with a version stamp, save only if nobody changed
// the file meanwhile, keep the last versions in <folder>/.mdlearn/history/<path>/, create new notes.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inRoot } from '@mdlearn/core/node'
import type { Handle, Workspaces } from './workspaces.js'
import { UserError } from './workspaces.js'
import type { FileInfo, HistoryEntry } from '../shared/types.js'

export const MAX_FILE_CHARS = 1_500_000
const KEEP_VERSIONS = 20
const STAMP_TOLERANCE_MS = 1
const isLesson = (rel: string) => /\.learn\.md$/i.test(rel)
/** Text files the editor opens: notes, and the files of a LaTeX project. */
const EDITABLE = /\.(md|markdown|tex|bib|sty|cls)$/i
const isLatex = (rel: string) => /\.(tex|bib|sty|cls)$/i.test(rel)
const histDir = (h: Handle, rel: string) => join(h.root, '.mdlearn', 'history', rel)
const digest = (s: string) => createHash('sha1').update(s).digest('hex')

export function readFileInfo(h: Handle, workspaces: Workspaces, rel: string): FileInfo {
  const abs = workspaces.resolve(h, rel, EDITABLE)
  return { path: rel, text: readFileSync(abs, 'utf8'), mtime: statSync(abs).mtimeMs, kind: isLesson(rel) ? 'lesson' : isLatex(rel) ? 'latex' : 'doc' }
}

function atomicWrite(abs: string, text: string) {
  const tmp = `${abs}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, abs)
}

/** Remember the file as it is now (unless the newest version already is that) and drop the oldest beyond 20. */
function snapshot(h: Handle, rel: string, current: string, now: number) {
  const dir = histDir(h, rel)
  mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir).filter((f) => /^\d+\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
  const last = files.at(-1)
  if (last && digest(readFileSync(join(dir, last), 'utf8')) === digest(current)) return
  writeFileSync(join(dir, `${now}.md`), current)
  for (const f of [...files, `${now}.md`].slice(0, -KEEP_VERSIONS)) rmSync(join(dir, f), { force: true })
}

export function saveFile(h: Handle, workspaces: Workspaces, o: { path: string; text: string; baseMtime?: number; overwrite?: boolean }): { mtime: number } {
  if (o.text.length > MAX_FILE_CHARS) throw new UserError('too-large', 'This file is too large to save from the browser.')
  const abs = workspaces.resolve(h, o.path, EDITABLE)
  const st = statSync(abs)
  if (!o.overwrite && o.baseMtime !== undefined && Math.abs(st.mtimeMs - o.baseMtime) > STAMP_TOLERANCE_MS) throw new UserError('conflict', 'This file changed on disk since you opened it.')
  const before = readFileSync(abs, 'utf8')
  if (before === o.text) return { mtime: st.mtimeMs }
  snapshot(h, o.path, before, Date.now())
  atomicWrite(abs, o.text)
  return { mtime: statSync(abs).mtimeMs }
}

/** A new Markdown or LaTeX file inside the folder; never replaces one. */
export function createFile(h: Handle, rel: string, text: string): { path: string; mtime: number } {
  if (!/\.(md|tex)$/i.test(rel) || rel.split(/[\\/]/).some((s) => s.startsWith('.') || s === '') || /[\u0000-\u001f]/.test(rel)) throw new UserError('path', 'Choose a name ending in .md or .tex, outside hidden folders.')
  const abs = inRoot(h.root, rel)
  if (!abs) throw new UserError('path', 'That file is outside this folder.')
  if (existsSync(abs)) throw new UserError('file-exists', `${rel} already exists.`)
  mkdirSync(dirname(abs), { recursive: true })
  atomicWrite(abs, text)
  return { path: rel, mtime: statSync(abs).mtimeMs }
}

export function listHistory(h: Handle, workspaces: Workspaces, rel: string): HistoryEntry[] {
  workspaces.resolve(h, rel, EDITABLE)
  const dir = histDir(h, rel)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => /^\d+\.md$/.test(f)).map((f) => ({ id: f.slice(0, -3), at: parseInt(f), size: statSync(join(dir, f)).size })).sort((a, b) => b.at - a.at)
}
export function readVersion(h: Handle, workspaces: Workspaces, rel: string, id: string): string {
  workspaces.resolve(h, rel, EDITABLE)
  if (!/^\d{10,16}$/.test(id)) throw new UserError('not-found', 'No such version.')
  const f = join(histDir(h, rel), `${id}.md`)
  if (!existsSync(f)) throw new UserError('not-found', 'No such version.')
  return readFileSync(f, 'utf8')
}
