// Evaluate MathJSON (from compute-engine's LaTeX parser) with plain numbers: no eval, no dependencies,
// safe to ship to the browser. Used by answer checking and by interactive plots and formulas.
export type MathJson = number | string | { num: string } | MathJson[]
export class Unevaluable extends Error {}

export const CONST: Readonly<Record<string, number>> = { Pi: Math.PI, e: Math.E, ExponentialE: Math.E, Infinity: Infinity }
const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) // normalised, as numpy.sinc
const factorial = (n: number) => { if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN; let f = 1; for (let i = 2; i <= n; i++) f *= i; return f }
const FN: Readonly<Record<string, (...a: number[]) => number>> = {
  Add: (...a) => a.reduce((s, v) => s + v, 0), Multiply: (...a) => a.reduce((s, v) => s * v, 1),
  InvisibleOperator: (...a) => a.reduce((s, v) => s * v, 1), Subtract: (a, b) => (b === undefined ? -a : a - b),
  Negate: (a) => -a, Divide: (a, b) => a / b, Rational: (a, b) => a / b, Power: (a, b) => a ** b, Square: (a) => a * a,
  Sqrt: Math.sqrt, Root: (a, n) => a ** (1 / n), Exp: Math.exp, Ln: Math.log, Lb: Math.log2, Lg: Math.log10,
  Log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(a) / Math.log(b)),
  Sin: Math.sin, Cos: Math.cos, Tan: Math.tan, Sec: (a) => 1 / Math.cos(a), Csc: (a) => 1 / Math.sin(a), Cot: (a) => 1 / Math.tan(a),
  Arcsin: Math.asin, Arccos: Math.acos, Arctan: Math.atan, Arctan2: Math.atan2, Sinh: Math.sinh, Cosh: Math.cosh, Tanh: Math.tanh,
  Abs: Math.abs, Delimiter: (a) => a, Half: (a) => a / 2, Sinc: sinc, Max: Math.max, Min: Math.min,
  Mod: (a, b) => ((a % b) + b) % b, Floor: Math.floor, Ceil: Math.ceil, Round: Math.round, Sign: Math.sign, Factorial: factorial, Hypot: Math.hypot,
  Greater: (a, b) => +(a > b), GreaterEqual: (a, b) => +(a >= b), Less: (a, b) => +(a < b), LessEqual: (a, b) => +(a <= b),
  Equal: (a, b) => +(a === b), NotEqual: (a, b) => +(a !== b), And: (...a) => +a.every(Boolean), Or: (...a) => +a.some(Boolean), Not: (a) => +!a,
}
const SPECIAL = new Set(['Which', 'Sum', 'Product', 'Hold'])
export const isKnownFunction = (head: string) => head in FN || SPECIAL.has(head)

/** Symbols a formula needs values for (bound variables of sums excluded). */
export function freeSymbols(e: MathJson, acc = new Set<string>(), bound = new Set<string>()): Set<string> {
  if (typeof e === 'string') { if (!(e in CONST) && e !== 'True' && e !== 'False' && !bound.has(e)) acc.add(e) }
  else if (Array.isArray(e)) {
    const [head, ...args] = e
    if ((head === 'Sum' || head === 'Product') && Array.isArray(args[1]) && args[1][0] === 'Tuple') {
      const [, v, lo, hi] = args[1] as MathJson[]
      freeSymbols(lo, acc, bound); freeSymbols(hi, acc, bound)
      freeSymbols(args[0], acc, new Set([...bound, String(v)]))
    } else args.forEach((x) => freeSymbols(x, acc, bound))
  }
  return acc
}
/** Unsupported function heads in a formula (for a clear diagnostic). */
export function unknownHeads(e: MathJson, acc = new Set<string>()): Set<string> {
  if (Array.isArray(e)) {
    const [head, ...args] = e
    if (typeof head === 'string' && head !== 'Tuple' && !isKnownFunction(head)) acc.add(head)
    args.forEach((x) => unknownHeads(x, acc))
  }
  return acc
}
const MAX_TERMS = 10_000

export function evaluate(e: MathJson, env: Readonly<Record<string, number>>): number {
  if (typeof e === 'number') return e
  if (typeof e === 'string') {
    if (e in env) return env[e]
    if (e in CONST) return CONST[e]
    if (e === 'True') return 1
    if (e === 'False') return 0
    throw new Unevaluable(e)
  }
  if (!Array.isArray(e)) { if (e && typeof e === 'object' && 'num' in e) return Number(e.num); throw new Unevaluable('node') }
  const [head, ...args] = e as [string, ...MathJson[]]
  if (head === 'Which') { // piecewise: condition, value, condition, value, …
    for (let i = 0; i + 1 < args.length; i += 2) if (evaluate(args[i], env)) return evaluate(args[i + 1], env)
    return NaN
  }
  if ((head === 'Sum' || head === 'Product') && Array.isArray(args[1]) && args[1][0] === 'Tuple') {
    const [, v, lo, hi] = args[1] as [string, string, MathJson, MathJson]
    const a = Math.ceil(evaluate(lo, env)), b = Math.floor(evaluate(hi, env))
    if (!Number.isFinite(a) || !Number.isFinite(b) || b - a > MAX_TERMS) return NaN
    let acc = head === 'Sum' ? 0 : 1
    for (let k = a; k <= b; k++) { const x = evaluate(args[0], { ...env, [v]: k }); acc = head === 'Sum' ? acc + x : acc * x }
    return acc
  }
  if (head === 'Delimiter' && args.length !== 1) throw new Unevaluable('tuple')
  const f = FN[head]
  if (!f) throw new Unevaluable(String(head))
  return f(...args.map((a) => evaluate(a, env)))
}
/** A reusable function of the environment (for sampling a curve many times). */
export const compileExpr = (e: MathJson) => (env: Readonly<Record<string, number>>): number => {
  try { return evaluate(e, env) } catch { return NaN }
}
