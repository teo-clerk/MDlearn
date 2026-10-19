// What a document knows about itself, extracted once and kept: its formulas, the terms it defines, the
// documents it points to, and its text in searchable chunks. Pure functions over a parsed document.
import { toMarkdown, resolveRel, type DocModel, type DocBlock, type MdNode } from '@mdlearn/core'

export interface SectionRef { num: string | null; anchor: string; title: string }
export interface FormulaFact { tex: string; section: SectionRef | null; line: number; lead: string }
/** How a definition was found: `is` ("X is …"), `label` ("X: …" / "X — …"), `table` (Term | Meaning), `item` (list item). */
export type TermKind = 'is' | 'label' | 'table'
export interface TermFact { term: string; definition: string; section: SectionRef | null; line: number; kind: TermKind }
export interface LinkFact { to: string; count: number; kind: 'link' | 'prereq' }
export interface ChunkFact { section: SectionRef | null; title: string; text: string; line: number }
export interface DocFacts {
  path: string; title: string; words: number; timeMin?: number; level?: string
  objectives: string[]; intro: string
  formulas: FormulaFact[]; terms: TermFact[]; links: LinkFact[]; chunks: ChunkFact[]
}

/** Bump when extraction changes: saved indexes are rebuilt. */
export const EXTRACTOR_VERSION = 6
const md = (nodes: MdNode[]) => toMarkdown(nodes, { math: 'tex' }).replace(/\s+/g, ' ').trim()
const plain = (n: MdNode): string => (n.type === 'text' || n.type === 'inlineCode' ? String(n.value) : n.type === 'inlineMath' ? `$${String(n.value)}$` : (n.children ?? []).map(plain).join(''))
const first = (s: string, max = 300) => {
  const end = s.search(/(?<=[.!?])\s+(?=[A-Z$*])/)
  const one = end > 0 ? s.slice(0, end) : s
  return one.length > max ? `${one.slice(0, max).replace(/\s+\S*$/, '')}…` : one
}
const IS = /^\s*(?:\([^)]{1,40}\)\s*)?(?:is|are|means|denotes|refers to|stands for|is defined as|are defined as)\b/i
const SEP = /^\s*(?:\([^)]{1,40}\)\s*)?[:—–-]\s+(?=\S)/
const BAD_TERM = /^(step|note|example|answer|warning|tip|why|how|what|check|result|exercise|goal|input|output|returns?|todo|caution|important|key|rule|fix|bug|q\d*|a\d*|measure|read|look|use|run|write|install|set|choose|report|compare|record|build|train|open|compute|plot|verify|explain|derive|show|state|if|when|most|going|down|part|row|project|section|figure|table|chapter|appendix|eligibility|then|else|so|but|and|or|first|second|third|finally|also|only|each|every|any|no|not)\b/i
const CITATION = /^\d{4}|^[A-Z]{1,2}-?[A-Z]?\d|\(\d{4}\)|\bet al\b|\band colleagues\b|\bdocumentation\b|\bhandbook\b|\bwhitepaper\b|^\(|^\d+\s*\(|^\d+[.)]\s/i
const INSTRUCTION = /^(look up|read|see|check|use|run|measure|install|open|write|compute|report|compare|set|choose|record|build|plot|verify|explain|derive|show|state|find|cite|compare)\b/i
const usable = (term: string, def: string) => def.replace(/[*_`$]/g, '').length >= 12 && /\p{L}{4,}/u.test(def.replace(/\$[^$]*\$/g, ' ')) && !/\b(is|are|means|as|by|of|the|a|an|to|that|which)\s*[:—–-]?\s*$/i.test(def.replace(/[*]/g, '').trim()) && !/[:—–-]\s*$/.test(def.trim()) && !INSTRUCTION.test(def.replace(/^[*\s]+/, ''))
const goodTerm = (t: string) => {
  if (/\.(md|py|json|ya?ml)\b|§/i.test(t)) return false
  const s = t.trim().replace(/[.:]$/, ''); return s.length >= 2 && s.length <= 60 && !/[.!?]$/.test(s) && s.split(/\s+/).length <= 6 && !BAD_TERM.test(s) && !CITATION.test(s) && !/^\d+(\s|$)/.test(s)
}

/** "**Revisit** is when the same point is imaged again." → "when the same point is imaged again." The term is shown beside it. */
const asDefinition = (sentence: string) => sentence.replace(/^\*\*[^*]+\*\*\s+(?:is defined as|are defined as|refers to|stands for|denotes|means|is|are)\s+/i, '')

export function extractTerms(block: MdNode, section: SectionRef | null, line: number): TermFact[] {
  const out: TermFact[] = []
  const kids = block.children ?? []
  if (block.type === 'paragraph') {
    kids.forEach((k, i) => {
      if (k.type !== 'strong') return
      const term = plain(k).trim()
      const rest = kids.slice(i + 1)
      const next = rest[0]?.type === 'text' ? String(rest[0].value) : ''
      if (!goodTerm(term)) return
      const label = i === 0 && SEP.test(next)
      let def = label ? first(md([{ ...rest[0], value: next.replace(SEP, '') } as MdNode, ...rest.slice(1)])) : IS.test(next) ? asDefinition(first(md([k, ...rest]))) : ''
      if (!def || !usable(term, def)) return
      if (!label && def.split(/\s+/).length < 4) return // "X is green." is a remark, not a definition
      def = def[0].toUpperCase() + def.slice(1)
      out.push({ term, definition: def, section, line, kind: label ? 'label' : 'is' })
    })
  } else if (block.type === 'list') {
    for (const li of kids) for (const p of (li.children ?? []).filter((c) => c.type === 'paragraph')) out.push(...extractTerms(p, section, line))
  } else if (block.type === 'table') {
    const [head, ...rows] = kids
    const cells = (head?.children ?? []).map((c) => plain(c).trim())
    const ti = cells.findIndex((c) => /^(term|symbol|quantity|name|concept|parameter|abbreviation|acronym|notation)/i.test(c))
    const di = cells.findIndex((c) => /^(meaning|definition|description|explanation|what it is|role|stands for)/i.test(c))
    if (ti >= 0 && di >= 0) for (const row of rows) {
      const c = row.children ?? []
      const term = plain(c[ti] ?? { type: 'text', value: '' }).trim(), def = md((c[di]?.children ?? []))
      if (term.length >= 1 && term.length <= 60 && def.length >= 3 && /\p{L}{3,}/u.test(def.replace(/\$[^$]*\$/g, ' ')) && !INSTRUCTION.test(def) && !CITATION.test(term) && !/\.(md|py|json|ya?ml)\b|§|^\d+_|^[A-Z]\d+\s*§/i.test(term)) out.push({ term: term.replace(/^\*+|\*+$/g, ''), definition: first(def), section, line, kind: 'table' })
    }
  }
  return out
}

/** Walk a document's blocks in order, tracking the section and the paragraph before each formula. */
export function extractFacts(doc: DocModel, source: string): DocFacts {
  const formulas: FormulaFact[] = [], terms: TermFact[] = []
  const links = new Map<string, LinkFact>()
  const titles = new Map(doc.outline.sections.map((s) => [s.anchor, s.title]))
  let section: SectionRef | null = null, lastParagraph = ''
  const addLink = (url: string, kind: LinkFact['kind']) => {
    const r = resolveRel(doc.path, url)?.split('#')[0]
    if (!r || !/\.(md|markdown)$/i.test(r) || r === doc.path) return
    const k = `${kind}:${r}`
    const have = links.get(k)
    links.set(k, { to: r, kind, count: (have?.count ?? 0) + 1 })
  }
  const urls = (n: MdNode, f: (u: string) => void) => { if (n.type === 'link') f(String(n.url)); (n.children ?? []).forEach((c) => urls(c, f)) }
  const walk = (blocks: DocBlock[]) => {
    for (const b of blocks) {
      if (b.type === 'heading') { section = { num: b.num, anchor: b.anchor, title: titles.get(b.anchor) ?? md(b.text) }; lastParagraph = ''; continue }
      if (b.type === 'details') { walk(b.children); continue }
      if (b.type !== 'prose') continue
      const n = b.node
      if (n.type === 'math') formulas.push({ tex: String(n.value).trim(), section, line: b.line, lead: lastParagraph })
      else {
        urls(n, (u) => addLink(u, 'link'))
        if (n.type === 'paragraph') lastParagraph = first(md([n]), 220)
        terms.push(...extractTerms(n, section, b.line))
      }
    }
  }
  walk(doc.blocks)
  const prereq = (doc.outline.prerequisites ?? []).map((p) => p.href)
  for (const h of prereq) addLink(h, 'prereq')

  // text chunks: each section's own text (up to the next heading), split into ≤ 400-word pieces by paragraph
  const lines = source.split('\n')
  const heads = doc.outline.sections.map((s) => s.startLine).sort((a, b) => a - b)
  const chunks: ChunkFact[] = []
  for (const s of doc.outline.sections) {
    const next = heads.find((l) => l > s.startLine) ?? lines.length + 1
    const body = lines.slice(s.startLine, next - 1).join('\n').replace(/<!--[\s\S]*?-->/g, '')
    let acc: string[] = [], words = 0, startLine = s.startLine + 1
    const flush = () => { const text = acc.join('\n\n').trim(); if (text.split(/\s+/).length >= 12) chunks.push({ section: { num: s.num, anchor: s.anchor, title: s.title }, title: s.title, text, line: startLine }); acc = []; words = 0 }
    for (const para of body.split(/\n{2,}/)) {
      const w = para.split(/\s+/).filter(Boolean).length
      if (words + w > 400 && acc.length) flush()
      acc.push(para.trim()); words += w
    }
    flush()
  }
  const intro = doc.blocks.find((b) => b.type === 'prose' && b.node.type === 'paragraph')
  return {
    path: doc.path, title: doc.title, words: doc.outline.words, ...(doc.outline.timeMin ? { timeMin: doc.outline.timeMin } : {}), ...(doc.outline.level ? { level: doc.outline.level } : {}),
    objectives: doc.outline.objectives, intro: intro && intro.type === 'prose' ? first(md([intro.node]), 280) : '',
    formulas, terms: dedupeTerms(terms), links: [...links.values()], chunks,
  }
}
const dedupeTerms = (ts: TermFact[]) => { const seen = new Set<string>(); return ts.filter((t) => { const k = t.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }) }
