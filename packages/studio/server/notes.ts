// Notes and AI conversations about a passage, stored beside the files (never inside your Markdown):
// <folder>/.mdlearn/notes/<document path>.json. Anchored by the quoted text (W3C TextQuoteSelector) and
// the section, so they survive edits to the document.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Handle } from './workspaces.js'
import { UserError } from './workspaces.js'

const MAX_NOTES_FILE = 5 * 1024 * 1024
export const NoteColorSchema = z.enum(['important', 'confusing', 'exam'])
export const AnchorSchema = z.object({
  section: z.string().max(200).nullable(),
  quote: z.object({ exact: z.string().min(1).max(2000), prefix: z.string().max(64), suffix: z.string().max(64) }),
  /** A moment of a video, in seconds (v1.4). */
  t: z.number().min(0).max(100 * 3600).optional(),
})
const MessageSchema = z.object({ id: z.string(), role: z.enum(['user', 'ai']), text: z.string().max(40_000), engine: z.string().optional(), at: z.number(), error: z.string().optional(), done: z.boolean().default(true) })
export const NoteSchema = z.object({
  id: z.string(), doc: z.string(), anchor: AnchorSchema, body: z.string().max(20_000), thread: z.array(MessageSchema), created: z.number(), updated: z.number(),
  /** A highlight with a purpose: it needs no text. */
  color: NoteColorSchema.optional(),
})
const FileSchema = z.object({ version: z.literal(1), notes: z.array(NoteSchema) })
export type Note = z.infer<typeof NoteSchema>
export type Anchor = z.infer<typeof AnchorSchema>
export type Message = z.infer<typeof MessageSchema>

const fileOf = (h: Handle, doc: string) => join(h.root, '.mdlearn', 'notes', `${doc}.json`)
const locks = new Map<string, Promise<unknown>>()
/** Serialise read-modify-write per file (AI deltas and edits can overlap). */
export async function withFile<T>(path: string, fn: () => T): Promise<T> {
  const prev = locks.get(path) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(path, next.catch(() => {}))
  return next
}
function read(path: string): Note[] {
  if (!existsSync(path)) return []
  const r = FileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!r.success) throw new UserError('notes', `The notes file ${path} is damaged; it was left untouched.`)
  return r.data.notes
}
/** For lists across files: one damaged or huge file can't take the rest down. Its own document still reports it. */
function readOrSkip(path: string): Note[] {
  try { return statSync(path).size > MAX_NOTES_FILE ? [] : read(path) } catch { return [] }
}
function write(path: string, notes: Note[]) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ version: 1, notes }, null, 1))
  renameSync(tmp, path)
}

export const notesStore = {
  list(h: Handle, doc: string): Note[] { return read(fileOf(h, doc)) },
  /** Every highlight of one kind in the folder, newest first. */
  marked(h: Handle, color: Note['color'], limit: number): Note[] {
    const dir = join(h.root, '.mdlearn', 'notes')
    if (!existsSync(dir)) return []
    const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith('.json'))
    return files.flatMap((f) => readOrSkip(join(f.parentPath, f.name))).filter((n) => n.color === color).sort((a, b) => b.updated - a.updated).slice(0, limit)
  },
  async create(h: Handle, doc: string, anchor: Anchor, body: string, color?: Note['color']): Promise<Note> {
    const path = fileOf(h, doc)
    return withFile(path, () => {
      const now = Date.now()
      const note: Note = { id: randomUUID(), doc, anchor, body, thread: [], created: now, updated: now, ...(color ? { color } : {}) }
      write(path, [...read(path), note])
      return note
    })
  },
  async update(h: Handle, doc: string, id: string, fn: (n: Note) => Note): Promise<Note> {
    const path = fileOf(h, doc)
    return withFile(path, () => {
      const notes = read(path)
      const at = notes.findIndex((n) => n.id === id)
      if (at < 0) throw new UserError('not-found', 'This note no longer exists.')
      const next = { ...fn(notes[at]), updated: Date.now() }
      write(path, notes.map((n, i) => (i === at ? next : n)))
      return next
    })
  },
  async remove(h: Handle, doc: string, id: string): Promise<void> {
    const path = fileOf(h, doc)
    await withFile(path, () => write(path, read(path).filter((n) => n.id !== id)))
  },
}
