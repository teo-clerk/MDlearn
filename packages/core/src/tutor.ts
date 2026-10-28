// Tutor engine — pure functions behind the MCP tools and the CLI: what to study next, how to pose it
// without leaking the answer, how to check it, and how to record the result as an FSRS review.
import { z } from 'zod'
import { isWidget, type Lesson, type Card, type Widget, type Block, type ReadRef, type Blank, type MdNode } from './ast.js'
import { checkBlank, checkText, type Verdict } from './checkers.js'
import { toMarkdown, inlineText, type MdOptions } from './md.js'
import { prettyInline } from './tex.js'
import { rate, type Help, type Rating } from './learn/session.js'
import { deriveCards, retrievability, type ReviewEvent } from './learn/srs.js'
import { seededOrder } from './seed.js'
import { GAME_FORMAT, checkGame, fitsGame, parseGameText, poseGame, redactGame, type GameAnswer, type GameParts, type PosedGame } from './games.js'

type W = Exclude<Widget, { type: 'unavailable' }>
const DAY = 864e5

export { seededOrder }

/** Widgets the learner can be examined on (fully worked `steps` are exposition). */
export const askable = (b: Block): b is W => isWidget(b) && !(b.type === 'steps' && b.blanks.length === 0)
export const cardKey = (lesson: Lesson, card: Card) => `${lesson.id}/${card.id}`

export interface QueueItem {
  cardKey: string; lessonId: string; lessonTitle: string; cardId: string; cardTitle: string
  widgetId: string; kind: W['type']; reason: 'due' | 'new'; retrievability?: number; dueSince?: string
}
export interface QueueOptions { now?: number; limit?: number; newCards?: number; scope?: string; attempts?: { widget: string }[]
  /** Card keys the learner set aside (leeches, goals.json `suspended`). */
  suspended?: ReadonlySet<string> }

const RECALL: W['type'][] = ['cloze', 'explain', 'steps', 'order', 'code']
function pickWidget(widgets: W[], stabilityDays: number, attempts: { widget: string }[]): W {
  const used = (w: W) => attempts.filter((a) => a.widget === w.id).length
  const pool = stabilityDays > 7 && widgets.some((w) => RECALL.includes(w.type)) ? widgets.filter((w) => RECALL.includes(w.type)) : widgets
  return [...pool].sort((a, b) => used(a) - used(b))[0]
}

/**
 * Due cards first (lowest recall probability first, interleaved so two cards of one lesson are not
 * adjacent when avoidable), then up to `newCards` unseen cards in curriculum order.
 */
export function studyQueue(lessons: Lesson[], reviews: ReviewEvent[], opts: QueueOptions = {}): QueueItem[] {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? 10
  const fsrs = deriveCards(reviews)
  const scoped = lessons.filter((l) => !opts.scope || l.id.includes(opts.scope) || l.title.toLowerCase().includes(opts.scope.toLowerCase()))
  const due: QueueItem[] = [], fresh: QueueItem[] = []
  for (const lesson of scoped) for (const card of lesson.cards) {
    const widgets = card.blocks.filter(askable)
    if (!widgets.length) continue
    const key = cardKey(lesson, card)
    if (opts.suspended?.has(key)) continue
    const state = fsrs.get(key)
    const w = pickWidget(widgets, state?.stability ?? 0, opts.attempts ?? [])
    const base = { cardKey: key, lessonId: lesson.id, lessonTitle: lesson.title, cardId: card.id, cardTitle: card.title, widgetId: w.id, kind: w.type }
    if (!state) fresh.push({ ...base, reason: 'new' })
    else if (state.due.getTime() <= now) due.push({ ...base, reason: 'due', retrievability: round(retrievability(state, new Date(now))), dueSince: state.due.toISOString() })
  }
  due.sort((a, b) => (a.retrievability ?? 0) - (b.retrievability ?? 0))
  return [...interleave(due), ...fresh.slice(0, opts.newCards ?? 5)].slice(0, limit)
}
function interleave(items: QueueItem[]): QueueItem[] {
  const out: QueueItem[] = [], rest = [...items]
  while (rest.length) {
    const i = rest.findIndex((x) => x.lessonId !== out[out.length - 1]?.lessonId)
    out.push(...rest.splice(i < 0 ? 0 : i, 1))
  }
  return out
}
const round = (x: number) => Math.round(x * 1000) / 1000

