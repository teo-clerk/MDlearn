import { describe, it, expect } from 'vitest'
import { deriveCards, type ReviewEvent } from '../src/learn/srs'
import { forecast, heatmap, studyTime, calibration, leeches, pacing, dayKey } from '../src/learn/analytics'

const TZ = 0 // UTC, so the tests do not depend on the machine's time zone
const at = (iso: string) => new Date(iso).getTime()
const ev = (id: string, iso: string, key: string, rating: 1 | 2 | 3 = 3): ReviewEvent => ({ id, t: at(iso), key, rating })
const NOW = at('2026-10-06T12:00:00Z')

describe('forecast', () => {
  it('counts what is due each day; day 0 includes everything overdue', () => {
    const cards = deriveCards([ev('a', '2026-09-01T09:00:00Z', 'l/a'), ev('b', '2026-10-05T09:00:00Z', 'l/b'), ev('c', '2026-10-06T11:00:00Z', 'l/c')])
    const f = forecast(cards, NOW, 7, TZ)
    expect(f).toHaveLength(7)
    expect(f[0].date).toBe('2026-10-06')
    expect(f.reduce((n, d) => n + d.count, 0)).toBeGreaterThanOrEqual(1)
    expect(f[0].count).toBeGreaterThanOrEqual(1) // the card from September is overdue
  })
})

describe('heatmap', () => {
  it('counts reviews per local day and scales levels 0–4', () => {
    const reviews = [...Array(8)].map((_, i) => ev(`x${i}`, '2026-10-06T08:00:00Z', `l/c${i}`)).concat([ev('y', '2026-10-04T08:00:00Z', 'l/z')])
    const h = heatmap(reviews, NOW, 4, TZ)
    expect(h.days).toHaveLength(28)
    expect(h.days.at(-1)).toMatchObject({ date: '2026-10-06', count: 8, level: 4 })
    expect(h.days.find((d) => d.date === '2026-10-04')).toMatchObject({ count: 1 })
    expect(h.days.find((d) => d.date === '2026-10-05')).toMatchObject({ count: 0, level: 0 })
    expect(h.total).toBe(9)
  })
})

describe('study time', () => {
  it('sums time between events, capping idle gaps, and splits sessions after 5 minutes', () => {
    const t = (m: number) => at('2026-10-06T08:00:00Z') + m * 60_000
    const r = studyTime([t(0), t(1), t(2), t(30), t(31)], NOW, TZ)
    expect(r.sessions).toBe(2)
    expect(r.today.minutes).toBeGreaterThanOrEqual(3)
    expect(r.today.minutes).toBeLessThanOrEqual(5)
  })
  it('nothing is zero', () => { expect(studyTime([], NOW, TZ)).toMatchObject({ sessions: 0, today: { minutes: 0 } }) })
})

describe('confidence calibration', () => {
  it('says how often "sure" and "not sure" answers were right', () => {
    const a = (t: number, sure: boolean, correct: boolean) => ({ id: String(t), t, widget: 'w', card: 'l/c', kind: 'attempt', sure, correct })
    const c = calibration([a(NOW - 1, true, true), a(NOW - 2, true, true), a(NOW - 3, true, false), a(NOW - 4, false, false), a(NOW - 5, false, true)], NOW, 30)
    expect(c).toMatchObject({ sureRight: 2, sureWrong: 1, unsureRight: 1, unsureWrong: 1, answered: 5 })
    expect(c.sureAccuracy).toBeCloseTo(2 / 3)
    expect(c.unsureAccuracy).toBeCloseTo(0.5)
  })
  it('ignores answers without a confidence rating or older than the window', () => {
    const c = calibration([{ id: 'x', t: NOW - 40 * 864e5, widget: 'w', card: 'c', kind: 'attempt', sure: true, correct: true }, { id: 'y', t: NOW, widget: 'w', card: 'c', kind: 'attempt', correct: true }], NOW, 30)
    expect(c.answered).toBe(0)
    expect(c.sureAccuracy).toBeNull()
  })
})

describe('leeches', () => {
  const again = (n: number, key = 'l/hard') => [ev('first', '2026-09-01T08:00:00Z', key, 3), ...[...Array(n)].map((_, i) => ev(`a${i}`, `2026-09-0${i + 2}T08:00:00Z`, key, 1))]
  it('a card failed four times after its first review is a leech', () => {
    const l = leeches(again(4), [], new Set())
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ key: 'l/hard', lapses: 4 })
  })
  it('three "again" in a row is a leech even with fewer lapses overall', () => {
    expect(leeches([ev('f', '2026-09-01T08:00:00Z', 'l/x', 1), ev('a', '2026-09-02T08:00:00Z', 'l/x', 1), ev('b', '2026-09-03T08:00:00Z', 'l/x', 1)], [], new Set())).toHaveLength(1)
  })
  it('a card you now remember is not a leech', () => {
    expect(leeches([...again(3), ev('ok1', '2026-09-20T08:00:00Z', 'l/hard'), ev('ok2', '2026-09-25T08:00:00Z', 'l/hard')], [], new Set())).toHaveLength(0)
  })
  it('lists what you answered wrongly, and skips suspended cards', () => {
    const attempts = [{ id: '1', t: 1, widget: 'w', card: 'l/hard', kind: 'attempt', correct: false, answer: '12' }, { id: '2', t: 2, widget: 'w', card: 'l/hard', kind: 'attempt', correct: false, answer: '12' }, { id: '3', t: 3, widget: 'w', card: 'l/hard', kind: 'attempt', correct: false, answer: '20' }]
    expect(leeches(again(4), attempts, new Set())[0].wrongAnswers).toEqual(['20', '12'])
    expect(leeches(again(4), attempts, new Set(['l/hard']))).toHaveLength(0)
  })
})

describe('pacing', () => {
  const today = at('2026-10-06T12:00:00Z')
  it('turns a deadline into new cards per day', () => {
    const p = pacing({ remainingNew: 140, deadline: '2026-10-16', now: today, recentNewPerDay: 14 }, TZ)
    expect(p).toMatchObject({ daysLeft: 10, perDay: 14, status: 'on-track' })
  })
  it('says how far behind you are when your recent pace is too slow', () => {
    const p = pacing({ remainingNew: 140, deadline: '2026-10-16', now: today, recentNewPerDay: 7 }, TZ)
    expect(p.status).toBe('behind')
    expect(p.perDay).toBe(14)
    expect(p.daysBehind).toBe(10)
  })
  it('handles done, today, and past deadlines', () => {
    expect(pacing({ remainingNew: 0, deadline: '2026-10-16', now: today, recentNewPerDay: 0 }, TZ).status).toBe('done')
    expect(pacing({ remainingNew: 30, deadline: '2026-10-06', now: today, recentNewPerDay: 0 }, TZ)).toMatchObject({ daysLeft: 1, perDay: 30 })
    expect(pacing({ remainingNew: 30, deadline: '2026-10-01', now: today, recentNewPerDay: 5 }, TZ).status).toBe('overdue')
  })
})

describe('dayKey', () => { it('uses the given time zone offset', () => { expect(dayKey(at('2026-10-06T23:30:00Z'), TZ)).toBe('2026-10-06'); expect(dayKey(at('2026-10-06T23:30:00Z'), -120)).toBe('2026-10-07') }) })
