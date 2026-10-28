// Study sessions for the web app: the same coach flow and scheduling as `mdlearn review`, over HTTP.
// Answers are checked on the server (keys never reach the browser before an attempt).
import { randomUUID } from 'node:crypto'
import { relative, sep } from 'node:path'
import {
  studyQueue, locate, checkStructured, parseWebAnswer, redactWidget, ratingFor, ratingWords, scheduleAfter, whenText, report, deriveCards, retrievability, askable, videoMoment, confidence,
  type QueueItem,
  type Lesson, type Outcome, type MdNode, type Block, type WebAnswer,
} from '@mdlearn/core'
import { loadCourse, loadProgress, loadGoals, appendProgress, findDoc, loadDoc, lessonDirFor } from '@mdlearn/core/node'
import { defaultNewCards } from './today.js'
import type { Handle } from './workspaces.js'
import { UserError } from './workspaces.js'
import type { StudyPlan, StudyItem, RecordResponse, ConfidenceInfo } from '../shared/types.js'

const MINUTES: Record<string, number> = { quiz: 0.6, cloze: 0.8, order: 1, steps: 1.5, explain: 2, code: 3, match: 1, sort: 1, speed: 1.5 }
const posix = (p: string) => p.split(sep).join('/')

export function course(h: Handle): { lessons: Lesson[]; pathOf: Map<string, string> } {
  const loaded = loadCourse(h.ws.learnDir)
  const lessons = loaded.map((l) => l.lesson).filter((l): l is Lesson => !!l)
  return { lessons, pathOf: new Map(loaded.filter((l) => l.lesson).map((l) => [l.lesson!.id, posix(relative(h.root, l.path))])) }
}
export const progressOf = (h: Handle) => {
  try { return loadProgress(h.ws) } catch (e) { throw new UserError('progress', `Your progress file cannot be read (${(e as Error).message}). Nothing was changed.`) }
}

export function plan(h: Handle, opts: { scope?: string; limit?: number; newCards?: number; due?: boolean; doc?: string; widgets?: string[] }): StudyPlan {
  const { lessons } = course(h)
  const p = progressOf(h)
  if (opts.widgets) return summed(chosen(lessons, p, opts.widgets))
  // "Study this document": every lesson whose files live in the document's companion folder
  const inDoc = opts.doc ? lessonsOfDoc(h, opts.doc) : null
  const pool = inDoc ? lessons.filter((l) => inDoc.has(l.id)) : lessons
  // with a deadline the day's quota of new cards follows the pace needed to finish in time
  const paced = opts.due || opts.newCards !== undefined ? null : defaultNewCards(h, pool, p)
  const items = studyQueue(pool, p.reviews, { limit: opts.limit ?? (paced ? Math.min(40, 10 + paced) : 10), newCards: opts.due ? 0 : opts.newCards ?? paced ?? 5, scope: opts.scope, attempts: p.attempts, suspended: new Set(loadGoals(h.ws).suspended) })
  return summed(items)
}
function summed(items: QueueItem[]): StudyPlan {
  const due = items.filter((i) => i.reason === 'due').length
  return { items, due, fresh: items.length - due, minutes: Math.max(1, Math.round(items.reduce((m, i) => m + (MINUTES[i.kind] ?? 1), 0))) }
}
/** A session on given questions ("Review these" from the confidence check), early if need be; cards that are gone are left out. */
function chosen(lessons: Lesson[], p: ReturnType<typeof progressOf>, widgets: string[]): QueueItem[] {
  const cards = deriveCards(p.reviews)
  const now = new Date()
  return [...new Set(widgets)].flatMap((id): QueueItem[] => {
    const loc = locate(lessons, id)
    if (!loc) return []
    const key = `${loc.lesson.id}/${loc.card.id}`, state = cards.get(key)
    const base = { cardKey: key, lessonId: loc.lesson.id, lessonTitle: loc.lesson.title, cardId: loc.card.id, cardTitle: loc.card.title, widgetId: id, kind: loc.widget.type }
    return [state ? { ...base, reason: 'due', retrievability: Math.round(retrievability(state, now) * 1000) / 1000, dueSince: state.due.toISOString() } : { ...base, reason: 'new' }]
  })
}
export function lessonsOfDoc(h: Handle, docRel: string): Set<string> {
  const abs = findDoc(h.ws, docRel)
  if (!abs) throw new UserError('not-found', `No document ${docRel}.`)
  const dir = lessonDirFor(h.ws, abs) + sep
  return new Set(loadCourse(h.ws.learnDir).filter((l) => l.path.startsWith(dir) && l.lesson).map((l) => l.lesson!.id))
}

