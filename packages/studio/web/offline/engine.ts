// Studying from an offline pack, in the browser: the same marking, rating table and scheduler as the server
// (all from @mdlearn/core), over the pack's history plus what was answered here and not yet synced.
import {
  locate, redactWidget, checkStructured, ratingFor, deriveCards, mergeLogs, dayKey, answerText, scheduleAfter,
  type Checked, type WebAnswer, type Outcome, type ReviewEvent, type PosedWidget, type MdNode, type Block,
} from '@mdlearn/core'
import type { OfflinePack } from '../../shared/types'

export type PackCard = OfflinePack['cards'][number]
export interface OfflineAttempt { id: string; t: number; widget: string; card: string; kind: 'attempt' | 'hint' | 'reveal'; correct?: boolean; sure?: boolean; answer?: string }
export interface OfflineReview { id: string; t: number; key: string; rating: 1 | 2 | 3 }
/** Answered here, not yet on the computer. */
export interface Pending { reviews: OfflineReview[]; attempts: OfflineAttempt[] }
export const NOTHING: Pending = { reviews: [], attempts: [] }

/** A v4 UUID. Browsers give crypto.randomUUID only to secure (https) pages; a phone on the local network is not one. */
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const historyOf = (pack: OfflinePack, pending: Pending): ReviewEvent[] => mergeLogs(pack.reviews, pending.reviews)

/** What to study now: the cards due by the replayed schedule, then today's share of the new ones; and when the next one is due. */
export function queueNow(pack: OfflinePack, pending: Pending, now = Date.now()): { cards: PackCard[]; nextDue: number | null; left: number } {
  const log = historyOf(pack, pending)
  const states = deriveCards(log)
  const first = new Map<string, number>()
  for (const r of log) if (!first.has(r.key)) first.set(r.key, r.t)
  const today = dayKey(now)
  const startedToday = pack.cards.filter((c) => c.isNew && first.has(c.cardKey) && dayKey(first.get(c.cardKey)!) === today).length
  const due = pack.cards.filter((c) => { const s = states.get(c.cardKey); return !!s && s.due.getTime() <= now })
  const unseen = pack.cards.filter((c) => !states.has(c.cardKey))
  const fresh = unseen.slice(0, Math.max(0, pack.newPerDay - startedToday))
  const later = pack.cards.map((c) => states.get(c.cardKey)?.due.getTime()).filter((t): t is number => t !== undefined && t > now)
  return { cards: [...due, ...fresh], nextDue: later.length ? Math.min(...later) : null, left: unseen.length - fresh.length }
}

const located = (pack: OfflinePack, widgetId: string) => {
  const loc = locate(pack.lessons, widgetId)
  if (!loc) throw new Error(`The pack has no question ${widgetId}.`)
  return loc
}
/** The question as shown before answering (no keys in what the components see), with the card's text before it. */
export function pose(pack: OfflinePack, widgetId: string): { widget: PosedWidget; title: string; lessonTitle: string; exposition: MdNode[] } {
  const loc = located(pack, widgetId)
  const at = loc.card.blocks.indexOf(loc.widget as Block)
  const exposition = loc.card.blocks.slice(0, at).flatMap((b): MdNode[] => (b.type === 'prose' ? [b.node] : b.type === 'callout' ? [b as unknown as MdNode] : []))
  return { widget: redactWidget(loc.widget), title: loc.card.title, lessonTitle: loc.lesson.title, exposition }
}
export const mark = (pack: OfflinePack, widgetId: string, answer: WebAnswer): Checked => checkStructured(located(pack, widgetId), answer, pack.lessons)
export const hint = (pack: OfflinePack, widgetId: string, n: number): MdNode[] | null => located(pack, widgetId).widget.hints[n] ?? null

/** The events one answered card adds: its attempt (and hints), its review; plus when it comes back. */
export function answered(pack: OfflinePack, pending: Pending, card: PackCard, a: { answer: WebAnswer; checked: Checked; outcome: Outcome; hints: number }, now = Date.now()): { add: Pending; rating: 1 | 2 | 3; next: string | null } {
  const rating = ratingFor(a.outcome) as 1 | 2 | 3
  const review: OfflineReview = { id: uuid(), t: now, key: card.cardKey, rating }
  const hints: OfflineAttempt[] = Array.from({ length: a.hints }, (_, i) => ({ id: uuid(), t: now - a.hints + i, widget: card.widgetId, card: card.cardKey, kind: 'hint' }))
  const skip = a.answer.type === 'skip'
  const attempt: OfflineAttempt = { id: uuid(), t: now, widget: card.widgetId, card: card.cardKey, kind: skip ? 'reveal' : 'attempt',
    ...(a.checked.correct !== null ? { correct: a.checked.correct } : {}), ...(a.outcome.sure !== undefined ? { sure: a.outcome.sure } : {}), answer: answerText(a.answer).slice(0, 2000) }
  const next = scheduleAfter(mergeLogs(historyOf(pack, pending), [review]), card.cardKey)
  return { add: { reviews: [review], attempts: [...hints, attempt] }, rating, next: next?.due ?? null }
}
