import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { loadProgress, workspace, loadCourse } from '@mdlearn/core/node'
import { seededOrder, askable, type Lesson } from '@mdlearn/core'
import type { ExamPlan, ExamResult } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-exam-'); cpSync(fixture, root, { recursive: true })
  const quiz = (n: number) => `## Question ${n}\n\n:::quiz\nIs ${n} a number?\n- [x] Yes\n- [ ] No\n  > It is.\n:::\n`
  mkdirSync(join(root, 'learn/extra'), { recursive: true })
  writeFileSync(join(root, 'learn/extra/01-numbers.learn.md'), `---\ntitle: Numbers\nid: numbers\n---\n${[1, 2, 3].map(quiz).join('\n')}`)
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 'test', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const lessons = loadCourse(workspace(root).learnDir).map((l) => l.lesson).filter((l): l is Lesson => !!l)
  return { root, get, post, lessons }
}

describe('mock exam over HTTP', () => {
  it('asks nothing before you have studied', async () => {
    const { get } = setup()
    expect(await get<ExamPlan>('/exam/plan?count=10')).toMatchObject({ items: [], available: 0 })
  })
  it('sets a paper without answers, marks it at the end, and records it once', async () => {
    const { root, get, post, lessons } = setup()
    const examinable = lessons.flatMap((l) => l.cards.filter((c) => c.blocks.some((b) => askable(b) && ['quiz', 'cloze'].includes(b.type))).map((c) => `${l.id}/${c.id}`))
    for (const cardKey of examinable) await post('/study/record', { cardKey, outcome: { correct: true, sure: true } })
    const paper = await get<ExamPlan>('/exam/plan?count=40')
    expect(paper.items.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(paper)).not.toMatch(/"correct"|"answers"/)
    const widgets = lessons.flatMap((l) => l.cards.flatMap((c) => c.blocks))
    const keyOf = (id: string, right: boolean) => {
      const w = widgets.find((b) => askable(b) && b.id === id)!
      if (w.type === 'cloze') return { type: 'cloze', values: w.blanks.map(() => 'zzz') }
      if (w.type !== 'quiz') return { type: 'skip' }
      return { type: 'quiz', picked: [(w.sortNumeric ? w.options : seededOrder(w.options, w.id)).findIndex((o) => o.correct === right)] }
    }
    const first = paper.items.find((i) => i.widget.type === 'quiz')!
    const second = paper.items.find((i) => i !== first && ['quiz', 'cloze'].includes(i.widget.type))!
    const rest = paper.items.filter((i) => i !== first && i !== second)
    expect(rest.length).toBeGreaterThan(0)
    const answers = [
      { widgetId: first.widget.id, answer: keyOf(first.widget.id, true), sure: true, ms: 8000 },
      { widgetId: second.widget.id, answer: keyOf(second.widget.id, false), sure: true, ms: 12000 },
      ...rest.map((i) => ({ widgetId: i.widget.id, answer: null, ms: 0 })),
    ]
    const before = loadProgress(workspace(root))
    const r = await (await post('/exam/grade', { id: paper.id, answers })).json() as ExamResult
    expect(r.summary).toMatchObject({ total: paper.items.length, answered: 2, sureWrong: 1 })
    expect(r.results[0]).toMatchObject({ correct: true, rating: 3, word: 'solid' })
    expect(r.results[1]).toMatchObject({ correct: false, rating: 1 })
    expect(r.results[1].checked.answer).toMatch(/^Answer:/) // the answer is shown once the paper is in
    expect(r.results.slice(2).every((x) => x.correct === null && x.rating === undefined)).toBe(true)
    const after = loadProgress(workspace(root))
    expect(after.reviews.length - before.reviews.length).toBe(2)
    expect(after.attempts.filter((a) => a.id.startsWith(`exam:${paper.id}:`))).toHaveLength(2)
    await post('/exam/grade', { id: paper.id, answers }) // sent again: nothing new
    expect(loadProgress(workspace(root)).reviews.length).toBe(after.reviews.length)
  })
  it('refuses a paper without a proper id or with too many answers', async () => {
    const { post } = setup()
    expect((await post('/exam/grade', { id: 'nope', answers: [{ widgetId: 'a/quiz-1', answer: null, ms: 0 }] })).status).toBe(400)
    const many = Array.from({ length: 51 }, (_, i) => ({ widgetId: `a/quiz-${i}`, answer: null, ms: 0 }))
    expect((await post('/exam/grade', { id: crypto.randomUUID(), answers: many })).status).toBe(400)
    expect((await post('/exam/grade', { id: crypto.randomUUID(), answers: [{ widgetId: 'gone/quiz-1', answer: null, ms: 0 }] })).status).toBe(404)
  })
})
