// Which words in a document are underlined as defined terms: the first time each term appears in the
// document, outside code, math, links and headings, and not in the paragraph that defines it. Plain short
// words (range, cell, type) are left alone: they are everyday words even when a document defines them.
import type { DocBlock, MdNode } from '@mdlearn/core'

export interface HoverTerm { term: string; definition: string; sources: { doc: string; docTitle: string; section: { num: string | null; anchor: string; title: string } | null; line: number }[] }
export interface TermSpan { start: number; end: number; term: HoverTerm }
export type TermPlan = WeakMap<MdNode, TermSpan[]>

const SKIP = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'link', 'heading', 'image', 'blank', 'strayBlank'])
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Terms worth underlining: words and phrases, not symbols, one-letter names or everyday short words. */
export const usableTerm = (t: string) => t.length >= 3 && !/[$\\]/.test(t) && /\p{L}{3}/u.test(t) && !/^[a-z]{1,5}$/.test(t)

export function termMatcher(terms: HoverTerm[]): { re: RegExp; byKey: Map<string, HoverTerm> } | null {
  const usable = terms.filter((t) => usableTerm(t.term)).sort((a, b) => b.term.length - a.term.length)
  if (!usable.length) return null
  const byKey = new Map(usable.map((t) => [t.term.toLowerCase(), t]))
  const body = usable.map((t) => escape(t.term)).join('|')
  return { re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, 'giu'), byKey }
}

export function planTerms(blocks: DocBlock[], terms: HoverTerm[], docPath: string): TermPlan {
  const plan: TermPlan = new WeakMap()
  const m = termMatcher(terms)
  if (!m) return plan
  const seen = new Set<string>()
  const visit = (n: MdNode, defines: Set<string>) => {
    if (SKIP.has(n.type)) return
    if (n.type === 'text') {
      const text = String(n.value), spans: TermSpan[] = []
      m.re.lastIndex = 0
      for (let r = m.re.exec(text); r; r = m.re.exec(text)) {
        const key = r[0].toLowerCase(), term = m.byKey.get(key)
        if (!term || seen.has(key) || defines.has(key)) continue
        seen.add(key); spans.push({ start: r.index, end: r.index + r[0].length, term })
      }
      if (spans.length) plan.set(n, spans)
      return
    }
    for (const c of n.children ?? []) visit(c, defines)
  }
  const walk = (bs: DocBlock[]) => {
    for (const b of bs) {
      if (b.type === 'details') walk(b.children)
      else if (b.type === 'prose' || b.type === 'callout') {
        // a paragraph that defines a term is not underlined for that term
        const defines = new Set(terms.filter((t) => t.sources.some((s) => s.doc === docPath && s.line === b.line)).map((t) => t.term.toLowerCase()))
        visit(b.type === 'prose' ? b.node : (b as unknown as MdNode), defines)
      }
    }
  }
  walk(blocks)
  return plan
}
