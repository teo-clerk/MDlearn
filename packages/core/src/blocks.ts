// Block building shared by lessons (compile) and documents (parseDocument): mdast → CourseAST blocks
// (prose, callouts, read panels, widgets), with the same sanitising, TeX checks and widget rules.
import { toString } from 'mdast-util-to-string'
import katex from 'katex'
import type { Root, RootContent, Nodes, PhrasingContent, List, ListItem, Code as CodeNode } from 'mdast'
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive'
import { PH_OPEN, PH_CLOSE, PH_STRAY, WIDGETS, CALLOUTS, VISUALS, type Stage0Result } from './stage0.js'
import { buildVisual } from './visuals.js'
import { type Code } from './registry.js'
import { type Blank, type Block, type MdNode, type Widget } from './ast.js'
import { mathKeyEvaluable, parseNumber } from './checkers.js'
import { processor } from './parser.js'

/** Resolves `::read` references. `doc` is the lesson's `source` (or the path in the label), as written. */
export type SourceResolver = (doc: string, section: string) => { title: string; words: number } | 'no-document' | null
type Flow = MdNode[]
type Positioned = { position?: { start: { line: number; column: number } } } | undefined
/** Languages the Studio can run in the browser (JavaScript in the simulation sandbox, Python with Pyodide). */
const RUNNABLE = new Set(['js', 'javascript', 'mjs', 'python', 'py', 'python3'])
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'il', 'la', 'le', 'di', 'el', 'de', 'y', 'e'])

export interface BuildContext {
  s0: Stage0Result
  macros: Record<string, string>
  /** Default document for `::read` (the lesson's `source:`). */
  source?: string
  lang: string
  diag: (code: Code, node: Positioned | number, message?: string) => void
  resolveSource?: SourceResolver
  /** Document mode: raw HTML becomes literal text (no E107), unknown directives keep their content. */
  document?: boolean
  /** Node-only syntax check for simulation code. */
  checkJs?: (code: string) => string | null
}

