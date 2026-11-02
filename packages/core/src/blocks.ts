// Block building shared by lessons (compile) and documents (parseDocument): mdast → CourseAST blocks
// (prose, callouts, read panels, widgets), with the same sanitising, TeX checks and widget rules.
import { toString } from 'mdast-util-to-string'
import katex from 'katex'
import type { Root, RootContent, Nodes, PhrasingContent, List, ListItem, Code as CodeNode } from 'mdast'
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive'
import { PH_OPEN, PH_CLOSE, PH_STRAY, WIDGETS, CALLOUTS, VISUALS, type Stage0Result } from './stage0.js'
import { buildVisual } from './visuals.js'
import { buildGame, GAME_TYPES } from './games.js'
import { type Code } from './registry.js'
import { type Blank, type Block, type MdNode, type VideoBlock, type Widget } from './ast.js'
import { parseTime, parseVideoUrl } from './video.js'
import { mathKeyEvaluable, parseNumber } from './checkers.js'
import { processor } from './parser.js'
import { CONTAINER_TAGS, cleanAttrs, groupFlowHtml, isMarkTone, pairInline, parseTag, summaryMarkdown, unsafeHtml, type HtmlContainerNode, type HtmlPairNode } from './html.js'

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
  /** Document mode: unknown directives keep their content. */
  document?: boolean
  /** Node-only syntax check for simulation code. */
  checkJs?: (code: string) => string | null
  /** Whether a file exists, by its path relative to the lesson or document (`::video` files and captions). */
  fileExists?: (path: string) => boolean
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

/** Phrasing parents' children pair inline HTML tags; flow children group container HTML (§4, html.ts). */
const PHRASING = new Set(['text', 'emphasis', 'strong', 'delete', 'inlineCode', 'inlineMath', 'link', 'image', 'break', 'linkReference', 'imageReference', 'footnoteReference'])
const cleanAll = (nodes: Nodes[], inWidget: string | null): MdNode[] =>
  (nodes.some((c) => PHRASING.has(c.type)) ? pairInline(nodes) : groupFlowHtml(nodes as RootContent[]) as Nodes[]).flatMap((c) => clean(c, inWidget))
const phrasingOf = (md: string, inWidget: string | null): MdNode[] => {
  const para = (processor.parse(md) as Root).children[0]
  return para && 'children' in para ? cleanAll(para.children as Nodes[], inWidget) : []
}

