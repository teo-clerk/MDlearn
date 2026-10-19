// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { anchorFromSelection, locate, rangeFor, textOf } from '../../web/lib/anchor'

beforeEach(() => {
  document.body.innerHTML = `<div id="a"><h2 id="radar" data-num="3">Radar</h2><p>The <em>R</em> is now visible: one going out, one coming back.</p><p>Step 4 — the receive aperture.</p></div>`
})
const root = () => document.getElementById('a')!
const select = (node: Node, a: number, b: Node, e: number) => { const r = document.createRange(); r.setStart(node, a); r.setEnd(b, e); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r) }

describe('anchoring notes to text', () => {
  it('selecting a whole paragraph anchors exactly that paragraph', () => {
    const p = root().querySelectorAll('p')[0]
    select(p, 0, p, p.childNodes.length)
    const a = anchorFromSelection(root())!.anchor
    expect(a.quote.exact).toBe('The R is now visible: one going out, one coming back.')
    expect(a.section).toBe('3')
    expect(a.quote.suffix.startsWith('Step 4')).toBe(true)
  })
  it('finds the passage again after text is inserted above it', () => {
    const p = root().querySelectorAll('p')[0]
    select(p.lastChild!, 1, p.lastChild!, 12)
    const a = anchorFromSelection(root())!.anchor
    root().insertAdjacentHTML('afterbegin', '<p>A new introduction paragraph.</p>')
    const at = locate(textOf(root()), a)!
    expect(textOf(root()).slice(at.start, at.end)).toBe(a.quote.exact)
    expect(rangeFor(root(), at.start, at.end)!.toString()).toBe(a.quote.exact)
  })
  it('a deleted passage is not found (the note shows as detached)', () => {
    const a = { section: null, quote: { exact: 'nothing like this', prefix: '', suffix: '' } }
    expect(locate(textOf(root()), a)).toBeNull()
  })
})
