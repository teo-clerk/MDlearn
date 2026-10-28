import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { parseDocument } from '../src/document'
import { toMarkdown } from '../src/md'
import { cleanStyle, parseTag, unsafeHtml } from '../src/html'
import type { MdNode } from '../src/ast'

const lesson = (body: string) => compile(`---\ntitle: T\n---\n## Card\n\n${body}\n`)
const nodes = (body: string): MdNode[] => lesson(body).lesson!.cards[0].blocks.flatMap((b) => (b.type === 'prose' ? [b.node] : []))
const json = (body: string) => JSON.stringify(nodes(body))
const codes = (body: string) => lesson(body).diagnostics.map((d) => d.code)

describe('inline html', () => {
  it('pairs allowlisted tags and keeps Markdown inside them', () => {
    const p = nodes('A <mark>**bold** and $x^2$</mark> word.')[0]
    const mark = p.children!.find((c) => c.type === 'htmlInline')!
    expect(mark).toMatchObject({ tag: 'mark' })
    expect(mark.children!.map((c) => c.type)).toEqual(['strong', 'text', 'inlineMath'])
  })
  it('filters attributes and reports handlers', () => {
    expect(json('<span style="color: #c03a2b; position: fixed" title="t">x</span>')).toContain('"style":"color: #c03a2b"')
    expect(json('<span style="color: #c03a2b; position: fixed" title="t">x</span>')).not.toContain('fixed')
    expect(codes('<b onclick="steal()">x</b>')).toContain('E107')
    expect(json('<a href="javascript:alert(1)">x</a>')).toContain('"url":""')
  })
  it('unknown or unpaired tags are shown as written', () => {
    expect(json('A `List` of List<T> items')).toContain('<T>')
    expect(json('<mark>never closed')).toContain('<mark>')
  })
  it('br, img and hr become Markdown nodes', () => {
    const p = nodes('a<br>b <img src="figs/x.png" alt="orbit" width="240">')[0]
    expect(p.children!.map((c) => c.type)).toContain('break')
    expect(p.children!.find((c) => c.type === 'image')).toMatchObject({ url: 'figs/x.png', alt: 'orbit', width: 240 })
  })
})

describe('block html', () => {
  it('a container around Markdown keeps the Markdown', () => {
    const div = nodes('<div align="center">\n\n**Centred** text\n\n</div>')[0]
    expect(div).toMatchObject({ type: 'htmlBlock', tag: 'div', attrs: { style: 'text-align: center' } })
    expect(div.children![0].type).toBe('paragraph')
  })
  it('details in a lesson folds with its summary', () => {
    const d = nodes('<details><summary>Why <b>R⁴</b>?</summary>\n\nTwo-way spreading.\n\n</details>')[0]
    expect(d).toMatchObject({ type: 'htmlBlock', tag: 'details' })
    expect(JSON.stringify(d.summary)).toContain('strong')
  })
  it('a self-contained block is passed on raw (the player sanitises it); scripts are reported', () => {
    const t = nodes('<table><tr><td>a</td><td>b</td></tr></table>')[0]
    expect(t).toMatchObject({ type: 'htmlRaw' })
    expect(codes('<div><script>alert(1)</script></div>')).toContain('E107')
    expect(codes('<table><tr><td>a</td></tr></table>')).not.toContain('E107')
  })
  it('documents keep their own <details> and pair other containers', () => {
    const d = parseDocument('# Doc\n\n<details>\n<summary>More</summary>\n\nHidden\n\n</details>\n\n<figure>\n\n![orbit](o.png)\n\n<figcaption>An orbit</figcaption>\n</figure>\n')
    expect(d.blocks.some((b) => b.type === 'details')).toBe(true)
    expect(JSON.stringify(d.blocks)).toContain('"tag":"figure"')
    expect(d.diagnostics.map((x) => x.code)).not.toContain('E107')
  })
  it('terminal text shows what the html says', () => {
    expect(toMarkdown(nodes('<table><tr><td>alpha</td><td>beta</td></tr></table>'))).toMatch(/alpha\s*beta/)
    expect(toMarkdown(nodes('Press <kbd>Ctrl</kbd>+<kbd>K</kbd>.'))).toBe('Press Ctrl+K.')
  })
})

describe('helpers', () => {
  it('parseTag reads one tag and its attributes', () => {
    expect(parseTag('<span title="a b" data-x=1>')).toEqual({ name: 'span', close: false, attrs: { title: 'a b', 'data-x': '1' } })
    expect(parseTag('</span>')).toMatchObject({ name: 'span', close: true })
    expect(parseTag('<b>x</b>')).toBeNull()
  })
  it('cleanStyle keeps typographic properties only', () => {
    expect(cleanStyle('color: red; background: url(x); position: absolute; font-weight: 600')).toBe('color: red; font-weight: 600')
  })
  it('unsafeHtml names what is removed', () => {
    expect(unsafeHtml('<iframe src="x">')).toMatch(/iframe/)
    expect(unsafeHtml('<img src=x onerror=alert(1)>')).toMatch(/onerror/)
    expect(unsafeHtml('<a href="javascript:x">')).toMatch(/script URL/)
    expect(unsafeHtml('<mark>ok</mark>')).toBeNull()
  })
})