export function item(h: Handle, widgetId: string): StudyItem {
  const { lessons, pathOf } = course(h)
  const loc = locate(lessons, widgetId)
  if (!loc) throw new UserError('not-found', 'This card no longer exists (the lesson was edited). Start a new session.')
  const p = progressOf(h)
  const key = `${loc.lesson.id}/${loc.card.id}`
  const state = deriveCards(p.reviews).get(key)
  const at = loc.card.blocks.indexOf(loc.widget as Block)
  // what the card says before its question, for "reread the card" after answering
  const exposition = loc.card.blocks.slice(0, at).flatMap((b): MdNode[] => (b.type === 'prose' ? [b.node] : b.type === 'callout' ? [b as unknown as MdNode] : []))
  return {
    item: { cardKey: key, lessonId: loc.lesson.id, lessonTitle: loc.lesson.title, cardId: loc.card.id, cardTitle: loc.card.title, widgetId, kind: loc.widget.type,
      reason: state ? 'due' : 'new', ...(state ? { retrievability: Math.round(retrievability(state, new Date()) * 1000) / 1000, dueSince: state.due.toISOString() } : {}) },
    title: `${loc.lesson.title} › ${loc.card.title}`,
    widget: redactWidget(loc.widget),
    exposition,
    reads: loc.card.blocks.flatMap((b) => (b.type === 'read' ? b.refs : [])),
    lessonPath: pathOf.get(loc.lesson.id) ?? '',
    ...(() => { const video = videoMoment(loc.card, widgetId); return video ? { video } : {} })(),
  }
}

export function check(h: Handle, body: { widgetId: string; answer: unknown; sure?: boolean; practice?: boolean }) {
  const { lessons } = course(h)
  const loc = locate(lessons, body.widgetId)
  if (!loc) throw new UserError('not-found', 'This card no longer exists (the lesson was edited).')
  const answer = parseWebAnswer(loc.widget, body.answer)
  if (!answer) throw new UserError('invalid', 'That answer does not fit this question (it may have changed). Reload the card.')
  const checked = checkStructured(loc, answer, lessons)
  if (!body.practice) {
    const text = answerText(answer)
    appendProgress(h.ws, { attempts: [{ id: randomUUID(), t: Date.now(), widget: body.widgetId, card: `${loc.lesson.id}/${loc.card.id}`,
      kind: answer.type === 'skip' ? 'reveal' : 'attempt', ...(checked.correct !== null ? { correct: checked.correct } : {}), ...(body.sure !== undefined ? { sure: body.sure } : {}), answer: text.slice(0, 2000) }] })
  }
  return checked
}

/** What the learner answered, as text for the attempt log. */
export function answerText(a: WebAnswer): string {
  switch (a.type) {
    case 'quiz': return a.picked.join(',')
    case 'cloze': case 'steps': return a.values.join(' ; ')
    case 'order': return a.order.join(' ')
    case 'explain': case 'code': return a.text
    case 'match': return a.pairs.map((j) => (j === null ? '-' : j)).join(' ')
    case 'sort': return a.groups.map((g) => (g === null ? '-' : g)).join(' ')
    case 'speed': return a.answers.map((x) => (x === null ? '-' : x ? 'T' : 'F')).join('')
    case 'skip': return ''
  }
}

export function hint(h: Handle, widgetId: string, n: number): MdNode[] | null {
  const { lessons } = course(h)
  const loc = locate(lessons, widgetId)
  if (!loc) throw new UserError('not-found', 'This card no longer exists.')
  const hnt = loc.widget.hints[n]
  if (!hnt) return null
  appendProgress(h.ws, { attempts: [{ id: randomUUID(), t: Date.now(), widget: widgetId, card: `${loc.lesson.id}/${loc.card.id}`, kind: 'hint' }] })
  return hnt
}

