// Study with no connection to this computer (a phone on the train): a pack of the cards due in the next days
// and the new ones, with their answers, so the device can mark them itself; then the answers come back in one
// sync. The progress file is an append-only log and the schedule is replayed from it, so reviews made offline
// simply join the history in time order. Sync is idempotent: event ids come from the device, and what was
// recorded first is kept. The server remembers the packs it gave out (in the folder's private .mdlearn), and
// takes an offline answer only for a card of one of them, made after that pack was taken.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { studyQueue, locate, askable, type Lesson } from '@mdlearn/core'
import { appendProgress, loadGoals, type AttemptEvent } from '@mdlearn/core/node'
import { course, progressOf } from './study.js'
import { defaultNewCards } from './today.js'
import type { Handle } from './workspaces.js'
import type { OfflinePack, SyncResult } from '../shared/types.js'

const DAY = 864e5
export const PACK_DAYS = [1, 3, 7] as const
const MAX_CARDS = 200
const DEFAULT_NEW_PER_DAY = 5
/** Answers from the future are refused; one made up to an hour before the pack was taken passes (the device's clock may be off). */
const MAX_AHEAD = 10 * 60_000, CLOCK_SLACK = 3_600_000
/** Packs remembered for sync: the most recent ones, for two months. */
const KEEP_PACKS = 30, KEEP_FOR = 60 * DAY

const Issued = z.object({ version: z.literal(1), packs: z.array(z.object({ id: z.string(), createdAt: z.number(), cards: z.array(z.string()) })) })
type Issued = z.infer<typeof Issued>
const issuedFile = (h: Handle) => join(h.ws.learnDir, '.mdlearn', 'offline-packs.json')
function loadIssued(h: Handle): Issued {
  const f = issuedFile(h)
  if (!existsSync(f)) return { version: 1, packs: [] }
  try { return Issued.parse(JSON.parse(readFileSync(f, 'utf8'))) } catch { return { version: 1, packs: [] } } // damaged: packs taken before cannot sync
}
function remember(h: Handle, pack: Issued['packs'][number], now: number): void {
  const f = issuedFile(h)
  const packs = [pack, ...loadIssued(h).packs.filter((p) => now - p.createdAt < KEEP_FOR)].slice(0, KEEP_PACKS)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(`${f}.tmp`, JSON.stringify({ version: 1, packs }))
  renameSync(`${f}.tmp`, f)
}

/** Code exercises need Python, which is not there offline: their cards keep only their other questions. */
const withoutCode = (l: Lesson): Lesson => ({ ...l, intro: [], cards: l.cards.map((c) => ({ ...c, blocks: c.blocks.filter((b) => b.type !== 'code') })) })

export function offlinePack(h: Handle, days: number): OfflinePack {
  const { lessons } = course(h)
  const p = progressOf(h)
  const now = Date.now()
  const pool = lessons.map(withoutCode)
  const newPerDay = defaultNewCards(h, lessons, p, now) ?? DEFAULT_NEW_PER_DAY
  // everything due by the end of the window, then the new cards for every day of it
  const items = studyQueue(pool, p.reviews, { now: now + days * DAY, limit: MAX_CARDS, newCards: newPerDay * days, attempts: p.attempts, suspended: new Set(loadGoals(h.ws).suspended) })
  const keys = new Set(items.map((i) => i.cardKey))
  const id = randomUUID()
  remember(h, { id, createdAt: now, cards: [...keys] }, now)
  const packLessons = pool.filter((l) => items.some((i) => i.lessonId === l.id)).map((l) => ({ ...l, cards: l.cards.filter((c) => keys.has(`${l.id}/${c.id}`)) }))
  return {
    id, ws: h.id, name: h.name, createdAt: now, days, newPerDay,
    lessons: packLessons,
    cards: items.map((i) => ({ cardKey: i.cardKey, widgetId: i.widgetId, isNew: i.reason === 'new' })),
    reviews: p.reviews.filter((r) => keys.has(r.key)),
  }
}

export interface SyncBody {
  reviews: { id: string; t: number; key: string; rating: 1 | 2 | 3 }[]
  attempts: { id: string; t: number; widget: string; card: string; kind: 'attempt' | 'hint' | 'reveal'; correct?: boolean; sure?: boolean; answer?: string }[]
}
/**
 * Takes what was answered offline: answers about a card of a pack given out here, made after that pack was taken
 * and not in the future, about a card that still exists. Everything else is left out (and counted).
 */
export function syncOffline(h: Handle, body: SyncBody): SyncResult {
  const { lessons } = course(h)
  const now = Date.now()
  const cards = new Set(lessons.flatMap((l) => l.cards.filter((c) => c.blocks.some(askable)).map((c) => `${l.id}/${c.id}`)))
  // for each card, the earliest pack that carried it
  const since = new Map<string, number>()
  for (const p of loadIssued(h).packs) for (const k of p.cards) since.set(k, Math.min(since.get(k) ?? Infinity, p.createdAt))
  const fits = (key: string, t: number) => cards.has(key) && t <= now + MAX_AHEAD && t >= (since.get(key) ?? Infinity) - CLOCK_SLACK
  // device ids get their own prefix, so an offline event can never stand in for one recorded here
  const reviews = body.reviews.filter((r) => fits(r.key, r.t)).map((r) => ({ ...r, id: `off:${r.id}` }))
  const attempts: AttemptEvent[] = body.attempts.filter((a) => {
    const loc = fits(a.card, a.t) ? locate(lessons, a.widget) : null
    return !!loc && `${loc.lesson.id}/${loc.card.id}` === a.card
  }).map((a) => ({ ...a, id: `off:${a.id}` }))
  if (reviews.length || attempts.length) appendProgress(h.ws, { reviews, attempts }, { keepExisting: true })
  return { reviews: reviews.length, attempts: attempts.length, rejected: body.reviews.length + body.attempts.length - reviews.length - attempts.length }
}
