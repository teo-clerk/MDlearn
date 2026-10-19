// Visual blocks (DSL v1.2): :::plot, :::formula, :::animate, :::sim — explanation, never graded.
// Formulas are parsed and checked at compile time; the AST carries MathJSON so a browser only needs the
// small evaluator in mathfn.ts. On an error a visual fails open-static: its caption, text and formulas
// still show, with the diagnostic.
import { toString } from 'mdast-util-to-string'
import type { RootContent, Nodes, PhrasingContent, List, Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import { LatexSyntax, LATEX_DICTIONARY, PHYSICS_DICTIONARY, UNITS_DICTIONARY } from '@cortex-js/compute-engine/latex-syntax'
import type { Code } from './registry.js'
import type { Block, MdNode, Param, VisualCurve } from './ast.js'
import { compileExpr, freeSymbols, unknownHeads, type MathJson } from './mathfn.js'
import { processor } from './parser.js'

export const VISUAL_TYPES = ['plot', 'formula', 'animate', 'sim'] as const
export const VISUAL_MINUTES: Record<string, number> = { plot: 0.5, formula: 0.3, animate: 0.5, sim: 1 }
type Positioned = { position?: { start: { line: number; column: number } } } | number
export interface VisualContext {
  clean: (n: Nodes) => MdNode[]
  diag: (code: Code, node: Positioned, message?: string) => void
  id: (key: string) => string
  /** Node-only syntax check for simulation code (returns an error message or null). */
  checkJs?: (code: string) => string | null
}

const drop = new Set<unknown>([...PHYSICS_DICTIONARY, ...UNITS_DICTIONARY])
const latex = new LatexSyntax({ dictionary: LATEX_DICTIONARY.filter((e) => !drop.has(e)) })

// ---------------------------------------------------------------- TeX tokens
/** Control words, control symbols, and single characters (spaces dropped); `_{x}` collapses to `_x`. */
export function texTokens(tex: string): string[] {
  const raw = tex.match(/\\[a-zA-Z]+|\\[^a-zA-Z]|[^\s]/g) ?? []
  const skip = new Set(['\\left', '\\right', '\\,', '\\;', '\\:', '\\!', '\\ ', '\\displaystyle'])
  const t = raw.filter((x) => !skip.has(x))
  const out: string[] = []
  for (let i = 0; i < t.length; i++) {
    if ((t[i] === '_' || t[i] === '^') && t[i + 1] === '{' && t[i + 3] === '}') { out.push(t[i], t[i + 2]); i += 3; continue }
    out.push(t[i])
  }
  return out
}
const join = (ts: string[]) => ts.reduce((s, t) => (s && /^\\[a-zA-Z]+$/.test(s.split(' ').pop() ?? '') && /^[a-zA-Z]/.test(t) ? `${s} ${t}` : s + t), '')
/** Positions where `needle` occurs as a whole term (not a subscript, not followed by a subscript). */
function occurrences(hay: string[], needle: string[]): number[] {
  const out: number[] = []
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (!needle.every((t, k) => hay[i + k] === t)) continue
    const before = hay[i - 1], after = hay[i + needle.length]
    if (before === '_' || before === '^' || after === '_') continue
    if (/^[a-zA-Z]$/.test(needle[0]) && needle.length === 1 && after && /^[a-zA-Z]$/.test(after) && before && /^[a-zA-Z]$/.test(before)) continue
    out.push(i)
    i += needle.length - 1
  }
  return out
}
/** Is the token run balanced in braces (so it can be wrapped as one group)? */
const balanced = (ts: string[]) => { let d = 0; for (const t of ts) { if (t === '{') d++; if (t === '}' && --d < 0) return false } return d === 0 }

