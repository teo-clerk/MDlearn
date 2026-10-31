// The Today dashboard and deadline pacing: everything derived from your own logs and goals.
import { dirname, relative, resolve, sep } from 'node:path'
import {
  askable, deriveCards, isOriginalReview, forecast, heatmap, studyTime, calibration, leeches, pacing, dayKey, localTz, reviewStreakFromLog, report, whenText,
  type Lesson, type Pace,
} from '@mdlearn/core'
import { loadGoals, type Progress } from '@mdlearn/core/node'
import type { Handle } from './workspaces.js'
import type { TodayResponse, LeechInfo, PaceInfo } from '../shared/types.js'
import { course, progressOf, lessonsOfDoc, plan } from './study.js'

const DAY = 864e5
const keysOf = (lessons: Lesson[]) => lessons.flatMap((l) => l.cards.filter((c) => c.blocks.some(askable)).map((c) => `${l.id}/${c.id}`))
/** Cards that have been reviewed at least once, with the time of their first review. */
const firstReviews = (p: Progress) => { const m = new Map<string, number>(); for (const r of p.reviews.filter(isOriginalReview)) if (!m.has(r.key)) m.set(r.key, r.t); return m }

export function pacesOf(h: Handle, lessons: Lesson[], p: Progress, now = Date.now()): PaceInfo[] {
  const goals = loadGoals(h.ws)
  const first = firstReviews(p)
  return [...goals.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
    let scoped = lessons
    if (d.scope) { const ids = lessonsOfDoc(h, d.scope); scoped = lessons.filter((l) => ids.has(l.id)) }
    const keys = keysOf(scoped).filter((k) => !goals.suspended.includes(k))
    const remaining = keys.filter((k) => !first.has(k)).length
    const recent = keys.filter((k) => (first.get(k) ?? 0) > now - 7 * DAY).length / 7
    const pace = pacing({ remainingNew: remaining, deadline: d.date, now, recentNewPerDay: recent })
    return { scope: d.scope, label: d.label ?? (d.scope ? d.scope.split('/').pop()!.replace(/\.md$/, '') : 'Everything'), ...pace, text: paceText(pace, d.label) }
  })
}
export function paceText(p: Pace, label?: string): string {
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${p.deadline}T12:00:00`))
  const what = label ? ` for ${label}` : ''
  switch (p.status) {
    case 'done': return `All cards seen${what}.`
    case 'overdue': return `The deadline${what} (${date}) has passed; ${p.remaining} cards are still new.`
    case 'on-track': return `On track${what}: ${p.perDay} new cards a day finishes by ${date}.`
    case 'behind': return `Behind${what}${p.daysBehind ? ` by about ${p.daysBehind} ${p.daysBehind === 1 ? 'day' : 'days'}` : ''}: ${p.perDay} new cards a day finishes by ${date}.`
  }
}
/** New cards for today's session: the tightest deadline's daily pace minus what you already started today; null without a deadline. */
export function defaultNewCards(h: Handle, lessons: Lesson[], p: Progress, now = Date.now()): number | null {
  const paces = pacesOf(h, lessons, p, now).filter((x) => x.status === 'behind' || x.status === 'on-track')
  if (!paces.length) return null
  const need = Math.max(...paces.map((x) => x.perDay))
  const tz = localTz(now), today = dayKey(now, tz)
  const startedToday = [...firstReviews(p)].filter(([, t]) => dayKey(t, tz) === today).length
  return Math.max(0, Math.min(30, need - startedToday))
}

export function today(h: Handle, now = Date.now()): TodayResponse {
  const { lessons, pathOf } = course(h)
  const p = progressOf(h)
  const goals = loadGoals(h.ws)
  const tz = localTz(now)
  const cards = deriveCards(p.reviews)
  const rep = report(lessons, p.reviews, now, p.attempts)
  const todayKey = dayKey(now, tz)
  const done = p.reviews.filter(isOriginalReview), doneToday = done.filter((r) => dayKey(r.t, tz) === todayKey).length
  const cardInfo = new Map<string, { lesson: Lesson; title: string; source?: { doc: string; section: string } }>()
  for (const l of lessons) for (const c of l.cards) {
    const read = c.blocks.find((b) => b.type === 'read')
    cardInfo.set(`${l.id}/${c.id}`, { lesson: l, title: c.title, ...(read && read.type === 'read' ? { source: { doc: read.refs[0].doc, section: read.refs[0].section } } : {}) })
  }
  const leechList: LeechInfo[] = leeches(p.reviews, p.attempts, new Set(goals.suspended)).flatMap((l) => {
    const info = cardInfo.get(l.key)
    if (!info) return []
    const lessonPath = pathOf.get(info.lesson.id) ?? ''
    // `::read` documents are relative to the lesson file; the app wants folder-relative paths
    const sourceDoc = info.source && lessonPath ? relative(h.root, resolve(h.root, dirname(lessonPath), info.source.doc)).split(sep).join('/') : undefined
    return [{ key: l.key, title: info.title, lessonTitle: info.lesson.title, lessonPath, lapses: l.lapses, wrongAnswers: l.wrongAnswers,
      ...(sourceDoc ? { sourceDoc, sourceSection: info.source!.section } : {}) }]
  })
  const times = [...p.attempts.map((a) => a.t), ...p.reviews.map((r) => r.t)]
  const next = plan(h, {})
  return {
    plan: next,
    goal: { daily: goals.dailyGoal, doneToday, percent: Math.min(100, Math.round((doneToday / goals.dailyGoal) * 100)) },
    forecast: forecast(cards, now, 7, tz),
    heatmap: heatmap(done, now, 26, tz),
    time: studyTime(times, now, tz),
    calibration: calibration(p.attempts, now, 30),
    leeches: leechList,
    paces: pacesOf(h, lessons, p, now),
    streak: reviewStreakFromLog(p.reviews, now),
    totals: rep.totals,
    nextDueText: rep.nextDue ? whenText(rep.nextDue, now) : null,
    nextDue: rep.nextDue ?? null,
    suspended: goals.suspended.length,
  }
}
