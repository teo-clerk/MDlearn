// CourseAST — the JSON contract between compiler and player (astVersion 1).
import { z } from 'zod'

/** mdast node types allowed inside Prose (no html, no definitions, no directives). */
export const PROSE_TYPES = [
  'paragraph', 'heading', 'list', 'listItem', 'blockquote', 'table', 'tableRow', 'tableCell', 'code', 'thematicBreak',
  'math', 'inlineMath', 'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'break', 'link', 'image',
  'blank', 'strayBlank', 'callout',
  // safe HTML (v1.3): an allowlisted inline element, a container around Markdown, a raw block the player sanitises
  'htmlInline', 'htmlBlock', 'htmlRaw',
] as const
export interface MdNode { type: (typeof PROSE_TYPES)[number]; children?: MdNode[]; [k: string]: unknown }

const MdNodeSchema: z.ZodType<MdNode> = z.lazy(() =>
  z.looseObject({ type: z.enum(PROSE_TYPES), children: z.array(MdNodeSchema).optional() }),
) as z.ZodType<MdNode>
const Flow = z.array(MdNodeSchema)
const Phrasing = z.array(MdNodeSchema)

export const BlankSchema = z.object({
  id: z.string(), kind: z.enum(['text', 'number', 'math']), answers: z.array(z.string()).min(1),
  tol: z.object({ abs: z.number().optional(), rel: z.number().optional() }).optional(),
  hint: z.string().optional(),
})
const base = { id: z.string(), hints: z.array(Phrasing), reveal: Flow.optional() }
export const WidgetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quiz'), ...base, stem: Flow, multi: z.boolean(), sortNumeric: z.boolean(),
    options: z.array(z.object({ id: z.string(), correct: z.boolean(), content: Phrasing, feedback: Flow.optional() })).min(2) }),
  z.object({ type: z.literal('cloze'), ...base, body: Flow, blanks: z.array(BlankSchema).min(1), exact: z.boolean() }),
  z.object({ type: z.literal('order'), ...base, prompt: Flow, items: z.array(Flow).min(3) }),
  z.object({ type: z.literal('explain'), ...base, prompt: Flow, ideas: z.array(Flow).min(1) }),
  z.object({ type: z.literal('steps'), ...base, problem: Flow, steps: z.array(Flow).min(2), blanks: z.array(BlankSchema), exact: z.boolean() }),
  z.object({ type: z.literal('code'), ...base, prompt: Flow, lang: z.string(), starter: z.string(),
    tests: z.string().optional(), solution: z.string().optional(), mode: z.enum(['run', 'self']) }),
  // games (v1.3): graded like the others, played with motion in the Studio
  z.object({ type: z.literal('match'), ...base, prompt: Flow, pairs: z.array(z.object({ left: Phrasing, right: Phrasing })).min(3), memory: z.boolean() }),
  z.object({ type: z.literal('sort'), ...base, prompt: Flow, groups: z.array(z.object({ label: Phrasing, items: z.array(Phrasing).min(1) })).min(2) }),
  z.object({ type: z.literal('speed'), ...base, prompt: Flow, items: z.array(z.object({ content: Phrasing, truth: z.boolean(), feedback: Flow.optional() })).min(3),
    /** Seconds for the whole round; none = untimed. */
    time: z.number().optional() }),
  z.object({ type: z.literal('unavailable'), id: z.string(), kind: z.string(), codes: z.array(z.string()),
    /** Content still worth showing (documents: an unknown directive's body; visuals: caption and formula). */
    fallback: Flow.optional() }),
])
// ---------------------------------------------------------------- visual blocks (never graded)
type MathJsonT = number | string | { num: string } | MathJsonT[]
const MathJsonSchema: z.ZodType<MathJsonT> = z.lazy(() => z.union([z.number(), z.string(), z.object({ num: z.string() }), z.array(MathJsonSchema)])) as z.ZodType<MathJsonT>
export const ParamSchema = z.object({
  /** Evaluation name in the MathJSON (v0, v1, …). */
  id: z.string(),
  /** The symbol as written (TeX). */
  sym: z.string(),
  /** Identifier for simulation code (`api.params.P_t`). */
  key: z.string(),
  label: Phrasing, value: z.number().optional(), min: z.number().optional(), max: z.number().optional(),
  log: z.boolean(), step: z.number().optional(), unit: z.string().optional(),
})
export const VisualCurveSchema = z.object({ tex: z.string(), lhs: z.string().optional(), expr: MathJsonSchema })
const visualBase = { id: z.string(), caption: Phrasing.optional(), body: Flow }
export const VisualSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plot'), ...visualBase, curves: z.array(VisualCurveSchema).min(1).max(4), params: z.array(ParamSchema), x: z.string(),
    xScale: z.enum(['linear', 'log']), yScale: z.enum(['linear', 'log']), height: z.number() }),
  z.object({ type: z.literal('formula'), ...visualBase, tex: z.string(), marked: z.string(),
    terms: z.array(z.object({ i: z.number(), tex: z.string(), label: Phrasing })), params: z.array(ParamSchema),
    live: z.object({ lhs: z.string().optional(), expr: MathJsonSchema }).optional() }),
  // a frame is a formula with a caption, or (v1.3) any Markdown; `replace` shows one frame at a time
  z.object({ type: z.literal('animate'), ...visualBase, frames: z.array(z.object({ tex: z.string().optional(), caption: Flow })).min(2), auto: z.boolean(), replace: z.boolean() }),
  z.object({ type: z.literal('sim'), ...visualBase, code: z.string(), params: z.array(ParamSchema), height: z.number() }),
  /** Author HTML/CSS/JS run in a sandbox (v1.3); `height` unset = fit the content. */
  z.object({ type: z.literal('html'), ...visualBase, code: z.string(), height: z.number().optional(), auto: z.boolean() }),
])
export type Param = z.infer<typeof ParamSchema>
export type VisualCurve = z.infer<typeof VisualCurveSchema>
export type Visual = z.infer<typeof VisualSchema>

