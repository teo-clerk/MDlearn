import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from '../src/compile'
import { start, reduce, cardRatings, rate } from '../src/learn/session'
import { deriveCards, mergeLogs, due, retrievability } from '../src/learn/srs'

const lesson = compile(readFileSync(resolve(__dirname, 'fixtures/02-bayes-theorem.learn.md'), 'utf8')).lesson!
const quizId = (lesson.cards[0].blocks[0] as { id: string }).id

describe('session reducer', () => {
  it('a widget-only card starts in the check phase and is attempt-gated', () => {
    let s = start(lesson)
    expect(s.phase).toBe('check')
    expect(reduce(lesson, s, { type: 'NEXT' }).pos).toBe(0) // not attempted yet
    s = reduce(lesson, s, { type: 'ATTEMPT', widgetId: quizId, correct: true, sure: true })
    s = reduce(lesson, s, { type: 'NEXT' })
    expect(s.pos).toBe(1); expect(s.phase).toBe('expose')
  })
  it('a missed item is re-queued with at least two items in between', () => {
    let s = start(lesson)
    s = reduce(lesson, s, { type: 'ATTEMPT', widgetId: quizId, correct: false, sure: true })
    expect(s.queue[3]).toEqual({ kind: 'retry', cardId: lesson.cards[0].id, widgetId: quizId })
    s = reduce(lesson, s, { type: 'ATTEMPT', widgetId: quizId, correct: true, sure: true })
    expect(cardRatings(lesson, s)[lesson.cards[0].id]).toBe(1) // any miss → Again
  })
  it('rating table', () => {
    const base = { failed: false, shaky: false, help: 'none' as const, done: true, revealed: false }
    expect(rate(base)).toBe(3)
    expect(rate({ ...base, shaky: true })).toBe(2)
    expect(rate({ ...base, help: 'look-back' })).toBe(2)
    expect(rate({ ...base, help: 'author-hint' })).toBe(2)
    expect(rate({ ...base, help: 'answer-hint' })).toBe(1)
    expect(rate({ ...base, revealed: true })).toBe(1)
  })
  it('exposition collapses into a check phase; looking back counts as help', () => {
    let s = { ...start(lesson), pos: 2, phase: 'expose' as const }
    s = reduce(lesson, s, { type: 'NEXT' }); expect(s.phase).toBe('check')
    s = reduce(lesson, s, { type: 'LOOK_BACK' })
    const cloze = (lesson.cards[2].blocks.at(-1) as { id: string }).id
    expect(s.runs[cloze].help).toBe('look-back')
  })
})

describe('FSRS from an event log', () => {
  it('replays a merged log from two tabs deterministically', () => {
    const t0 = Date.UTC(2026, 9, 1)
    const a = [{ id: 'e1', t: t0, key: 'bayes/base-rate', rating: 3 as const }]
    const b = [{ id: 'e1', t: t0, key: 'bayes/base-rate', rating: 3 as const }, { id: 'e2', t: t0 + 864e5 * 3, key: 'bayes/base-rate', rating: 1 as const }]
    const log = mergeLogs(a, b)
    expect(log).toHaveLength(2)
    const cards = deriveCards(log)
    const c = cards.get('bayes/base-rate')!
    const goodOnly = deriveCards(a).get('bayes/base-rate')!
    expect(c.reps).toBe(2)
    expect(c.due.getTime()).toBeLessThan(goodOnly.due.getTime() + 864e5 * 3) // Again shortens the interval
    expect(due(cards, t0 + 864e5 * 400)).toEqual(['bayes/base-rate'])
    expect(retrievability(c, new Date(t0 + 864e5 * 3))).toBeGreaterThan(0.5)
  })
})

describe('review fixes', () => {
  const mk = (src: string) => compile('---\ntitle: T\n---\n' + src).lesson!
  it('a fully worked steps widget is exposition: it neither blocks nor gets rated', () => {
    const l = mk('## A\n:::steps\nP\n1. a\n2. b\n:::')
    let s = start(l)
    s = reduce(l, s, { type: 'NEXT' })
    expect(s.phase).toBe('complete'); expect(cardRatings(l, s)).toEqual({})
  })
  it('a retry is a real, gated check and keeps the first miss', () => {
    const l = mk('## A\n:::quiz\nQ?\n- [x] a\n- [ ] b\n:::\n## B\nx\n## C\ny\n## D\nz')
    const id = (l.cards[0].blocks[0] as { id: string }).id
    let s = start(l)
    s = reduce(l, s, { type: 'ATTEMPT', widgetId: id, correct: false, sure: true })
    s = reduce(l, s, { type: 'ATTEMPT', widgetId: id, correct: true, sure: true })
    for (let i = 0; i < 3; i++) s = reduce(l, s, { type: 'NEXT' })
    expect(s.queue[s.pos]).toMatchObject({ kind: 'retry' })
    expect(reduce(l, s, { type: 'NEXT' }).pos).toBe(s.pos) // gated
    s = reduce(l, s, { type: 'ATTEMPT', widgetId: id, correct: true, sure: true })
    expect(s.runs[`${id}#retry`].done).toBe(true)
    expect(cardRatings(l, s)[l.cards[0].id]).toBe(1)
  })
  it('unfinished widgets rate Again', () => {
    const l = mk('## A\n:::quiz\nQ?\n- [x] a\n- [ ] b\n:::')
    expect(cardRatings(l, start(l))).toEqual({ [l.cards[0].id]: 1 })
  })
})

import { reviewStreak } from '../src/learn/streak'
describe('study streak over day summaries', () => {
  it('studied + cleared counts, quiet days are neutral, an uncleared due day breaks', () => {
    expect(reviewStreak([
      { date: '2026-10-03', due: 4, cleared: true, studied: 6 },
      { date: '2026-10-02', due: 0, cleared: true, studied: 0 },
      { date: '2026-10-01', due: 0, cleared: true, studied: 5 },
      { date: '2026-09-30', due: 3, cleared: false, studied: 1 },
      { date: '2026-09-29', due: 1, cleared: true, studied: 1 },
    ])).toBe(2)
  })
})
