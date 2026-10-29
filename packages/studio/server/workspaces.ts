// Open folders ("workspaces"): registry with recents, per-folder caches of parsed documents, the
// library tree (documents, their companion lessons, study state) and uploads into the library.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { parseDocument, report, type Lesson, type DocModel } from '@mdlearn/core'
import { workspace, sourceDocs, loadCourse, loadDoc, lessonDirFor, loadProgress, resolverFor, fileExistsFor, inRoot, checkJs, IGNORED_DIRS, type Workspace } from '@mdlearn/core/node'
import type { SettingsStore } from './settings.js'
import { texDocs } from './latex-files.js'
import type { Tree, TreeDoc, WorkspaceSummary, BrowseResult } from '../shared/types.js'

export interface Handle { id: string; name: string; root: string; ws: Workspace }
export const workspaceId = (root: string) => createHash('sha256').update(root).digest('hex').slice(0, 12)
const posix = (p: string) => p.split(sep).join('/')

export class Workspaces {
  private open_ = new Map<string, Handle>()
  private docs = new Map<string, { stamp: string; model: DocModel & { mtime: number } }>()
  constructor(private settings: SettingsStore, private onOpen: (h: Handle) => void = () => {}) {}

  /** Open (or re-open) a folder in place. Throws a user-facing message when it cannot be used. */
  open(path: string): Handle {
    const abs = resolve(path.replace(/^~(?=$|\/)/, homedir()))
    if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new UserError('not-found', `There is no folder at ${abs}.`)
    const root = realpathSync(abs)
    const id = workspaceId(root)
    let h = this.open_.get(id)
    if (!h) {
      h = { id, name: basename(root), root, ws: workspace(root) }
      this.open_.set(id, h)
      this.onOpen(h)
    }
    this.settings.update((s) => ({ ...s, recents: [{ root, lastOpened: Date.now() }, ...s.recents.filter((r) => r.root !== root)].slice(0, 20) }))
    return h
  }
  get(id: string): Handle | undefined {
    const h = this.open_.get(id)
    if (h) return h
    const recent = this.settings.get().recents.find((r) => workspaceId(r.root) === id) // reopen after a restart
    return recent && existsSync(recent.root) ? this.open(recent.root) : undefined
  }
  handles(): Handle[] { return [...this.open_.values()] }
  list(): WorkspaceSummary[] {
    const lib = this.settings.get().libraryDir
    return this.settings.get().recents.filter((r) => existsSync(r.root)).map((r) => {
      const ws = workspace(r.root)
      return { id: workspaceId(r.root), name: basename(r.root), root: r.root, docs: sourceDocs(ws).length, lessons: countLessons(ws.learnDir), lastOpened: r.lastOpened, inLibrary: r.root.startsWith(lib + sep) }
    })
  }

