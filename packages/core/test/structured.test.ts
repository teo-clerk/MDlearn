import { describe, it, expect } from 'vitest'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { compileFile, loadCourse } from '../src/node'
import { isWidget } from '../src/compile'
import { locate, askable, check, checkStructured, redactWidget, seededOrder, parseWebAnswer, type Located } from '../src/tutor'
import type { Lesson, Block } from '../src/ast'
import { compile } from '../src/compile'

const lesson = compileFile(resolve(__dirname, 'fixtures/02-bayes-theorem.learn.md')).lesson as Lesson
const widgets = lesson.cards.flatMap((c) => c.blocks.filter(askable))
const loc = (type: string): Located => locate([lesson], widgets.find((w) => w.type === type)!.id)!

const KEY_FIELDS = ['correct', 'answers', 'feedback', 'ideas', 'solution', 'tests', 'reveal', 'tol']
const keysIn = (v: unknown, path = ''): string[] =>
  Array.isArray(v) ? v.flatMap((x, i) => keysIn(x, `${path}[${i}]`))
    : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [...(KEY_FIELDS.includes(k) ? [`${path}.${k}`] : []), ...keysIn(x, `${path}.${k}`)])
      : []

describe('isWidget is an allowlist', () => {
  it.each([['quiz', true], ['cloze', true], ['order', true], ['explain', true], ['steps', true], ['code', true],
    ['prose', false], ['read', false], ['callout', false], ['unavailable', false], ['plot', false], ['formula', false], ['sim', false]])(
    '%s → %s', (type, expected) => { expect(isWidget({ type } as unknown as Block)).toBe(expected) })
})

describe('redactWidget', () => {
  it('fixture covers every widget type', () => {
    expect(new Set(widgets.map((w) => w.type))).toEqual(new Set(['quiz', 'cloze', 'order', 'explain', 'steps', 'code']))
  })
  it('never contains answer keys, feedback, ideas, solutions or tests', () => {
    for (const w of widgets) expect(keysIn(redactWidget(w)), w.id).toEqual([])
  })
  const learn = join(process.env.MDLEARN_CORPUS ?? '', 'learn') // a real curriculum, when one is at hand
  it.skipIf(!existsSync(learn))('contract holds for every companion lesson of a real curriculum', () => {
    const all = loadCourse(learn).flatMap((l) => l.lesson?.cards.flatMap((c) => c.blocks.filter(askable)) ?? [])
    expect(all.length).toBeGreaterThan(100)
    for (const w of all) expect(keysIn(redactWidget(w)), w.id).toEqual([])
  }, 60_000) // compiles the whole curriculum (247 lessons)
  it('shows quiz options and order items in the same seeded order as the terminal', () => {
    const q = loc('quiz').widget as Extract<Block, { type: 'quiz' }>
    const r = redactWidget(q)
    const shown = q.sortNumeric ? q.options : seededOrder(q.options, q.id)
    expect(r.type === 'quiz' && r.options.map((o) => JSON.stringify(o.content))).toEqual(shown.map((o) => JSON.stringify(o.content)))
    expect(r.hints).toBe(q.hints.length)
  })
})

describe('checkStructured agrees with the text checker', () => {
  it('quiz: picking the key by display index', () => {
    const l = loc('quiz'); const w = l.widget as Extract<Block, { type: 'quiz' }>
    const shown = w.sortNumeric ? w.options : seededOrder(w.options, w.id)
    const key = shown.findIndex((o) => o.correct)
    const wrong = shown.findIndex((o) => !o.correct)
    expect(checkStructured(l, { type: 'quiz', picked: [key] }).correct).toBe(true)
    const bad = checkStructured(l, { type: 'quiz', picked: [wrong] })
    expect(bad.correct).toBe(false)
    expect(bad.parts?.options?.[wrong]).toMatchObject({ picked: true, correct: false })
    expect(bad.parts?.options?.[key]).toMatchObject({ picked: false, correct: true })
    expect(check(l, 'ABCDEFGH'[key]).correct).toBe(true)
  })
  it('cloze: values per blank, with per-blank verdicts', () => {
    const l = loc('cloze'); const w = l.widget as Extract<Block, { type: 'cloze' }>
    const right = w.blanks.map((b) => b.answers[0])
    const r = checkStructured(l, { type: 'cloze', values: right })
    expect(r.correct).toBe(true)
    expect(r.parts?.blanks?.every((b) => b.ok)).toBe(true)
    const wrong = checkStructured(l, { type: 'cloze', values: right.map(() => 'zzz') })
    expect(wrong.correct).toBe(false)
    expect(wrong.parts?.blanks?.[0]).toMatchObject({ ok: false, given: 'zzz', expected: w.blanks[0].answers[0] })
  })
  it('a value containing ";" is one answer, not two', () => {
    const l = loc('cloze'); const w = l.widget as Extract<Block, { type: 'cloze' }>
    const r = checkStructured(l, { type: 'cloze', values: w.blanks.map((b, i) => (i === 0 ? `${b.answers[0]}; extra` : b.answers[0])) })
    expect(r.parts?.blanks?.[0].given).toBe(`${w.blanks[0].answers[0]}; extra`)
  })
  it('order: display indices in the chosen order', () => {
    const l = loc('order'); const w = l.widget as Extract<Block, { type: 'order' }>
    const shown = seededOrder(w.items.map((_, i) => i), w.id)
    const right = w.items.map((_, i) => shown.indexOf(i))
    expect(checkStructured(l, { type: 'order', order: right }).correct).toBe(true)
    expect(checkStructured(l, { type: 'order', order: [...right].reverse() }).correct).toBe(false)
    expect(checkStructured(l, { type: 'order', order: right }).parts?.order).toEqual(right)
  })
  it('explain and code need judging; skip reveals', () => {
    expect(checkStructured(loc('explain'), { type: 'explain', text: 'because' }).correct).toBeNull()
    expect(checkStructured(loc('code'), { type: 'code', text: 'x' }).correct).toBeNull()
    const s = checkStructured(loc('cloze'), { type: 'skip' })
    expect(s.correct).toBe(false)
    expect(s.answer).toMatch(/^Answer:/)
  })
})

