import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { mkdtempSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { compileFile, workspace, loadCourse, curriculumStatus, planFor, findDoc, loadProgress, saveProgress, resolverFor } from '../src/node'
import { compile } from '../src/compile'
import { studyQueue, locate, pose, check, ratingFor, scheduleAfter, report, reviewStreakFromLog, parseBlankAnswers, ratingWords, whenText } from '../src/tutor'

const root = resolve(__dirname, 'fixtures/curriculum')
const lessonPath = resolve(root, 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md')

describe('companion lessons', () => {
  it('::read resolves against the source; a missing section is E111', () => {
    const r = compileFile(lessonPath)
    const read = r.lesson!.cards[0].blocks[0]
    expect(read).toMatchObject({ type: 'read', refs: [{ section: '2', title: 'The radar equation' }, { section: '2.1' }] })
    expect(r.diagnostics.map((d) => d.code)).toContain('E111')
  })
})

describe('workspace', () => {
  const ws = workspace(root)
  it('status maps documents to lessons', () => {
    const st = curriculumStatus(ws)
    expect(st).toHaveLength(1)
    expect(st[0]).toMatchObject({ doc: '00_FOUNDATIONS/04_radar.md', existing: 1, errors: 1, cards: 3, widgets: 3 })
  })
  it('plans with paths and source links; finds docs by fragment', () => {
    const doc = findDoc(ws, '04_radar')!
    const plan = planFor(ws, doc, 30)
    expect(plan[0].source).toBe('../../../00_FOUNDATIONS/04_radar.md')
    expect(plan[0].path).toContain('learn/00_FOUNDATIONS/04_radar/')
  })
  it('progress round-trips atomically', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'mdl-'))
    const w2 = workspace(tmp)
    expect(loadProgress(w2).reviews).toEqual([])
    saveProgress(w2, { version: 1, reviews: [{ id: 'a', t: 1, key: 'k', rating: 3 }], attempts: [] })
    expect(loadProgress(w2).reviews).toHaveLength(1)
  })
})

describe('tutor', () => {
  const lessons = loadCourse(resolve(root, 'learn')).map((l) => l.lesson!)
  it('queue: new cards in order, due ones first once reviewed', () => {
    const q = studyQueue(lessons, [])
    expect(q.map((x) => x.reason)).toEqual(['new', 'new'])
    const t0 = Date.UTC(2026, 9, 1)
    const q2 = studyQueue(lessons, [{ id: 'r', t: t0, key: q[0].cardKey, rating: 1 }], { now: t0 + 864e5 })
    expect(q2[0]).toMatchObject({ reason: 'due', cardKey: q[0].cardKey })
  })
  it('pose never leaks the answer; check grades it', () => {
    const quiz = lessons[0].cards[1].blocks.find((b) => b.type === 'quiz') as { id: string }
    const loc = locate(lessons, quiz.id)!
    const p = pose(loc)
    expect(p.question).not.toMatch(/Right:|limits azimuth/)
    expect(p.reads[0]).toMatchObject({ section: '3' })
    const letter = 'ABC'[p.question.split('\n').filter((l) => /^\s+[A-C]\s\s/.test(l)).findIndex((l) => l.includes('bandwidth'))]
    expect(check(loc, `${letter}`).correct).toBe(true)
    const wrong = check(loc, letter === 'A' ? 'B' : 'A')
    expect(wrong.correct).toBe(false); expect(wrong.feedback).toMatch(/limits azimuth|Height changes/); expect(check(loc, 'x').feedback).not.toMatch(/such as/)
    expect(wrong.answer).toMatch(/^Answer: [A-C] — The pulse bandwidth/)
    expect(check(loc, letter).feedback).toMatch(/^Right:/)
  })
  it('cloze and order answers', () => {
    const cloze = locate(lessons, (lessons[0].cards[0].blocks.find((b) => b.type === 'cloze') as { id: string }).id)!
    expect(pose(cloze).question).toContain('[1]____')
    expect(check(cloze, '16').correct).toBe(true)
    expect(parseBlankAnswers('1: a; 2: b', 2)).toEqual(['a', 'b'])
    const order = locate(lessons, (lessons[0].cards[1].blocks.find((b) => b.type === 'order') as { id: string }).id)!
    const shown = pose(order).question.split('\n').filter((l) => /^\s+\d\s\s/.test(l))
    const pos = (s: string) => shown.findIndex((l) => l.includes(s)) + 1
    const right = ['Transmit', 'towards', 'Scatter', 'back'].map(pos)
    expect(check(order, right.join(', ')).correct).toBe(true)
    const swapped = [right[1], right[0], right[2], right[3]]
    expect(check(order, swapped.join(','))).toMatchObject({ correct: true, partial: true })
  })
  it('ratings and schedule', () => {
    expect(ratingFor({ correct: true, sure: true })).toBe(3)
    expect(ratingFor({ correct: true, sure: false })).toBe(2)
    expect(ratingFor({ correct: false })).toBe(1)
    const s = scheduleAfter([{ id: 'x', t: Date.UTC(2026, 9, 1), key: 'k', rating: 3 }], 'k')!
    expect(new Date(s.due).getTime()).toBeGreaterThan(Date.UTC(2026, 9, 1))
  })
  it('report and streak', () => {
    const r = report(lessons, [])
    expect(r.totals).toMatchObject({ cards: 2, seen: 0 })
    const d = (n: number) => Date.UTC(2026, 9, n, 12)
    const key = 'k'
    // reviewed on day 1; due again later; cleared on each due day
    const log = [{ id: '1', t: d(1), key, rating: 3 as const }]
    expect(reviewStreakFromLog(log, d(1), 0)).toBe(1) // studied today with nothing overdue: counts
  })
})