// ---------------------------------------------------------------- locating and posing
export interface Located { lesson: Lesson; card: Card; widget: W }
export function locate(lessons: Lesson[], widgetId: string): Located | null {
  for (const lesson of lessons) for (const card of lesson.cards) for (const b of card.blocks)
    if (askable(b) && b.id === widgetId) return { lesson, card, widget: b }
  return null
}
const LETTERS = 'ABCDEFGH'
const blanksOf = (w: W): Blank[] => (w.type === 'cloze' || w.type === 'steps' ? w.blanks : [])
const optionOrder = (w: Extract<W, { type: 'quiz' }>) => (w.sortNumeric ? w.options : seededOrder(w.options, w.id))

export type Surface = 'chat' | 'terminal'
export interface PoseOptions { surface?: Surface; bold?: (s: string) => string }
const mdOpts = (o: PoseOptions, ids: string[] = []): MdOptions => ({
  math: 'unicode',
  bold: o.bold ?? (o.surface === 'terminal' ? (x: string) => x : undefined),
  blankLabel: (id: string) => `[${ids.indexOf(id) + 1}]____`,
})
/** Display form of a title: `$…$` segments become Unicode. */
export const displayTitle = (s: string) => prettyInline(s)

export interface Posed {
  widgetId: string; cardKey: string; kind: W['type']; title: string
  /** Question text, safe to show: no keys, no feedback, no solutions. */
  question: string
  /** One line telling the learner how to answer on this surface. */
  answerFormat: string
  hintsAvailable: number
  /** Source sections behind this card (companion lessons). */
  reads: ReadRef[]
}
const FORMAT: Record<Surface, (w: W, n: number) => string> = {
  terminal: (w, n) => {
    switch (w.type) {
      case 'quiz': return w.multi ? 'Type every correct letter, e.g. "A C".' : `Type one letter (A–${LETTERS[w.options.length - 1]}).`
      case 'cloze': case 'steps': return n > 1 ? `Type ${n} answers separated by ";" — e.g. "16; 4".` : 'Type your answer.'
      case 'order': return 'Type the numbers in the right order, e.g. "3 1 4 2".'
      case 'explain': return 'Explain in a sentence or two. Press Enter on an empty line if you can\'t recall.'
      case 'code': return 'Describe or paste your solution, or press Enter to see the reference.'
      case 'match': case 'sort': case 'speed': return GAME_FORMAT[w.type].terminal
    }
  },
  chat: (w, n) => {
    switch (w.type) {
      case 'quiz': return (w.multi ? 'All correct letters (several are correct)' : 'One letter') + ', and whether you are sure.'
      case 'cloze': case 'steps': return n > 1 ? `${n} answers, separated by ";" or as "1: …; 2: …".` : 'One answer.'
      case 'order': return 'The item numbers in the right order, e.g. "3 1 4 2".'
      case 'explain': return 'A short explanation in your own words (or "can\'t recall").'
      case 'code': return `Your ${w.lang} code, or a description of your approach.`
      case 'match': case 'sort': case 'speed': return GAME_FORMAT[w.type].chat
    }
  },
}
export function pose(loc: Located, opts: PoseOptions = {}): Posed {
  const { lesson, card, widget: w } = loc
  const surface = opts.surface ?? 'chat'
  const ids = blanksOf(w).map((b) => b.id)
  const mo = mdOpts(opts, ids)
  let question: string
  switch (w.type) {
    case 'quiz':
      question = `${toMarkdown(w.stem, mo)}\n\n${optionOrder(w).map((o, i) => `  ${LETTERS[i]}  ${inlineText(o.content, mo)}`).join('\n')}`
      break
    case 'cloze': question = toMarkdown(w.body, mo); break
    case 'order': {
      const items = seededOrder(w.items.map((it, i) => ({ it, i })), w.id)
      question = `${toMarkdown(w.prompt, mo)}\n\n${items.map((x, k) => `  ${k + 1}  ${inlineText(flat(x.it), mo)}`).join('\n')}`
      break
    }
    case 'explain': question = toMarkdown(w.prompt, mo); break
    case 'steps':
      question = `${toMarkdown(w.problem, mo)}\n\n${w.steps.map((st, i) => `  Step ${i + 1}. ${toMarkdown(st, mo).replace(/\n+/g, ' ')}`).join('\n')}`
      break
    case 'code': question = `${toMarkdown(w.prompt, mo)}\n\n\`\`\`${w.lang}\n${w.starter}\n\`\`\``; break
    case 'match': case 'sort': case 'speed': question = poseGame(w, mo); break
  }
  const reads = card.blocks.flatMap((b) => (b.type === 'read' ? b.refs : []))
  return { widgetId: w.id, cardKey: cardKey(lesson, card), kind: w.type, title: `${displayTitle(lesson.title)} › ${displayTitle(card.title)}`,
    question, answerFormat: FORMAT[surface](w, ids.length), hintsAvailable: w.hints.length, reads }
}
/** A list item's flow content as phrasing (paragraph children), for one-line rendering. */
const flat = (flow: { children?: unknown[] }[]) => flow.flatMap((b) => ((b as { type: string }).type === 'paragraph' ? ((b.children ?? []) as never[]) : [b as never]))
export function hint(loc: Located, n: number, opts: PoseOptions = {}): string | null {
  const h = loc.widget.hints[n]
  return h ? inlineText(h, mdOpts(opts)) : null
}
/** "§2, §2.1 of 04_sar_physics_from_first_principles.md" — each document named once. */
export function readsLabel(reads: ReadRef[]): string {
  const byDoc = new Map<string, string[]>()
  for (const r of reads) byDoc.set(r.doc, [...(byDoc.get(r.doc) ?? []), `§${r.section}`])
  return [...byDoc].map(([doc, secs]) => `${secs.join(', ')} of ${doc.split('/').pop()}`).join('; ')
}