export function blockBuilder(ctx: BuildContext) {
  const { s0, lang, diag } = ctx
  const meta = { macros: ctx.macros, source: ctx.source }
  const opts = { resolveSource: ctx.resolveSource }
const sideHint = (id: string): PhrasingContent[] => {
  const h = s0.hints.get(id)
  const para = (processor.parse(h?.raw ?? '') as Root).children[0]
  return para && 'children' in para ? (para.children as PhrasingContent[]) : []
}


let widgetSeq = 0
const allBlankAnswers: string[] = []

const clean = (n: Nodes, inWidget: string | null): MdNode[] => {
  // strip position & data (data.hName/hProperties are an injection vector), resolve placeholders
  if (n.type === 'html') {
    if (/^\s*<!--/.test(n.value)) return []
    if (!ctx.document) { diag('E107', n); return [] }
    // documents: <br> is a line break; any other tag is shown as the text it is (never rendered as HTML)
    return /^<br\s*\/?>$/i.test(n.value.trim()) ? [{ type: 'break' }] : [{ type: 'text', value: n.value }]
  }
  if (n.type === 'text') return splitPlaceholders(n.value, n)
  if (n.type === 'image') { if (!n.alt) diag('W604', n); return [{ type: 'image', url: safeUrl(n.url, true), alt: n.alt ?? '', title: n.title ?? undefined }] }
  if (n.type === 'link') return [{ type: 'link', url: safeUrl(n.url, false), title: n.title ?? undefined, children: n.children.flatMap((c) => clean(c, inWidget)) }]
  if (n.type === 'math' || n.type === 'inlineMath') {
    const blanks: string[] = []
    const value = n.value.replace(new RegExp(`${PH_OPEN}(b\\d+)${PH_CLOSE}`, 'g'), (_, id) => (blanks.push(id), `\\placeholder[${id}]{}`))
    checkTex(value, n, n.type === 'math')
    return [{ type: n.type, value, ...(blanks.length ? { blanks } : {}) }]
  }
  if (n.type === 'containerDirective' && (CALLOUTS as readonly string[]).includes(n.name)) return [callout(n, inWidget) as unknown as MdNode]
  if (n.type === 'containerDirective' && (VISUALS as readonly string[]).includes(n.name)) { diag('W918', n, n.name); return n.children.flatMap((c) => clean(c, inWidget)) }
  if (n.type === 'leafDirective' && n.name === 'read') { diag('W113', n); return [] }
  if (n.type === 'containerDirective' || n.type === 'leafDirective') { diag(n.type === 'leafDirective' ? 'E104' : 'E103', n, n.name); return [] }
  if (n.type === 'textDirective' || n.type === 'yaml' || n.type === 'definition' || n.type === 'footnoteDefinition' || n.type === 'footnoteReference' || n.type === 'linkReference' || n.type === 'imageReference') {
    return 'children' in n ? (n.children as Nodes[]).flatMap((c) => clean(c, inWidget)) : []
  }
  const out: Record<string, unknown> = { type: n.type }
  for (const [k, v] of Object.entries(n)) if (!['type', 'position', 'data', 'children'].includes(k) && v !== null && v !== undefined) out[k] = v
  if (n.type === 'listItem' && !inWidget) delete out.checked // stray task lists never reveal check state
  if ('children' in n) out.children = (n.children as Nodes[]).flatMap((c) => clean(c, inWidget))
  return [out as MdNode]
}
function splitPlaceholders(value: string, node: Nodes): MdNode[] {
  const out: MdNode[] = []
  const re = new RegExp(`${PH_OPEN}(b\\d+)${PH_CLOSE}|${PH_STRAY}`, 'g')
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    out.push(m[1] ? { type: 'blank', id: m[1] } : { type: 'strayBlank' })
    last = m.index + m[0].length
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  void node
  return out
}
function checkTex(tex: string, node: Nodes, display: boolean) {
  if (/\\\\[A-Za-z]/.test(tex)) diag('W702', node, tex.slice(0, 40))
  let untrusted = false
  try {
    katex.renderToString(tex.replace(/\\placeholder\[\w+\]\{\}/g, '\\boxed{?}'), {
      displayMode: display, throwOnError: true, strict: 'ignore', maxSize: 10, maxExpand: 1000,
      macros: { ...meta.macros }, trust: () => { untrusted = true; return false },
    })
  } catch (e) { diag('E701', node, (e as Error).message.replace(/^KaTeX parse error: /, '').slice(0, 80)) }
  if (untrusted) diag('E703', node)
}
function callout(n: ContainerDirective, inWidget: string | null) {
  const kids = n.children.filter((c) => !(c.type === 'paragraph' && c.data && 'directiveLabel' in c.data))
  const label = n.children.find((c) => c.type === 'paragraph' && c.data && 'directiveLabel' in c.data)
  return { type: 'callout', kind: n.name, fold: 'fold' in (n.attributes ?? {}),
    ...(label && 'children' in label ? { summary: label.children.flatMap((c) => clean(c, inWidget)) } : {}),
    children: kids.flatMap((c) => clean(c, inWidget)) }
}
const blanksIn = (nodes: MdNode[]): string[] => nodes.flatMap((n) =>
  n.type === 'blank' ? [n.id as string] : [...((n.blanks as string[]) ?? []), ...blanksIn(n.children ?? [])])
const makeBlank = (id: string): Blank => {
  const b = s0.blanks.get(id)!
  const numeric = b.answers.every((a) => parseNumber(a, 'en') !== null)
  const kind = numeric ? 'number' : b.inMath ? 'math' : 'text'
  if (kind === 'math' && !mathKeyEvaluable(b.answers[0])) diag('I704', b.line, b.answers[0])
  if (kind === 'text' && b.answers.every((a) => parseNumber(a, lang) === null && (a.length <= 2 || STOPWORDS.has(a.toLowerCase())))) diag('W304', b.line, b.answers[0])
  allBlankAnswers.push(...b.answers)
  return { id, kind, answers: b.answers, ...(b.tol ? { tol: b.tol } : {}), ...(b.hint ? { hint: b.hint } : {}) }
}
const usedIds = new Set<string>()
const uniqueId = (base: string) => { let id = base, n = 1; while (usedIds.has(id)) id = `${base}-${n++}`; usedIds.add(id); return id }
const fingerprint = (s: string) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(16).padStart(8, '0') }

