// Node-only helpers (file system): source resolution, course loading, curriculum status, progress file.
// Imported as `@mdlearn/core/node`; the rest of the package stays DOM- and fs-free.
import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, existsSync, mkdirSync, writeFileSync, renameSync, openSync, writeSync, closeSync, unlinkSync, realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { compile, isWidget, type CompileResult, type SourceResolver } from './compile.js'
import { outlineDoc, findSection, planLessons, scaffoldLesson, type DocOutline, type LessonPlan } from './importer.js'
import type { Lesson } from './ast.js'
import { mergeLogs, type ReviewEvent } from './learn/srs.js'

/** Folders never treated as curriculum content (shared with file watchers). */
/** Instructions for coding assistants at the top of a folder: not notes. */
const ASSISTANT_FILES: ReadonlySet<string> = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'])
export const IGNORED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', '.venv', 'venv', '.claude', '.pytest_cache', '.ruff_cache', '__pycache__', 'dist', '.mdlearn', 'learn'])

/** Outline cache keyed by absolute path + mtime, so long sessions re-read only changed documents. */
const outlines = new Map<string, { mtime: number; outline: DocOutline; md: string }>()
/** A document's outline and text. `outline.path` is relative to `root` when given, else absolute. */
export function loadDoc(absPath: string, root?: string): { outline: DocOutline; md: string } {
  const mtime = statSync(absPath).mtimeMs
  let hit = outlines.get(absPath)
  if (!hit || hit.mtime !== mtime) {
    const md = readFileSync(absPath, 'utf8')
    hit = { mtime, outline: outlineDoc(md, absPath), md }
    outlines.set(absPath, hit)
  }
  return { md: hit.md, outline: { ...hit.outline, path: root ? relative(root, absPath).split(sep).join('/') : absPath } }
}

/** Resolver for a lesson file: `source:` paths are relative to the lesson's directory. `seen` collects the documents it read. */
export function resolverFor(lessonPath: string, seen?: Set<string>): SourceResolver {
  return (doc, section) => {
    const abs = resolve(dirname(lessonPath), doc)
    seen?.add(abs)
    let outline: DocOutline
    try {
      if (!/\.(md|markdown)$/i.test(abs) || !statSync(abs).isFile()) return 'no-document'
      outline = loadDoc(abs).outline
    } catch { return 'no-document' } // unreadable or vanished: report E111, never crash the course
    const s = findSection(outline, section)
    return s ? { title: s.title, words: s.words } : null
  }
}

/** Whether a file named in a lesson or document (a `::video` and its captions) exists, relative to that file. */
export function fileExistsFor(filePath: string): (rel: string) => boolean {
  return (rel) => {
    try { return statSync(resolve(dirname(filePath), ...rel.split('/').map(decodeURIComponent))).isFile() } catch { return false }
  }
}

export function compileFile(path: string): CompileResult {
  return compileSource(readFileSync(path, 'utf8'), path)
}
/** Compile unsaved lesson source as if it were saved at `path` (so `::read` links resolve). */
export function compileSource(source: string, path: string, seen?: Set<string>): CompileResult {
  return compile(source, { path, resolveSource: resolverFor(path, seen), checkJs, fileExists: fileExistsFor(path) })
}
/** Syntax check for simulation code (compiled, never run). */
export function checkJs(code: string): string | null {
  try { new vm.Script(`(async function (api) {\n${code}\n})`, { filename: 'simulation.js' }); return null }
  catch (e) { return (e as Error).message }
}

/** Every file under `dir` whose name matches, skipping IGNORED_DIRS and hidden folders (`learn/` kept when `skipLearn` is false). */
export function walk(dir: string, pred: (f: string) => boolean, skipLearn = true): string[] {
  const out: string[] = []
  let names: string[]
  try { names = readdirSync(dir).sort() } catch { return out } // unreadable folder (e.g. /tmp/systemd-private-*): skip it
  for (const name of names) {
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (name.startsWith('.') || (IGNORED_DIRS.has(name) && (skipLearn || name !== 'learn'))) continue
      out.push(...walk(p, pred, skipLearn))
    } else if (pred(name)) out.push(p)
  }
  return out
}

