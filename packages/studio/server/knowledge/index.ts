// A workspace's knowledge index: facts extracted from every document, kept up to date as files change
// and saved beside the notes so the next start is instant. Built in the background, one document per
// turn of the event loop, so the server stays responsive while it works.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { sourceDocs } from '@mdlearn/core/node'
import type { EventBus } from '../bus.js'
import type { Handle, Workspaces } from '../workspaces.js'
import { extractFacts, EXTRACTOR_VERSION, type DocFacts } from './extract.js'
import type { KnowledgeStatus, FormulaItem, GlossaryTerm, LinkedDoc, MapNode } from '../../shared/types.js'

interface Entry { stamp: string; facts: DocFacts }
const VERSION = EXTRACTOR_VERSION
const posix = (p: string) => p.split(sep).join('/')
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')

export class KnowledgeIndex {
  private docs = new Map<string, Entry>()
  private total = 0
  private building: Promise<void> | null = null
  private dirty = false
  private scanned = false
  /** Counts every change to the index; lets others cache what they derive from it. */
  rev = 0
  private file: string
  constructor(private h: Handle, private workspaces: Workspaces) {
    this.file = join(h.root, '.mdlearn', 'index', 'knowledge.json')
    try {
      const saved = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) as { version: number; docs: Record<string, Entry> } : null
      if (saved?.version === VERSION) for (const [k, v] of Object.entries(saved.docs)) this.docs.set(k, v)
    } catch { /* an unreadable index is rebuilt */ }
    this.total = this.docs.size
  }
  status(): KnowledgeStatus { return { total: this.total, indexed: this.docs.size, building: !!this.building } }

  /** Index every document once (those unchanged since last time are skipped); file changes keep it current after that. Safe to call often. */
  ensure(): Promise<void> {
    if (this.building) return this.building
    if (this.scanned) return Promise.resolve()
    this.scanned = true
    this.building = (async () => {
      const files = sourceDocs(this.h.ws).map((abs) => ({ abs, rel: posix(relative(this.h.root, abs)) }))
      this.total = files.length
      const live = new Set(files.map((f) => f.rel))
      for (const k of [...this.docs.keys()]) if (!live.has(k)) { this.docs.delete(k); this.dirty = true; this.rev++ }
      for (const f of files) {
        this.indexOne(f.abs, f.rel)
        await new Promise((r) => setImmediate(r))
      }
      if (this.dirty) this.save()
    })().finally(() => { this.building = null })
    return this.building
  }
  private indexOne(abs: string, rel: string): void {
    try {
      const st = statSync(abs)
      const stamp = `${st.mtimeMs}:${st.size}`
      if (this.docs.get(rel)?.stamp === stamp) return
      const model = this.workspaces.doc(this.h, rel)
      this.docs.set(rel, { stamp, facts: extractFacts(model, readFileSync(abs, 'utf8')) })
      this.dirty = true; this.rev++
    } catch { if (this.docs.delete(rel)) this.rev++ } // unreadable or vanished: leave it out
  }
  /** A document changed or appeared on disk. */
  update(rel: string): void { this.indexOne(join(this.h.root, rel), rel); this.total = Math.max(this.total, this.docs.size); this.save() }
  remove(rel: string): void { if (this.docs.delete(rel)) { this.rev++; this.total = this.docs.size; this.save() } }
  private save() {
    try {
      mkdirSync(join(this.h.root, '.mdlearn', 'index'), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: VERSION, docs: Object.fromEntries(this.docs) }))
      renameSync(tmp, this.file)
      this.dirty = false
    } catch { /* the index is a cache: failing to save it is not an error */ }
  }

  all(): DocFacts[] { return [...this.docs.values()].map((e) => e.facts) }
  facts(path: string): DocFacts | undefined { return this.docs.get(path)?.facts }
  title(path: string): string { return this.docs.get(path)?.facts.title ?? path.split('/').pop()!.replace(/\.md$/i, '') }

  formulas(opts: { q?: string; doc?: string; limit?: number; offset?: number }): { total: number; items: FormulaItem[]; docs: { path: string; title: string; count: number }[] } {
    const words = norm(opts.q ?? '').split(/\s+/).filter(Boolean)
    const items: FormulaItem[] = []
    const perDoc = new Map<string, number>()
    for (const f of this.all()) f.formulas.forEach((x, i) => {
      const hay = norm(`${x.tex} ${x.lead} ${x.section?.title ?? ''} ${f.title}`)
      if (words.length && !words.every((w) => hay.includes(w))) return
      perDoc.set(f.path, (perDoc.get(f.path) ?? 0) + 1)
      if (opts.doc && opts.doc !== f.path) return
      items.push({ id: `${f.path}#${i}`, tex: x.tex, doc: f.path, docTitle: f.title, section: x.section, line: x.line, lead: x.lead })
    })
    return { total: items.length, items: items.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 60)), docs: [...perDoc].map(([path, count]) => ({ path, title: this.title(path), count })).sort((a, b) => a.path.localeCompare(b.path)) }
  }

  /** `loose` adds "term: text" lines, which are as often headings as definitions. */
  glossary(q?: string, loose = false): (GlossaryTerm & { hoverable: boolean })[] {
    const words = norm(q ?? '').split(/\s+/).filter(Boolean)
    const byTerm = new Map<string, GlossaryTerm & { hoverable: boolean }>()
    for (const f of this.all()) for (const t of f.terms) {
      if (t.kind === 'label' && !loose && !/^[A-Z][A-Z0-9-]+$/.test(t.term)) continue
      const k = norm(t.term)
      const src = { doc: f.path, docTitle: f.title, section: t.section, line: t.line, definition: t.definition }
      const hoverable = t.kind !== 'label' || /^[A-Z][A-Z0-9-]+$/.test(t.term)
      const have = byTerm.get(k)
      if (have) { have.sources.push(src); have.hoverable ||= hoverable } else byTerm.set(k, { term: t.term, definition: t.definition, sources: [src], hoverable })
    }
    return [...byTerm.values()].filter((g) => !words.length || words.every((w) => norm(`${g.term} ${g.definition}`).includes(w))).sort((a, b) => norm(a.term).localeCompare(norm(b.term)))
  }

  links(path: string): { outgoing: LinkedDoc[]; backlinks: LinkedDoc[] } {
    const merge = (rows: LinkedDoc[]) => { const m = new Map<string, LinkedDoc>(); for (const r of rows) { const h = m.get(r.path); m.set(r.path, h ? { ...h, count: h.count + r.count, kind: h.kind === 'prereq' || r.kind === 'prereq' ? 'prereq' : 'link' } : r) } return [...m.values()].sort((a, b) => a.path.localeCompare(b.path)) }
    const mine = this.facts(path)
    const outgoing = merge((mine?.links ?? []).map((l) => ({ path: l.to, title: this.title(l.to), kind: l.kind, count: l.count, exists: this.docs.has(l.to) })))
    const backlinks = merge(this.all().filter((f) => f.path !== path).flatMap((f) => f.links.filter((l) => l.to === path).map((l) => ({ path: f.path, title: f.title, kind: l.kind, count: l.count, exists: true }))))
    return { outgoing, backlinks }
  }

  graph(): { nodes: Pick<MapNode, 'path' | 'title' | 'words'>[]; edges: { from: string; to: string; kind: 'link' | 'prereq' }[] } {
    const edges = new Map<string, { from: string; to: string; kind: 'link' | 'prereq' }>()
    for (const f of this.all()) for (const l of f.links) {
      if (!this.docs.has(l.to)) continue
      // a prerequisite points the other way: the prerequisite comes first
      const e = l.kind === 'prereq' ? { from: l.to, to: f.path, kind: 'prereq' as const } : { from: f.path, to: l.to, kind: 'link' as const }
      const k = `${e.from}>${e.to}`
      if (!edges.has(k) || e.kind === 'prereq') edges.set(k, e)
    }
    return { nodes: this.all().map((f) => ({ path: f.path, title: f.title, words: f.words })), edges: [...edges.values()] }
  }
}

/** One index per open folder; follows file changes announced on the bus. */
export class Knowledge {
  private byId = new Map<string, KnowledgeIndex>()
  constructor(private workspaces: Workspaces, bus: EventBus) {
    bus.subscribe(({ event }) => {
      if (event.type !== 'fs.changed') return
      const idx = this.byId.get(event.ws)
      if (!idx) return
      for (const p of event.paths) if (p.kind === 'doc') { if (p.change === 'unlink') idx.remove(p.path); else idx.update(p.path) }
    })
  }
  for(h: Handle): KnowledgeIndex {
    let idx = this.byId.get(h.id)
    if (!idx) { idx = new KnowledgeIndex(h, this.workspaces); this.byId.set(h.id, idx) }
    void idx.ensure().catch(() => undefined)
    return idx
  }
}
