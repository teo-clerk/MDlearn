// Answer checkers — pure, DOM-free, deterministic given a seed.
import { LatexSyntax, LATEX_DICTIONARY, PHYSICS_DICTIONARY, UNITS_DICTIONARY } from '@cortex-js/compute-engine/latex-syntax'
import type { Blank } from './ast.js'
import { evaluate, freeSymbols, type MathJson } from './mathfn.js'

export type Verdict =
  | { ok: true; note?: 'typo' | 'equivalent-form'; canonical?: string }
  | { ok: false; reason?: 'imprecise' | 'unparsed' }

// ---------------------------------------------------------------- text
const COMMA_DECIMAL = new Set(['it', 'es', 'de', 'fr', 'pt', 'nl', 'ru', 'pl', 'tr', 'sv', 'da', 'fi', 'cs', 'ro', 'hu', 'el', 'uk', 'ca'])
export const normText = (s: string, lang = 'en') =>
  trimEndPunct(s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(lang).replace(/\s+/g, ' ').replace(/^[\s\p{P}]+/u, ''))
/** Trailing spaces/punctuation removed in linear time (an end-anchored regex backtracks quadratically). */
function trimEndPunct(s: string): string {
  let i = s.length
  while (i > 0 && /[\s\p{P}]/u.test(s[i - 1])) i--
  return s.slice(0, i)
}

