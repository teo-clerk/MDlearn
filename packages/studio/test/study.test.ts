import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { loadProgress, workspace, loadCourse } from '@mdlearn/core/node'
import { seededOrder, type Lesson } from '@mdlearn/core'
import type { StudyPlan, StudyItem, RecordResponse } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-study-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 'test', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const lessons = loadCourse(workspace(root).learnDir).map((l) => l.lesson).filter((l): l is Lesson => !!l)
  return { root, h, get, post, lessons }
}

describe('a question a video pauses at', () => {
  it('says which video and when on the study card', async () => {
    const { root, get } = setup()
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(root, 'learn/video'), { recursive: true })
    writeFileSync(join(root, 'learn/video/01-watch.learn.md'), '---\ntitle: Watch\nid: watch\n---\n## The talk\n\n::video[https://vimeo.com/76979871]{title="The talk"}\n\n:::quiz{at=2:30}\nWhich band?\n- [x] C\n- [ ] L\n  > No.\n:::\n')
    const watch = loadCourse(workspace(root).learnDir).map((l) => l.lesson).find((l) => l?.id === 'watch')!
    const quiz = watch.cards[0].blocks.find((b) => b.type === 'quiz') as { id: string }
    const item = await get<StudyItem>(`/study/item?widget=${encodeURIComponent(quiz.id)}`)
    expect(item.video).toEqual({ title: 'The talk', at: '2:30', link: 'https://vimeo.com/76979871#t=150s' })
  })
})

describe('study over HTTP', () => {
  const { root, get, post, lessons } = setup()
  it('plans a session of new cards with a time estimate', async () => {
    const p = await get<StudyPlan>('/study/queue?limit=5')
    expect(p.items.length).toBeGreaterThan(0)
    expect(p.fresh).toBe(p.items.length)
    expect(p.minutes).toBeGreaterThanOrEqual(1)
  })
  it('an item never carries answer keys', async () => {
    const p = await get<StudyPlan>('/study/queue')
    for (const it of p.items) {
      const item = await get<StudyItem>(`/study/item?widget=${encodeURIComponent(it.widgetId)}`)
      const json = JSON.stringify(item)
      for (const k of ['"correct"', '"answers"', '"solution"', '"ideas"', '"feedback"', '"reveal"']) expect(json, it.widgetId).not.toContain(k)
      expect(item.widget.type).toBe(it.kind)
    }
  })
  it('check grades on the server and logs the attempt; practice is not logged', async () => {
    const quiz = lessons.flatMap((l) => l.cards.flatMap((c) => c.blocks)).find((b) => b.type === 'quiz')!
    if (quiz.type !== 'quiz') throw new Error('fixture needs a quiz')
    const key = (quiz.sortNumeric ? quiz.options : seededOrder(quiz.options, quiz.id)).findIndex((o) => o.correct)
    const r = await (await post('/study/check', { widgetId: quiz.id, answer: { type: 'quiz', picked: [key] }, sure: true })).json() as { checked: { correct: boolean; parts: { options: unknown[] } } }
    expect(r.checked.correct).toBe(true)
    expect(r.checked.parts.options).toHaveLength(quiz.options.length)
    const before = loadProgress(workspace(root)).attempts.length
    await post('/study/check', { widgetId: quiz.id, answer: { type: 'quiz', picked: [key] }, practice: true })
    expect(loadProgress(workspace(root)).attempts.length).toBe(before)
    expect(before).toBe(1)
  })
  it('a malformed answer is refused, not graded', async () => {
    const quiz = lessons.flatMap((l) => l.cards.flatMap((c) => c.blocks)).find((b) => b.type === 'quiz')!
    const r = await post('/study/check', { widgetId: (quiz as { id: string }).id, answer: { type: 'quiz', picked: [99] } })
    expect(r.status).toBe(400)
  })
  it('record schedules the card in plain words and the report reflects it', async () => {
    const p = await get<StudyPlan>('/study/queue')
    const rec = await (await post('/study/record', { cardKey: p.items[0].cardKey, outcome: { correct: true, sure: true } })).json() as RecordResponse
    expect(rec).toMatchObject({ rating: 3, word: 'solid' })
    expect(rec.next?.when).toMatch(/minute|today|tomorrow|days/)
    const rep = await get<{ totals: { seen: number }; streak: number; nextDueText: string | null }>('/study/report')
    expect(rep.totals.seen).toBe(1)
    expect(rep.streak).toBe(1)
  })
  it('section map shows memory per section of the source document', async () => {
    const map = await get<{ num: string | null; cards: number }[]>('/study/map?path=00_FOUNDATIONS/04_radar.md')
    expect(map.some((s) => s.cards > 0)).toBe(true)
  })
  it('unknown cards are 404 with a helpful message', async () => {
    const r = await post('/study/record', { cardKey: 'nope/nope', outcome: { correct: true } })
    expect(r.status).toBe(404)
  })
})
