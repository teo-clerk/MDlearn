import { describe, it, expect } from 'vitest'
import { parseDocument } from '@mdlearn/core'
import { extractFacts } from '../server/knowledge/extract'

const SRC = `# Radar notes

Intro paragraph about radar that is long enough to be a summary of the document.

## 1. Basics

**Backscatter** is the power returned toward the radar by the target and its surroundings. It depends on roughness.

**Speckle**: granular noise from coherent summation of echoes. See [the SAR physics](04_sar.md#speckle) and [elsewhere](https://esa.int).

- **Gain** — antenna power concentration relative to isotropic. Dimensionless.
- Plain item without a term.

| Symbol | Meaning |
|---|---|
| $\\sigma^0$ | normalised radar cross-section |
| $R$ | slant range |

**Step 1 — isotropic spreading.** A transmitter radiates power over a sphere.

Power spreads as the inverse square of the range, which gives:

$$S = \\frac{P_t}{4\\pi R^2}$$

## 2. Next

<details>
<summary>Derivation</summary>

Second formula follows:

$$P_r = S A_e$$

</details>

See [basics](../notes/other.md).
`
const doc = parseDocument(SRC, { path: 'docs/radar.md' })
const facts = extractFacts(doc, SRC)

describe('extractFacts', () => {
  it('finds display formulas with their section and the sentence leading to them', () => {
    expect(facts.formulas.map((f) => f.tex)).toEqual(['S = \\frac{P_t}{4\\pi R^2}', 'P_r = S A_e'])
    expect(facts.formulas[0].section).toMatchObject({ num: '1', title: 'Basics' })
    expect(facts.formulas[0].lead).toMatch(/inverse square of the range/)
    expect(facts.formulas[1].section?.num).toBe('2') // inside <details>
  })
  it('finds definitions in sentences, "term: …", list items and tables — but not step labels', () => {
    const t = Object.fromEntries(facts.terms.map((x) => [x.term, x.definition]))
    expect(t['Backscatter']).toMatch(/^The power returned toward the radar/)
    expect(t['Speckle']).toMatch(/^Granular noise from coherent summation/)
    expect(t['Gain']).toMatch(/^Antenna power concentration/)
    expect(t['$\\sigma^0$']).toBe('normalised radar cross-section')
    expect(t['$R$']).toBe('slant range')
    expect(Object.keys(t).some((k) => /^Step/.test(k))).toBe(false)
    expect(t['Backscatter'].split('. ')).toHaveLength(1) // one sentence
  })
  it('lists the documents it points to, resolved against its own folder, never external links', () => {
    expect(facts.links).toEqual(expect.arrayContaining([{ to: 'docs/04_sar.md', count: 1, kind: 'link' }, { to: 'notes/other.md', count: 1, kind: 'link' }]))
    expect(facts.links.some((l) => l.to.includes('esa.int'))).toBe(false)
  })
  it('splits the text into chunks that know their section, each at most ~400 words', () => {
    expect(facts.chunks.length).toBeGreaterThan(0)
    expect(facts.chunks.every((c) => c.text.split(/\s+/).length <= 460)).toBe(true)
    expect(facts.chunks.find((c) => /Backscatter/.test(c.text))?.section?.num).toBe('1')
  })
  it('keeps the document facts', () => {
    expect(facts).toMatchObject({ path: 'docs/radar.md', title: 'Radar notes' })
    expect(facts.intro).toMatch(/^Intro paragraph about radar/)
  })
})
