import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from '../src/document'
import type { DocBlock } from '../src/ast'

const types = (bs: DocBlock[]) => bs.map((b) => (b.type === 'prose' ? `prose:${b.node.type}` : b.type))
const SAMPLE = `# Radar notes

Intro with $x$.

## 2. The radar equation

Power spreads over a sphere.

<details>
<summary><strong>Derivation</strong> (optional)</summary>

$$P_r = \\frac{P_t G}{4\\pi R^2}$$

</details>

---

| a | b |
|---|---|
| 1<br/>2 | <N> |

:::quiz
Which way does power scale?
- [x] $R^{-4}$
- [ ] $R^{-2}$
  > Only one way.
:::

:::mystery
Kept as text.
:::

### 2.1 Gain

Done.
`

describe('parseDocument', () => {
  const d = parseDocument(SAMPLE, { path: 'notes/radar.md' })
  it('title, headings with outline anchors and numbers', () => {
    expect(d.title).toBe('Radar notes')
    const hs = d.blocks.filter((b) => b.type === 'heading') as Extract<DocBlock, { type: 'heading' }>[]
    expect(hs.map((h) => [h.depth, h.num])).toEqual([[1, null], [2, '2'], [3, '2.1']])
    expect(hs[1].anchor).toBe(d.outline.sections.find((s) => s.num === '2')!.anchor)
    expect(hs[1].line).toBe(5)
  })
  it('folds <details> with a Markdown summary and its body', () => {
    const det = d.blocks.find((b) => b.type === 'details') as Extract<DocBlock, { type: 'details' }>
    expect(det.summary.map((n) => n.type)).toContain('strong')
    expect(det.children.some((b) => b.type === 'prose' && b.node.type === 'math')).toBe(true)
  })
  it('keeps thematic breaks; <br/> is a line break; other tags stay literal text', () => {
    expect(types(d.blocks)).toContain('prose:thematicBreak')
    const table = JSON.stringify(d.blocks.find((b) => b.type === 'prose' && b.node.type === 'table'))
    expect(table).toContain('"type":"break"')
    expect(table).toContain('<N>')
    expect(d.diagnostics.map((x) => x.code)).not.toContain('E107')
  })
  it('authored widgets become interactive; unknown directives keep their content', () => {
    expect(d.blocks.some((b) => b.type === 'quiz')).toBe(true)
    const un = d.blocks.find((b) => b.type === 'unavailable') as Extract<DocBlock, { type: 'unavailable' }>
    expect(un.kind).toBe('mystery')
    expect(JSON.stringify(un.fallback)).toContain('Kept as text.')
  })
  it('renders the real fixture document without errors', () => {
    const src = readFileSync(resolve(__dirname, 'fixtures/curriculum/00_FOUNDATIONS/04_radar.md'), 'utf8')
    const doc = parseDocument(src, { path: '00_FOUNDATIONS/04_radar.md' })
    expect(doc.diagnostics.filter((x) => x.code.startsWith('E'))).toEqual([])
    expect(doc.blocks.filter((b) => b.type === 'heading' && b.depth > 1).length).toBe(doc.outline.sections.length)
  })
})
