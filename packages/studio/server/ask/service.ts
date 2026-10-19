// Ask your whole folder: find the passages that matter (words + meaning), then let the local model answer
// from them only, citing each claim as [1], [2]… The answer streams like a note's, and is kept in a history.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { EventBus } from '../bus.js'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import type { SettingsStore } from '../settings.js'
import type { Knowledge, KnowledgeIndex } from '../knowledge/index.js'
import { hasModel, ollamaChat, ollamaEmbed, ollamaPull, ollamaStatus, type ChatMessage, type OllamaConfig } from '../ai/ollama.js'
import { trackRunning } from '../ai/ask.js'
import { notesStore, withFile } from '../notes.js'
import { VectorStore } from './vectors.js'
import { Bm25, fuse, nearest, normalise, type Scored } from './search.js'
import type { AskEntry, AskSource, AskStatus } from '../../shared/types.js'

const TOP = 8, PER_LIST = 30, BATCH = 12, MAX_PASSAGE_CHARS = 1500, MAX_HISTORY = 100
const QUERY_PREFIX = 'task: search result | query: '

export interface Passage { hash: string; doc: string; docTitle: string; section: AskSource['section']; line: number; text: string }
const embedText = (p: Passage) => `title: ${p.docTitle}${p.section ? ` — ${p.section.title}` : ''} | text: ${p.text.slice(0, 3500)}`
const plain = (s: string) => s.replace(/\$\$?[^$]*\$\$?/g, ' ').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim()

export const ASK_FOLDER_SYSTEM = `You answer questions about a student's own notes, using only the numbered passages you are given.
After each claim, cite the passage it comes from like [2]; use several like [1][3] when they agree.
If the passages do not contain the answer, say so in one sentence and name what is missing; never guess or use outside knowledge.
Write math in LaTeX between $…$ (inline) or $$…$$ (display). Be concise: at most 200 words, no preamble, no closing offer.`

export function buildPrompt(question: string, passages: { n: number; title: string; section: string | null; text: string }[]): ChatMessage[] {
  const body = passages.map((p) => `[${p.n}] ${p.title}${p.section ? ` — §${p.section}` : ''}\n${p.text.slice(0, MAX_PASSAGE_CHARS)}`).join('\n\n')
  return [{ role: 'system', content: ASK_FOLDER_SYSTEM }, { role: 'user', content: `Passages:\n\n${body}\n\nQuestion: ${question}` }]
}
/** The passage numbers an answer cites, in order of first appearance, ignoring numbers that are not sources. */
export function citedNumbers(answer: string, count: number): number[] {
  const out: number[] = []
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) { const n = Number(m[1]); if (n >= 1 && n <= count && !out.includes(n)) out.push(n) }
  return out
}

interface Pull { status: string; completed?: number; total?: number; error?: string; done: boolean }
interface Build { running: boolean; error?: string; startedAt: number }
const EntrySchema = z.object({
  id: z.string(), question: z.string(), answer: z.string(), at: z.number(), mode: z.enum(['meaning', 'words']), notice: z.string().optional(), error: z.string().optional(), done: z.boolean(),
  sources: z.array(z.object({ n: z.number(), doc: z.string(), docTitle: z.string(), section: z.object({ num: z.string().nullable(), anchor: z.string(), title: z.string() }).nullable(), line: z.number(), snippet: z.string() })),
})
const FileSchema = z.object({ version: z.literal(1), entries: z.array(EntrySchema) })

export class AskService {
  private pull: Pull | null = null
  private builds = new Map<string, Build>()
  private stores = new Map<string, VectorStore>()
  private cache = new Map<string, { rev: number; passages: Passage[]; bm25: Bm25 }>()
  constructor(private knowledge: Knowledge, private bus: EventBus, private settings: SettingsStore) {}

  private cfg(): OllamaConfig { return this.settings.get().ollama }
  private store(h: Handle): VectorStore {
    const model = this.cfg().embedModel ?? 'embeddinggemma'
    const have = this.stores.get(h.id)
    if (have && have.model === model) return have
    const s = new VectorStore(h.root, model); this.stores.set(h.id, s); return s
  }
  private passages(h: Handle): { idx: KnowledgeIndex; passages: Passage[]; bm25: Bm25 } {
    const idx = this.knowledge.for(h)
    const hit = this.cache.get(h.id)
    if (hit && hit.rev === idx.rev) return { idx, passages: hit.passages, bm25: hit.bm25 }
    const passages: Passage[] = idx.all().flatMap((f) => f.chunks.map((c) => ({
      hash: createHash('sha1').update(`${f.title}\n${c.title}\n${c.text}`).digest('hex').slice(0, 20), doc: f.path, docTitle: f.title, section: c.section, line: c.line, text: c.text,
    })))
    const bm25 = new Bm25(passages.map((p) => `${p.docTitle} ${p.section?.title ?? ''} ${p.text}`))
    this.cache.set(h.id, { rev: idx.rev, passages, bm25 })
    return { idx, passages, bm25 }
  }