function widget(n: ContainerDirective, cardId: string): Widget[] {
  const kind = n.name as (typeof WIDGETS)[number]
  const top = n.children.filter((c) => !(c.type === 'paragraph' && c.data && 'directiveLabel' in c.data))
  const hints: MdNode[][] = []
  const body: RootContent[] = []
  for (const c of top) {
    if (c.type === 'leafDirective' && c.name === 'hint') {
      const ph = toString(c).match(new RegExp(`${PH_OPEN}(h\\d+)${PH_CLOSE}`))
      hints.push(ph ? sideHint(ph[1]).flatMap((x) => clean(x, kind)) : (c as LeafDirective).children.flatMap((x) => clean(x, kind)))
    } else if (c.type === 'containerDirective' && (WIDGETS as readonly string[]).includes(c.name)) {
      body.push({ type: 'paragraph', children: [] }) // locked nested widget; reported in stage 0 (E106)
    } else body.push(c)
  }
  let r = body.length
  while (r > 0 && body[r - 1].type === 'blockquote') r--
  const main = body.slice(0, r), trailing = body.slice(r)
  const revealOf = (nodes: RootContent[]) => nodes.flatMap((b) => ('children' in b ? (b.children as Nodes[]) : [])).flatMap((c) => clean(c, kind))
  const reveal = trailing.length ? revealOf(trailing) : undefined
  const answerLabel = main.find((b) => /^(answer|solution|risposta|soluzione|respuesta|solución)\s*:/i.test(toString(b)))
  if (answerLabel) diag('W606', answerLabel)
  const pinned = (n.attributes as Record<string, string> | undefined)?.id
  const id = (key: string) => uniqueId(pinned ? `${cardId}/${pinned}` : `${cardId}/${kind}-${fingerprint(key)}`)
  const flow = (nodes: RootContent[]) => nodes.flatMap((c) => clean(c, kind))
  const fail = (code: Code, node: Nodes, msg?: string): Widget[] => {
    diag(code, node, msg)
    return [{ type: 'unavailable', id: `${cardId}/${kind}-${++widgetSeq}`, kind, codes: [code] }]
  }

  if (kind === 'quiz') {
    // split multi-question quizzes: each task list + the stem blocks before it
    const groups: { stem: RootContent[]; list: List; extra: RootContent[] }[] = []
    let pending: RootContent[] = []
    for (const b of main) {
      if (b.type === 'list' && b.children.some((li) => li.checked !== null && li.checked !== undefined)) {
        const prev = groups[groups.length - 1]
        if (prev && pending.length === 0) prev.list.children.push(...b.children) // list split by a blank line etc.
        else groups.push({ stem: pending, list: b, extra: [] })
        pending = []
      } else if (b.type === 'list' && groups.length === 0 && pending.length && b.children.some((li) => markerCorrect(li) !== null)) {
        groups.push({ stem: pending, list: b, extra: [] }); pending = []
      } else pending.push(b)
    }
    if (!groups.length) return fail('E201', n)
    if (groups.length > 1) diag('I209', n)
    return groups.map((g, gi) => {
      const options = g.list.children.map((li, oi) => {
        let correct = li.checked === true
        const marker = markerCorrect(li)
        if (marker !== null) { diag('W208', li); correct = correct || marker }
        const [first, ...rest] = li.children
        const content = first && first.type === 'paragraph' ? first.children.flatMap((c) => clean(c, kind)) : []
        stripMarker(content)
        const fb = rest.filter((x) => x.type === 'blockquote').flatMap((x) => ('children' in x ? (x.children as Nodes[]) : [])).flatMap((c) => clean(c, kind))
        return { id: `o${oi}`, correct, content, ...(fb.length ? { feedback: fb } : {}), _li: li }
      })
      const extra = gi === groups.length - 1 ? pending : []
      void extra
      if (options.length < 2) return fail('E203', g.list)[0]
      if (!options.some((o) => o.correct)) return fail('E202', g.list)[0]
      if (options.length > 5) diag('W204', g.list)
      for (const o of options) if (!o.correct && !o.feedback) diag('W205', o._li, toString(o._li.children[0]).slice(0, 40))
      const len = (o: (typeof options)[number]) => toString({ type: 'paragraph', children: o.content as PhrasingContent[] }).length
      const correctLen = Math.max(...options.filter((o) => o.correct).map(len))
      const wrong = options.filter((o) => !o.correct).map(len)
      if (options.length >= 3 && wrong.length && correctLen > 1.5 * Math.max(...wrong) && correctLen - Math.max(...wrong) > 12) diag('W206', g.list)
      if (options.some((o) => /\b(all|none) of the above\b/i.test(len(o) ? toString({ type: 'paragraph', children: o.content as PhrasingContent[] }) : ''))) diag('W207', g.list)
      const texts = options.map((o) => toString({ type: 'paragraph', children: o.content as PhrasingContent[] }))
      return {
        type: 'quiz', id: id(toString({ type: 'root', children: g.stem }) + texts.join('|') + options.map((o) => +o.correct).join('')),
        stem: flow(g.stem), multi: options.filter((o) => o.correct).length > 1,
        sortNumeric: texts.every((t) => parseNumber(t.replace(/\$/g, ''), lang) !== null),
        options: options.map(({ _li, ...o }) => o), hints, ...(gi === groups.length - 1 && reveal ? { reveal } : {}),
      } as Widget
    })
  }
  if (kind === 'cloze') {
    const content = flow(main)
    const ids = blanksIn(content)
    if (!ids.length) return fail('E301', n)
    if (ids.length > 4) diag('W303', n)
    const blanks = ids.map(makeBlank)
    return [{ type: 'cloze', id: id(toString({ type: 'root', children: main }) + JSON.stringify(blanks.map((b) => b.answers))), body: content, blanks, exact: 'exact' in (n.attributes ?? {}), hints, ...(reveal ? { reveal } : {}) }]
  }
  if (kind === 'order') {
    const li = main.findIndex((b) => b.type === 'list' && b.ordered)
    if (li < 0 || (main[li] as List).children.length < 3) return fail('E210', n)
    const items = (main[li] as List).children.map((it) => it.children.flatMap((c) => clean(c, kind)))
    return [{ type: 'order', id: id(toString({ type: 'root', children: main })), prompt: flow(main.slice(0, li)), items, hints, ...(reveal ? { reveal } : {}) }]
  }
  if (kind === 'explain') {
    if (!trailing.length) return fail('E401', n)
    const lists = trailing.flatMap((b) => ('children' in b ? (b.children as RootContent[]) : [])).filter((c): c is List => c.type === 'list')
    if (!lists.length) diag('W402', trailing[0])
    const ideas = lists.length ? lists.flatMap((l) => l.children.map((it) => it.children.flatMap((c) => clean(c, kind)))) : reveal!.map((p) => [p])
    return [{ type: 'explain', id: id(toString({ type: 'root', children: body })), prompt: flow(main), ideas, hints }]
  }
  if (kind === 'steps') {
    const first = main.findIndex((b) => b.type === 'list' && b.ordered)
    if (first < 0) return fail('E403', n)
    const steps: RootContent[][] = []
    let merged = false
    for (const b of main.slice(first)) {
      if (b.type === 'list' && b.ordered) { if (steps.length) merged = true; for (const it of b.children) steps.push([...it.children]) }
      else { steps[steps.length - 1].push(b); merged = true } // unindented block after a step belongs to it
    }
    if (merged && main.slice(first).filter((b) => b.type === 'list').length > 1) diag('I405', n)
    if (steps.length < 2) return fail('E404', n)
    const stepFlows = steps.map((s) => flow(s))
    const blanks = blanksIn(stepFlows.flat()).map(makeBlank)
    return [{ type: 'steps', id: id(toString({ type: 'root', children: main })), problem: flow(main.slice(0, first)), steps: stepFlows, blanks, exact: 'exact' in (n.attributes ?? {}), hints, ...(reveal ? { reveal } : {}) }]
  }
  // code
  const fences = main.filter((b): b is CodeNode => b.type === 'code')
  if (!fences.length) return fail('E501', n)
  const role = (c: CodeNode) => (/\btest\b/.test(c.meta ?? '') ? 'test' : /\bsolution\b/.test(c.meta ?? '') ? 'solution' : 'starter')
  const langs = new Set(fences.map((f) => (f.lang ?? '').toLowerCase()))
  if (langs.size > 1) diag('E503', n, [...langs].join(', '))
  const lang0 = [...langs][0] ?? ''
  const starter = fences.find((f) => role(f) === 'starter')?.value ?? ''
  const tests = fences.find((f) => role(f) === 'test')?.value
  const solution = fences.find((f) => role(f) === 'solution')?.value
  const mode = tests && RUNNABLE.has(lang0) ? 'run' : 'self'
  if (!tests) diag('W502', n)
  else if (mode === 'self') diag('I504', n, lang0)
  return [{ type: 'code', id: id(starter + (tests ?? '') + (solution ?? '')), prompt: flow(main.filter((b) => b.type !== 'code')), lang: lang0, starter, ...(tests ? { tests } : {}), ...(solution ? { solution } : {}), mode, hints, ...(reveal ? { reveal } : {}) }]
}