export function record(h: Handle, cardKey: string, outcome: Outcome): RecordResponse {
  const { lessons } = course(h)
  if (!lessons.some((l) => l.cards.some((c) => `${l.id}/${c.id}` === cardKey && c.blocks.some(askable)))) throw new UserError('not-found', 'This card no longer exists.')
  const rating = ratingFor(outcome) as 1 | 2 | 3
  const saved = appendProgress(h.ws, { reviews: [{ id: randomUUID(), t: Date.now(), key: cardKey, rating }] })
  const next = scheduleAfter(saved.reviews, cardKey)
  const w = ratingWords(rating)
  return { rating, word: w.word, meaning: w.meaning, next: next ? { due: next.due, when: whenText(next.due) } : null }
}

export function progressReport(h: Handle) {
  const { lessons, pathOf } = course(h)
  const p = progressOf(h)
  const now = Date.now()
  const r = report(lessons, p.reviews, now, p.attempts)
  return { ...r, nextDueText: r.nextDue ? whenText(r.nextDue) : null, lessons: r.lessons.map((l) => ({ ...l, path: pathOf.get(l.lessonId) ?? '' })), confidence: confidenceOf(h, lessons, pathOf, p, now) }
}
/** The confidence check, with the cards named; cards that were edited away or set aside are left out. */
function confidenceOf(h: Handle, lessons: Lesson[], pathOf: Map<string, string>, p: ReturnType<typeof progressOf>, now: number): ConfidenceInfo {
  const c = confidence(p.attempts, now, { top: 20 })
  const suspended = new Set(loadGoals(h.ws).suspended)
  const overconfident = c.overconfident.flatMap((o) => {
    const loc = locate(lessons, o.widget)
    if (!loc || suspended.has(o.card) || `${loc.lesson.id}/${loc.card.id}` !== o.card) return []
    // what you typed means something on its own; a picked option's number or an order does not
    const typed = loc.widget.type === 'cloze' || loc.widget.type === 'steps'
    return [{ ...o, answers: typed ? o.answers : [], lessonTitle: loc.lesson.title, cardTitle: loc.card.title, lessonPath: pathOf.get(loc.lesson.id) ?? '' }]
  }).slice(0, 8)
  return { ...c, overconfident }
}

/** Memory per section of a document: which cards read it, how many are seen/due, mean predicted recall. */
export function sectionMap(h: Handle, docRel: string) {
  const abs = findDoc(h.ws, docRel)
  if (!abs) throw new UserError('not-found', `No document ${docRel}.`)
  const { outline } = loadDoc(abs, h.root)
  const { lessons } = course(h)
  const ids = lessonsOfDoc(h, docRel)
  const cards = deriveCards(progressOf(h).reviews)
  const now = new Date()
  const sections = new Map<string, { cards: number; seen: number; due: number; recall: number[] }>()
  for (const l of lessons.filter((x) => ids.has(x.id))) for (const c of l.cards) {
    if (!c.blocks.some(askable)) continue
    const state = cards.get(`${l.id}/${c.id}`)
    for (const r of c.blocks.flatMap((b) => (b.type === 'read' ? b.refs : []))) {
      const s = sections.get(r.section) ?? { cards: 0, seen: 0, due: 0, recall: [] }
      s.cards++
      if (state) { s.seen++; s.recall.push(retrievability(state, now)); if (state.due <= now) s.due++ }
      sections.set(r.section, s)
    }
  }
  return outline.sections.map((s) => {
    const st = sections.get(s.num ?? s.anchor)
    return { num: s.num, anchor: s.anchor, title: s.title, depth: s.depth, cards: st?.cards ?? 0, seen: st?.seen ?? 0, due: st?.due ?? 0,
      memory: st?.recall.length ? Math.round((st.recall.reduce((a, b) => a + b, 0) / st.recall.length) * 100) / 100 : null }
  })
}
