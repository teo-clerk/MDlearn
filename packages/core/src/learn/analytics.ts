// Study analytics: pure functions over the review/attempt logs (no clock, no files), so the terminal,
// the Studio dashboard and the tests all say the same thing. Days are local days: `tz` is the offset in
// minutes as `Date.getTimezoneOffset()` reports it (UTC − local).
import type { Card } from 'ts-fsrs'
import type { ReviewEvent } from './srs.js'

const DAY = 864e5
const MIN = 6e4
export interface AttemptLike { id?: string; t: number; widget: string; card: string; kind: string; correct?: boolean; sure?: boolean; answer?: string }
export const localTz = (now = Date.now()) => new Date(now).getTimezoneOffset()
const dayNumber = (t: number, tz: number) => Math.floor((t - tz * MIN) / DAY)
/** `YYYY-MM-DD` of the local day containing `t`. */
export const dayKey = (t: number, tz = localTz(t)) => new Date(t - tz * MIN).toISOString().slice(0, 10)
const keyToDayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY)

/** Cards due on each of the next `days` days (day 0 also holds everything overdue). */
export function forecast(cards: Map<string, Card>, now = Date.now(), days = 7, tz = localTz(now)): { date: string; count: number }[] {
  const today = dayNumber(now, tz)
  const out = Array.from({ length: days }, (_, i) => ({ date: dayKey(now + i * DAY, tz), count: 0 }))
  for (const c of cards.values()) {
    const i = Math.max(0, dayNumber(c.due.getTime(), tz) - today)
    if (i < days) out[i].count++
  }
  return out
}

/** Reviews per day for the last `weeks` weeks, with a 0–4 intensity level relative to the busiest day. */
export function heatmap(reviews: { t: number }[], now = Date.now(), weeks = 26, tz = localTz(now)) {
  const n = weeks * 7
  const counts = new Map<string, number>()
  for (const r of reviews) counts.set(dayKey(r.t, tz), (counts.get(dayKey(r.t, tz)) ?? 0) + 1)
  const days = Array.from({ length: n }, (_, i) => { const date = dayKey(now - (n - 1 - i) * DAY, tz); return { date, count: counts.get(date) ?? 0, level: 0 } })
  const max = Math.max(1, ...days.map((d) => d.count))
  for (const d of days) d.level = d.count ? Math.max(1, Math.ceil((4 * d.count) / max)) : 0
  return { days, total: days.reduce((s, d) => s + d.count, 0), max }
}

const SESSION_GAP = 5 * MIN
const IDLE_CAP = 2 * MIN
const SESSION_START = 0.5 // minutes credited for the first answer of a session
/** Minutes studied, estimated from event times: sessions split after 5 idle minutes, gaps capped at 2. */
export function studyTime(times: number[], now = Date.now(), tz = localTz(now)) {
  const t = [...times].sort((a, b) => a - b)
  const byDay: Record<string, number> = {}
  let sessions = 0
  for (let i = 0; i < t.length; ) {
    let j = i, minutes = SESSION_START
    while (j + 1 < t.length && t[j + 1] - t[j] <= SESSION_GAP) { minutes += Math.min(t[j + 1] - t[j], IDLE_CAP) / MIN; j++ }
    const k = dayKey(t[i], tz)
    byDay[k] = (byDay[k] ?? 0) + minutes
    sessions++
    i = j + 1
  }
  const today = dayKey(now, tz)
  const week = Array.from({ length: 7 }, (_, i) => dayKey(now - i * DAY, tz))
  return {
    sessions, byDay,
    today: { minutes: Math.round(byDay[today] ?? 0) },
    last7Days: { minutes: Math.round(week.reduce((s, k) => s + (byDay[k] ?? 0), 0)) },
  }
}

/** How often your confidence matched reality, over the last `days` days. */
export function calibration(attempts: AttemptLike[], now = Date.now(), days = 30) {
  const since = now - days * DAY
  const c = { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0 }
  for (const a of attempts) {
    if (a.kind !== 'attempt' || a.t < since || a.sure === undefined || a.correct === undefined) continue
    if (a.sure) a.correct ? c.sureRight++ : c.sureWrong++
    else a.correct ? c.unsureRight++ : c.unsureWrong++
  }
  const sure = c.sureRight + c.sureWrong, unsure = c.unsureRight + c.unsureWrong
  return { ...c, answered: sure + unsure, sureAccuracy: sure ? c.sureRight / sure : null, unsureAccuracy: unsure ? c.unsureRight / unsure : null }
}

export interface ConfidenceWeek { start: string; sure: number; sureRight: number; unsure: number; unsureRight: number }
/** A card you said you were sure about and got wrong: `widget` is the question you missed last. */
export interface Overconfident { card: string; widget: string; count: number; last: number; answers: string[] }
/** The local day number of the Monday that starts the week holding day `d` (day 0, 1 Jan 1970, was a Thursday). */
const mondayOf = (d: number) => d - ((d + 3) % 7)
/**
 * The confidence check: the sure/not-sure × right/wrong split of the last `days` days, the same per week for
 * the last `weeks` weeks, and the cards you were sure about and got wrong (most often first). A card leaves the
 * list once you were sure and right about it again.
 */