describe('untrusted answers', () => {
  const quiz = loc('quiz').widget, cloze = loc('cloze').widget, order = loc('order').widget, explain = loc('explain').widget
  it('parseWebAnswer accepts well-formed answers', () => {
    expect(parseWebAnswer(quiz, { type: 'quiz', picked: [0] })).not.toBeNull()
    expect(parseWebAnswer(cloze, { type: 'cloze', values: (cloze as { blanks: unknown[] }).blanks.map(() => 'x') })).not.toBeNull()
    expect(parseWebAnswer(order, { type: 'order', order: (order as { items: unknown[] }).items.map((_, i) => i) })).not.toBeNull()
    expect(parseWebAnswer(explain, { type: 'skip' })).toEqual({ type: 'skip' })
  })
  it.each([
    ['not an object', 5], ['picked not an array', { type: 'quiz', picked: 5 }], ['index out of range', { type: 'quiz', picked: [99] }],
    ['repeated index', { type: 'quiz', picked: [0, 0] }], ['wrong type for widget', { type: 'order', order: [0, 1, 2] }],
    ['non-string value', { type: 'cloze', values: [123] }],
  ])('parseWebAnswer rejects %s', (_, raw) => { expect(parseWebAnswer(quiz, raw)).toBeNull() })
  it('rejects wrong gap counts, non-permutations and huge text', () => {
    expect(parseWebAnswer(cloze, { type: 'cloze', values: [] })).toBeNull()
    expect(parseWebAnswer(order, { type: 'order', order: [0, 0, 1] })).toBeNull()
    expect(parseWebAnswer(explain, { type: 'explain', text: 'x'.repeat(5000) })).toBeNull()
  })
  it('an out-of-range index makes an answer wrong, never ignored', () => {
    const l = loc('quiz'); const w = l.widget as Extract<Block, { type: 'quiz' }>
    const shown = w.sortNumeric ? w.options : seededOrder(w.options, w.id)
    const key = shown.findIndex((o) => o.correct)
    expect(checkStructured(l, { type: 'quiz', picked: [key, 99] }).correct).toBe(false)
    const lo = loc('order'); const n = (lo.widget as { items: unknown[] }).items.length
    expect(check(lo, `${n + 5} 1 2 3`).correct).toBe(false)
  })
  it('an empty explanation counts as a skip', () => {
    const r = checkStructured(loc('explain'), { type: 'explain', text: '   ' })
    expect(r.correct).toBe(false)
    expect(r.feedback).toBe('Skipped.')
  })
})

describe('runnable exercises (Python in the browser)', () => {
  const code = () => loc('code')
  it('the fixture exercise is runnable, and its checks reach the browser but not the solution', () => {
    const w = code().widget as Extract<Block, { type: 'code' }>
    expect(w.mode).toBe('run')
    const posed = redactWidget(w) as { runnable: boolean; testSource?: string }
    expect(posed.runnable).toBe(true)
    expect(posed.testSource).toContain('assert abs(posterior(0.01')
    expect(JSON.stringify(posed)).not.toContain('hit / (hit')
  })
  it('all checks passing is correct; some passing is partial; none is wrong', () => {
    const l = code()
    const pass = checkStructured(l, { type: 'code', text: 'x', tests: { passed: 3, total: 3 } })
    expect(pass).toMatchObject({ correct: true, partial: false, feedback: 'All 3 checks pass.' })
    const some = checkStructured(l, { type: 'code', text: 'x', tests: { passed: 2, total: 3 } })
    expect(some).toMatchObject({ correct: false, partial: true, feedback: '2 of 3 checks pass.' })
    expect(checkStructured(l, { type: 'code', text: 'x', tests: { passed: 0, total: 3 } })).toMatchObject({ correct: false, partial: false })
    expect(pass.parts?.tests).toEqual({ passed: 3, total: 3 })
    expect(pass.answer).toContain('def posterior') // the solution is shown after an attempt
  })
  it('without results the learner still compares with the reference (terminal, chat)', () => {
    expect(checkStructured(code(), { type: 'code', text: 'x' }).correct).toBeNull()
    expect(check(code(), 'my attempt').correct).toBeNull()
  })
  it('the server refuses impossible results', () => {
    const w = code().widget
    expect(parseWebAnswer(w, { type: 'code', text: 'x', tests: { passed: 4, total: 3 } })).toBeNull()
    expect(parseWebAnswer(w, { type: 'code', text: 'x', tests: { passed: 1, total: 0 } })).toBeNull()
    expect(parseWebAnswer(w, { type: 'code', text: 'x', tests: { passed: 2, total: 3 } })).not.toBeNull()
  })
  it('results sent for a non-runnable exercise are ignored', () => {
    // a self-check exercise (no runnable language) is never auto-graded from the client's claim
    const src = '---\ntitle: T\n---\n## C\n\n:::code\nWrite it.\n```c\nint f();\n```\n```c test\nassert(f()==1);\n```\n:::\n'
    const l2 = (compile(src).lesson as Lesson)
    const loc2 = locate([l2], (l2.cards[0].blocks.find((b) => b.type === 'code') as { id: string }).id)!
    expect(checkStructured(loc2, { type: 'code', text: 'x', tests: { passed: 1, total: 1 } }).correct).toBeNull()
  })
})
