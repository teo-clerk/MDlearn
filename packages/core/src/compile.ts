// Stages 1–3: remark parse (block-only directives) → tree repair & validation → CourseAST.
import { toString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'
import YAML from 'yaml'
import type { Root, RootContent, Nodes } from 'mdast'
import { stage0, type Stage0Result } from './stage0.js'
import { blockBuilder, safeUrl, type SourceResolver } from './blocks.js'
import { VISUAL_MINUTES } from './visuals.js'
import { type Code, type Diagnostic } from './registry.js'
import { FrontmatterSchema, FRONTMATTER_SYNONYMS, LessonSchema, type Block, type Card, type Lesson, isWidget } from './ast.js'

import { processor } from './parser.js'
export { processor, remarkBlockDirectives } from './parser.js'

/** `## Title {#id}`. An id holds what a slug can, so that a card with an Italian or French title can keep the id it was given. */
export const CARD_ID = /\{#([\p{L}\p{M}\p{N}_-]+)\}\s*$/u

export interface CompileResult {
  lesson: Lesson | null; diagnostics: Diagnostic[]; stage0: Stage0Result
  /** The source line of each card's heading, in card order. */
  cardLines: number[]
}
export type { SourceResolver }
export interface CompileOptions {
  path?: string; resolveSource?: SourceResolver; checkJs?: (code: string) => string | null
  /** Whether a file exists, relative to the lesson (`::video`); without it files are not checked. */
  fileExists?: (path: string) => boolean
}
/** Heuristic minutes per widget for the time estimate (reading is estimated at 180 words/min). */
const WIDGET_MINUTES: Record<string, number> = { quiz: 0.5, cloze: 0.5, order: 0.75, explain: 1.5, steps: 1.5, code: 3, match: 1, sort: 1, speed: 1.5, ...VISUAL_MINUTES }

export function compile(source: string, opts: CompileOptions = {}): CompileResult {
  const s0 = stage0(source)
  const diagnostics: Diagnostic[] = [...s0.diagnostics]
  const lineOf = (n: { position?: { start: { line: number; column: number } } } | undefined) =>
    n?.position ? s0.lineMap[n.position.start.line - 1] ?? n.position.start.line : 1
  const diag = (code: Code, node: Parameters<typeof lineOf>[0] | number, message?: string) =>
    diagnostics.push({ code, line: typeof node === 'number' ? node : lineOf(node), message })

  // ---- frontmatter
  let fm: Record<string, unknown> = {}
  if (s0.frontmatter) {
    try {
      const raw = YAML.parse(s0.frontmatter.raw) ?? {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const key = FRONTMATTER_SYNONYMS[k.toLowerCase()] ?? k.toLowerCase()
        if (key !== k) diag('I815', s0.frontmatter.line, `${k} → ${key}`)
        fm[key] = v
      }
    } catch (e) { diag('E101', s0.frontmatter.line, (e as Error).message.split('\n')[0]); fm = {} }
  }
  for (const k of Object.keys(fm)) if (!(k in FrontmatterSchema.shape)) { diag('I817', s0.frontmatter?.line ?? 1, k); delete fm[k] }
  let parsedFm = FrontmatterSchema.safeParse(fm)
  if (!parsedFm.success) { // drop each offending key, keep the rest (lenient reader)
    for (const iss of parsedFm.error.issues) { diag('E101', s0.frontmatter?.line ?? 1, `${iss.path.join('.')}: ${iss.message}`); delete fm[String(iss.path[0])] }
    parsedFm = FrontmatterSchema.safeParse(fm)
  }
  const meta = parsedFm.success ? parsedFm.data : FrontmatterSchema.parse({})
  const lang = meta.lang

  // ---- parse
  const tree = processor.parse(s0.text) as Root
  // ---- title & headings
  let children = tree.children.filter((n) => {
    if (n.type === 'html') return !/^\s*<!--[\s\S]*-->\s*$/.test(n.value) // comments are annotations; other HTML is sanitised (§4)
    if (n.type === 'definition' || n.type === 'thematicBreak') return false
    return true
  })
  let title = meta.title
  const firstH1 = children.findIndex((n) => n.type === 'heading' && n.depth === 1)
  if (firstH1 >= 0) { if (!title) title = toString(children[firstH1]); diag('I816', children[firstH1]); children = children.filter((_, i) => i !== firstH1) }
  if (!title) diag('E102', 1)
  let cardDepth = 2
  if (!children.some((n) => n.type === 'heading' && n.depth === 2) && children.some((n) => n.type === 'heading' && n.depth === 3)) {
    cardDepth = 3; diag('W608', children.find((n) => n.type === 'heading')!)
  }

  // ---- blocks
  const { toBlocks } = blockBuilder({ s0, macros: meta.macros, source: meta.source, lang, diag, resolveSource: opts.resolveSource, ...(opts.checkJs ? { checkJs: opts.checkJs } : {}), ...(opts.fileExists ? { fileExists: opts.fileExists } : {}) })
  const slugger = new GithubSlugger()

  // ---- cards
  const isCard = (n: RootContent) => n.type === 'heading' && n.depth === cardDepth
  const firstCard = children.findIndex(isCard)
  const intro = toBlocks(firstCard < 0 ? children : children.slice(0, firstCard), 'intro').map((b): Block => {
    if (!isWidget(b)) return b
    diag('W609', 1, b.type); return { type: 'unavailable', id: b.id, kind: b.type, codes: ['W609'] }
  })
  const cards: Card[] = [], cardLines: number[] = []
  for (let i = Math.max(firstCard, 0); firstCard >= 0 && i < children.length; ) {
    const h = children[i]
    let j = i + 1; while (j < children.length && !isCard(children[j])) j++
    const ctitle = toString(h).replace(CARD_ID, '').trimEnd()
    const explicit = CARD_ID.exec(toString(h))?.[1]
    const slugged = slugger.slug(explicit ?? ctitle) // an explicit id is counted too, so a card of the same title can't take it
    const cid = explicit ?? slugged
    const blocks = toBlocks(children.slice(i + 1, j), cid)
    cards.push({ id: cid, title: headingTitle(h).replace(CARD_ID, '').trimEnd(), blocks })
    cardLines.push(lineOf(h))
    cardLint(blocks, children.slice(i + 1, j), h)
    i = j
  }
  // retrieval gap & lesson length (heuristics)
  let gap = 0
  for (const [ci, c] of cards.entries()) {
    gap = c.blocks.some((b) => isWidget(b)) ? 0 : gap + 1
    if (gap === 4) diag('W602', 1, `cards ending at "${cards[ci].title}"`)
  }
  if (cards.length > 15) diag('W603', 1, `${cards.length} cards`)

  function cardLint(blocks: Block[], raw: RootContent[], heading: RootContent) {
    const prose = raw.filter((n) => n.type !== 'containerDirective')
    const words = toString({ type: 'root', children: prose }).split(/\s+/).filter(Boolean).length
    if (words > 150) diag('W601', heading, `${words} words`)
    const marked = markedPhrases(prose), markedWords = marked.join(' ').split(/\s+/).filter(Boolean).length
    if (marked.length > MAX_MARKS || markedWords > Math.max(MIN_MARKED_WORDS, words / 6)) diag('W610', heading, `${marked.length} marks, ${markedWords} of ${words} words`)
    const expo = toString({ type: 'root', children: prose }).toLowerCase()
    for (const b of blocks) {
      const keys = b.type === 'cloze' || b.type === 'steps' ? b.blanks.filter((x) => x.kind === 'text').flatMap((x) => x.answers) : []
      for (const k of keys) if (k.length > 3 && new RegExp(`\\b${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(expo)) diag('I605', heading, k)
    }
  }

  const estimate = Math.max(1, Math.round(
    cards.reduce((t, c) => t + c.blocks.reduce((s, b) => s + blockMinutes(b), 0), 0) +
    toString(tree).split(/\s+/).length / 180))
  if (meta.time && Math.abs(meta.time - estimate) / estimate > 0.5) diag('I607', s0.frontmatter?.line ?? 1, `declared ${meta.time}, estimated ${estimate}`)

  const lessonId = meta.id ?? (opts.path ? opts.path.split('/').pop()!.replace(/\.learn\.md$|\.md$/, '').replace(/^\d+[-_]/, '') : slugger.slug(title ?? 'lesson'))
  diagnostics.sort((a, b) => a.line - b.line)
  const candidate = { astVersion: 1, id: lessonId, title: title ?? '', level: meta.level, lang, prereq: meta.prereq, goals: meta.goals,
    ...(meta.source ? { source: meta.source } : {}),
    ...(meta.time ? { time: meta.time } : {}), timeEstimate: estimate, macros: meta.macros, intro, cards }
  const checked = LessonSchema.safeParse(candidate)
  if (!checked.success) throw new Error('compiler produced invalid CourseAST: ' + checked.error.message)
  // only a missing title or a truncated file stops the whole lesson; everything else fails closed per widget
  return { lesson: diagnostics.some((d) => d.code === 'E102' || d.code === 'E109') ? null : checked.data, diagnostics, stage0: s0, cardLines }
}

/** Minutes a block adds to the estimate: a video its segment when its length is known (else 2). */
function blockMinutes(b: Block): number {
  if (b.type !== 'video') return WIDGET_MINUTES[b.type] ?? 0
  return b.end !== undefined ? (b.end - (b.start ?? 0)) / 60 : 2
}

const MAX_MARKS = 3, MIN_MARKED_WORDS = 6
/** The text inside each `<mark>…</mark>`: Markdown parses the tags as separate nodes around it. */
function markedPhrases(nodes: RootContent[]): string[] {
  const out: string[] = []
  const walk = (list: Nodes[]) => {
    let open: string | null = null
    for (const n of list) {
      const html = n.type === 'html' ? (n as { value?: string }).value ?? '' : ''
      if (/^<mark\b/i.test(html)) open = ''
      else if (/^<\/mark>/i.test(html)) { if (open !== null) out.push(open); open = null }
      else if (open !== null) open += toString(n)
      else if ('children' in n) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** Heading text that keeps inline math as `$…$`, so surfaces can render it (ids still use plain text). */
function headingTitle(h: RootContent): string {
  const walk = (n: Nodes): string => n.type === 'inlineMath' ? `$${n.value}$` : 'children' in n ? (n.children as Nodes[]).map(walk).join('') : 'value' in n ? String(n.value) : ''
  return walk(h).trim()
}

export { isWidget }
export { safeUrl }