// ---------------------------------------------------------------- posing for interactive surfaces
type Flow = MdNode[]
interface PosedBase { id: string; hints: number }
/** A widget as an interactive surface may render it before the answer: no keys, feedback, ideas, solutions or tests. */
export type PosedWidget = PosedBase & (
  | { type: 'quiz'; multi: boolean; stem: Flow; options: { content: Flow }[] }
  | { type: 'cloze'; body: Flow; blanks: { id: string; kind: Blank['kind'] }[] }
  | { type: 'order'; prompt: Flow; items: Flow[] }
  | { type: 'explain'; prompt: Flow; ideaCount: number }
  | { type: 'steps'; problem: Flow; steps: Flow[]; blanks: { id: string; kind: Blank['kind'] }[] }
  | { type: 'code'; prompt: Flow; lang: string; starter: string; hasTests: boolean; hasSolution: boolean
      /** Runnable exercises: the checks to run in the browser (shown only when one fails). The solution never leaves the server. */
      runnable: boolean; testSource?: string }
  | PosedGame)
const gaps = (bs: Blank[]) => bs.map((b) => ({ id: b.id, kind: b.kind }))
/** Options and order items appear in the same seeded order as on every other surface (display index = letter). */
export function redactWidget(w: W): PosedWidget {
  const base = { id: w.id, hints: w.hints.length }
  switch (w.type) {
    case 'quiz': return { ...base, type: 'quiz', multi: w.multi, stem: w.stem, options: optionOrder(w).map((o) => ({ content: o.content })) }
    case 'cloze': return { ...base, type: 'cloze', body: w.body, blanks: gaps(w.blanks) }
    case 'order': return { ...base, type: 'order', prompt: w.prompt, items: seededOrder(w.items, w.id) }
    case 'explain': return { ...base, type: 'explain', prompt: w.prompt, ideaCount: w.ideas.length }
    case 'steps': return { ...base, type: 'steps', problem: w.problem, steps: w.steps, blanks: gaps(w.blanks) }
    case 'code': return { ...base, type: 'code', prompt: w.prompt, lang: w.lang, starter: w.starter, hasTests: !!w.tests, hasSolution: !!w.solution, runnable: w.mode === 'run' && !!w.tests, ...(w.mode === 'run' && w.tests ? { testSource: w.tests } : {}) }
    case 'match': case 'sort': case 'speed': return { ...base, ...redactGame(w) }
  }
}