const missingDocs = new Set<string>()
/** `::read[§3.1, §3.2]` or `::read[other_doc.md §2]` → read block, checked against the source. */
function readBlock(n: LeafDirective): Block[] {
  const label = toString(n)
  const refs: { doc: string; section: string; title?: string; words?: number }[] = []
  for (const part of label.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(?:(\S+\.md)\s*)?§?\s*(.+)$/.exec(part)
    if (!m) continue
    const doc = m[1] ?? meta.source
    if (!doc) { diag('W112', n, part); continue }
    const hit = opts.resolveSource?.(doc, m[2].trim())
    if (hit === 'no-document') { if (!missingDocs.has(doc)) { missingDocs.add(doc); diag('E111', n, `source document not found: ${doc} (every ::read to it is skipped)`) } continue }
    if (opts.resolveSource && !hit) { diag('E111', n, part); continue }
    refs.push({ doc, section: m[2].trim(), ...(hit ? { title: hit.title, words: hit.words } : {}) })
  }
  return refs.length ? [{ type: 'read', refs }] : []
}
const toBlocks = (nodes: RootContent[], cardId: string): Block[] => nodes.flatMap((n): Block[] => {
  if (n.type === 'leafDirective' && n.name === 'read') return readBlock(n)
  if (n.type === 'containerDirective' && (WIDGETS as readonly string[]).includes(n.name)) return widget(n, cardId)
  if (n.type === 'containerDirective' && (VISUALS as readonly string[]).includes(n.name)) {
    const pinned = (n.attributes as Record<string, string> | undefined)?.id
    return buildVisual(n, { clean: (x) => clean(x, null), diag, checkJs: ctx.checkJs,
      id: (key) => uniqueId(pinned ? `${cardId}/${pinned}` : `${cardId}/${n.name}-${fingerprint(key)}`) })
  }
  if (n.type === 'containerDirective' && !(CALLOUTS as readonly string[]).includes(n.name)) {
    diag('E103', n, n.name)
    const fallback = ctx.document ? n.children.flatMap((c) => clean(c, null)) : []
    return [{ type: 'unavailable', id: `${cardId}/x-${++widgetSeq}`, kind: n.name, codes: ['E103'], ...(fallback.length ? { fallback } : {}) }]
  }
  return clean(n, null).map((node) => (node.type === 'callout' ? (node as unknown as Block) : { type: 'prose', node }))
})


  return { clean, toBlocks }
}

