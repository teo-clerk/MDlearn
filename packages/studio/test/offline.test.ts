import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { loadProgress, workspace } from '@mdlearn/core/node'
import type { OfflinePack, SyncResult } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const uuid = () => crypto.randomUUID()
function setup() {
  const root = tmp('mdl-off-'); cpSync(fixture, root, { recursive: true })
  mkdirSync(join(root, 'learn/code'), { recursive: true })
  writeFileSync(join(root, 'learn/code/01-code.learn.md'), '---\ntitle: Code\nid: code\n---\n## Only code\n\n:::code{lang=python}\nWrite f.\n```python\ndef f(): pass\n```\n:::\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  return { root, get, post }
}

describe('offline packs', () => {
  it('packs the next days of cards with their answers, leaving out code exercises', async () => {
    const { get } = setup()
    const pack = await get<OfflinePack>('/study/pack?days=3')
    expect(pack.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(pack.cards.length).toBeGreaterThan(0)
    expect(pack.cards.every((c) => c.isNew)).toBe(true)
    expect(pack.cards.length).toBeLessThanOrEqual(pack.newPerDay * 3)
    expect(pack.cards.some((c) => c.cardKey.startsWith('code/'))).toBe(false)
    const online = await get<{ items: { cardKey: string }[] }>('/study/queue?newCards=20&limit=50')
    expect(online.items.some((i) => i.cardKey === 'code/only-code')).toBe(true) // studied as usual on the computer
    const keys = JSON.stringify(pack.lessons)
    expect(keys).toContain('"correct":true') // the device marks answers itself
    expect(pack.lessons.every((l) => l.intro.length === 0)).toBe(true)
    expect((await get<{ error: { code: string } }>('/study/pack?days=2')).error.code).toBe('invalid')
  })
  it('syncs what was answered offline once, keeping the device ids apart, and refuses impossible events', async () => {
    const { root, get, post } = setup()
    const pack = await get<OfflinePack>('/study/pack?days=1')
    const card = pack.cards[0]
    const now = Date.now()
    const review = { id: uuid(), t: now - 60_000, key: card.cardKey, rating: 3 }
    const attempt = { id: uuid(), t: now - 61_000, widget: card.widgetId, card: card.cardKey, kind: 'attempt', correct: true, sure: true, answer: '1' }
    const body = {
      reviews: [review, { id: uuid(), t: now + 3_600_000, key: card.cardKey, rating: 3 }, { id: uuid(), t: now, key: 'gone/card', rating: 1 }],
      attempts: [attempt, { ...attempt, id: uuid(), card: 'other/card' }],
    }
    const r = await (await post('/study/sync', body)).json() as SyncResult
    expect(r).toEqual({ reviews: 1, attempts: 1, rejected: 3 })
    expect((await (await post('/study/sync', body)).json() as SyncResult).reviews).toBe(1) // sent again: still one
    const p = loadProgress(workspace(root))
    expect(p.reviews.map((x) => x.id)).toEqual([`off:${review.id}`])
    expect(p.attempts.map((x) => x.id)).toEqual([`off:${attempt.id}`])
    expect((await get<{ totals: { seen: number } }>('/study/report')).totals.seen).toBe(1)
  })
  it('takes answers only about cards of a pack given out here, made after it was taken, and never changes one already in', async () => {
    const { root, get, post } = setup()
    const sync = async (reviews: unknown[]) => (await (await post('/study/sync', { reviews, attempts: [] })).json()) as SyncResult
    const now = Date.now()
    expect((await sync([{ id: uuid(), t: now, key: 'numbers/q1', rating: 3 }])).rejected).toBe(1) // no pack taken yet
    const pack = await get<OfflinePack>('/study/pack?days=1')
    const key = pack.cards[0].cardKey
    const id = uuid()
    expect(await sync([
      { id, t: now, key, rating: 1 },
      { id: uuid(), t: now - 2 * 3_600_000, key, rating: 3 }, // before the pack existed
      { id: uuid(), t: now, key: 'code/only-code', rating: 3 }, // a real card, but never packed
    ])).toEqual({ reviews: 1, attempts: 0, rejected: 2 })
    await sync([{ id, t: now + 1, key, rating: 3 }]) // same id, other rating
    expect(loadProgress(workspace(root)).reviews.map((r) => [r.id, r.rating])).toEqual([[`off:${id}`, 1]])
  })
  it('accepts only proper event ids', async () => {
    const { post } = setup()
    expect((await post('/study/sync', { reviews: [{ id: 'x', t: Date.now(), key: 'a/b', rating: 3 }], attempts: [] })).status).toBe(400)
  })
})
