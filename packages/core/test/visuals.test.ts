import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { checkJs } from '../src/node'
import { parseDocument } from '../src/document'
import { compileExpr, evaluate } from '../src/mathfn'
import { parseFormula } from '../src/visuals'
import type { Block, Visual } from '../src/ast'

const lesson = (body: string) => compile(`---\ntitle: T\n---\n## Card\n\n${body}\n`, { checkJs })
const blocks = (body: string) => lesson(body).lesson!.cards[0].blocks
const visual = <T extends Visual['type']>(body: string, type: T) => blocks(body).find((b) => b.type === type) as Extract<Block, { type: T }>
const codes = (body: string) => lesson(body).diagnostics.map((d) => d.code)

const RADAR = `:::plot[Received power falls as R⁻⁴]{y=log height=320}
$$P_r = \\frac{P_t G^2 \\lambda^2 \\sigma}{(4\\pi)^3 R^4}$$
- $R$ in [100e3, 2000e3] m — slant range
- $P_t$ = 1000 in [10, 5000] W — transmit power
- $G$ = 1000 in [10, 10000] log — antenna gain
- $\\lambda$ = 0.055 m — wavelength
- $\\sigma$ = 1 in [0.01, 100] log $\\mathrm{m^2}$ — radar cross-section
:::`

describe('plot', () => {
  const p = visual(RADAR, 'plot')
  it('compiles the radar equation with its parameters and attributes', () => {
    expect(codes(RADAR).filter((c) => /^[EW]/.test(c))).toEqual([])
    expect(p.curves).toHaveLength(1)
    expect(p.curves[0].lhs).toBe('P_r')
    expect(p.yScale).toBe('log')
    expect(p.height).toBe(320)
    expect(p.params.map((x) => x.key)).toEqual(['R', 'P_t', 'G', 'lambda', 'sigma'])
    expect(p.params.find((x) => x.key === 'sigma')).toMatchObject({ log: true, min: 0.01, max: 100, unit: '$\\mathrm{m^2}$' })
    expect(p.x).toBe(p.params[0].id)
  })
  it('evaluates to the hand-computed received power', () => {
    const env = Object.fromEntries(p.params.map((x) => [x.id, x.value ?? 850e3]))
    const expected = (1000 * 1000 ** 2 * 0.055 ** 2 * 1) / ((4 * Math.PI) ** 3 * 850e3 ** 4)
    expect(Math.abs(evaluate(p.curves[0].expr, env) - expected) / expected).toBeLessThan(1e-9)
  })
  it('an undeclared symbol is an error that names it, and the block still shows its formula', () => {
    const r = lesson(':::plot\n$$y = a x + b$$\n- $x$ in [0, 1]\n- $a$ = 2\n:::')
    expect(r.diagnostics.find((d) => d.code === 'E903')?.message).toBe('b')
    const b = r.lesson!.cards[0].blocks[0]
    expect(b).toMatchObject({ type: 'unavailable', kind: 'plot', codes: ['E903'] })
    expect(JSON.stringify(b)).toContain('a x + b')
  })
  it('needs an x axis, valid ranges, and a formula', () => {
    expect(codes(':::plot\n$$y = 2a$$\n- $a$ = 1\n:::')).toContain('E905')
    expect(codes(':::plot\n$$y = x$$\n- $x$ in [5, 1]\n:::')).toContain('E904')
    expect(codes(':::plot\n$$y = x$$\n- $x$ in [0, 1] log\n:::')).toContain('E904')
    expect(codes(':::plot\nNo formula.\n- $x$ in [0, 1]\n:::')).toContain('E901')
  })
  it('warns when the curve is mostly undefined', () => {
    expect(codes(':::plot\n$$y = \\ln(x)$$\n- $x$ in [-10, -1]\n:::')).toContain('W907')
  })
  it('the loose form `R: [1 .. 10] km range` still works (I920)', () => {
    const r = lesson(':::plot\n$$y = R^2$$\n- R: [1 .. 10] km range\n:::')
    expect(r.diagnostics.map((d) => d.code)).toContain('I920')
    expect((r.lesson!.cards[0].blocks[0] as Extract<Block, { type: 'plot' }>).params[0]).toMatchObject({ min: 1, max: 10, unit: 'km' })
  })
  it('aliases and the misplaced case', () => {
    expect(blocks(':::chart\n$$y = x$$\n- $x$ in [0, 1]\n:::')[0].type).toBe('plot')
    expect(codes(':::quiz\nQ?\n:::plot\n$$y=x$$\n- $x$ in [0,1]\n:::\n- [x] a\n- [ ] b\n  > no\n:::')).toContain('W918')
  })
})

