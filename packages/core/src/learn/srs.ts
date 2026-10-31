// Progress = append-only event log; FSRS state is *derived* by replaying it (multi-tab merge = union by id).
import { fsrs, generatorParameters, createEmptyCard, type Card, type Grade } from 'ts-fsrs'

export interface ReviewEvent { id: string; t: number; key: string /* lessonId/cardId */; rating: 1 | 2 | 3 | 4 }
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, maximum_interval: 365 }))

/** Union of event logs by id, in time order (append-only logs merge without conflicts). */
export function mergeLogs<E extends { id: string; t: number }>(...logs: E[][]): E[] {
  const byId = new Map<string, E>()
  for (const log of logs) for (const e of log) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
}
/** Copies of a card's reviews under its new key. The log only grows, and replaying these gives the new card the same schedule. */
export function carriedOver(reviews: ReviewEvent[], from: string, to: string): ReviewEvent[] {
  return reviews.filter((r) => r.key === from).map((r) => ({ ...r, id: `moved:${to}:${r.id}`, key: to }))
}
/** A review that happened, as opposed to a copy made when a card moved: what daily counts should count. */
export const isOriginalReview = (r: { id: string }) => !r.id.startsWith('moved:')

export function deriveCards(log: ReviewEvent[]): Map<string, Card> {
  const cards = new Map<string, Card>()
  for (const e of log) {
    const card: Card = cards.get(e.key) ?? createEmptyCard<Card>(new Date(e.t))
    cards.set(e.key, scheduler.next(card, new Date(e.t), e.rating as Grade).card)
  }
  return cards
}
export const due = (cards: Map<string, Card>, now = Date.now()) => [...cards].filter(([, c]) => c.due.getTime() <= now).map(([k]) => k)
/** Mastery shown to the learner = current recall probability (FSRS retrievability). */
export const retrievability = (c: Card, now = new Date()) => scheduler.get_retrievability(c, now, false) as number