  /** Parsed document, cached by mtime + size. `rel` must already be validated. */
  doc(h: Handle, rel: string): DocModel & { mtime: number } {
    const abs = this.resolve(h, rel)
    const st = statSync(abs)
    const key = `${h.id}:${rel}`, stamp = `${st.mtimeMs}:${st.size}`
    const hit = this.docs.get(key)
    if (hit?.stamp === stamp) return hit.model
    const model = { ...parseDocument(readFileSync(abs, 'utf8'), { path: rel, resolveSource: resolverFor(abs), checkJs, fileExists: fileExistsFor(abs) }), mtime: st.mtimeMs }
    this.docs.set(key, { stamp, model })
    return model
  }
  /** A document as it would read with this text (the editor's preview); nothing is cached. */
  preview(h: Handle, rel: string, text: string): DocModel & { mtime: number } {
    const abs = inRoot(h.root, rel)
    if (!abs) throw new UserError('path', 'That file is outside this folder.')
    return { ...parseDocument(text, { path: rel, resolveSource: resolverFor(abs), checkJs, fileExists: fileExistsFor(abs) }), mtime: 0 }
  }
  /** Absolute path for a workspace-relative path, or a 403-style error when it escapes the folder. */
  resolve(h: Handle, rel: string, exts = /\.(md|markdown)$/i): string {
    const abs = inRoot(h.root, rel)
    if (!abs || !exts.test(abs) || rel.split(/[\\/]/).some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..')) throw new UserError('path', 'That file is outside this folder or not a Markdown file.')
    if (!existsSync(abs)) throw new UserError('not-found', `No file ${rel} in this folder.`)
    return abs
  }

  tree(h: Handle): Tree {
    const loaded = loadCourse(h.ws.learnDir)
    const progress = safeProgress(h.ws)
    const lessons = loaded.map((l) => l.lesson).filter((l): l is Lesson => !!l)
    const rep = report(lessons, progress.reviews, Date.now(), progress.attempts)
    const perLesson = new Map(rep.lessons.map((r) => [r.lessonId, r]))
    const lessonRow = (l: (typeof loaded)[number]) => ({
      path: posix(relative(h.root, l.path)), id: l.lesson?.id ?? basename(l.path), title: l.lesson?.title ?? basename(l.path),
      cards: l.lesson?.cards.length ?? 0, errors: l.diagnostics.filter((d) => d.code.startsWith('E')).length, warnings: l.diagnostics.filter((d) => d.code.startsWith('W')).length,
    })
    const used = new Set<string>()
    const docs: TreeDoc[] = sourceDocs(h.ws).map((abs) => {
      const { outline } = loadDoc(abs, h.root)
      const dir = lessonDirFor(h.ws, abs) + sep
      const mine = loaded.filter((l) => l.path.startsWith(dir))
      mine.forEach((l) => used.add(l.path))
      const stats = mine.map((l) => (l.lesson ? perLesson.get(l.lesson.id) : undefined)).filter((r) => !!r)
      const seen = stats.reduce((n, r) => n + r.seen, 0)
      const recalls = stats.filter((r) => r.predictedRecall !== null)
      return {
        path: posix(relative(h.root, abs)), title: outline.title, kind: outline.kind, words: outline.words, ...(outline.timeMin ? { timeMin: outline.timeMin } : {}),
        lessons: mine.map(lessonRow), cards: stats.reduce((n, r) => n + r.cards, 0), seen, due: stats.reduce((n, r) => n + r.due, 0),
        memory: recalls.length ? Math.round((recalls.reduce((n, r) => n + r.predictedRecall! * r.seen, 0) / Math.max(1, seen)) * 100) / 100 : null,
      }
    })
    const orphanLessons = loaded.filter((l) => !used.has(l.path)).map(lessonRow)
    return { root: h.root, name: h.name, docs, orphanLessons, latex: texDocs(h.root),
      totals: { docs: docs.length, lessons: loaded.length, cards: rep.totals.cards, due: rep.totals.due, seen: rep.totals.seen } }
  }

  /** Copy uploaded files into a new library folder and open it. Paths come from the browser: sanitised here. */
  /** The library's own "Imports" folder, created when needed: where imports go when no folder is open yet. */
  importsFolder(): Handle {
    const dir = join(this.settings.get().libraryDir, 'Imports')
    mkdirSync(dir, { recursive: true })
    return this.open(dir)
  }
  /**
   * The interactive tutorial (the feature tour and "Start here"), copied into the library so your answers and
   * notes stay out of the app's own files. `reset` starts it over from a fresh copy.
   */
  tutorial(source: string, reset = false): Handle {
    if (!existsSync(source)) throw new UserError('not-found', 'The tutorial is missing from this installation.')
    const dir = join(this.settings.get().libraryDir, 'MDlearn Tutorial')
    if (reset && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    if (!existsSync(dir)) { mkdirSync(dirname(dir), { recursive: true }); cpSync(source, dir, { recursive: true, filter: (f) => !/[\\/]\.mdlearn([\\/]|$)/.test(f) }) }
    return this.open(dir)
  }
  upload(name: string, files: { path: string; data: Uint8Array }[]): Handle {
    const lib = this.settings.get().libraryDir
    const slug = (name.trim() || 'Uploaded notes').replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/^[.-]+/, '').slice(0, 60) || 'notes'
    let dir = join(lib, slug)
    for (let n = 2; existsSync(dir); n++) dir = join(lib, `${slug}-${n}`)
    for (const f of files) {
      const segs = f.path.split(/[\\/]+/).filter(Boolean)
      // the browser sends "Folder/sub/file.md": drop the dropped folder's own name, keep the structure below it
      const rel = segs.length > 1 && files.every((x) => x.path.split(/[\\/]+/).filter(Boolean)[0] === segs[0]) ? segs.slice(1) : segs
      if (!rel.length || rel.some((s) => s === '..' || s === '.' || s.startsWith('.'))) throw new UserError('path', `Refused file path: ${f.path}`)
      const target = join(dir, ...rel)
      if (!target.startsWith(dir + sep)) throw new UserError('path', `Refused file path: ${f.path}`)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, f.data, { flag: 'wx' })
    }
    return this.open(dir)
  }
}

export class UserError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

function countLessons(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.')) n += countLessons(join(dir, e.name))
    else if (e.name.endsWith('.learn.md')) n++
  }
  return n
}
/** A broken progress file must not take the library down; the study views report it instead. */
function safeProgress(ws: Workspace) {
  try { return loadProgress(ws) } catch { return { version: 1 as const, reviews: [], attempts: [] } }
}

/** Folder browser for "Open a folder" (this computer only): subfolders of a folder under the home directory. */
export function browse(path: string | undefined): BrowseResult {
  const home = realpathSync(homedir())
  const target = path ? inRoot(home, path.replace(/^~(?=$|\/)/, home)) : home
  if (!target || !existsSync(target) || !statSync(target).isDirectory()) throw new UserError('path', 'Only folders inside your home folder can be opened here.')
  const entries = readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name) || (e.isDirectory() && e.name === 'learn'))
    .map((e) => {
      const p = join(target, e.name)
      let md = 0, hasLearn = false
      try { for (const f of readdirSync(p)) { if (/\.(md|markdown)$/i.test(f)) md++; if (f === 'learn') hasLearn = true } } catch { /* unreadable */ }
      return { name: e.name, path: p, mdFiles: md, hasLearn }
    })
    .sort((a, b) => Number(b.hasLearn) - Number(a.hasLearn) || b.mdFiles - a.mdFiles || a.name.localeCompare(b.name))
  return { path: target, parent: target === home ? null : dirname(target), entries }
}