/** ✅ / "(correct)" markers → true; ✗ / "(wrong)" → false; none → null. */
function markerCorrect(li: ListItem): boolean | null {
  const t = toString(li.children[0] ?? { type: 'text', value: '' }).trim()
  if (/(✅|✔|☑|\((?:correct|right|corretta|correcta)\)|\*\*correct\*\*)\s*$/i.test(t)) return true
  if (/(❌|✗|✘|\((?:wrong|incorrect)\))\s*$/i.test(t)) return false
  return null
}
function stripMarker(content: MdNode[]) {
  const last = content[content.length - 1]
  if (last?.type === 'text') last.value = (last.value as string).replace(/\s*(✅|✔|☑|❌|✗|✘|\((?:correct|right|wrong|incorrect|corretta|correcta)\))\s*$/i, '')
}
/** URL allowlist: links http(s)/mailto/relative (react-markdown's policy); images https/relative only. */
export function safeUrl(url: string, image: boolean): string {
  const colon = url.indexOf(':'), q = url.indexOf('?'), h = url.indexOf('#'), sl = url.indexOf('/')
  if (colon < 0 || (sl > -1 && colon > sl) || (q > -1 && colon > q) || (h > -1 && colon > h)) return url
  const proto = url.slice(0, colon).toLowerCase()
  return (image ? proto === 'https' : /^(https?|mailto)$/.test(proto)) ? url : ''
}
