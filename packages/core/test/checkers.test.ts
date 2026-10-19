import { describe, it, expect } from 'vitest'
import { checkText, checkNumber, checkMath, parseNumber, mathKeyEvaluable } from '../src/checkers'

describe('text', () => {
  it('ignores case, diacritics and surrounding punctuation', () => {
    expect(checkText('  Schrodinger. ', ['Schrödinger']).ok).toBe(true)
  })
  it('accepts a one-edit typo on long answers, reported as typo', () => {
    expect(checkText('posteriro', ['posterior'])).toEqual({ ok: true, note: 'typo', canonical: 'posterior' })
  })
  it('refuses a typo that lands on another answer in the lesson', () => {
    expect(checkText('efferent', ['afferent'], 'en', ['efferent']).ok).toBe(false)
  })
  it('no typo tolerance below 6 chars', () => { expect(checkText('prir', ['prior']).ok).toBe(false) })
})

describe('number', () => {
  const k = { answers: ['0.0594'] }
  it('exact and correctly rounded answers pass', () => {
    expect(checkNumber('0.0594', k).ok).toBe(true)
    expect(checkNumber('0.059', k).ok).toBe(true)
    expect(checkNumber('5.94%', k).ok).toBe(true)
  })
  it('one significant figure is too imprecise', () => { expect(checkNumber('0.06', k)).toEqual({ ok: false, reason: 'imprecise' }) })
  it('a rough answer that is simply wrong is not called imprecise', () => { expect(checkNumber('5', { answers: ['-15.5'] })).toEqual({ ok: false }) })
  it('wrong rounding fails', () => { expect(checkNumber('0.0595', k).ok).toBe(false) })
  it('integers are exact (1780 is not 1763)', () => { expect(checkNumber('1780', { answers: ['1763'] }).ok).toBe(false) })
  it('fractions are exact values', () => { expect(checkNumber('1/6', { answers: ['0.1667'] }).ok).toBe(true) })
  it('decimal comma follows lang', () => {
    expect(checkNumber('0,0594', k, 'it').ok).toBe(true)
    expect(parseNumber('1,000', 'en')!.value).toBe(1000)
    expect(parseNumber('1.000', 'it')!.value).toBe(1000)
  })
  it('explicit tolerance', () => { expect(checkNumber('0.0598', { answers: ['0.0594'], tol: { abs: 0.0005 } }).ok).toBe(true) })
})

describe('math', () => {
  it('equivalent forms', () => {
    expect(checkMath('x+x', '2x').ok).toBe(true)
    expect(checkMath('x^2+2x+1', '(x+1)^2').ok).toBe(true)
    expect(checkMath('\\mu_0 I/(2\\pi r)', '\\frac{\\mu_0 I}{2\\pi r}').ok).toBe(true)
  })
  it('sqrt(x^2) is not x (negative sample points)', () => { expect(checkMath('x', '\\sqrt{x^2}').ok).toBe(false) })
  it('varepsilon and epsilon are the same symbol', () => { expect(checkMath('\\epsilon_0', '\\varepsilon_0').ok).toBe(true) })
  it('accepts the right-hand side of an equation key', () => { expect(checkMath('\\frac{1}{2}mv^2', 'E=\\frac{1}{2}mv^2').ok).toBe(true) })
  it('exact mode rejects an unsimplified equivalent', () => { expect(checkMath('(x+1)^2', 'x^2+2x+1', true).ok).toBe(false) })
  it('non-evaluable notation falls back to TeX comparison', () => {
    expect(checkMath('P(H \\mid E)', 'P(H\\mid E)').ok).toBe(true)
    expect(mathKeyEvaluable('P(H\\mid E)')).toBe(false)
    expect(mathKeyEvaluable('\\frac{a}{b}')).toBe(true)
  })
})

describe('number keys with a decimal-comma lang', () => {
  it('keys are read with a decimal point; learners may use a comma', () => {
    expect(checkNumber('0,167', { answers: ['0.167'] }, 'it').ok).toBe(true)
    expect(checkNumber('0.167', { answers: ['0.167'] }, 'it').ok).toBe(true)
    expect(checkNumber('1.500', { answers: ['1500'] }, 'it').ok).toBe(true)
  })
})
