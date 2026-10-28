import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { examQueue, examSummary, examOutcome, type ExamAnswer } from '../src/learn/exam'
import { ratingFor } from '../src/tutor'
import type { Lesson } from '../src/ast'
import type { ReviewEvent } from '../src/learn/srs'

const quiz = (q: string) => `:::quiz\n${q}?\n- [x] Yes\n- [ ] No\n  > No.\n:::`
const lesson = (id: string, cards: string[]) => compile(`---\ntitle: ${id.toUpperCase()}\nid: ${id}\n---\n${cards.join('\n\n')}\n`, { path: `learn/${id}.learn.md` }).lesson as Lesson
const A = lesson('a', ['## One\n\n' + quiz('A one'), '## Two\n\n' + quiz('A two'), '## Three\n\n:::explain\nWhy?\n- Because.\n:::', '## Four\n\n:::cloze\nThe {{answer}} is here.\n:::'])
const B = lesson('b', ['## One\n\n' + quiz('B one'), '## Two\n\n' + quiz('B two')])
const NOW = Date.parse('2026-10-06T12:00:00Z')
const seen = (...keys: string[]): ReviewEvent[] => keys.map((key, i) => ({ id: `r${i}`, t: NOW - 3 * 864e5, key, rating: 3 }))

describe('examQueue', () => {
  it('asks only about cards you have studied, never explanations, mixing lessons', () => {
    const reviews = seen('a/one', 'a/two', 'a/three', 'a/four', 'b/one', 'b/two')
    const { items, available } = examQueue([A, B], reviews, { count: 10, seed: 's', now: NOW })
    expect(available).toBe(5) // a/three is an explanation only
    expect(items.map((i) => i.cardKey).sort()).toEqual(['a/four', 'a/one', 'a/two', 'b/one', 'b/two'])
    expect(items.every((i) => ['quiz', 'cloze'].includes(i.kind))).toBe(true)
    for (let i = 1; i < items.length - 1; i++) expect(items[i].lessonId === items[i - 1].lessonId && items[i].lessonId === items[i + 1].lessonId).toBe(false)
  })
  it('samples the same exam for the same seed, and a different one for another', () => {
    const reviews = seen('a/one', 'a/two', 'a/four', 'b/one', 'b/two')
    const one = examQueue([A, B], reviews, { count: 3, seed: 'x', now: NOW }).items.map((i) => i.cardKey)
    expect(examQueue([A, B], reviews, { count: 3, seed: 'x', now: NOW }).items.map((i) => i.cardKey)).toEqual(one)
    expect(one).toHaveLength(3)
    const seeds = new Set(['p', 'q', 'r', 's', 't', 'u'].map((seed) => examQueue([A, B], reviews, { count: 3, seed, now: NOW }).items.map((i) => i.cardKey).sort().join()))
    expect(seeds.size).toBeGreaterThan(1)
  })
  it('keeps to the chosen lessons and leaves out set-aside cards and unseen ones', () => {
    const { items } = examQueue([A, B], seen('a/one', 'b/one', 'b/two'), { count: 10, seed: 's', now: NOW, lessons: new Set(['b']), suspended: new Set(['b/two']) })
    expect(items.map((i) => i.cardKey)).toEqual(['b/one'])
    expect(examQueue([A, B], [], { count: 10, seed: 's', now: NOW })).toEqual({ items: [], available: 0 })
  })
})

describe('exam marks', () => {
  const ans = (lessonId: string, correct: boolean | null, extra: Partial<ExamAnswer> = {}): ExamAnswer => ({ widgetId: `${lessonId}/w`, cardKey: `${lessonId}/c`, lessonId, lessonTitle: lessonId.toUpperCase(), correct, ms: 10_000, ...extra })
  it('scores every question, counts unanswered ones as wrong, and puts the weakest lesson first', () => {
    const s = examSummary([ans('a', true), ans('a', true), ans('b', false, { sure: true }), ans('b', null, { ms: 0 }), ans('a', true, { skipped: true })])
    expect(s).toMatchObject({ total: 5, answered: 4, right: 2, sureWrong: 1, msPerQuestion: 10_000 })
    expect(s.score).toBeCloseTo(0.4)
    expect(s.lessons.map((l) => [l.lessonId, l.right, l.total])).toEqual([['b', 0, 2], ['a', 2, 3]])
  })
  it('records with the study rating table: right and sure is solid, not sure is shaky, a skip is again', () => {
    expect(ratingFor(examOutcome(ans('a', true, { sure: true })))).toBe(3)
    expect(ratingFor(examOutcome(ans('a', true, { sure: false })))).toBe(2)
    expect(ratingFor(examOutcome(ans('a', true, { partial: true })))).toBe(2)
    expect(ratingFor(examOutcome(ans('a', false, { sure: true })))).toBe(1)
    expect(ratingFor(examOutcome(ans('a', false, { skipped: true })))).toBe(1)
  })
})