function damerau1(a: string, b: string): boolean { // true if edit distance ≤ 1 (incl. transposition)
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0; while (i < a.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}
/** `others` = answers of every other blank in the lesson (typo guard: afferent ≠ efferent). */
export function checkText(input: string, answers: string[], lang = 'en', others: string[] = []): Verdict {
  const x = normText(input, lang)
  if (!x) return { ok: false }
  for (const a of answers) if (normText(a, lang) === x) return { ok: true }
  const otherNorm = others.map((o) => normText(o, lang))
  if (otherNorm.includes(x)) return { ok: false }
  for (const a of answers) {
    const n = normText(a, lang)
    if (n.length >= 6 && damerau1(n, x)) return { ok: true, note: 'typo', canonical: a }
  }
  return { ok: false }
}

// ---------------------------------------------------------------- numbers
export interface Num { value: number; ulp: number; sig: number } // ulp = half unit of the last given digit
export function parseNumber(raw: string, lang = 'en'): Num | null {
  let s = raw.trim().replace(/\\,|\\ |\\!|\s/g, '').replace(/[−–]/g, '-').replace(/\\%/g, '%')
  s = s.replace(/^\\frac\{([^{}]+)\}\{([^{}]+)\}$/, '$1/$2')
  let pct = 1
  if (s.endsWith('%')) { pct = 0.01; s = s.slice(0, -1) }
  const frac = /^([+-]?\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(s)
  if (frac) {
    const a = parseNumber(frac[1], lang), b = parseNumber(frac[2], lang)
    return a && b && b.value !== 0 ? { value: (a.value / b.value) * pct, ulp: 0, sig: Infinity } : null
  }
  s = s.replace(/(?:\\times|×|x|\*)10\^\{?([+-]?\d+)\}?$/, 'e$1')
  const comma = COMMA_DECIMAL.has(lang.slice(0, 2))
  if (/^[+-]?[1-9]\d{0,2}([.,'])\d{3}(\1\d{3})*([.,]\d+)?$/.test(s) && (comma ? /^[^,]*\.\d{3}/.test(s) : /^[^.]*,\d{3}/.test(s))) {
    s = s.replace(comma ? /\./g : /,/g, '').replace(',', '.') // thousands separators
  } else s = s.replace(',', '.')
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s)
  if (!m || (!m[2] && !m[3])) return null
  const value = Number(`${m[1]}${m[2] || '0'}.${m[3] || '0'}e${m[4] || 0}`) * pct
  const decimals = (m[3]?.length ?? 0) - Number(m[4] || 0)
  const digits = (m[2] + (m[3] ?? '')).replace(/^0+/, '')
  return { value, ulp: 0.5 * 10 ** -decimals * pct, sig: digits.length || 1 }
}
const isIntegerKey = (k: string) => /^[+-]?\d+$/.test(k.trim())

export function checkNumber(input: string, blank: Pick<Blank, 'answers' | 'tol'>, lang = 'en'): Verdict {
  const x = parseNumber(input, lang)
  if (!x) return { ok: false, reason: 'unparsed' }
  for (const key of blank.answers) {
    const k = parseNumber(key, 'en') // keys are always written with a decimal point
    if (!k) continue
    if (blank.tol?.abs !== undefined) { if (Math.abs(x.value - k.value) <= blank.tol.abs + 1e-12) return { ok: true }; continue }
    if (blank.tol?.rel !== undefined) { if (Math.abs(x.value - k.value) <= blank.tol.rel * Math.abs(k.value) + 1e-12) return { ok: true }; continue }
    if (isIntegerKey(key)) { if (Math.abs(x.value - k.value) < 1e-9) return { ok: true }; continue }
    const close = Math.abs(x.value - k.value) <= Math.max(x.ulp, k.ulp) * (1 + 1e-9) + 1e-15
    if (x.sig < Math.min(2, k.sig)) { if (close) return { ok: false, reason: 'imprecise' }; continue } // right but too rough vs. simply wrong
    // accept when the key, rounded to the learner's precision, equals the learner's value
    if (Math.abs(x.value - k.value) <= Math.max(x.ulp, k.ulp) * (1 + 1e-9) + 1e-15) return { ok: true }
  }
  return { ok: false }
}

// ---------------------------------------------------------------- math
const drop = new Set<unknown>([...PHYSICS_DICTIONARY, ...UNITS_DICTIONARY])
const latex = new LatexSyntax({ dictionary: LATEX_DICTIONARY.filter((e) => !drop.has(e)) })

export const normTex = (s: string) =>
  s.replace(/\\(left|right|displaystyle)\b/g, '').replace(/\\[,;:! ]/g, '')
    .replace(/\\[dt]frac/g, '\\frac').replace(/\\varepsilon/g, '\\epsilon').replace(/\\vartheta/g, '\\theta')
    .replace(/\\varphi/g, '\\phi').replace(/\\cdot|\\times/g, '*').replace(/\\mid/g, '|').replace(/\\lnot/g, '\\neg').replace(/([_^])\{(\w)\}/g, '$1$2')
    .replace(/\s+/g, '')

type MJ = MathJson
function parseTex(tex: string): MJ | null {
  try {
    const j = latex.parse(normTexForParse(tex))
    return JSON.stringify(j).includes('"Error"') ? null : (j as unknown as MJ)
  } catch { return null }
}
const normTexForParse = (s: string) => s.replace(/\\varepsilon/g, '\\epsilon').replace(/\\[dt]frac/g, '\\frac').replace(/\\(left|right)\b/g, '')
const sides = (e: MJ): [MJ | null, MJ] => (Array.isArray(e) && e[0] === 'Equal' && e.length === 3 ? [e[1], e[2]] : [null, e])

/** Seeded PRNG so the same check gives the same verdict everywhere (tests, lint, player). */
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export function mathEquivalent(a: MJ, b: MJ, seed = 1): boolean | 'unknown' {
  const vars = [...new Set([...freeSymbols(a), ...freeSymbols(b)])]
  const rnd = mulberry32(seed)
  let valid = 0
  for (let k = 0; k < 24 && valid < 6; k++) {
    const env = Object.fromEntries(vars.map((v) => { let x = 0; while (Math.abs(x) < 0.2) x = rnd() * 5 - 2.5; return [v, x] }))
    let x: number, y: number
    try { x = evaluate(a, env); y = evaluate(b, env) } catch { return 'unknown' }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return false
    valid++
  }
  return valid >= 4 ? true : 'unknown'
}

export function checkMath(input: string, key: string, exact = false): Verdict {
  if (normTex(input) === normTex(key)) return { ok: true }
  if (exact) {
    const a = parseTex(input), b = parseTex(key)
    return a && b && JSON.stringify(a) === JSON.stringify(b) ? { ok: true } : { ok: false }
  }
  const a = parseTex(input), b = parseTex(key)
  if (!a || !b) return { ok: false, reason: a ? undefined : 'unparsed' }
  const [la, ra] = sides(a), [lb, rb] = sides(b)
  const lhsA = la ?? lb, lhsB = lb
  // learner may type only the right-hand side of an equation key
  const left = la ? (['Subtract', lhsA, ra] as MJ) : ra
  const right = la && lhsB ? (['Subtract', lhsB, rb] as MJ) : rb
  const eq = mathEquivalent(left, right)
  return eq === true ? { ok: true, note: 'equivalent-form' } : { ok: false, reason: eq === 'unknown' ? 'unparsed' : undefined }
}
/** Lint helper: can this key be checked by evaluation (else I704 → TeX comparison only)? */
export function mathKeyEvaluable(key: string): boolean {
  const j = parseTex(key)
  if (!j) return false
  const [, r] = sides(j)
  return mathEquivalent(r, r) === true
}

export function checkBlank(input: string, blank: Blank, opts: { lang?: string; others?: string[]; exact?: boolean } = {}): Verdict {
  if (blank.kind === 'number') return checkNumber(input, blank, opts.lang)
  if (blank.kind === 'math') return checkMath(input, blank.answers[0], opts.exact)
  return checkText(input, blank.answers, opts.lang, opts.others)
}