export interface LoadedLesson { path: string; lesson: Lesson | null; diagnostics: CompileResult['diagnostics'] }
const stamp = (p: string) => { try { const st = statSync(p); return `${st.mtimeMs}:${st.size}` } catch { return 'missing' } }
const mtimeOf = (p: string) => { try { return statSync(p).mtimeMs } catch { return -1 } }
/** Compiled lessons keyed by path; valid while the lesson file and every source document it read are unchanged. */
const compiled = new Map<string, { stamp: string; deps: Map<string, string>; result: LoadedLesson }>()
function loadLesson(path: string): LoadedLesson {
  const hit = compiled.get(path)
  if (hit && hit.stamp === stamp(path) && [...hit.deps].every(([d, s]) => stamp(d) === s)) return hit.result
  const before = stamp(path) // taken before reading: a write during the compile invalidates this entry
  const seen = new Set<string>()
  const r = compileSource(readFileSync(path, 'utf8'), path, seen)
  const result = { path, lesson: r.lesson, diagnostics: r.diagnostics }
  const deps = new Map([...seen].map((d) => [d, stamp(d)]))
  // cache only if nothing moved under us: the lesson is unchanged and every document read is the version now on disk
  const settled = stamp(path) === before && [...seen].every((d) => { const used = outlines.get(d); return !used || mtimeOf(d) === used.mtime })
  if (settled) compiled.set(path, { stamp: before, deps, result })
  return result
}
export function loadCourse(learnDir: string): LoadedLesson[] {
  if (!existsSync(learnDir)) return []
  return walk(learnDir, (f) => f.endsWith('.learn.md'), false).map(loadLesson)
}
/** Every lesson file of a folder: companions in learn/, and courses an assistant wrote anywhere else in it. */
export const lessonPaths = (ws: Workspace): string[] => walk(ws.root, (f) => f.endsWith('.learn.md'), false)
export const loadLessons = (ws: Workspace): LoadedLesson[] => lessonPaths(ws).map(loadLesson)

// ---------------------------------------------------------------- curriculum layout
export interface Workspace { root: string; learnDir: string }
export function workspace(root: string, learnDirName = 'learn'): Workspace {
  const abs = realPath(resolve(root))
  return { root: abs, learnDir: join(abs, learnDirName) }
}
/** Source documents of a curriculum (Markdown outside learn/, tooling and hidden dirs). */
export function sourceDocs(ws: Workspace): string[] {
  return walk(ws.root, (f) => f.endsWith('.md') && !f.endsWith('.learn.md')).filter((p) => !(dirname(p) === ws.root && ASSISTANT_FILES.has(basename(p))))
}
/** `00_FOUNDATIONS/04_sar….md` → `<learn>/00_FOUNDATIONS/04_sar…/` */
export function lessonDirFor(ws: Workspace, docAbs: string): string {
  return join(ws.learnDir, relative(ws.root, docAbs).replace(/\.md$/, ''))
}
/** A lesson belongs to a document as a companion in learn/<doc>/, or by sitting beside a course.md overview. */
export function lessonOfDoc(ws: Workspace, docAbs: string, lessonAbs: string): boolean {
  if (lessonAbs.startsWith(lessonDirFor(ws, docAbs) + sep)) return true
  return basename(docAbs).toLowerCase() === 'course.md' && dirname(lessonAbs) === dirname(docAbs)
}
/** Resolve a document reference: a path relative to the root, or a unique file-name fragment. */
export function findDoc(ws: Workspace, ref: string): string | null {
  const direct = resolve(ws.root, ref)
  if (existsSync(direct) && direct.endsWith('.md')) return direct
  const q = ref.toLowerCase().replace(/\.md$/, '')
  const hits = sourceDocs(ws).filter((p) => relative(ws.root, p).toLowerCase().includes(q))
  return hits.length === 1 ? hits[0] : (hits.find((p) => p.toLowerCase().endsWith(`/${q}.md`)) ?? null)
}