/** A learner's answer from an interactive surface. Indices are display indices (as in `PosedWidget`). */
export type WebAnswer =
  | { type: 'quiz'; picked: number[] }
  | { type: 'cloze' | 'steps'; values: string[] }
  | { type: 'order'; order: number[] }
  /** `tests`: the result of running a runnable exercise's checks in the browser. */
  | { type: 'explain' | 'code'; text: string; tests?: { passed: number; total: number } }
  /** Games: `null` marks a part not answered yet (a move checked on its own). */
  | GameAnswer
  | { type: 'skip' }

const MAX_BLANK = 500, MAX_TEXT = 4000
const WebAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quiz'), picked: z.array(z.number().int().min(0)).max(8) }),
  z.object({ type: z.enum(['cloze', 'steps']), values: z.array(z.string().max(MAX_BLANK)).max(64) }),
  z.object({ type: z.literal('order'), order: z.array(z.number().int().min(0)).max(64) }),
  z.object({ type: z.enum(['explain', 'code']), text: z.string().max(MAX_TEXT), tests: z.object({ passed: z.number().int().min(0).max(1000), total: z.number().int().min(1).max(1000) }).refine((t) => t.passed <= t.total).optional() }),
  z.object({ type: z.literal('match'), pairs: z.array(z.number().int().min(0).nullable()).max(16), log: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(400).optional() }),
  z.object({ type: z.literal('sort'), groups: z.array(z.number().int().min(0).nullable()).max(32) }),
  z.object({ type: z.literal('speed'), answers: z.array(z.boolean().nullable()).max(32), ms: z.number().int().min(0).max(36e5).optional(), done: z.boolean().optional() }),
  z.object({ type: z.literal('skip') }),
])
/**
 * Validate an untrusted answer against the widget it claims to answer. Returns null when it does not fit
 * (wrong type, out-of-range or repeated indices, wrong number of gaps) — callers reject it instead of grading.
 */
export function parseWebAnswer(w: W, raw: unknown): WebAnswer | null {
  const r = WebAnswerSchema.safeParse(raw)
  if (!r.success) return null
  const a = r.data as WebAnswer
  if (a.type === 'skip') return a
  if (a.type !== w.type) return null
  const distinct = (xs: number[], n: number) => new Set(xs).size === xs.length && xs.every((i) => i < n)
  switch (a.type) {
    case 'quiz': return distinct(a.picked, (w as Extract<W, { type: 'quiz' }>).options.length) ? a : null
    case 'cloze': case 'steps': return a.values.length === (w as Extract<W, { type: 'cloze' }>).blanks.length ? a : null
    case 'order': { const n = (w as Extract<W, { type: 'order' }>).items.length; return a.order.length === n && distinct(a.order, n) ? a : null }
    case 'match': case 'sort': case 'speed': return fitsGame(w as Extract<W, { type: typeof a.type }>, a) ? a : null
    default: return a
  }
}

// ---------------------------------------------------------------- checking
export interface Checked {
  /** true/false when decidable; null when the tutor or learner must judge (explain, self-check code). */
  correct: boolean | null
  partial: boolean
  /** One line per gap or chosen option, in words ("[1] correct", "B — not quite: …"). */
  feedback: string
  /** The answer itself, always available (shown after a wrong answer or a skip). */
  answer: string
  /** What to show after the attempt: explanation, model answer, solution. */
  reveal: string
  /** Idea units or tests the tutor compares a free answer against. */
  rubric?: string[]
  /** Structured verdicts for interactive surfaces (display indices; expected answers as authored, TeX for math). */
  parts?: {
    options?: { picked: boolean; correct: boolean; feedback?: Flow }[]
    blanks?: { id: string; ok: boolean; note?: string; given: string; expected: string; kind: Blank['kind'] }[]
    /** The correct order as display indices. */
    order?: number[]
    ideas?: Flow[]
    solution?: { lang: string; code: string }
    /** Checks that passed when the exercise ran in the browser. */
    tests?: { passed: number; total: number }
    reveal?: Flow
  } & GameParts
}
/**
 * Split a learner's reply into one answer per gap. Labelled replies ("1: a; 2: b", "[2] b", "1) a",
 * "1. prior") are used only when *every* segment carries a valid gap number; otherwise answers are
 * positional, separated by ";" or new lines. A decimal such as "42.9" is never a label.
 */
