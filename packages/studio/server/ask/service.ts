// Ask your whole folder, notes and lessons: find the passages that matter (words + meaning), then let an AI answer
// from them, citing each claim as [1], [2]… The local model is the default; Claude answers when you choose it. The
// answer streams like a note's, and is kept in a history. The companion asks here too, with your studies added.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { EventBus } from '../bus.js'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import type { SettingsStore } from '../settings.js'
import type { Knowledge, KnowledgeIndex } from '../knowledge/index.js'
import { hasModel, ollamaChat, ollamaEmbed, ollamaStatus, type ChatMessage, type OllamaConfig } from '../ai/ollama.js'
import { ModelDownloads } from '../ai/models.js'
import { trackRunning } from '../ai/ask.js'
import type { OneShot } from '../ai/teachback.js'
import { notesStore, withFile } from '../notes.js'
import { VectorStore } from './vectors.js'
import { Bm25, centroid, fuse, nearest, normalise, type Scored } from './search.js'
import { lessonPassages, lessonsStamp } from './lessons.js'
import { buildPrompt, searchWordsPrompt } from './prompt.js'
import { studyRecord } from './record.js'
import type { AskEntry, AskSource, AskStatus, RelatedPassage, RelatedResponse } from '../../shared/types.js'

const TOP = 8, PER_LIST = 30, BATCH = 12, MAX_HISTORY = 100
// Under this share of known words a question is probably in another language than the folder: ask for search words.
const MIN_KNOWN = 0.5, MAX_TITLES = 20, WORDS_TIMEOUT = 30_000, CLAUDE_TIMEOUT = 120_000
const NEAR = 3, MAX_TURNS = 3, MAX_TURN_CHARS = 1200
const TOO_LONG = 'Claude took too long to answer. Try again, or use the local AI.'
// Related passages: how many to show, and how close one must be. Words are judged against the section's own best
// match, because a BM25 score means nothing on its own.
const RELATED = 5, MIN_MEANING = 0.5, MIN_WORDS = 0.15, MAX_SECTION_CHARS = 4000
const QUERY_PREFIX = 'task: search result | query: '

export interface Passage { hash: string; doc: string; docTitle: string; section: AskSource['section']; line: number; text: string }
const searchText = (p: Passage) => `${p.docTitle} ${p.section?.title ?? ''} ${p.text}`
const embedText = (p: Passage) => `title: ${p.docTitle}${p.section ? ` — ${p.section.title}` : ''} | text: ${p.text.slice(0, 3500)}`
const plain = (s: string) => s.replace(/\$\$?[^$]*\$\$?/g, ' ').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim()
const reference = (p: Passage): RelatedPassage => ({ doc: p.doc, docTitle: p.docTitle, section: p.section, line: p.line, snippet: plain(p.text).slice(0, 220) })

export type AskEngine = 'local' | 'claude'
export interface AskOptions { engine?: AskEngine; lang?: string; companion?: boolean; doc?: string; thread?: string[] }

interface Build { running: boolean; error?: string; startedAt: number }
const EntrySchema = z.object({
  id: z.string(), question: z.string(), answer: z.string(), at: z.number(), mode: z.enum(['meaning', 'words']), notice: z.string().optional(), error: z.string().optional(), done: z.boolean(),
  sources: z.array(z.object({ n: z.number(), doc: z.string(), docTitle: z.string(), section: z.object({ num: z.string().nullable(), anchor: z.string(), title: z.string() }).nullable(), line: z.number(), snippet: z.string() })),
})
const FileSchema = z.object({ version: z.literal(1), entries: z.array(EntrySchema) })

export class AskService {
  private builds = new Map<string, Build>()
  private stores = new Map<string, VectorStore>()
  private cache = new Map<string, { rev: number; lessons: string; passages: Passage[]; bm25: Bm25; notes?: { passages: Passage[]; bm25: Bm25 } }>()
  constructor(private knowledge: Knowledge, private bus: EventBus, private settings: SettingsStore, private downloads = new ModelDownloads(() => settings.get().ollama), private claude?: OneShot) {}