export interface DocStatus {
  doc: string; title: string; kind: DocOutline['kind']; words: number; timeMin?: number
  planned: number; existing: number; errors: number; warnings: number; cards: number; widgets: number
}
export function curriculumStatus(ws: Workspace, filter?: string): DocStatus[] {
  const lessons = loadLessons(ws)
  return sourceDocs(ws)
    .filter((p) => !filter || relative(ws.root, p).toLowerCase().includes(filter.toLowerCase()))
    .map((abs) => {
      const { outline } = loadDoc(abs, ws.root)
      const mine = lessons.filter((l) => lessonOfDoc(ws, abs, l.path))
      const ok = mine.map((l) => l.lesson).filter((l): l is Lesson => !!l)
      return {
        doc: relative(ws.root, abs).split(sep).join('/'), title: outline.title, kind: outline.kind, words: outline.words,
        timeMin: outline.timeMin, planned: planLessons(outline).length, existing: mine.length,
        errors: mine.reduce((n, l) => n + l.diagnostics.filter((d) => d.code.startsWith('E')).length, 0),
        warnings: mine.reduce((n, l) => n + l.diagnostics.filter((d) => d.code.startsWith('W')).length, 0),
        cards: ok.reduce((n, l) => n + l.cards.length, 0),
        widgets: ok.reduce((n, l) => n + l.cards.reduce((m, c) => m + c.blocks.filter(isWidget).length, 0), 0),
      }
    })
}

/** Lesson plan for a document with concrete file paths and the `source:` value each lesson needs. */
export function planFor(ws: Workspace, docAbs: string, targetWords?: number): (LessonPlan & { path: string; source: string; exists: boolean })[] {
  const { outline } = loadDoc(docAbs, ws.root)
  const dir = lessonDirFor(ws, docAbs)
  return planLessons(outline, { targetWords }).map((p) => {
    const path = join(dir, p.file)
    return { ...p, path, source: relative(dir, docAbs).split(sep).join('/'), exists: existsSync(path) }
  })
}

/** Companion-lesson skeletons for a document (never overwrites: `exists` files are reported, not regenerated). */
export function scaffoldLessons(ws: Workspace, docAbs: string, targetWords?: number): { path: string; id: string; exists: boolean; content: string | null }[] {
  const { outline } = loadDoc(docAbs, ws.root)
  let prev: string | undefined
  return planFor(ws, docAbs, targetWords).map((p) => {
    const content = p.exists ? null : scaffoldLesson(outline, p, prev)
    prev = p.id
    return { path: p.path, id: p.id, exists: p.exists, content }
  })
}

export interface SearchHit { doc: string; section: string; title: string; snippet: string; score: number }
/** Sections (depth ≤ 3) whose text contains every query term, best first (title matches weigh more). */
export function searchCurriculum(ws: Workspace, query: string, opts: { filter?: string; limit?: number } = {}): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const hits: SearchHit[] = []
  for (const abs of sourceDocs(ws)) {
    const rel = relative(ws.root, abs).split(sep).join('/')
    if (opts.filter && !rel.toLowerCase().includes(opts.filter.toLowerCase())) continue
    const { outline, md } = loadDoc(abs, ws.root)
    const lines = md.split('\n')
    const starts = outline.sections.map((x) => x.startLine).sort((x, y) => x - y)
    for (const s of outline.sections.filter((x) => x.depth <= 3)) {
      // the section's own text, up to the next heading of any depth (parents do not repeat their children's hits)
      const next = starts.find((l) => l > s.startLine) ?? s.endLine + 1
      const body = lines.slice(s.startLine - 1, Math.min(s.endLine, next - 1)).join('\n')
      const lower = body.toLowerCase()
      if (!terms.every((t) => lower.includes(t))) continue
      const at = lower.indexOf(terms[0])
      hits.push({ doc: rel, section: s.num ?? s.anchor, title: s.title,
        score: terms.reduce((n, t) => n + lower.split(t).length - 1, 0) + (terms.some((t) => s.title.toLowerCase().includes(t)) ? 20 : 0),
        snippet: body.slice(Math.max(0, at - 80), at + 160).replace(/\s+/g, ' ') })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 10)
}