  async status(h: Handle): Promise<AskStatus> {
    const cfg = this.cfg(), model = cfg.embedModel ?? 'embeddinggemma'
    const local = await ollamaStatus(cfg)
    const installed = hasModel(local.models, model)
    const { passages } = this.passages(h)
    const store = this.store(h)
    const indexed = passages.filter((p) => store.has(p.hash)).length
    const b = this.builds.get(h.id)
    return {
      model, ollama: local.models.length > 0 || local.available, chatReady: local.available, installed, size: '≈620 MB',
      pulling: this.pull && !this.pull.done && !this.pull.error ? { status: this.pull.status, ...(this.pull.total ? { percent: Math.min(100, Math.round(100 * (this.pull.completed ?? 0) / this.pull.total)) } : {}) } : null,
      indexed, total: passages.length, building: !!b?.running, reading: this.knowledge.for(h).status().building, ...((b?.error ?? this.pull?.error) ? { error: b?.error ?? this.pull?.error } : {}),
    }
  }

  /** Download the embedding model if needed, then index every passage. Returns at once; follow `status`. */
  async setup(h: Handle): Promise<void> {
    const cfg = this.cfg(), model = cfg.embedModel ?? 'embeddinggemma'
    const local = await ollamaStatus(cfg)
    if (!local.models.length && !local.available) throw new UserError('engine', local.error ?? 'Ollama is not running.')
    if (!hasModel(local.models, model)) {
      if (this.pull && !this.pull.done && !this.pull.error) return
      const p: Pull = { status: 'Starting the download', done: false }; this.pull = p
      void ollamaPull(cfg, model, (x) => { p.status = x.status; if (x.total) { p.total = x.total; p.completed = x.completed } })
        .then(() => { p.done = true; return this.build(h) })
        .catch((e: Error) => { p.error = e.message })
      return
    }
    void this.build(h)
  }

