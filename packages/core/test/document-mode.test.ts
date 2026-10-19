import { describe, it, expect } from 'vitest'
import { stage0 } from '../src/stage0'
import { processor } from '../src/compile'

const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code)
const mdast = (text: string) => processor.parse(text) as { children: { type: string; children?: { type: string; value?: string }[] }[] }

describe('inline math across a line break (both modes)', () => {
  const src = 'The power is $P_t G \\lambda^2\n\\sigma$ at the receiver, and costs $5 or $6.\n'
  it.each(['lesson', 'document'] as const)('%s mode keeps the span as math', (mode) => {
    const r = stage0(src, { mode })
    expect(codes(r)).not.toContain('E109')
    const para = mdast(r.text).children[0]
    const math = para.children!.filter((c) => c.type === 'inlineMath')
    expect(math).toHaveLength(1)
    expect(math[0].value).toContain('\\sigma')
    expect(r.text).toContain('\\$5') // currency still escaped
  })
  it('documents accept a TeX span with loose spaces, never currency', () => {
    const r = stage0('Check $[R T] = $ J mol$^{-1}$, costs $5 or $6.\n', { mode: 'document' })
    const math = mdast(r.text).children[0].children!.filter((c) => c.type === 'inlineMath').map((c) => c.value)
    expect(math).toEqual(['[R T] =', '^{-1}'])
    expect(r.text).toContain('\\$5')
  })
  it('a lone $ with no closer in the paragraph is still escaped', () => {
    const r = stage0('Costs $5\nand more.\n\nNext $x$ here.\n', { mode: 'document' })
    expect(r.text).toContain('\\$5')
    expect(mdast(r.text).children[1].children!.some((c) => c.type === 'inlineMath')).toBe(true)
  })
})

describe('document mode is faithful to ordinary Markdown', () => {
  it('keeps --- thematic breaks', () => {
    const r = stage0('# T\n\nOne.\n\n---\n\nTwo.\n', { mode: 'document' })
    expect(mdast(r.text).children.map((c) => c.type)).toContain('thematicBreak')
    expect(codes(r)).not.toContain('I805')
  })
  it('leaves {{…}} literal outside widgets', () => {
    const r = stage0('Template {{name}} here.\n', { mode: 'document' })
    expect(r.text).toContain('{{name}}')
    expect(codes(r)).not.toContain('W305')
  })
  it('does not unwrap a whole-file code fence or drop text before ---', () => {
    const src = 'Intro line.\n\n---\ntitle: not frontmatter\n---\n'
    expect(stage0(src, { mode: 'document' }).text).toContain('Intro line.')
    const fenced = '```markdown\n# inside\n```\n'
    expect(stage0(fenced, { mode: 'document' }).text).toBe(fenced)
  })
  it('a stray $$ near the end is reported (I820) and the rest still parses', () => {
    const src = '# T\n\n$$\nx = 1\n$$\n\nText after.\n\n$$\n\nFinal paragraph.\n'
    const r = stage0(src, { mode: 'document' })
    expect(codes(r)).toContain('I820')
    expect(codes(r)).not.toContain('E109')
    const types = mdast(r.text).children.map((c) => c.type)
    expect(types.filter((t) => t === 'math')).toHaveLength(1)
    expect(r.text).toContain('Final paragraph.')
  })
  it('lesson mode is unchanged: --- is dropped (setext trap)', () => {
    expect(codes(stage0('One.\n\n---\n\nTwo.\n'))).toContain('I805')
  })
})
