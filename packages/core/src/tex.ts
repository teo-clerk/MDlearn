// TeX → Unicode for surfaces that cannot typeset math (terminals, plain chat).
// Converts the common subset of inline physics/ML notation; reports when something is left over,
// so callers can fall back to showing the TeX.

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', Theta: 'Θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', Xi: 'Ξ', pi: 'π', Pi: 'Π', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', Phi: 'Φ', chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', approx: '≈', sim: '∼', simeq: '≃', cong: '≅', equiv: '≡', le: '≤', leq: '≤',
  ge: '≥', geq: '≥', neq: '≠', ne: '≠', ll: '≪', gg: '≫', pm: '±', mp: '∓', infty: '∞', propto: '∝', partial: '∂',
  nabla: '∇', sum: 'Σ', prod: '∏', int: '∫', oint: '∮', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
  Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦', circ: '°', degree: '°', mid: '|', vert: '|',
  Vert: '‖', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
  neg: '¬', lnot: '¬', land: '∧', lor: '∨', cdots: '⋯', ldots: '…', dots: '…', ell: 'ℓ', hbar: 'ℏ', perp: '⊥',
  parallel: '∥', angle: '∠', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  odot: '⊙', otimes: '⊗', oplus: '⊕', top: '⊤', dagger: '†', star: '⋆', emptyset: '∅', varnothing: '∅',
  uparrow: '↑', downarrow: '↓', Uparrow: '⇑', Downarrow: '⇓', gtrsim: '≳', lesssim: '≲', lvert: '|', rvert: '|',
  lVert: '‖', rVert: '‖', prime: '′', checkmark: '✓', setminus: '∖',
  '%': '%', '$': '$', '{': '{', '}': '}', '#': '#', '&': '&', '_': '_',
}
const FUNCTIONS = ['log', 'ln', 'exp', 'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'max', 'min', 'arg', 'argmax', 'argmin', 'det', 'lim', 'sup', 'inf', 'Pr', 'var', 'cov', 'erf', 'sgn', 'sec', 'csc', 'cot', 'deg', 'dim', 'ker', 'mod', 'gcd']
const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', E: '𝔼', P: 'ℙ' }
const ACCENT: Record<string, string> = { hat: '\u0302', bar: '\u0304', tilde: '\u0303', vec: '\u20d7', dot: '\u0307', ddot: '\u0308', overline: '\u0305' }
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ', '*': '*', '°': '°', '′': '′', "'": '′' }
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }

/** Read a `{…}` group (balanced) or a single token starting at i. */
function arg(s: string, i: number): [string, number] {
  while (s[i] === ' ') i++
  if (s[i] === '{') {
    let d = 0
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue }
      if (s[j] === '{') d++
      else if (s[j] === '}' && --d === 0) return [s.slice(i + 1, j), j + 1]
    }
    return [s.slice(i + 1), s.length]
  }
  if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); return m ? [m[0], i + m[0].length] : ['', i + 1] }
  return [s[i] ?? '', i + 1]
}
const script = (raw: string, table: Record<string, string>, mark: string) => {
  const body = raw.trim()
  if (body && [...body].every((ch) => ch in table || ch === ' ')) return [...body.replace(/\s+/g, '')].map((ch) => table[ch]).join('')
  // a word or a gap marker reads fine without brackets: S_inc, k_B, (4π)^[1]____
  return /^[\p{L}\p{N}]+$|^\[\d+\]_+$|^\u0000$/u.test(body) ? `${mark}${body}` : `${mark}(${body})`
}
const group = (x: string) => (/^[\p{L}\p{N}.]+$/u.test(x) || /^\(.*\)$/.test(x) ? x : `(${x})`)

function convert(s: string): string {
  let out = ''
  for (let i = 0; i < s.length;) {
    const ch = s[i]
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))!
      const name = m[1]
      i += m[0].length
      if ([',', ';', ':', '!', ' '].includes(name)) { out += name === '!' ? '' : ' '; continue }
      if (['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'displaystyle', 'textstyle', 'limits', 'nolimits'].includes(name)) continue
      if (name === 'quad' || name === 'qquad') { out += '  '; continue }
      if (['text', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'operatorname', 'boldsymbol', 'bm', 'textbf', 'textit', 'texttt', 'textsf', 'textrm', 'emph', 'mathcal', 'mathfrak'].includes(name)) {
        const [a, j] = arg(s, i); out += convert(a); i = j; continue
      }
      if (name === 'mathbb') { const [a, j] = arg(s, i); out += BLACKBOARD[a] ?? a; i = j; continue }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [a, j] = arg(s, i); const [b, k] = arg(s, j); out += `${group(convert(a))}/${group(convert(b))}`; i = k; continue
      }
      if (name === 'sqrt') { const [a, j] = arg(s, i); out += `√${group(convert(a))}`; i = j; continue }
      if (name in ACCENT) { const [a, j] = arg(s, i); const c = convert(a); out += c.length === 1 ? c + ACCENT[name] : `${name}(${c})`; i = j; continue }
      if (FUNCTIONS.includes(name)) { out += name; continue }
      if (name in SYMBOLS) { out += SYMBOLS[name]; continue }
      out += m[0] // unknown command: keep it, the caller sees complete=false
      continue
    }
    if (ch === '^' || ch === '_') {
      const [a, j] = arg(s, i + 1)
      const body = convert(a)
      out += ch === '^' ? script(body, SUP, '^') : script(body, SUB, '_')
      i = j
      continue
    }
    if (ch === '{' || ch === '}') { i++; continue }
    if (ch === '~') { out += ' '; i++; continue }
    out += ch
    i++
  }
  return out
}

export function texToUnicode(tex: string): { text: string; complete: boolean } {
  if (/\\begin\{/.test(tex)) return { text: tex, complete: false }
  const text = convert(tex).normalize('NFC').replace(/\s{2,}/g, ' ').replace(/\s+([,.;)])/g, '$1')
    .replace(/‖\s*([^‖]*?)\s*‖/g, '‖$1‖').replace(/⟨\s*([^⟩]*?)\s*⟩/g, '⟨$1⟩').trim()
  return { text, complete: !/\\[A-Za-z]/.test(text) }
}
/** Convert `$…$` segments inside a plain string (titles, labels); leaves everything else alone. */
export function prettyInline(s: string): string {
  return s.replace(/\$([^$]+)\$/g, (whole, tex: string) => { const r = texToUnicode(tex); return r.complete ? r.text : whole })
}