  private cfg(): OllamaConfig { return this.settings.get().ollama }
  private store(h: Handle): VectorStore {
    const model = this.cfg().embedModel ?? 'embeddinggemma'
    const have = this.stores.get(h.id)
    if (have && have.model === model) return have
    const s = new VectorStore(h.root, model); this.stores.set(h.id, s); return s
  }
  private passages(h: Handle): { idx: KnowledgeIndex; passages: Passage[]; bm25: Bm25 } {
    const idx = this.knowledge.for(h)
    const hit = this.cache.get(h.id), lessons = lessonsStamp(h)
    if (hit && hit.rev === idx.rev && hit.lessons === lessons) return { idx, passages: hit.passages, bm25: hit.bm25 }
    const hash = (title: string, section: string, text: string) => createHash('sha1').update(`${title}\n${section}\n${text}`).digest('hex').slice(0, 20)
    const passages: Passage[] = [
      ...idx.all().flatMap((f) => f.chunks.map((c) => ({ hash: hash(f.title, c.title, c.text), doc: f.path, docTitle: f.title, section: c.section, line: c.line, text: c.text }))),
      ...lessonPassages(h).map((p) => ({ ...p, hash: hash(p.docTitle, p.section?.title ?? '', p.text) })),
    ]
    const bm25 = new Bm25(passages.map(searchText))
    this.cache.set(h.id, { rev: idx.rev, lessons, passages, bm25 })
    return { idx, passages, bm25 }
  }
  /** Notes only, for Related: it lists documents, and lessons in the counts would change what it finds. Built when first needed. */
  private notes(h: Handle): { passages: Passage[]; bm25: Bm25 } {
    this.passages(h)
    const hit = this.cache.get(h.id)!
    if (hit.notes) return hit.notes
    const passages = hit.passages.filter((p) => !p.doc.endsWith('.learn.md'))
    hit.notes = { passages, bm25: new Bm25(passages.map(searchText)) }
    return hit.notes
  }

  async status(h: Handle): Promise<AskStatus> {
    const cfg = this.cfg(), model = cfg.embedModel ?? 'embeddinggemma'
    const local = await ollamaStatus(cfg)
    const installed = hasModel(local.models, model)
    const { passages } = this.passages(h)
    const store = this.store(h)
    const indexed = passages.filter((p) => store.has(p.hash)).length
    const b = this.builds.get(h.id)
    const pull = this.downloads.state()
    const pullError = pull?.model === model ? pull.error : undefined
    return {
      model, ollama: local.models.length > 0 || local.available, chatReady: local.available, installed, size: '≈620 MB',
      pulling: pull && this.downloads.running(model) ? { status: pull.status, ...(pull.total ? { percent: Math.min(100, Math.round(100 * (pull.completed ?? 0) / pull.total)) } : {}) } : null,
      indexed, total: passages.length, building: !!b?.running, reading: this.knowledge.for(h).status().building, ...((b?.error ?? pullError) ? { error: b?.error ?? pullError } : {}),
    }
  }