export function parseBlankAnswers(answer: string, n: number): string[] {
  const text = answer.trim()
  const segments = text.split(/\s*[;\n]\s*/).filter(Boolean)
  const label = /^(?:\[(\d+)\]\s*|(\d+)\s*[:)=]\s*|(\d+)\.\s+(?=\D))(.*)$/
  const parsed = segments.map((seg) => {
    const m = label.exec(seg)
    const k = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN
    return m && k >= 1 && k <= n ? { k, value: m[4].trim() } : null
  })
  if (n > 1 && parsed.length && parsed.every((x) => x)) {
    const out = Array<string>(n).fill('')
    for (const x of parsed) out[x!.k - 1] = x!.value
    return out
  }
  if (n === 1) {
    const only = parsed.length === 1 && parsed[0]?.k === 1 && /^\s*(\[1\]|1\s*[:)=])/.test(text) ? parsed[0]!.value : text
    return [only]
  }
  return segments
}
/** Grade a free-text reply (terminal, chat): parsed into a structured answer, then checked. */
export function check(loc: Located, answer: string, lessonsForTypos: Lesson[] = [], opts: PoseOptions = {}): Checked {
  const w = loc.widget
  switch (w.type) {
    case 'quiz': {
      const n = optionOrder(w).length
      const picked = [...new Set((answer.toUpperCase().match(/\b[A-H]\b/g) ?? []).map((l) => LETTERS.indexOf(l)))].filter((i) => i >= 0 && i < n)
      const res = checkStructured(loc, { type: 'quiz', picked }, lessonsForTypos, opts)
      return picked.length ? res : { ...res, feedback: `No option letter (A–${LETTERS[n - 1]}) found in the answer.` }
    }
    case 'cloze': case 'steps': return checkStructured(loc, { type: w.type, values: parseBlankAnswers(answer, w.blanks.length) }, lessonsForTypos, opts)
    case 'order': return checkStructured(loc, { type: 'order', order: (answer.match(/\d+/g) ?? []).map((d) => Number(d) - 1) }, lessonsForTypos, opts)
    case 'explain': case 'code': return checkStructured(loc, answer.trim() ? { type: w.type, text: answer } : { type: 'skip' }, lessonsForTypos, opts)
    case 'match': case 'sort': case 'speed': return checkStructured(loc, answer.trim() ? parseGameText(w, answer) : { type: 'skip' }, lessonsForTypos, opts)
  }
}

