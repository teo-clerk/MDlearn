import { describe, it, expect } from 'vitest'
import { parseDocument } from '@mdlearn/core'
import { planTerms, termMatcher, usableTerm, type HoverTerm } from '../../web/knowledge/terms'

const term = (t: string, line = 0, doc = 'other.md'): HoverTerm => ({ term: t, definition: `${t} means something`, sources: [{ doc, docTitle: 'Other', section: null, line }] })
const SRC = `# Doc

## 1. One

Speckle appears in every image. Speckle again here, and a speckle in lower case.

The \`speckle\` in code and $speckle$ in math and [speckle in a link](x.md) are left alone. Backscatter matters.

## 2. Two

Speckle returns in a new section, but "specklefree" and "unspeckled" are different words.
`
const doc = parseDocument(SRC, { path: 'doc.md' })
const spansOf = (terms: HoverTerm[]) => {
  const plan = planTerms(doc.blocks, terms, 'doc.md')
  const out: string[] = []
  const visit = (n: any) => { const s = plan.get(n); if (s) for (const x of s) out.push(`${String(n.value).slice(x.start, x.end)}`); (n.children ?? []).forEach(visit) }
  for (const b of doc.blocks) { if (b.type === 'prose') visit(b.node) }
  return out
}

describe('term hovers', () => {
  it('underlines each term once per document, outside code, math and links, on whole words only', () => {
    const got = spansOf([term('speckle'), term('backscatter')])
    expect(got).toEqual(['Speckle', 'Backscatter'])
  })
  it('prefers the longest term and ignores symbols and tiny words', () => {
    expect(usableTerm('$c$')).toBe(false); expect(usableTerm('ab')).toBe(false); expect(usableTerm('SAR')).toBe(true)
    expect(usableTerm('range')).toBe(false); expect(usableTerm('speckle')).toBe(true); expect(usableTerm('flooded forest')).toBe(true)
    const m = termMatcher([term('radar'), term('radar cross-section')])!
    expect('The radar cross-section is'.match(m.re)).toEqual(['radar cross-section'])
  })
  it('skips the paragraph that defines the term', () => {
    const defLine = doc.blocks.find((b) => b.type === 'prose' && b.node.type === 'paragraph' && JSON.stringify(b.node).includes('appears in every image'))!.line
    expect(spansOf([term('speckle', defLine, 'doc.md')])).toEqual(['Speckle']) // not in the defining paragraph; the next mention (section 2) is underlined
  })
  it('does nothing without terms', () => { expect(termMatcher([])).toBeNull(); expect(spansOf([])).toEqual([]) })
})