  /** Download the embedding model if needed, then index every passage. Returns at once; follow `status`. */
  async setup(h: Handle): Promise<void> {
    const cfg = this.cfg(), model = cfg.embedModel ?? 'embeddinggemma'
    const local = await ollamaStatus(cfg)
    if (!local.models.length && !local.available) throw new UserError('engine', local.error ?? 'Ollama is not running.')
    if (!hasModel(local.models, model)) { this.downloads.start(model, () => void this.build(h)); return }
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

  /** A reply from the engine chosen, at once or as it is written. */
  private reply(engine: AskEngine, messages: ChatMessage[], signal: AbortSignal, onDelta?: (t: string) => void): Promise<string> {
    if (engine === 'local') return ollamaChat(this.cfg(), { messages, signal, temperature: 0.2, ...(onDelta ? { onDelta } : {}) })
    const [system, ...rest] = messages
    const prompt = rest.map((m) => (m.role === 'assistant' ? `Your earlier answer:\n${m.content}` : m.content)).join('\n\n')
    return this.claude!({ system: system.content, prompt, signal }).then((text) => { onDelta?.(text); return text })
  }
  /** Words the folder would use for a question it does not know the words of. Nothing if the AI cannot say: the question's own words still search. */
  private async searchWords(engine: AskEngine, question: string, passages: Passage[]): Promise<string> {
    const all = [...new Set(passages.map((p) => p.docTitle))], every = Math.ceil(all.length / MAX_TITLES)
    const titles = all.filter((_, i) => i % every === 0) // a spread of the folder: it shows what language the folder is written in
    try { return await this.reply(engine, searchWordsPrompt(question, titles), AbortSignal.timeout(WORDS_TIMEOUT)) } catch { return '' }
  }

  private async retrieve(h: Handle, query: string, o: AskOptions): Promise<{ hits: Scored[]; passages: Passage[]; mode: 'meaning' | 'words'; notice?: string }> {
    await this.knowledge.for(h).ensure()
    const { passages, bm25 } = this.passages(h)
    const words = bm25.search(query, PER_LIST)
    const store = this.store(h), cfg = this.cfg()
    const { matrix, owners } = store.matrixFor(passages.map((p) => p.hash))
    let meaning: Scored[] = []
    let notice: string | undefined
    if (owners.length) {
      try {
        const [q] = await ollamaEmbed(cfg, store.model, [`${QUERY_PREFIX}${query}`])
        meaning = nearest(matrix, store.dim, normalise(q), PER_LIST).map((s) => ({ index: owners[s.index], score: s.score }))
        if (owners.length < passages.length) notice = 'partial'
      } catch { notice = 'model' }
    } else notice = 'words'
    // meaning crosses languages by itself; words need the question in the language of the folder, and then the
    // question's own words only match by accident
    const other = !meaning.length && bm25.known(query) < MIN_KNOWN ? bm25.search(await this.searchWords(o.engine ?? 'local', query, passages), PER_LIST) : []
    const inDoc = o.doc ? passages.flatMap((p, index) => (p.doc === o.doc ? [index] : [])) : []
    const here = [...words.filter((s) => inDoc.includes(s.index)), ...inDoc.slice(0, NEAR).map((index) => ({ index, score: 0 }))]
    return { hits: fuse([other.length ? other : words, meaning, here], TOP), passages, mode: meaning.length ? 'meaning' : 'words', ...(notice ? { notice } : {}) }
  }

  /** Passages elsewhere in the folder about the same thing as a section (or a whole document). Only what is already stored is read, so no model is asked and it answers at once, on a phone too. */
  async related(h: Handle, doc: string, anchor?: string): Promise<RelatedResponse> {
    await this.knowledge.for(h).ensure()
    const { passages, bm25 } = this.notes(h)
    const inDoc = passages.filter((p) => p.doc === doc)
    const inSection = inDoc.filter((p) => p.section?.anchor === anchor)
    const here = inSection.length ? inSection : inDoc // a heading with no text of its own speaks for the document
    const closest = (hits: Scored[]) => {
      const docs = new Set<string>()
      const best = hits.filter((s) => { const d = passages[s.index].doc; if (d === doc || docs.has(d)) return false; docs.add(d); return true })
      return best.slice(0, RELATED).map((s) => reference(passages[s.index]))
    }
    const store = this.store(h)
    const mine = store.matrixFor(here.map((p) => p.hash))
    if (mine.owners.length) {
      const { matrix, owners } = store.matrixFor(passages.map((p) => p.hash))
      const near = nearest(matrix, store.dim, centroid(mine.matrix, store.dim), PER_LIST + inDoc.length, (r) => passages[owners[r]].doc !== doc)
      return { mode: 'meaning', passages: closest(near.filter((s) => s.score >= MIN_MEANING).map((s) => ({ index: owners[s.index], score: s.score }))) }
    }
    const words = bm25.search(here.map((p) => `${p.section?.title ?? ''} ${p.text}`).join(' ').slice(0, MAX_SECTION_CHARS), PER_LIST + inDoc.length)
    return { mode: 'words', passages: closest(words.filter((s) => s.score >= MIN_WORDS * words[0].score)) }
  }

  private async ready(engine: AskEngine): Promise<void> {
    if (engine === 'claude') { if (!this.claude) throw new UserError('engine', 'Claude is not available here. Use the local AI.'); return }
    const local = await ollamaStatus(this.cfg())
    if (!local.available) throw new UserError('engine', local.error ?? 'The local model is not available.')
  }
  /** The questions and answers a follow-up continues. */
  private turns(h: Handle, ids: string[]): { question: string; answer: string }[] {
    const all = this.read(h)
    return ids.flatMap((id) => all.filter((e) => e.id === id && e.done && e.answer && !e.error)).slice(-MAX_TURNS).map((e) => ({ question: e.question, answer: e.answer.slice(0, MAX_TURN_CHARS) }))
  }

  async ask(h: Handle, question: string, o: AskOptions = {}): Promise<{ id: string; entry: AskEntry }> {
    const engine = o.engine ?? 'local'
    await this.ready(engine)
    const thread = this.turns(h, o.thread ?? [])
    const { hits, passages, mode, notice } = await this.retrieve(h, [...thread.map((t) => t.question), question].join(' '), o)
    const sources: AskSource[] = hits.map((s, i) => ({ n: i + 1, ...reference(passages[s.index]) }))
    // the companion's answers don't need a word about how the search went
    const entry: AskEntry = { id: randomUUID(), question, answer: '', at: Date.now(), mode, ...(notice && !o.companion ? { notice } : {}), sources, done: false }
    if (!hits.length && !o.companion) {
      const done = { ...entry, notice: 'nothing', done: true }
      await this.save(h, done)
      return { id: entry.id, entry: done }
    }
    const reading = passages.find((p) => p.doc === o.doc)?.docTitle
    const record = o.companion ? studyRecord(h, o.doc) : ''
    const messages = buildPrompt(question, hits.map((s, i) => { const p = passages[s.index]; return { n: i + 1, title: p.docTitle, section: p.section?.num ?? (p.doc.endsWith('.learn.md') ? p.section?.title ?? null : null), text: p.text } }),
      { ...(o.lang ? { lang: o.lang } : {}), ...(o.companion ? { companion: true } : {}), ...(record ? { record } : {}), ...(reading ? { reading } : {}), thread })
    await this.save(h, entry)
    const ctl = new AbortController()
    trackRunning(entry.id, ctl)
    let pending = '', timer: NodeJS.Timeout | undefined
    const publish = (text: string) => this.bus.publish({ type: 'ai.delta', ws: h.id, doc: '', noteId: 'ask', messageId: entry.id, text })
    const flush = () => { timer = undefined; if (pending) { publish(pending); pending = '' } }
    const finish = async (text: string | null, error?: string) => {
      clearTimeout(timer); flush(); trackRunning(entry.id, null)
      await this.save(h, { ...entry, answer: text ?? '', done: true, ...(error ? { error } : {}) }).catch(() => undefined)
      this.bus.publish({ type: 'ai.done', ws: h.id, doc: '', noteId: 'ask', messageId: entry.id, ...(error ? { error } : {}) })
    }
    publish('') // the answer has started, even if an engine says nothing until it is done
    const limit = engine === 'claude' ? AbortSignal.timeout(CLAUDE_TIMEOUT) : null
    // generation continues in the background; the browser follows it through ai.delta events
    void this.reply(engine, messages, limit ? AbortSignal.any([ctl.signal, limit]) : ctl.signal, (t) => { pending += t; timer ??= setTimeout(flush, 50) })
      .then((text) => finish(text)).catch((e: Error) => finish(null, ctl.signal.aborted ? 'Stopped.' : limit?.aborted ? TOO_LONG : e.message))
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
