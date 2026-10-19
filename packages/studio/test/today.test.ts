import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { appendProgress, workspace } from '@mdlearn/core/node'
import type { TodayResponse, StudyPlan, GoalsInfo } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-today-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  return { root, ws: workspace(root), get, post }
}
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

describe('Today', () => {
  it('summarises the day from your own logs', async () => {
    const { get } = setup()
    const t = await get<TodayResponse>('/today')
    expect(t.forecast).toHaveLength(7)
    expect(t.heatmap.days).toHaveLength(182)
    expect(t.goal).toMatchObject({ daily: 20, doneToday: 0, percent: 0 })
    expect(t.plan.items.length).toBeGreaterThan(0)
    expect(t.totals.cards).toBeGreaterThan(0)
    expect(t.leeches).toEqual([])
    expect(t.paces).toEqual([])
  })
  it('counts what you studied today', async () => {
    const { get, ws } = setup()
    const q = (await get<StudyPlan>('/study/queue')).items[0]
    appendProgress(ws, { reviews: [{ id: 'r1', t: Date.now(), key: q.cardKey, rating: 3 }], attempts: [{ id: 'a1', t: Date.now(), widget: q.widgetId, card: q.cardKey, kind: 'attempt', correct: true, sure: true }] })
    const t = await get<TodayResponse>('/today')
    expect(t.goal.doneToday).toBe(1)
    expect(t.streak).toBe(1)
    expect(t.calibration).toMatchObject({ sureRight: 1, answered: 1 })
    expect(t.time.today.minutes).toBeGreaterThanOrEqual(0)
    expect(t.heatmap.days.at(-1)?.count).toBe(1)
  })
})

describe('deadline pacing', () => {
  it('turns a deadline into the day’s new cards and says how you are doing', async () => {
    const { get, post } = setup()
    const total = (await get<TodayResponse>('/today')).totals.cards
    const r = await post('/goals', { deadlines: [{ scope: '', date: inDays(3), label: 'interview' }] })
    expect(r.status).toBe(200)
    const t = await get<TodayResponse>('/today')
    expect(t.paces[0]).toMatchObject({ scope: '', status: 'behind', remaining: total, perDay: Math.ceil(total / 3) })
    expect(t.paces[0].text).toMatch(/interview/)
    const plan = await get<StudyPlan>('/study/queue')
    expect(plan.fresh).toBe(Math.min(30, Math.ceil(total / 3)))
    // explicit counts still win
    expect((await get<StudyPlan>('/study/queue?newCards=1')).fresh).toBe(1)
  })
  it('refuses a deadline for a document that does not exist or is outside the folder', async () => {
    const { post } = setup()
    expect((await post('/goals', { deadlines: [{ scope: 'nope.md', date: inDays(3) }] })).status).toBe(404)
    expect((await post('/goals', { deadlines: [{ scope: '../x.md', date: inDays(3) }] })).status).toBe(403)
    expect((await post('/goals', { deadlines: [{ scope: '', date: 'tomorrow' }] })).status).toBe(400)
  })
  it('the daily goal changes the progress bar', async () => {
    const { get, post } = setup()
    await post('/goals', { dailyGoal: 5 })
    expect((await get<GoalsInfo>('/goals')).dailyGoal).toBe(5)
    expect((await get<TodayResponse>('/today')).goal.daily).toBe(5)
  })
})

describe('leeches and suspended cards', () => {
  it('a card you keep failing is listed with your wrong answers; suspending removes it from sessions', async () => {
    const { get, post, ws } = setup()
    const first = (await get<StudyPlan>('/study/queue')).items[0]
    const t0 = Date.now() - 6 * 864e5
    appendProgress(ws, {
      reviews: [3, 1, 1, 1, 1].map((rating, i) => ({ id: `r${i}`, t: t0 + i * 864e5, key: first.cardKey, rating: rating as 1 | 3 })),
      attempts: [{ id: 'w1', t: t0 + 864e5, widget: first.widgetId, card: first.cardKey, kind: 'attempt', correct: false, answer: '12' }],
    })
    const t = await get<TodayResponse>('/today')
    expect(t.leeches).toHaveLength(1)
    expect(t.leeches[0]).toMatchObject({ key: first.cardKey, lapses: 4, wrongAnswers: ['12'] })
    expect(t.leeches[0].lessonPath).toMatch(/\.learn\.md$/)
    await post('/cards/suspend', { key: first.cardKey, suspended: true })
    expect((await get<TodayResponse>('/today')).leeches).toHaveLength(0)
    const plan = await get<StudyPlan>('/study/queue?limit=50&newCards=20')
    expect(plan.items.map((i) => i.cardKey)).not.toContain(first.cardKey)
    await post('/cards/suspend', { key: first.cardKey, suspended: false })
    expect((await get<TodayResponse>('/today')).leeches).toHaveLength(1)
  })
})