/** Grade a structured answer. `{type:'skip'}` counts as wrong and reveals the answer. */
export function checkStructured(loc: Located, given: WebAnswer, lessonsForTypos: Lesson[] = [], opts: PoseOptions = {}): Checked {
  const { lesson, widget: w } = loc
  const mo = mdOpts(opts, blanksOf(w).map((b) => b.id))
  const reveal = 'reveal' in w && w.reveal ? toMarkdown(w.reveal, mo) : ''
  const revealFlow = 'reveal' in w && w.reveal ? { reveal: w.reveal } : {}
  // an empty free answer is a skip (the same as "can't recall")
  const skip = given.type === 'skip' || ((given.type === 'explain' || given.type === 'code') && !given.text.trim())
  const others = lessonsForTypos.flatMap((l) => l.cards.flatMap((c) => c.blocks.filter(askable).flatMap(blanksOf).flatMap((b) => b.answers)))
  switch (w.type) {
    case 'quiz': {
      const opts2 = optionOrder(w)
      const raw = given.type === 'quiz' ? given.picked : []
      const picked = [...new Set(raw)].filter((i) => Number.isInteger(i) && i >= 0 && i < opts2.length)
      const keys = opts2.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0)
      // an index that names no option makes the whole answer wrong (never silently ignored)
      const correct = picked.length === raw.length && picked.length > 0 && picked.length === keys.length && picked.every((i) => keys.includes(i))
      const why = (i: number) => (opts2[i].feedback ? inlineText(flat(opts2[i].feedback!), mo) : '')
      // single choice: the chosen option's own explanation; multiple choice: each pick labelled
      const lines = picked.map((i) => (w.multi ? `${LETTERS[i]} (${opts2[i].correct ? 'correct' : 'not correct'})${why(i) ? `: ${why(i)}` : ''}` : why(i) || (opts2[i].correct ? 'That is the answer.' : `${LETTERS[i]} is not the answer.`)))
      if (!picked.length) lines.push(skip ? 'Skipped.' : 'No option chosen.')
      const answerLine = keys.map((i) => `${LETTERS[i]} — ${inlineText(opts2[i].content, mo)}`).join('; ')
      const missedKeys = keys.filter((i) => !picked.includes(i))
      const extra = correct || !picked.length ? '' : missedKeys.map((i) => (why(i) ? `Why ${LETTERS[i]}: ${why(i)}` : '')).filter(Boolean).join('\n')
      return { correct: picked.length ? correct : false, partial: false, feedback: [lines.join('\n'), extra].filter(Boolean).join('\n'), answer: `Answer: ${answerLine}`, reveal,
        parts: { options: opts2.map((o, i) => ({ picked: picked.includes(i), correct: o.correct, ...(o.feedback ? { feedback: o.feedback } : {}) })), ...revealFlow } }
    }
    case 'cloze': case 'steps': {
      const values = given.type === 'cloze' || given.type === 'steps' ? given.values : []
      let partial = false
      const res = w.blanks.map((b, i) => {
        const v: Verdict = checkBlank(values[i] ?? '', b, { lang: lesson.lang, others: others.filter((a) => !b.answers.includes(a)), exact: w.exact })
        if (v.ok && v.note === 'typo') partial = true
        return { b, v, i }
      })
      const label = (i: number) => (w.blanks.length > 1 ? `[${i + 1}] ` : '')
      const feedback = skip ? 'Skipped.' : res.map(({ b, v, i }) =>
        v.ok ? `${label(i)}correct${v.note === 'typo' ? ` (spelled ${v.canonical})` : v.note === 'equivalent-form' ? ' (equivalent form)' : ''}`
          : `${label(i)}${values[i] ? `you wrote ${values[i]}` : 'no answer'} — it is ${shown(b)}${'reason' in v && v.reason === 'imprecise' ? ' (give at least 2 significant figures)' : ''}`).join('\n')
      const answerLine = 'Answer: ' + w.blanks.map((b, i) => `${label(i)}${shown(b)}`).join(' · ')
      return { correct: !skip && res.every((r) => r.v.ok), partial, feedback, answer: answerLine, reveal,
        parts: { blanks: res.map(({ b, v, i }) => ({ id: b.id, ok: !skip && v.ok, ...(skip || !(values[i] ?? '').trim() ? {} : v.ok && v.note ? { note: v.note } : !v.ok && 'reason' in v && v.reason ? { note: v.reason } : {}), given: values[i] ?? '', expected: b.answers[0], kind: b.kind })), ...revealFlow } }
    }
    case 'order': {
      const shownItems = seededOrder(w.items.map((it, i) => ({ it, i })), w.id)
      const raw = given.type === 'order' ? given.order : []
      const isPermutation = raw.length === w.items.length && new Set(raw).size === raw.length && raw.every((d) => Number.isInteger(d) && d >= 0 && d < w.items.length)
      const seq = isPermutation ? raw.map((d) => shownItems[d].i) : []
      const exact = seq.length === w.items.length && seq.every((v, i) => v === i)
      const swaps = seq.length === w.items.length ? seq.reduce((n, v, i) => n + (v !== i ? 1 : 0), 0) : Infinity
      const oneSwap = !exact && swaps === 2 && seq.some((v, i) => v === i + 1 && seq[i + 1] === i)
      const ordered = w.items.map((it, i) => `  ${i + 1}. ${inlineText(flat(it), mo)}  (your item ${shownItems.findIndex((x) => x.i === i) + 1})`).join('\n')
      return { correct: exact || oneSwap, partial: oneSwap, feedback: skip ? 'Skipped.' : exact ? 'Right order.' : oneSwap ? 'Nearly — one neighbouring pair is swapped.' : 'Not the right order.', answer: `Answer:\n${ordered}`, reveal,
        parts: { order: w.items.map((_, i) => shownItems.findIndex((x) => x.i === i)), ...revealFlow } }
    }
    case 'explain': {
      const ideas = w.ideas.map((i) => toMarkdown(i, mo).replace(/\n+/g, ' '))
      return { correct: skip ? false : null, partial: false, feedback: skip ? 'Skipped.' : 'Compare your explanation with these key ideas.', answer: ideas.map((i, k) => `  ${k + 1}. ${i}`).join('\n'), reveal, rubric: ideas,
        parts: { ideas: w.ideas.map((i) => i as unknown as Flow), ...revealFlow } }
    }
    case 'code': {
      const t = given.type === 'code' && w.mode === 'run' ? given.tests : undefined
      const solution = w.solution ? `\`\`\`${w.lang}\n${w.solution}\n\`\`\`` : ''
      const rubric = w.tests?.split('\n').filter((l) => /^\s*assert/.test(l)).map((l) => l.trim())
      const parts = { ...(w.solution ? { solution: { lang: w.lang, code: w.solution } } : {}), ...(t ? { tests: t } : {}), ...revealFlow }
      // checks that ran in the browser decide; otherwise the learner (or the tutor) compares with the reference
      if (t && !skip) {
        const all = t.passed === t.total
        return { correct: all, partial: !all && t.passed > 0, feedback: all ? `All ${t.total} ${t.total === 1 ? 'check passes' : 'checks pass'}.` : `${t.passed} of ${t.total} checks pass.`, answer: solution, reveal, rubric, parts }
      }
      return { correct: skip ? false : null, partial: false, feedback: skip ? 'Skipped.' : w.tests ? 'Check your code against each test.' : 'Compare with the reference solution.', answer: solution, reveal, rubric, parts }
    }
    case 'match': case 'sort': case 'speed': {
      const g = checkGame(w, given.type === w.type || given.type === 'skip' ? given as GameAnswer : { type: 'skip' }, mo)
      // the answer is shown only once the round is over (a single move must not reveal the rest)
      return { correct: g.correct, partial: g.partial, feedback: g.feedback, answer: g.complete ? g.answer : '', reveal: g.complete ? reveal : '',
        parts: { ...g.parts, ...(g.complete ? revealFlow : {}) } }
    }
  }
}
/** A blank's answer as a learner should read it (math in Unicode when possible). */
const shown = (b: Blank) => (b.kind === 'math' ? prettyInline(`$${b.answers[0]}$`) : b.answers[0])

