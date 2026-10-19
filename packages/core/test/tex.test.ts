import { describe, it, expect } from 'vitest'
import { texToUnicode, prettyInline } from '../src/tex'

describe('TeX → Unicode for terminals and chat', () => {
  it.each([
    ['\\sigma^0', 'σ⁰'],
    ['\\gamma^0 \\propto \\lambda^{-4}', 'γ⁰ ∝ λ⁻⁴'],
    ['J_2', 'J₂'],
    ['\\delta_r = c/2B', 'δᵣ = c/2B'],
    ['\\frac{\\mu_0 I}{2\\pi r}', '(μ₀ I)/(2π r)'],
    ['\\sqrt{2h/g}', '√(2h/g)'],
    ['P(H \\mid E)', 'P(H | E)'],
    ['10^{-3}\\,\\mathrm{m}', '10⁻³ m'],
    ['\\theta_i = 35^\\circ', 'θᵢ = 35°'],
    ['\\mathbb{R}^n', 'ℝⁿ'],
    ['\\hat{y}', 'ŷ'],
    ['\\lVert C \\rVert \\gtrsim 1 \\uparrow', '‖C‖ ≳ 1 ↑'],
    ['\\texttt{BOA\\_ADD\\_OFFSET}', 'BOA_ADD_OFFSET'],
    ['\\sec\\theta', 'secθ'],
  ])('%s → %s', (tex, out) => { expect(texToUnicode(tex).text).toBe(out) })
  it('reports when it cannot fully convert', () => {
    const r = texToUnicode('\\begin{bmatrix} a & b \\end{bmatrix}')
    expect(r.complete).toBe(false)
  })
  it('subscripts it cannot express stay readable', () => { expect(texToUnicode('x_{max}').text).toBe('xₘₐₓ') ; expect(texToUnicode('W_{\\text{slant}}').text).toBe('Wₛₗₐₙₜ'); expect(texToUnicode('W_{b}').text).toBe('W_b'); expect(texToUnicode('x_{i+b}').text).toBe('x_(i+b)') })
  it('prettyInline converts only $…$ segments', () => {
    expect(prettyInline('Why $\\gamma^0$ for num_workers')).toBe('Why γ⁰ for num_workers')
  })
})

import { toMarkdown } from '../src/md'
describe('gaps inside formulas', () => {
  it('a gap in a superscript has no stray brackets', () => {
    const md = toMarkdown([{ type: 'math', value: '(4\\pi)^{\\placeholder[b0]{}} R^{\\placeholder[b1]{}}' } as never], { math: 'unicode', blankLabel: (id) => `[${id === 'b0' ? 1 : 2}]____` })
    expect(md.trim()).toBe('(4π)^[1]____ R^[2]____')
  })
})
