import { describe, it, expect } from 'vitest'
import { tokenize, buildCloze, blankable, preview, countBlanks } from '../../web/lib/cloze'

const idx = (toks: ReturnType<typeof tokenize>, text: string) => toks.findIndex((t) => t.text === text)
describe('cloze from a passage', () => {
  const src = 'Received power falls as $R^{-4}$, because the echo spreads twice (out and back).'
  const toks = tokenize(src)
  it('tokenises words, formulas and punctuation and loses nothing', () => {
    expect(toks.map((t) => t.text).join('')).toBe(src)
    expect(toks.find((t) => t.text === '$R^{-4}$')?.kind).toBe('math')
    expect(blankable(toks[idx(toks, ',')])).toBe(false)
    expect(blankable(toks[idx(toks, 'power')])).toBe(true)
  })
  it('a chosen word becomes a blank, punctuation stays outside it', () => {
    const c = buildCloze(toks, new Set([idx(toks, 'twice')]))
    expect(c).toBe('Received power falls as $R^{-4}$, because the echo spreads {{twice}} (out and back).')
    expect(countBlanks(c)).toBe(1)
  })
  it('chosen words next to each other make one blank; separated words make two', () => {
    const c = buildCloze(toks, new Set([idx(toks, 'out'), idx(toks, 'and'), idx(toks, 'twice')]))
    expect(c).toContain('{{twice}}')
    expect(c).toContain('{{out and}}')
    expect(countBlanks(c)).toBe(2)
  })
  it('a chosen formula is blanked whole, as a formula blank', () => {
    const c = buildCloze(toks, new Set([idx(toks, '$R^{-4}$')]))
    expect(c).toContain('${{R^{-4}}}$')
    expect(preview(c)).toContain('falls as ____,')
  })
  it('nothing chosen leaves the passage as it was', () => { expect(buildCloze(toks, new Set())).toBe(src) })
  it('keeps display math as one unblankable piece', () => {
    const t = tokenize('See:\n\n$$E = mc^2$$\n\nDone.')
    expect(t.find((x) => x.kind === 'display')?.text).toBe('$$E = mc^2$$')
    expect(blankable(t.find((x) => x.kind === 'display')!)).toBe(false)
  })
  it('numbers with units and hyphenated words stay whole', () => {
    expect(tokenize('about 5.5 cm radar-based').filter((t) => t.kind === 'word').map((t) => t.text)).toEqual(['about', '5.5', 'cm', 'radar-based'])
  })
})