/** Spelling-tolerant comparison helper for free answers in chat (e.g. a single term). */
export const sameTerm = (a: string, b: string, lang = 'en') => checkText(a, [b], lang).ok

// ---------------------------------------------------------------- recording
export interface Outcome { correct: boolean; sure?: boolean; partial?: boolean; help?: Help; revealed?: boolean }
export function ratingFor(o: Outcome): Rating {
  return rate({ failed: !o.correct, shaky: o.sure === false || !!o.partial, help: o.help ?? 'none', done: true, revealed: !!o.revealed })
}
/** Plain-language meaning of an FSRS rating, for learners. */
export function ratingWords(r: Rating): { word: string; meaning: string } {
  return r === 1 ? { word: 'again', meaning: 'you will see it again soon' }
    : r === 2 ? { word: 'shaky', meaning: 'it comes back a little sooner than usual' }
    : { word: 'solid', meaning: 'it comes back later, when you are about to forget it' }
}
/** "in 10 minutes", "later today, 14:05", "tomorrow", "in 3 days (Fri 4 Oct)" — locale-aware. */
export function whenText(iso: string, now = Date.now(), locale?: string): string {
  const t = new Date(iso).getTime(), mins = Math.round((t - now) / 6e4)
  if (mins <= 1) return 'in a minute'
  if (mins < 60) return `in ${mins} minutes`
  const day = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime() }
  const days = Math.round((day(t) - day(now)) / DAY)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(t)
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(t)
  if (days === 0) return `later today, ${time}`
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days (${date})`
  return `in ${Math.round(days / 7)} weeks (${date})`
}
export function scheduleAfter(reviews: ReviewEvent[], key: string): { due: string; stabilityDays: number; retrievability: number } | null {
  const c = deriveCards(reviews).get(key)
  return c ? { due: c.due.toISOString(), stabilityDays: round(c.stability), retrievability: round(retrievability(c, new Date(reviews[reviews.length - 1]?.t ?? Date.now()))) } : null
}

// ---------------------------------------------------------------- reporting
export interface LessonReport {
  lessonId: string; title: string; cards: number; seen: number; due: number
  /** Predicted chance of recalling the seen cards right now (FSRS model, not a test score). */
  predictedRecall: number | null
}
export interface Accuracy { answered: number; correct: number }
export function report(lessons: Lesson[], reviews: ReviewEvent[], now = Date.now(), attempts: { t: number; widget: string; correct?: boolean; kind: string }[] = []) {
  const fsrs = deriveCards(reviews)
  const perLesson: LessonReport[] = lessons.map((l) => {
    const keys = l.cards.filter((c) => c.blocks.some(askable)).map((c) => cardKey(l, c))
    const states = keys.map((k) => fsrs.get(k)).filter((s) => !!s)
    const rs = states.map((s) => retrievability(s, new Date(now)))
    return { lessonId: l.id, title: displayTitle(l.title), cards: keys.length, seen: states.length, due: states.filter((s) => s.due.getTime() <= now).length, predictedRecall: rs.length ? round(rs.reduce((a, b) => a + b, 0) / rs.length) : null }
  })
  const nextDue = [...fsrs.values()].map((c) => c.due.getTime()).filter((t) => t > now).sort((a, b) => a - b)[0]
  return {
    lessons: perLesson,
    totals: { cards: sum(perLesson, 'cards'), seen: sum(perLesson, 'seen'), due: sum(perLesson, 'due'), reviews: reviews.length },
    /** Your own first-try results (each widget's first graded attempt per day). */
    accuracy: { today: accuracySince(attempts, startOfDay(now)), last7Days: accuracySince(attempts, startOfDay(now) - 6 * DAY) },
    nextDue: nextDue ? new Date(nextDue).toISOString() : null,
    streak: reviewStreakFromLog(reviews, now),
  }
}
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
function accuracySince(attempts: { t: number; widget: string; correct?: boolean; kind: string }[], since: number): Accuracy {
  const first = new Map<string, boolean>()
  for (const a of attempts) {
    if (a.t < since || a.kind !== 'attempt' || a.correct === undefined) continue
    const k = `${a.widget}@${startOfDay(a.t)}`
    if (!first.has(k)) first.set(k, a.correct)
  }
  return { answered: first.size, correct: [...first.values()].filter(Boolean).length }
}
const sum = (rows: LessonReport[], k: 'cards' | 'seen' | 'due') => rows.reduce((n, r) => n + r[k], 0)

/**
 * Study streak from the log: consecutive days on which you studied (≥ 1 review) and cleared what was
 * due. A day with nothing due and no study is neutral; today counts as soon as it qualifies.
 */
export function reviewStreakFromLog(reviews: ReviewEvent[], now = Date.now(), tzOffsetMin = new Date(now).getTimezoneOffset()): number {
  if (!reviews.length) return 0
  const dayOf = (t: number) => Math.floor((t - tzOffsetMin * 6e4) / DAY)
  const first = dayOf(reviews[0].t), today = dayOf(now)
  let streak = 0
  for (let d = today; d >= first; d--) {
    const start = d * DAY + tzOffsetMin * 6e4, end = start + DAY
    const before = deriveCards(reviews.filter((r) => r.t < start))
    const dueKeys = [...before].filter(([, c]) => c.due.getTime() < end).map(([k]) => k)
    const reviewed = new Set(reviews.filter((r) => r.t >= start && r.t < end).map((r) => r.key))
    const qualifies = reviewed.size > 0 && dueKeys.every((k) => reviewed.has(k))
    if (qualifies) { streak++; continue }
    if (d === today || (!reviewed.size && !dueKeys.length)) continue // today still open, or a neutral day
    break
  }
  return streak
}