  async build(h: Handle): Promise<void> {
    const have = this.builds.get(h.id)
    if (have?.running) return
    const b: Build = { running: true, startedAt: Date.now() }; this.builds.set(h.id, b)
    try {
      await this.knowledge.for(h).ensure()
      const { passages } = this.passages(h)
      const store = this.store(h), cfg = this.cfg()
      const todo = passages.filter((p) => !store.has(p.hash))
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH)
        const vecs = await ollamaEmbed(cfg, store.model, batch.map(embedText))
        batch.forEach((p, k) => store.set(p.hash, normalise(vecs[k])))
        if ((i / BATCH) % 20 === 19) store.save()
      }
      store.save(new Set(passages.map((p) => p.hash)))
    } catch (e) { b.error = (e as Error).message } finally { b.running = false }
  }

  private async retrieve(h: Handle, question: string): Promise<{ hits: Scored[]; passages: Passage[]; mode: 'meaning' | 'words'; notice?: string }> {
    await this.knowledge.for(h).ensure()
    const { passages, bm25 } = this.passages(h)
    const words = bm25.search(question, PER_LIST)
    const store = this.store(h), cfg = this.cfg()
    const { matrix, owners } = store.matrixFor(passages.map((p) => p.hash))
    let meaning: Scored[] = []
    let notice: string | undefined
    if (owners.length) {
      try {
        const [q] = await ollamaEmbed(cfg, store.model, [`${QUERY_PREFIX}${question}`])
        meaning = nearest(matrix, store.dim, normalise(q), PER_LIST).map((s) => ({ index: owners[s.index], score: s.score }))
        if (owners.length < passages.length) notice = `Meaning search covers ${owners.length} of ${passages.length} passages so far; the rest is found by words.`
      } catch { notice = 'The search model did not answer; this result uses words only.' }
    } else notice = 'Searching by words only. Download the search model for questions that use different words than the notes.'
    return { hits: fuse([words, meaning], TOP), passages, mode: meaning.length ? 'meaning' : 'words', ...(notice ? { notice } : {}) }
  }

  async ask(h: Handle, question: string): Promise<{ id: string; entry: AskEntry }> {
    const cfg = this.cfg()
    const local = await ollamaStatus(cfg)
    if (!local.available) throw new UserError('engine', local.error ?? 'The local model is not available.')
    const { hits, passages, mode, notice } = await this.retrieve(h, question)
    const sources: AskSource[] = hits.map((s, i) => { const p = passages[s.index]; return { n: i + 1, doc: p.doc, docTitle: p.docTitle, section: p.section, line: p.line, snippet: plain(p.text).slice(0, 220) } })
    const entry: AskEntry = { id: randomUUID(), question, answer: '', at: Date.now(), mode, ...(notice ? { notice } : {}), sources, done: false }
    if (!hits.length) {
      const done = { ...entry, answer: 'Nothing in this folder matches that question. Try other words, or check that the folder has documents.', done: true }
      await this.save(h, done)
      return { id: entry.id, entry: done }
    }
    const messages = buildPrompt(question, hits.map((s, i) => ({ n: i + 1, title: passages[s.index].docTitle, section: passages[s.index].section?.num ?? null, text: passages[s.index].text })))
    await this.save(h, entry)
    const ctl = new AbortController()
    trackRunning(entry.id, ctl)
    let pending = '', timer: NodeJS.Timeout | undefined
    const flush = () => { timer = undefined; if (pending) { this.bus.publish({ type: 'ai.delta', ws: h.id, doc: '', noteId: 'ask', messageId: entry.id, text: pending }); pending = '' } }
    const finish = async (text: string | null, error?: string) => {
      clearTimeout(timer); flush(); trackRunning(entry.id, null)
      await this.save(h, { ...entry, answer: text ?? '', done: true, ...(error ? { error } : {}) }).catch(() => undefined)
      this.bus.publish({ type: 'ai.done', ws: h.id, doc: '', noteId: 'ask', messageId: entry.id, ...(error ? { error } : {}) })
    }
    // generation continues in the background; the browser follows it through ai.delta events
    void ollamaChat(cfg, { messages, signal: ctl.signal, temperature: 0.2, onDelta: (t) => { pending += t; timer ??= setTimeout(flush, 50) } })
      .then((text) => finish(text)).catch((e: Error) => finish(null, ctl.signal.aborted ? 'Stopped.' : e.message))
    return { id: entry.id, entry }
  }

  // ---- history, in <folder>/.mdlearn/asks.json
  private file = (h: Handle) => join(h.root, '.mdlearn', 'asks.json')
  private read(h: Handle): AskEntry[] {
    const f = this.file(h)
    if (!existsSync(f)) return []
    try { const r = FileSchema.safeParse(JSON.parse(readFileSync(f, 'utf8'))); return r.success ? r.data.entries : [] } catch { return [] }
  }
  history(h: Handle): AskEntry[] { return this.read(h) }
  private save(h: Handle, entry: AskEntry): Promise<void> {
    const f = this.file(h)
    return withFile(f, () => {
      const rest = this.read(h).filter((e) => e.id !== entry.id)
      mkdirSync(dirname(f), { recursive: true })
      const tmp = `${f}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, entries: [entry, ...rest].slice(0, MAX_HISTORY) }))
      renameSync(tmp, f)
    })
  }
  async remove(h: Handle, id: string | null): Promise<void> {
    const f = this.file(h)
    await withFile(f, () => {
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, JSON.stringify({ version: 1, entries: id ? this.read(h).filter((e) => e.id !== id) : [] }))
    })
  }
  /** Keep an answer as a note on the section one of its sources comes from. */
  async saveAsNote(h: Handle, id: string, n: number): Promise<{ doc: string }> {
    const e = this.read(h).find((x) => x.id === id)
    const s = e?.sources.find((x) => x.n === n)
    if (!e || !s) throw new UserError('not-found', 'That answer or source is no longer in the history.')
    const exact = plain(s.section?.title ?? s.docTitle).slice(0, 200) || s.docTitle
    await notesStore.create(h, s.doc, { section: s.section?.num ?? s.section?.anchor ?? null, quote: { exact, prefix: '', suffix: '' } }, `**${e.question}**\n\n${e.answer}`)
    this.bus.publish({ type: 'notes.changed', ws: h.id, doc: s.doc })
    return { doc: s.doc }
  }
}