// ---------------------------------------------------------------- params
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:\s*(?:×|\\times|x)\s*10\^\{?[-+]?\d+\}?)?`
const num = (s: string): number => {
  const m = /^(.*?)(?:\s*(?:×|\\times|x)\s*10\^\{?([-+]?\d+)\}?)$/.exec(s.trim())
  return m ? Number(m[1]) * 10 ** Number(m[2]) : Number(s.trim())
}
const SPEC = new RegExp(String.raw`^\s*(?:=\s*(${NUM}))?\s*(?:in\s*)?(?:\[\s*(${NUM})\s*(?:,|\.\.\.?|…)\s*(${NUM})\s*\])?\s*(log)?\s*(?:step\s+(${NUM}))?\s*(.*)$`)
const keyOf = (tex: string) => tex.replace(/\\(mathrm|text|operatorname|mathit|mathbf)\{([^}]*)\}/g, '$2').replace(/\\/g, '').replace(/[{}^]/g, '').replace(/[^A-Za-z0-9_]/g, '') || 'p'

interface Item { sym: string; label: MdNode[]; value?: number; min?: number; max?: number; log: boolean; step?: number; unit?: string; node: Nodes; loose: boolean; spec: boolean; bad?: string }
/** `- $P_t$ = 1000 in [10, 5000] W — transmit power` → an item. Tolerates `- R: [100 .. 2000] km range`. */
function parseItem(li: Nodes, clean: VisualContext['clean']): Item | null {
  const para = 'children' in li ? (li.children as RootContent[]).find((c) => c.type === 'paragraph') : undefined
  if (!para || para.type !== 'paragraph') return null
  const kids = para.children as PhrasingContent[]
  let sym: string, rest: PhrasingContent[], loose = false
  if (kids[0]?.type === 'inlineMath') { sym = kids[0].value.trim(); rest = kids.slice(1) }
  else if (kids[0]?.type === 'text') {
    const m = /^\s*([A-Za-z\\][\w\\{}^]*)\s*:\s*/.exec(kids[0].value)
    if (!m) return null
    sym = m[1]; loose = true
    rest = [{ type: 'text', value: kids[0].value.slice(m[0].length) } as PhrasingContent, ...kids.slice(1)]
  } else return null
  // the spec is the text up to the separator; the label is everything after it (math kept)
  const flat = rest.map((n) => (n.type === 'inlineMath' ? `$${n.value}$` : toString(n))).join('')
  const sepAt = flat.search(/\s(—|–|--)\s|^\s*(—|–|--)\s|:\s/)
  const specText = (sepAt >= 0 ? flat.slice(0, sepAt) : flat).replace(/\s+\.\.\s+/g, ' .. ')
  let labelText = sepAt >= 0 ? flat.slice(sepAt).replace(/^\s*(—|–|--|:)\s*/, '') : ''
  const m = SPEC.exec(specText.replace(/\[\s*([^\]]*?)\s+\.\.\s+([^\]]*?)\s*\]/, '[$1 .. $2]'))
  const item: Item = { sym, label: [], log: false, node: li, loose, spec: false }
  if (m) {
    if (m[1]) item.value = num(m[1])
    if (m[2] !== undefined && m[3] !== undefined) { item.min = num(m[2]); item.max = num(m[3]) }
    if (m[4]) item.log = true
    if (m[5]) item.step = num(m[5])
    let unit = m[6].trim()
    if (sepAt < 0 && unit) { // no separator: in the loose form the first word is the unit, the rest the label
      const u = /^(\$[^$]+\$|\S+)\s*(.*)$/.exec(unit)!
      if (item.value !== undefined || item.min !== undefined) { unit = u[1]; labelText = u[2]; if (labelText) item.loose = true } else { labelText = unit; unit = '' }
    }
    if (unit) item.unit = unit
    item.spec = item.value !== undefined || item.min !== undefined
    for (const [k, v] of Object.entries({ value: item.value, min: item.min, max: item.max, step: item.step })) if (v !== undefined && !Number.isFinite(v)) item.bad = `${k} is not a number`
  } else labelText = specText + (labelText ? ` ${labelText}` : '')
  const parsed = (processor.parse(labelText.trim()) as Root).children[0]
  item.label = parsed && 'children' in parsed ? (parsed.children as Nodes[]).flatMap((c) => clean(c)) : []
  return item
}
function validate(it: Item, ctx: VisualContext): string | null {
  if (it.bad) return it.bad
  if (it.min !== undefined && it.max !== undefined) {
    if (!(it.min < it.max)) return `min (${it.min}) must be below max (${it.max})`
    if (it.value !== undefined && (it.value < it.min || it.value > it.max)) return `value ${it.value} is outside [${it.min}, ${it.max}]`
    if (it.log && it.min <= 0) return 'a log range must be positive'
  }
  if (it.log && it.value !== undefined && it.value <= 0) return 'a log value must be positive'
  void ctx
  return null
}
function toParam(it: Item, id: string, keys: Set<string>): Param {
  let key = keyOf(it.sym)
  for (let n = 2; keys.has(key); n++) key = `${keyOf(it.sym)}${n}`
  keys.add(key)
  const intRange = it.min !== undefined && it.max !== undefined && [it.min, it.max, it.value ?? it.min].every(Number.isInteger) && it.max - it.min <= 1000
  return { id, sym: it.sym, key, label: it.label, log: it.log,
    ...(it.value !== undefined ? { value: it.value } : {}), ...(it.min !== undefined ? { min: it.min, max: it.max } : {}),
    ...(it.step !== undefined ? { step: it.step } : intRange && !it.log ? { step: 1 } : {}), ...(it.unit ? { unit: it.unit } : {}) }
}

// ---------------------------------------------------------------- formulas
/** Replace declared symbols with `\mathrm{vN}` (longest first) and parse to MathJSON. */
export function parseFormula(tex: string, params: { id: string; sym: string }[]): { expr: MathJson | null; lhs?: string; rhsTex: string; error?: string } {
  let tokens = texTokens(tex)
  const eq = tokens.indexOf('=')
  const lhs = eq > 0 ? join(tokens.slice(0, eq)) : undefined
  if (eq > 0) tokens = tokens.slice(eq + 1)
  const rhsTex = join(tokens)
  const order = [...params].sort((a, b) => texTokens(b.sym).length - texTokens(a.sym).length)
  const marks = new Map<number, { len: number; id: string }>()
  for (const p of order) {
    const needle = texTokens(p.sym)
    for (const at of occurrences(tokens, needle)) {
      if ([...marks].some(([s, m]) => at < s + m.len && s < at + needle.length)) continue
      marks.set(at, { len: needle.length, id: p.id })
    }
  }
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const m = marks.get(i)
    if (m) { out.push(`{\\mathrm{${m.id}}}`); i += m.len - 1 } else out.push(tokens[i])
  }
  try {
    const expr = latex.parse(join(out).replace(/\\[dt]frac/g, '\\frac')) as unknown as MathJson
    const json = JSON.stringify(expr)
    if (json.includes('"Error"')) return { expr: null, ...(lhs ? { lhs } : {}), rhsTex, error: 'the formula could not be read' }
    return { expr, ...(lhs ? { lhs } : {}), rhsTex }
  } catch (e) { return { expr: null, ...(lhs ? { lhs } : {}), rhsTex, error: (e as Error).message } }
}
const displayMath = (nodes: RootContent[]) => nodes.filter((n) => n.type === 'math') as Extract<RootContent, { type: 'math' }>[]
const label = (n: ContainerDirective) => n.children.find((c) => c.type === 'paragraph' && c.data && 'directiveLabel' in c.data)
const attrs = (n: ContainerDirective) => (n.attributes ?? {}) as Record<string, string | null | undefined>

export function buildVisual(n: ContainerDirective, ctx: VisualContext): Block[] {
  const kind = n.name as (typeof VISUAL_TYPES)[number]
  const lab = label(n)
  const caption = lab && 'children' in lab ? lab.children.flatMap((c) => ctx.clean(c)) : undefined
  const content = n.children.filter((c) => c !== lab)
  const a = attrs(n)
  const height = Math.max(160, Math.min(720, Number(a.height) || (kind === 'sim' ? 360 : 300)))
  const id = ctx.id(toString(n) + kind)
  const errors: Code[] = []
  const fail = (code: Code, node: Positioned, msg?: string) => { ctx.diag(code, node, msg); if (code.startsWith('E')) errors.push(code) }
  const lists = content.filter((c): c is List => c.type === 'list')
  const body = content.filter((c) => c.type !== 'list' && c.type !== 'math' && c.type !== 'code').flatMap((c) => ctx.clean(c))
  const formulas = displayMath(content)
  const fallback = (): Block[] => [{ type: 'unavailable', id, kind, codes: [...new Set(errors)],
    fallback: [...(caption ? [{ type: 'paragraph', children: [{ type: 'strong', children: caption }] } as MdNode] : []), ...body, ...formulas.flatMap((f) => ctx.clean(f))] }]
  for (const k of Object.keys(a)) if (!['id', 'x', 'y', 'height', 'auto'].includes(k) || (k === 'height' && kind !== 'plot' && kind !== 'sim') || ((k === 'x' || k === 'y') && kind !== 'plot')) ctx.diag('I919', n, `${k} on ${kind}`)

  // parameters / terms (unordered list items)
  const items = lists.filter((l) => !l.ordered).flatMap((l) => l.children.map((li) => parseItem(li, ctx.clean)).filter((x): x is Item => !!x))
  for (const it of items) {
    if (it.loose) ctx.diag('I920', it.node, it.sym)
    const bad = validate(it, ctx)
    if (bad) fail('E904', it.node, `${it.sym}: ${bad}`)
  }
  const keys = new Set<string>()
  const withValues = items.filter((it) => it.spec)
  const params: Param[] = withValues.map((it, i) => toParam(it, `v${i}`, keys))

  if (kind === 'plot') {
    if (!formulas.length) { fail('E901', n); return fallback() }
    if (formulas.length > 4) ctx.diag('W910', n, `${formulas.length} curves`)
    const xs = params.filter((p) => p.value === undefined && p.min !== undefined)
    if (!xs.length) fail('E905', n)
    if (xs.length > 1) ctx.diag('W906', n, xs.map((p) => p.sym).join(', '))
    for (const p of xs.slice(1)) p.value = p.log ? Math.sqrt(p.min! * p.max!) : (p.min! + p.max!) / 2
    if (params.filter((p) => p.min !== undefined && p !== xs[0]).length > 6) ctx.diag('W910', n, 'sliders')
    const curves: VisualCurve[] = []
    for (const f of formulas.slice(0, 4)) {
      const parsed = parseFormula(f.value, params)
      if (!parsed.expr) { fail('E902', f, parsed.error); continue }
      const heads = unknownHeads(parsed.expr)
      if (heads.size) { fail('E902', f, [...heads].join(', ')); continue }
      const free = [...freeSymbols(parsed.expr)].filter((s) => !params.some((p) => p.id === s))
      if (free.includes('e')) ctx.diag('I923', f)
      const undeclared = free.filter((s) => s !== 'e')
      if (undeclared.length) { fail('E903', f, undeclared.join(', ')); continue }
      if (/\\sigma\^0|\\sigma\^\{0\}/.test(f.value) && !params.some((p) => /\^0|\^\{0\}/.test(p.sym))) ctx.diag('W921', f)
      curves.push({ tex: f.value, ...(parsed.lhs ? { lhs: parsed.lhs } : {}), expr: parsed.expr })
    }
    if (errors.length) return fallback()
    const x = xs[0]
    const xLog = a.x === 'log' || x.log
    // sample with the default values: mostly non-finite means the plot would be empty
    const env0 = Object.fromEntries(params.map((p) => [p.id, p.value ?? p.min!]))
    for (const c of curves) {
      const f = compileExpr(c.expr)
      let finite = 0
      for (let i = 0; i < 64; i++) {
        const t = i / 63
        const xv = xLog ? x.min! * (x.max! / x.min!) ** t : x.min! + (x.max! - x.min!) * t
        if (Number.isFinite(f({ ...env0, [x.id]: xv }))) finite++
      }
      if (finite < 32) ctx.diag('W907', n, c.lhs ?? c.tex.slice(0, 30))
    }
    return [{ type: 'plot', id, ...(caption ? { caption } : {}), body, curves, params, x: x.id, xScale: xLog ? 'log' : 'linear', yScale: a.y === 'log' ? 'log' : 'linear', height }]
  }

  if (kind === 'formula') {
    if (!formulas.length) { fail('E901', n); return fallback() }
    const f = formulas[0]
    const tokens = texTokens(f.value)
    const terms: { i: number; tex: string; label: MdNode[] }[] = []
    const spans: { at: number; len: number; i: number }[] = []
    for (const it of items) {
      const needle = texTokens(it.sym)
      const hits = occurrences(tokens, needle).filter((at) => balanced(tokens.slice(at, at + needle.length)))
      if (!hits.length) { fail('E908', it.node, it.sym); continue }
      if (hits.length > 1) ctx.diag('I909', it.node, it.sym)
      const i = terms.length
      terms.push({ i, tex: it.sym, label: it.label })
      for (const at of hits) if (!spans.some((s) => at < s.at + s.len && s.at < at + needle.length)) spans.push({ at, len: needle.length, i })
    }
    if (terms.length > 6) ctx.diag('W910', n, 'terms')
    if (errors.length) return fallback()
    const marked: string[] = []
    for (let k = 0; k < tokens.length; k++) {
      const s = spans.find((x) => x.at === k)
      if (s) { marked.push(`\\htmlClass{mdl-t-${s.i}}{${join(tokens.slice(k, k + s.len))}}`); k += s.len - 1 } else marked.push(tokens[k])
    }
    // a live result when every symbol has a value
    let live: { lhs?: string; expr: MathJson } | undefined
    if (params.length) {
      const parsed = parseFormula(f.value, params)
      if (parsed.expr && !unknownHeads(parsed.expr).size && [...freeSymbols(parsed.expr)].every((s) => s === 'e' || params.some((p) => p.id === s))) live = { ...(parsed.lhs ? { lhs: parsed.lhs } : {}), expr: parsed.expr }
    }
    return [{ type: 'formula', id, ...(caption ? { caption } : {}), body, tex: f.value, marked: join(marked), terms, params, ...(live ? { live } : {}) }]
  }

  if (kind === 'animate') {
    const list = lists.find((l) => l.ordered)
    const frames = (list?.children ?? []).map((li) => {
      const kids = li.children as RootContent[]
      const para = kids.find((c) => c.type === 'paragraph')
      const mathNode = (kids.find((c) => c.type === 'math') ?? (para && 'children' in para ? (para.children as PhrasingContent[]).find((c) => c.type === 'inlineMath') : undefined)) as { value: string } | undefined
      const rest: MdNode[] = kids.flatMap((c) => {
        if (c.type === 'math') return []
        if (c.type === 'paragraph') { const ch = c.children.filter((x) => x !== (mathNode as unknown)); return ch.length ? ctx.clean({ ...c, children: ch }) : [] }
        return ctx.clean(c)
      })
      if (!mathNode) fail('E901', li, 'frame without a formula')
      return { tex: mathNode?.value ?? '', caption: rest }
    })
    if (frames.length < 2) fail('E911', n)
    if (frames.length > 12) ctx.diag('W912', n, `${frames.length} frames`)
    if (errors.length) return fallback()
    return [{ type: 'animate', id, ...(caption ? { caption } : {}), body, frames, auto: 'auto' in a }]
  }

  // sim
  const codes = content.filter((c) => c.type === 'code' && /^(js|javascript|mjs)$/i.test(c.lang ?? '')) as Extract<RootContent, { type: 'code' }>[]
  if (codes.length !== 1) { fail('E913', n, `${codes.length} js blocks`); return fallback() }
  const code = codes[0].value
  if (code.length > 16_384) fail('E915', codes[0])
  const syntax = ctx.checkJs?.(code)
  if (syntax) fail('E914', codes[0], syntax)
  if (/\b(fetch|XMLHttpRequest|WebSocket|importScripts|EventSource)\b|\bimport\s*\(/.test(code)) ctx.diag('W917', codes[0])
  if (!body.length) ctx.diag('W916', n)
  if (errors.length) return fallback()
  return [{ type: 'sim', id, ...(caption ? { caption } : {}), body, code, params, height }]
}