export const ReadRefSchema = z.object({ doc: z.string(), section: z.string(), title: z.string().optional(), words: z.number().optional() })
export const VideoSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string() }),
  z.object({ kind: z.literal('youtube'), id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
  z.object({ kind: z.literal('vimeo'), id: z.string().regex(/^\d{1,12}$/), hash: z.string().regex(/^[0-9a-f]{6,20}$/i).optional() }),
])
/** A video (v1.4), never graded; `checkpoints` are questions of the same card it pauses for (seconds, widget id). */
export const VideoBlockSchema = z.object({ type: z.literal('video'), id: z.string(), source: VideoSourceSchema, title: z.string().optional(),
  start: z.number().optional(), end: z.number().optional(), captions: z.string().optional(),
  checkpoints: z.array(z.object({ at: z.number(), widget: z.string() })) })
export const BlockSchema = z.union([
  z.object({ type: z.literal('prose'), node: MdNodeSchema }),
  z.object({ type: z.literal('read'), refs: z.array(ReadRefSchema).min(1) }),
  z.object({ type: z.literal('callout'), kind: z.enum(['note', 'tip', 'important', 'warning']), fold: z.boolean(),
    summary: Phrasing.optional(), children: Flow }),
  WidgetSchema,
  VisualSchema,
  VideoBlockSchema,
])
export const CardSchema = z.object({ id: z.string(), title: z.string(), blocks: z.array(BlockSchema) })
export const LessonSchema = z.object({
  astVersion: z.literal(1),
  id: z.string(), title: z.string(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  lang: z.string(), prereq: z.array(z.string()), goals: z.array(z.string()),
  time: z.number().optional(), timeEstimate: z.number(),
  macros: z.record(z.string(), z.string()),
  source: z.string().optional(),
  intro: z.array(BlockSchema), cards: z.array(CardSchema),
})
/** Graded, interactive block types. */
export const WIDGET_TYPES = ['quiz', 'cloze', 'order', 'explain', 'steps', 'code', 'match', 'sort', 'speed'] as const satisfies readonly Exclude<z.infer<typeof WidgetSchema>['type'], 'unavailable'>[]
// every widget type of the schema must be listed (a new widget type that is missing here fails to compile)
type _AllWidgetsListed = Exclude<z.infer<typeof WidgetSchema>['type'], 'unavailable' | (typeof WIDGET_TYPES)[number]> extends never ? true : never
const _allWidgetsListed: _AllWidgetsListed = true
/** An allowlist: any other block type (prose, callouts, read panels, visuals, placeholders) is never graded. */
export const isWidget = (b: Block): b is Exclude<Widget, { type: 'unavailable' }> => (WIDGET_TYPES as readonly string[]).includes(b.type)
export type Blank = z.infer<typeof BlankSchema>
export type Widget = z.infer<typeof WidgetSchema>
export type Block = z.infer<typeof BlockSchema>
export type Card = z.infer<typeof CardSchema>
export type Lesson = z.infer<typeof LessonSchema>
export type ReadRef = z.infer<typeof ReadRefSchema>
export type VideoBlock = z.infer<typeof VideoBlockSchema>

/** Frontmatter: synonyms are mapped *before* strict validation. */
export const FRONTMATTER_SYNONYMS: Record<string, string> = {
  objectives: 'goals', outcomes: 'goals', learning_goals: 'goals',
  prerequisites: 'prereq', requires: 'prereq', prereqs: 'prereq',
  duration: 'time', minutes: 'time', estimated_time: 'time',
  difficulty: 'level', language: 'lang', name: 'title',
}
export const FrontmatterSchema = z.strictObject({
  title: z.string().min(1).optional(),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  lang: z.string().default('en'),
  prereq: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])).default([]),
  goals: z.array(z.string()).max(6).default([]),
  time: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'number' ? v : parseFloat(v))).pipe(z.number().positive()).optional(),
  source: z.string().optional(),
  /** A note in a plain `.md` file whose exercises are studied too: it reads as a document, not as cards. */
  study: z.boolean().optional(),
  macros: z.record(z.string().regex(/^\\[A-Za-z]+$/), z.string().refine((s) => !/[\u0000-\u001f]/.test(s), 'control character (use single quotes for TeX)')).default({}),
})

// Custom mdast nodes produced by the compiler (blanks and callouts inside prose).
declare module 'mdast' {
  interface BlankNode extends Node { type: 'blank'; id: string }
  interface StrayBlankNode extends Node { type: 'strayBlank' }
  interface CalloutNode extends Parent { type: 'callout'; kind: string; fold: boolean; children: BlockContent[] }
  interface PhrasingContentMap { blank: BlankNode; strayBlank: StrayBlankNode }
  interface BlockContentMap { callout: CalloutNode }
  interface RootContentMap { blank: BlankNode; strayBlank: StrayBlankNode; callout: CalloutNode }
}

// ---------------------------------------------------------------- documents (any Markdown file)
/** A heading of a document, with the same anchor and number as the outline (`§3.1`). */
export interface DocHeading { type: 'heading'; depth: number; anchor: string; num: string | null; text: MdNode[] }
/** A folded `<details><summary>…</summary>…</details>` block. */
export interface DocDetails { type: 'details'; summary: MdNode[]; children: DocBlock[] }
/** Blocks of a rendered document; `line` is the 1-based source line (for notes, AI context, "open at"). */
export type DocBlock = (Block | DocHeading | DocDetails) & { line: number }
