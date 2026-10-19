// Numbers for axes and slider readouts: 3 significant digits, ×10ⁿ for very large or small values.
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '–'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a))
    const m = v / 10 ** e
    const ms = Number(m.toPrecision(digits)).toString()
    return `${ms === '1' ? '' : ms === '-1' ? '−' : `${ms.replace('-', '−')}×`}10${String(e).split('').map((c) => SUP[c]).join('')}`
  }
  return Number(v.toPrecision(digits)).toLocaleString(undefined, { maximumSignificantDigits: digits }).replace('-', '−')
}
/** "Nice" linear ticks covering [lo, hi]. */
export function linearTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t)
  return out
}
/** Powers of ten covering [lo, hi] (thinned to at most ~7). */
export function logTicks(lo: number, hi: number): number[] {
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi))
  const every = Math.max(1, Math.ceil((b - a) / 7))
  const out: number[] = []
  for (let e = a; e <= b; e += every) { const t = 10 ** e; if (t >= lo * 0.999 && t <= hi * 1.001) out.push(t) }
  return out.length >= 2 ? out : [lo, hi]
}