export function confidence(attempts: AttemptLike[], now = Date.now(), opts: { days?: number; weeks?: number; top?: number } = {}, tz = localTz(now)) {
  const { days = 30, weeks = 8, top = 8 } = opts
  const rated = attempts.filter((a) => a.kind === 'attempt' && a.sure !== undefined && a.correct !== undefined).sort((x, y) => x.t - y.t)
  const thisWeek = mondayOf(dayNumber(now, tz))
  const out: ConfidenceWeek[] = Array.from({ length: weeks }, (_, i) => ({ start: new Date((thisWeek - (weeks - 1 - i) * 7) * DAY).toISOString().slice(0, 10), sure: 0, sureRight: 0, unsure: 0, unsureRight: 0 }))
  for (const a of rated) {
    const w = out[weeks - 1 - (thisWeek - mondayOf(dayNumber(a.t, tz))) / 7]
    if (!w) continue
    if (a.sure) { w.sure++; if (a.correct) w.sureRight++ } else { w.unsure++; if (a.correct) w.unsureRight++ }
  }
  const since = now - days * DAY
  const byCard = new Map<string, Overconfident>()
  for (const a of rated) {
    if (a.sure && a.correct) { byCard.delete(a.card); continue } // sure and right again: fixed
    if (!a.sure || a.correct || a.t < since) continue
    const o = byCard.get(a.card)
    byCard.set(a.card, { card: a.card, widget: a.widget, count: (o?.count ?? 0) + 1, last: a.t, answers: [a.answer?.trim(), ...(o?.answers ?? [])].filter((x): x is string => !!x).slice(0, 3) })
  }
  const overconfident = [...byCard.values()].sort((x, y) => y.count - x.count || y.last - x.last).slice(0, top)
  return { split: calibration(attempts, now, days), weeks: out, overconfident }
}

export interface Leech { key: string; lapses: number; reviews: number; lastReview: number; wrongAnswers: string[] }
/**
 * Cards you keep failing: at least 4 "again" after the first review (unless your last two ratings were
 * good — you got it), or 3 "again" in a row. Suspended cards are left out.
 */
export function leeches(reviews: ReviewEvent[], attempts: AttemptLike[], suspended: ReadonlySet<string>): Leech[] {
  const byKey = new Map<string, ReviewEvent[]>()
  for (const r of reviews) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r])
  const out: Leech[] = []
  for (const [key, rs] of byKey) {
    if (suspended.has(key)) continue
    const sorted = [...rs].sort((a, b) => a.t - b.t)
    const ratings = sorted.map((r) => r.rating)
    const lapses = ratings.slice(1).filter((r) => r === 1).length
    let trailing = 0
    for (let i = ratings.length - 1; i >= 0 && ratings[i] === 1; i--) trailing++
    const recovered = ratings.length >= 2 && ratings.slice(-2).every((r) => r >= 3)
    if (!((lapses >= 4 && !recovered) || trailing >= 3)) continue
    const wrong: string[] = []
    for (const a of [...attempts].filter((x) => x.card === key && x.correct === false && x.answer?.trim()).sort((x, y) => y.t - x.t)) {
      if (!wrong.includes(a.answer!.trim())) wrong.push(a.answer!.trim())
      if (wrong.length === 3) break
    }
    out.push({ key, lapses, reviews: sorted.length, lastReview: sorted[sorted.length - 1].t, wrongAnswers: wrong })
  }
  return out.sort((a, b) => b.lapses - a.lapses || b.lastReview - a.lastReview)
}

export type PaceStatus = 'on-track' | 'behind' | 'overdue' | 'done'
export interface Pace { status: PaceStatus; deadline: string; daysLeft: number; remaining: number; perDay: number; daysBehind: number | null }
/** New cards per day needed to finish by a deadline, compared with how fast you have been going. */
export function pacing(i: { remainingNew: number; deadline: string; now: number; recentNewPerDay: number }, tz = localTz(i.now)): Pace {
  const diff = keyToDayNumber(i.deadline) - dayNumber(i.now, tz)
  const base = { deadline: i.deadline, remaining: i.remainingNew }
  if (i.remainingNew <= 0) return { ...base, status: 'done', daysLeft: Math.max(0, diff), perDay: 0, daysBehind: null }
  if (diff < 0) return { ...base, status: 'overdue', daysLeft: 0, perDay: i.remainingNew, daysBehind: null }
  const daysLeft = Math.max(1, diff)
  const perDay = Math.ceil(i.remainingNew / daysLeft)
  if (i.recentNewPerDay >= perDay) return { ...base, status: 'on-track', daysLeft, perDay, daysBehind: null }
  return { ...base, status: 'behind', daysLeft, perDay, daysBehind: i.recentNewPerDay > 0 ? Math.ceil(i.remainingNew / i.recentNewPerDay) - daysLeft : null }
}