/** Absolute path of `p` (relative to `root` or absolute) if it stays inside `root` after resolving symlinks; else null. */
export function inRoot(root: string, p: string): string | null {
  const base = realPath(resolve(root))
  const abs = realPath(resolve(base, p))
  return within(base, abs) ? abs : null
}
const within = (base: string, abs: string) => {
  const rel = relative(base, abs)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
/** realpath that also works for paths that do not exist yet; a dangling symlink resolves to its target. */
export function realPath(x: string, depth = 0): string {
  try { return realpathSync(x) } catch { /* missing: resolve the part that exists */ }
  if (depth > 40) return x
  try {
    if (lstatSync(x).isSymbolicLink()) return realPath(resolve(dirname(x), readlinkSync(x)), depth + 1)
  } catch { /* not there at all */ }
  const parent = dirname(x)
  return parent === x ? x : join(realPath(parent, depth + 1), basename(x))
}

// ---------------------------------------------------------------- progress file
export const AttemptEventSchema = z.object({
  id: z.string().min(1), t: z.number().finite(), widget: z.string(), card: z.string(),
  kind: z.enum(['attempt', 'hint', 'reveal']), correct: z.boolean().optional(), sure: z.boolean().optional(),
  answer: z.string().max(2000).optional(),
})
export type AttemptEvent = z.infer<typeof AttemptEventSchema>
const ReviewEventSchema = z.object({ id: z.string().min(1), t: z.number().finite(), key: z.string(), rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })
export const ProgressSchema = z.object({
  version: z.literal(1),
  reviews: z.array(ReviewEventSchema),
  attempts: z.array(AttemptEventSchema),
})
export type Progress = z.infer<typeof ProgressSchema> & { reviews: ReviewEvent[] }

export const progressPath = (ws: Workspace) => join(ws.learnDir, '.mdlearn', 'progress.json')
export function loadProgress(ws: Workspace): Progress {
  const p = progressPath(ws)
  if (!existsSync(p)) return { version: 1, reviews: [], attempts: [] }
  const parsed = ProgressSchema.safeParse(JSON.parse(readFileSync(p, 'utf8')))
  if (!parsed.success) throw new Error(`progress file is invalid (${p}): ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

// The CLI, the MCP server and the studio may write at the same time. Every save takes a lock, re-reads
// the file and keeps the union of both logs (events have unique ids, so the union is always right),
// then writes atomically (temp file + rename), so a crash never leaves a half-written history.
const LOCK_STALE_MS = 10_000
const LOCK_TIMEOUT_MS = 15_000
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const errno = (e: unknown) => (e as NodeJS.ErrnoException).code
function withLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`
  const token = `${process.pid}:${randomUUID()}`
  const started = Date.now()
  for (;;) {
    if (Date.now() - started > LOCK_TIMEOUT_MS) throw new Error(`progress file is locked (${lock}); delete the lock file if no mdlearn program is running`)
    try {
      const fd = openSync(lock, 'wx')
      try { writeSync(fd, token) } finally { closeSync(fd) }
      break
    } catch (e) {
      if (errno(e) !== 'EEXIST') throw e
      breakIfStale(lock)
      pause(2 + Math.random() * 8)
    }
  }
  try { return fn() } finally {
    // release only our own lock: if we stalled and someone broke it as stale, theirs stays
    try { if (readFileSync(lock, 'utf8') === token) unlinkSync(lock) } catch (e) { if (errno(e) !== 'ENOENT') throw e }
  }
}
/** Remove a lock left by a crashed writer — only if it is still the same stale file we looked at. */
function breakIfStale(lock: string): void {
  try {
    const st = statSync(lock)
    if (Date.now() - st.mtimeMs <= LOCK_STALE_MS) return
    const again = statSync(lock)
    if (again.ino === st.ino && again.mtimeMs === st.mtimeMs) unlinkSync(lock)
  } catch (e) { if (errno(e) !== 'ENOENT') throw e } // released meanwhile: just retry
}
function writeMerged(ws: Workspace, add: Pick<Progress, 'reviews' | 'attempts'>, keepExisting = false): Progress {
  const p = progressPath(ws)
  mkdirSync(dirname(p), { recursive: true })
  return withLock(p, () => {
    const disk = loadProgress(ws)
    // validated before writing: one malformed event must fail this call, never corrupt the history
    // an id already on disk normally takes the new event; with keepExisting the recorded one stays (first write wins)
    const join = <E extends { id: string; t: number }>(old: E[], neu: E[]) => (keepExisting ? mergeLogs(neu, old) : mergeLogs(old, neu))
    const merged = ProgressSchema.parse({ version: 1, reviews: join(disk.reviews, add.reviews), attempts: join(disk.attempts, add.attempts) }) as Progress
    const tmp = `${p}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(merged, null, 1))
    renameSync(tmp, p)
    return merged
  })
}
/** Save a progress object, merged with whatever other writers saved meanwhile (events are never deleted). Returns the merged history. */
export function saveProgress(ws: Workspace, progress: Progress): Progress {
  return writeMerged(ws, progress)
}
/**
 * Append events to the history (the usual way to record an attempt or a review). Returns the merged history.
 * `keepExisting`: events whose id is already recorded are ignored, so a resent batch (an exam paper, an offline
 * sync) can never change what was recorded the first time.
 */
export function appendProgress(ws: Workspace, events: { reviews?: ReviewEvent[]; attempts?: AttemptEvent[] }, opts: { keepExisting?: boolean } = {}): Progress {
  return writeMerged(ws, { reviews: events.reviews ?? [], attempts: events.attempts ?? [] }, opts.keepExisting)
}

// ---------------------------------------------------------------- goals file (personal, beside progress)
const GoalsSchema = z.object({
  version: z.literal(1),
  /** Cards you aim to review per day. */
  dailyGoal: z.number().int().min(1).max(500),
  /** `scope` is '' for the whole folder, or a document path. */
  deadlines: z.array(z.object({ scope: z.string().max(1024), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(80).optional() })).max(50),
  /** Cards (`lessonId/cardId`) you set aside; they never appear in a session. */
  suspended: z.array(z.string().max(300)).max(5000),
  /** Studied cards with no card left, dealt with: reconnected to another card, or let go. Their history stays. */
  settled: z.array(z.string().max(300)).max(5000).default([]),
})
export type Goals = z.infer<typeof GoalsSchema>
export const DEFAULT_GOALS: Goals = { version: 1, dailyGoal: 20, deadlines: [], suspended: [], settled: [] }
export const goalsPath = (ws: Workspace) => join(ws.learnDir, '.mdlearn', 'goals.json')
export function loadGoals(ws: Workspace): Goals {
  const p = goalsPath(ws)
  if (!existsSync(p)) return { ...DEFAULT_GOALS }
  let raw: unknown
  try { raw = JSON.parse(readFileSync(p, 'utf8')) } catch { throw new Error(`your goals file is damaged (${p}); fix or delete it`) }
  const r = GoalsSchema.safeParse(raw)
  if (!r.success) throw new Error(`your goals file is not valid (${p}): ${r.error.issues[0]?.message}`)
  return r.data
}
/** Validated, atomic. The old file stays if the new goals are invalid. */
export function saveGoals(ws: Workspace, goals: Goals): Goals {
  const parsed = GoalsSchema.parse(goals)
  const p = goalsPath(ws)
  mkdirSync(dirname(p), { recursive: true })
  return withLock(p, () => {
    const tmp = `${p}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(parsed, null, 1))
    renameSync(tmp, p)
    return parsed
  })
}