const clean = (n: Nodes, inWidget: string | null): MdNode[] => {
  // strip position & data (data.hName/hProperties are an injection vector), resolve placeholders
  if (n.type === 'html') {
    if (/^\s*<!--/.test(n.value)) return []
    const unsafe = unsafeHtml(n.value)
    if (unsafe) diag('E107', n, unsafe)
    const tag = parseTag(n.value)
    if (!tag) return [{ type: 'htmlRaw', value: n.value }] // a block of HTML: sanitised by the player
    if (tag.name === 'br' && !tag.close) return [{ type: 'break' }]
    if (tag.name === 'hr' && !tag.close) return [{ type: 'thematicBreak' }]
    if (tag.name === 'wbr' || unsafe) return []
    if (tag.name === 'img' && !tag.close) {
      if (!tag.attrs.alt) diag('W604', n)
      const url = safeUrl(tag.attrs.src ?? '', true), width = Number(tag.attrs.width)
      return url ? [{ type: 'image', url, alt: tag.attrs.alt ?? '', ...(tag.attrs.title ? { title: tag.attrs.title } : {}), ...(width > 0 ? { width } : {}) }] : []
    }
    return [{ type: 'text', value: n.value }] // an unknown or unpaired tag is shown as written (`List<T>`)
  }
  if ((n.type as string) === 'htmlPair') {
    const { tag, children } = n as unknown as HtmlPairNode
    if (Object.keys(tag.attrs).some((k) => k.startsWith('on'))) diag('E107', n, 'on… handler is removed')
    if (tag.name === 'mark' && 'data-tone' in tag.attrs && !isMarkTone(tag.attrs['data-tone'])) diag('W612', n, tag.attrs['data-tone'])
    const kids = cleanAll(children, inWidget)
    if (tag.name === 'a') return [{ type: 'link', url: safeUrl(tag.attrs.href ?? '', false), ...(tag.attrs.title ? { title: tag.attrs.title } : {}), children: kids }]
    return [{ type: 'htmlInline', tag: tag.name === 'font' ? 'span' : tag.name, attrs: cleanAttrs(tag), children: kids }]
  }
  if ((n.type as string) === 'htmlContainer') {
    const c = n as unknown as HtmlContainerNode
    if (Object.keys(c.tag.attrs).some((k) => k.startsWith('on'))) diag('E107', n, 'on… handler is removed')
    return [{ type: 'htmlBlock', tag: c.tag.name === 'center' ? 'div' : c.tag.name, attrs: cleanAttrs(c.tag),
      ...(c.summary !== undefined ? { summary: phrasingOf(summaryMarkdown(c.summary) || 'Details', inWidget) } : {}),
      children: cleanAll(c.children as Nodes[], inWidget) }]
  }
  if (n.type === 'text') return splitPlaceholders(n.value, n)
  // a video inside running text cannot play there: an online one becomes a link to it, a file its title
  if (n.type === 'image' && parseVideoUrl(n.url)) {
    const label: MdNode = { type: 'text', value: n.alt || n.url }
    return parseVideoUrl(n.url)!.source.kind === 'file' ? [label] : [{ type: 'link', url: safeUrl(n.url, false), children: [label] }]
  }
  if (n.type === 'image') { if (!n.alt) diag('W604', n); return [{ type: 'image', url: safeUrl(n.url, true), alt: n.alt ?? '', title: n.title ?? undefined }] }
  if (n.type === 'link') return [{ type: 'link', url: safeUrl(n.url, false), title: n.title ?? undefined, children: cleanAll(n.children, inWidget) }]
  if (n.type === 'math' || n.type === 'inlineMath') {
    const blanks: string[] = []
    const value = n.value.replace(new RegExp(`${PH_OPEN}(b\\d+)${PH_CLOSE}`, 'g'), (_, id) => (blanks.push(id), `\\placeholder[${id}]{}`))
    checkTex(value, n, n.type === 'math')
    return [{ type: n.type, value, ...(blanks.length ? { blanks } : {}) }]
  }
  if (n.type === 'containerDirective' && (CALLOUTS as readonly string[]).includes(n.name)) return [callout(n, inWidget) as unknown as MdNode]
  if (n.type === 'containerDirective' && (VISUALS as readonly string[]).includes(n.name)) { diag('W918', n, n.name); return cleanAll(n.children, inWidget) }
  if (n.type === 'leafDirective' && n.name === 'read') { diag('W113', n); return [] }
  if (n.type === 'leafDirective' && n.name === 'video') { diag('W918', n, 'video'); return [] }
  if (n.type === 'containerDirective' || n.type === 'leafDirective') { diag(n.type === 'leafDirective' ? 'E104' : 'E103', n, n.name); return [] }
  if (n.type === 'textDirective' || n.type === 'yaml' || n.type === 'definition' || n.type === 'footnoteDefinition' || n.type === 'footnoteReference' || n.type === 'linkReference' || n.type === 'imageReference') {
    return 'children' in n ? cleanAll(n.children as Nodes[], inWidget) : []
  }
  const out: Record<string, unknown> = { type: n.type }
  for (const [k, v] of Object.entries(n)) if (!['type', 'position', 'data', 'children'].includes(k) && v !== null && v !== undefined) out[k] = v
  if (n.type === 'listItem' && !inWidget) delete out.checked // stray task lists never reveal check state
  if ('children' in n) out.children = cleanAll(n.children as Nodes[], inWidget)
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
    ...(label && 'children' in label ? { summary: cleanAll(label.children, inWidget) } : {}),
    children: cleanAll(kids, inWidget) }
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
      hints.push(cleanAll(ph ? sideHint(ph[1]) : (c as LeafDirective).children, kind))
    } else if (c.type === 'containerDirective' && (WIDGETS as readonly string[]).includes(c.name)) {
      body.push({ type: 'paragraph', children: [] }) // locked nested widget; reported in stage 0 (E106)
    } else body.push(c)
  }
  let r = body.length
  while (r > 0 && body[r - 1].type === 'blockquote') r--
  const main = body.slice(0, r), trailing = body.slice(r)
  const revealOf = (nodes: RootContent[]) => cleanAll(nodes.flatMap((b) => ('children' in b ? (b.children as Nodes[]) : [])), kind)
  const reveal = trailing.length ? revealOf(trailing) : undefined
  const answerLabel = main.find((b) => /^(answer|solution|risposta|soluzione|respuesta|solución)\s*:/i.test(toString(b)))
  if (answerLabel) diag('W606', answerLabel)
  const pinned = (n.attributes as Record<string, string> | undefined)?.id
  const id = (key: string) => uniqueId(pinned ? `${cardId}/${pinned}` : `${cardId}/${kind}-${fingerprint(key)}`)
  const flow = (nodes: RootContent[]) => cleanAll(nodes, kind)
  const fail = (code: Code, node: Nodes, msg?: string): Widget[] => {
    diag(code, node, msg)
    return [{ type: 'unavailable', id: `${cardId}/${kind}-${++widgetSeq}`, kind, codes: [code] }]
  }

  if ((GAME_TYPES as readonly string[]).includes(kind)) {
    return buildGame({ kind: kind as (typeof GAME_TYPES)[number], directive: n, main, cleanAll: (xs) => cleanAll(xs, kind), diag, id, fail, hints, ...(reveal ? { reveal } : {}) })
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
        const content = first && first.type === 'paragraph' ? cleanAll(first.children, kind) : []
        stripMarker(content)
        const fb = cleanAll(rest.filter((x) => x.type === 'blockquote').flatMap((x) => ('children' in x ? (x.children as Nodes[]) : [])), kind)
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
    const items = (main[li] as List).children.map((it) => cleanAll(it.children, kind))
    return [{ type: 'order', id: id(toString({ type: 'root', children: main })), prompt: flow(main.slice(0, li)), items, hints, ...(reveal ? { reveal } : {}) }]
  }
  if (kind === 'explain') {
    if (!trailing.length) return fail('E401', n)
    const lists = trailing.flatMap((b) => ('children' in b ? (b.children as RootContent[]) : [])).filter((c): c is List => c.type === 'list')
    if (!lists.length) diag('W402', trailing[0])
    const ideas = lists.length ? lists.flatMap((l) => l.children.map((it) => cleanAll(it.children, kind))) : reveal!.map((p) => [p])
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
/** The label of a leaf directive exactly as written (Markdown would read `my_clip.mp4` as emphasis). */
function rawLabel(n: LeafDirective): string {
  const from = n.position?.start.offset, to = n.position?.end.offset
  const m = from !== undefined && to !== undefined ? /^::[a-z]+\[([^\]\n]*)\]/.exec(s0.text.slice(from, to)) : null
  return (m ? m[1] : toString(n)).trim()
}
/** `::video[path or link]{start end title captions}` → video block; null when it cannot play (E928/E929/E930). */
function videoBlock(n: LeafDirective, cardId: string): VideoBlock | null {
  return videoFrom(rawLabel(n), (n.attributes ?? {}) as Record<string, string | null | undefined>, n, cardId)
}
/** The video block for an address and its attributes (`::video`, or an image whose address is a video). */
function videoFrom(raw: string, a: Record<string, string | null | undefined>, n: Positioned, cardId: string): VideoBlock | null {
  const parsed = parseVideoUrl(raw)
  if (!parsed) { diag('E928', n, raw || 'no address'); return null }
  const time = (key: 'start' | 'end'): number | undefined | false => {
    const v = a[key]
    if (v === undefined || v === null || v === '') return key === 'start' ? parsed.start : undefined
    const t = parseTime(v)
    if (t === null) { diag('E930', n, `${key}=${v}`); return false }
    return t
  }
  const start = time('start'), end = time('end')
  if (start === false || end === false) return null
  if (start !== undefined && end !== undefined && start >= end) { diag('E930', n, `start ${start}s is not before end ${end}s`); return null }
  const captions = a.captions?.trim() || undefined
  if (parsed.source.kind === 'file') {
    if (ctx.fileExists && !ctx.fileExists(parsed.source.path)) { diag('E929', n, parsed.source.path); return null }
    if (captions && ctx.fileExists && !ctx.fileExists(captions)) diag('E929', n, `captions: ${captions}`)
    if (!captions) diag('I933', n)
  }
  const pinned = a.id ?? undefined
  return { type: 'video', id: uniqueId(pinned ? `${cardId}/${pinned}` : `${cardId}/video-${fingerprint(raw)}`), source: parsed.source,
    ...(a.title ? { title: a.title } : {}), ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}),
    ...(captions && /\.vtt$/i.test(captions) && !/^[a-z][a-z0-9+.-]*:|^[\\/]/i.test(captions) ? { captions } : {}), checkpoints: [] }
}
/** `{at=…}` on a question: a checkpoint of the card's last video, if playback can reach it (W931/W932/E930). */
function checkpoint(video: VideoBlock | null, n: ContainerDirective, built: Widget[]) {
  const at = (n.attributes as Record<string, string | null | undefined> | undefined)?.at
  if (at === undefined || at === null) return
  const w = built[0]
  if (!w || w.type === 'unavailable') return
  if (!video) { diag('W932', n); return }
  const t = parseTime(at)
  if (t === null) { diag('E930', n, `at=${at}`); return }
  // playback starts at `start`, so it never reaches a checkpoint there or before it
  if (t <= (video.start ?? 0) || (video.end !== undefined && t > video.end)) { diag('W931', n, `at=${at}`); return }
  video.checkpoints.push({ at: t, widget: w.id })
  video.checkpoints.sort((x, y) => x.at - y.at)
}
// the last video of the card (or, in a document, the section): questions after it with {at=…} are its checkpoints
let lastVideo: { card: string; block: VideoBlock } | null = null
const toBlocks = (nodes: RootContent[], cardId: string): Block[] => {
  if (lastVideo?.card !== cardId) lastVideo = null
  const seen = (v: VideoBlock | null): Block[] => { if (v) lastVideo = { card: cardId, block: v }; return v ? [v] : [] }
  return groupFlowHtml(nodes, CONTAINER_TAGS).flatMap((n): Block[] => {
  if (n.type === 'leafDirective' && n.name === 'read') return readBlock(n)
  if (n.type === 'leafDirective' && n.name === 'video') return seen(videoBlock(n, cardId))
  // a paragraph that is only `![title](clip.mp4)` or `![title](https://youtu.be/…)` embeds the video, as in Obsidian
  if (n.type === 'paragraph' && n.children.length === 1 && n.children[0].type === 'image' && parseVideoUrl(n.children[0].url)) {
    const img = n.children[0]
    return seen(videoFrom(img.url, { title: img.alt || undefined }, n, cardId))
  }
  if (n.type === 'containerDirective' && (WIDGETS as readonly string[]).includes(n.name)) { const built = widget(n, cardId); checkpoint(lastVideo?.block ?? null, n, built); return built }
  if (n.type === 'containerDirective' && (VISUALS as readonly string[]).includes(n.name)) {
    const pinned = (n.attributes as Record<string, string> | undefined)?.id
    return buildVisual(n, { clean: (x) => clean(x, null), cleanAll: (xs) => cleanAll(xs, null), diag, checkJs: ctx.checkJs,
      id: (key) => uniqueId(pinned ? `${cardId}/${pinned}` : `${cardId}/${n.name}-${fingerprint(key)}`) })
  }
  if (n.type === 'containerDirective' && !(CALLOUTS as readonly string[]).includes(n.name)) {
    diag('E103', n, n.name)
    const fallback = ctx.document ? cleanAll(n.children, null) : []
    return [{ type: 'unavailable', id: `${cardId}/x-${++widgetSeq}`, kind: n.name, codes: ['E103'], ...(fallback.length ? { fallback } : {}) }]
  }
  return clean(n, null).map((node) => (node.type === 'callout' ? (node as unknown as Block) : { type: 'prose', node }))
  })
}


  return { clean, cleanAll, toBlocks }
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