describe('review streak from the log', () => {
  it('a cleared due day counts; a missed due day breaks the streak; today is pending', () => {
    const day = 864e5, t1 = Date.UTC(2026, 9, 1, 9)
    // two Goods: the card leaves FSRS short-term learning steps and is next due on a later day
    const log = [{ id: '1', t: t1, key: 'k', rating: 3 as const }, { id: '1b', t: t1 + 15 * 6e4, key: 'k', rating: 3 as const }]
    const due1 = new Date(scheduleAfter(log, 'k')!.due).getTime()
    const dueDay = Math.floor(due1 / day) * day + 10 * 3600e3
    expect(due1 - t1).toBeGreaterThan(day)
    const cleared = [...log, { id: '2', t: Math.max(dueDay, due1), key: 'k', rating: 3 as const }]
    expect(reviewStreakFromLog(cleared, Math.max(dueDay, due1) + 3600e3, 0)).toBe(2) // first day + the cleared due day
    // same history, but looked at two days after an uncleared due date → broken
    expect(reviewStreakFromLog(log, due1 + 2 * day, 0)).toBe(0)
  })
})

describe('answer parsing (critique P0)', () => {
  it('decimals are never read as gap labels', () => {
    expect(parseBlankAnswers('42.9', 1)).toEqual(['42.9'])
    expect(parseBlankAnswers('-15.5; 48.4', 2)).toEqual(['-15.5', '48.4'])
    expect(parseBlankAnswers('42.9; 7', 2)).toEqual(['42.9', '7'])
    expect(parseBlankAnswers('10:30', 1)).toEqual(['10:30'])
  })
  it('explicit labels still work, in any order', () => {
    expect(parseBlankAnswers('2: b; 1: a', 2)).toEqual(['a', 'b'])
    expect(parseBlankAnswers('[1] a\n[2] b', 2)).toEqual(['a', 'b'])
    expect(parseBlankAnswers('1) -15.5; 2) 48.4', 2)).toEqual(['-15.5', '48.4'])
    expect(parseBlankAnswers('1. prior; 2. posterior', 2)).toEqual(['prior', 'posterior'])
  })
  it('a numeric cloze answered naturally is correct', () => {
    const lessons = loadCourse(resolve(root, 'learn')).map((l) => l.lesson!)
    const cloze = locate(lessons, (lessons[0].cards[0].blocks.find((b) => b.type === 'cloze') as { id: string }).id)!
    expect(check(cloze, '16').correct).toBe(true)
    expect(check(cloze, '16.0').correct).toBe(true)
  })
})

describe('learner-facing copy (critique)', () => {
  const lessons = loadCourse(resolve(root, 'learn')).map((l) => l.lesson!)
  it('terminal format lines match how the terminal reads answers', () => {
    const quiz = locate(lessons, (lessons[0].cards[1].blocks.find((b) => b.type === 'quiz') as { id: string }).id)!
    expect(pose(quiz, { surface: 'terminal' }).answerFormat).toBe('Type one letter (A–C).')
    expect(pose(quiz).answerFormat).toMatch(/whether you are sure/)
  })
  it('order answers come back as item text, not bare numbers', () => {
    const order = locate(lessons, (lessons[0].cards[1].blocks.find((b) => b.type === 'order') as { id: string }).id)!
    expect(check(order, '').answer).toMatch(/1\. Transmit the pulse\./)
  })
  it('a skipped cloze still yields its answer', () => {
    const cloze = locate(lessons, (lessons[0].cards[0].blocks.find((b) => b.type === 'cloze') as { id: string }).id)!
    expect(check(cloze, '').answer).toBe('Answer: 16')
    expect(check(cloze, '15').feedback).toBe('you wrote 15 — it is 16')
  })
  it('ratings and dates read as plain language', () => {
    expect(ratingWords(1).word).toBe('again')
    const now = Date.UTC(2026, 9, 1, 9)
    expect(whenText(new Date(now + 10 * 6e4).toISOString(), now)).toBe('in 10 minutes')
    expect(whenText(new Date(now + 864e5).toISOString(), now)).toBe('tomorrow')
  })
  it('report separates your accuracy from the model prediction', () => {
    const r = report(lessons, [], Date.now(), [{ t: Date.now(), widget: 'w', correct: true, kind: 'attempt' }, { t: Date.now(), widget: 'w', correct: false, kind: 'attempt' }])
    expect(r.accuracy.today).toEqual({ answered: 1, correct: 1 })
    expect(r.lessons[0]).toHaveProperty('predictedRecall')
  })
})

describe('companion error states', () => {
  it('a missing source document is reported once, not per ::read', () => {
    const r = compile('---\ntitle: T\nsource: ../nope.md\n---\n## A\n::read[§1]\n## B\n::read[§2]\n## C\n::read[§3]', { path: lessonPath, resolveSource: resolverFor(lessonPath) })
    expect(r.diagnostics.filter((d) => d.code === 'E111')).toHaveLength(1)
    expect(r.diagnostics.find((d) => d.code === 'E111')!.message).toMatch(/source document not found/)
  })
})
