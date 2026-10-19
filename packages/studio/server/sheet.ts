// A cheat sheet for one document: its formulas and defined terms, section by section, from the knowledge
// index (no model needed), plus optional key ideas written by the local model and kept in
// <folder>/.mdlearn/sheets/<document>.json so printing never waits.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { sectionText, type DocOutline, type SectionInfo } from '@mdlearn/core'
import { loadDoc } from '@mdlearn/core/node'
import type { Handle, Workspaces } from './workspaces.js'
import { UserError } from './workspaces.js'
import type { KnowledgeIndex } from './knowledge/index.js'
import type { DocFacts } from './knowledge/extract.js'
import { ollamaChat, ollamaStatus, type OllamaConfig } from './ai/ollama.js'
import { withFile } from './notes.js'
import type { SheetResponse, SheetSection } from '../shared/types.js'

const MIN_WORDS = 60, SECTION_WORDS = 450
const CacheSchema = z.object({ version: z.literal(1), sections: z.record(z.string(), z.object({ hash: z.string(), ideas: z.array(z.string()) })) })
const IdeasSchema = z.object({ ideas: z.array(z.string().min(3).max(300)).min(1).max(8) })
const IDEAS_FORMAT = { type: 'object', properties: { ideas: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 } }, required: ['ideas'] }
const IDEAS_SYSTEM = `You write the key ideas of a section of someone's study notes for a one-page cheat sheet.
Return 2 to 5 ideas, each one short sentence a student could memorise (at most 25 words), in the order the section develops them.
Use only what the section says. Write math in LaTeX between $…$. No numbering, no restating the heading.`

const hashOf = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
const cacheFile = (h: Handle, path: string) => join(h.root, '.mdlearn', 'sheets', `${path}.json`)
function readCache(h: Handle, path: string): z.infer<typeof CacheSchema>['sections'] {
  const f = cacheFile(h, path)
  if (!existsSync(f)) return {}
  try { const r = CacheSchema.safeParse(JSON.parse(readFileSync(f, 'utf8'))); return r.success ? r.data.sections : {} } catch { return {} }
}

/** The sections that get key ideas: the top level of the document, long enough to say something. */
export function ideaSections(outline: DocOutline): SectionInfo[] {
  const secs = outline.sections.filter((s) => s.depth >= 2)
  if (!secs.length) return []
  const top = Math.min(...secs.map((s) => s.depth))
  return secs.filter((s) => s.depth === top && s.words >= MIN_WORDS)
}

export function sheetOf(h: Handle, workspaces: Workspaces, facts: DocFacts, progress: IdeaProgress | undefined): SheetResponse {
  const abs = workspaces.resolve(h, facts.path)
  const { outline, md } = loadDoc(abs, h.root)
  const cache = readCache(h, facts.path)
  const ideaSecs = new Map(ideaSections(outline).map((s) => [s.anchor, s]))
  const sections: SheetSection[] = []
  for (const s of outline.sections.filter((x) => x.depth >= 2 && x.depth <= 3)) {
    const formulas = facts.formulas.filter((f) => f.section?.anchor === s.anchor).map((f) => ({ tex: f.tex, lead: f.lead }))
    // a "label: text" line is as often a heading as a definition; a cheat sheet keeps only the surer kinds
    const terms = facts.terms.filter((t) => t.section?.anchor === s.anchor && t.kind !== 'label').map((t) => ({ term: t.term, definition: t.definition }))
    let ideas: string[] | undefined
    const is = ideaSecs.get(s.anchor)
    if (is) { const text = sectionText(md, outline, is.anchor, SECTION_WORDS)?.text ?? ''; const c = cache[is.anchor]; if (c && c.hash === hashOf(text)) ideas = c.ideas }
    if (formulas.length || terms.length || ideas?.length) sections.push({ num: s.num, anchor: s.anchor, title: s.title, depth: s.depth, formulas, terms, ...(ideas ? { ideas } : {}) })
  }
  return {
    path: facts.path, title: facts.title, ...(facts.level ? { level: facts.level } : {}), ...(facts.timeMin ? { timeMin: facts.timeMin } : {}),
    objectives: facts.objectives, sections, formulaCount: facts.formulas.length, termCount: facts.terms.filter((t) => t.kind !== 'label').length,
    ideas: progress ?? { state: ideaSecs.size && sections.some((s) => s.ideas) ? 'done' : 'none', done: sections.filter((s) => s.ideas).length, total: ideaSecs.size },
  }
}

export interface IdeaProgress { state: 'none' | 'running' | 'done' | 'error'; done: number; total: number; error?: string }
const running = new Map<string, IdeaProgress>()
export const ideaProgress = (h: Handle, path: string) => running.get(`${h.id}:${path}`)

/** Write key ideas for every long section with the local model, one at a time; returns at once. */
export async function startIdeas(h: Handle, workspaces: Workspaces, cfg: OllamaConfig, path: string, onDone: () => void, regenerate = false): Promise<IdeaProgress> {
  const key = `${h.id}:${path}`
  const have = running.get(key)
  if (have?.state === 'running') return have
  const status = await ollamaStatus(cfg)
  if (!status.available) throw new UserError('engine', status.error ?? 'The local model is not available.')
  const abs = workspaces.resolve(h, path)
  const { outline, md } = loadDoc(abs, h.root)
  const todo = ideaSections(outline)
  if (!todo.length) throw new UserError('empty', 'This document has no sections long enough for key ideas.')
  const cache = readCache(h, path)
  const progress: IdeaProgress = { state: 'running', done: 0, total: todo.length }
  running.set(key, progress)
  void (async () => {
    try {
      for (const s of todo) {
        const text = sectionText(md, outline, s.anchor, SECTION_WORDS)?.text ?? ''
        const hash = hashOf(text)
        if (!regenerate && cache[s.anchor]?.hash === hash) { progress.done++; continue }
        const raw = await ollamaChat(cfg, { messages: [{ role: 'system', content: IDEAS_SYSTEM }, { role: 'user', content: `Document: ${outline.title}\n\n${text}` }], format: IDEAS_FORMAT, temperature: 0.2 })
        const parsed = IdeasSchema.safeParse(JSON.parse(raw))
        if (parsed.success) { cache[s.anchor] = { hash, ideas: parsed.data.ideas }; await save(h, path, cache) }
        progress.done++
      }
      progress.state = 'done'
    } catch (e) { progress.state = 'error'; progress.error = (e as Error).message } finally { onDone() }
  })()
  return progress
}
function save(h: Handle, path: string, sections: z.infer<typeof CacheSchema>['sections']): Promise<void> {
  const f = cacheFile(h, path)
  return withFile(f, () => {
    mkdirSync(dirname(f), { recursive: true })
    const tmp = `${f}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, sections }))
    renameSync(tmp, f)
  })
}
export type { KnowledgeIndex }