describe('symbols that a plain parser gets wrong', () => {
  const params = (syms: string[]) => syms.map((sym, i) => ({ id: `v${i}`, sym }))
  it.each([
    ['\\sigma^0 \\cos\\theta', ['\\sigma^0', '\\theta'], { v0: 0.5, v1: 0 }, 0.5],
    ['\\varphi + 1', ['\\varphi'], { v0: 2 }, 3],
    ['2\\Delta\\phi', ['\\Delta\\phi'], { v0: 0.25 }, 0.5],
    ['B_\\perp / B', ['B_\\perp', 'B'], { v0: 6, v1: 3 }, 2],
    ['R_e + R', ['R', 'R_e'], { v0: 1, v1: 6371 }, 6372],
  ])('%s', (tex, syms, env, value) => {
    const r = parseFormula(tex, params(syms))
    expect(r.error).toBeUndefined()
    expect(compileExpr(r.expr!)(env)).toBeCloseTo(value, 9)
  })
})

describe('formula', () => {
  const src = `:::formula[The radar equation]
$$P_r = \\frac{P_t G^2 \\lambda^2 \\sigma}{(4\\pi)^3 R^4}$$
- $G^2$ — antenna gain, squared: the same antenna transmits and receives
- $(4\\pi)^3$ — spherical spreading, counted three times
- $R^4$ — two-way spreading: $R^2$ out and $R^2$ back
:::`
  it('marks each explained term for the renderer only', () => {
    const f = visual(src, 'formula')
    expect(f.terms.map((t) => t.tex)).toEqual(['G^2', '(4\\pi)^3', 'R^4'])
    expect(f.marked).toContain('\\htmlClass{mdl-t-0}{G^2}')
    expect(f.marked).toContain('\\htmlClass{mdl-t-2}{R^4}')
    expect(f.tex).not.toContain('htmlClass')
    expect(codes(src).filter((c) => /^[EW]/.test(c))).toEqual([])
  })
  it('a term that is not in the formula is an error', () => {
    expect(codes(':::formula\n$$E = mc^2$$\n- $p^2$ — momentum\n:::')).toContain('E908')
  })
  it('with values, the formula computes live', () => {
    const f = visual(':::formula\n$$E = m c^2$$\n- $m$ = 2 in [1, 10] kg — mass\n- $c$ = 3 — speed\n:::', 'formula')
    expect(compileExpr(f.live!.expr)(Object.fromEntries(f.params.map((p) => [p.id, p.value!])))).toBe(18)
  })
})

describe('animate', () => {
  const src = `:::animate[Where R⁴ comes from]
1. $$S_{tx} = \\frac{P_t G}{4\\pi R^2}$$ Power density at the target.
2. $$S_{rx} = \\frac{P_t G\\,\\sigma}{(4\\pi)^2 R^4}$$ Spread again on the way back.
:::`
  it('turns an ordered list into frames with captions', () => {
    const a = visual(src, 'animate')
    expect(a.frames).toHaveLength(2)
    expect(a.frames[1].tex).toContain('(4\\pi)^2 R^4')
    expect(JSON.stringify(a.frames[0].caption)).toContain('Power density at the target.')
  })
  it('needs two frames; a frame is a formula with a caption or any Markdown (v1.3)', () => {
    expect(codes(':::animate\n1. $$x$$ one\n:::')).toContain('E911')
    expect(codes(':::animate\n1. $$x$$ one\n2. just words\n:::')).not.toContain('E901')
    const b = blocks(':::animate[States]{replace}\n1. **Pulse** leaves the antenna.\n2. $$t = 2R/c$$ The echo returns.\n:::')[0]
    expect(b).toMatchObject({ type: 'animate', replace: true, frames: [{ caption: [{ type: 'paragraph' }] }, { tex: 't = 2R/c' }] })
    expect((b as { frames: { tex?: string }[] }).frames[0].tex).toBeUndefined()
  })
})

describe('sim', () => {
  it('keeps the code, parameters and size; checks syntax and network use', () => {
    const src = ':::sim[Speckle]{height=360}\nEach scatterer adds a phasor.\n```js\napi.frame((t) => { api.ctx.fillRect(0, 0, api.params.N, 1) })\n```\n- $N$ = 10 in [1, 200] — scatterers\n:::'
    const s = visual(src, 'sim')
    expect(s).toMatchObject({ height: 360, params: [{ key: 'N', value: 10, step: 1 }] })
    expect(codes(src).filter((c) => /^[EW]/.test(c))).toEqual([])
    expect(codes(':::sim\nX.\n```js\nfunction (\n```\n:::')).toContain('E914')
    expect(codes(':::sim\nX.\n```js\nfetch("https://x")\n```\n:::')).toContain('W917')
    expect(codes(':::sim\nX.\n:::')).toContain('E913')
  })
})

describe('visuals in ordinary documents', () => {
  it('render in any Markdown file, not only lessons', () => {
    const d = parseDocument(`# Notes\n\n${RADAR}\n`)
    expect(d.blocks.some((b) => b.type === 'plot')).toBe(true)
  })
})
