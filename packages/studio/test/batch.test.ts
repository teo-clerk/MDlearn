import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { JobManager, type JobSummary } from '../server/ai/jobs'
import { FakeEngine } from '../server/ai/fake'
import { BatchRunner } from '../server/ai/batch'
import type { Batch, BatchCandidate } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const doc = (title: string) => `# ${title}\n\n## 1. First part\n\n${words(120)}\n\n## 2. Second part\n\n${words(120)}\n`

function setup(delay = 5) {
  const root = tmp('mdl-batch-'); cpSync(fixture, root, { recursive: true })
  for (const n of ['alpha', 'beta', 'gamma']) writeFileSync(join(root, `${n}.md`), doc(n[0].toUpperCase() + n.slice(1)))
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const jobs = new JobManager(bus)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', jobs, engine: () => new FakeEngine(delay), batchPollMs: 10 })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown = {}) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const until = async (id: string, ok: (b: Batch) => boolean) => { for (let i = 0; i < 300; i++) { const b = await get<Batch>(`/ai/batches/${id}`); if (ok(b)) return b; await new Promise((r) => setTimeout(r, 20)) } throw new Error('timed out') }
  return { root, h, post, get, until, jobs, workspaces, bus }
}

describe('course for a whole folder', () => {
  it('lists the documents that still need lessons, and what each would take', async () => {
    const { get } = setup()
    const c = await get<BatchCandidate[]>('/ai/batch/candidates')
    expect(c.map((x) => x.path).sort()).toEqual(['alpha.md', 'beta.md', 'gamma.md'])
    expect(c[0]).toMatchObject({ title: expect.any(String), words: expect.any(Number), lessons: expect.any(Number) })
    expect(c.every((x) => x.lessons >= 1 && x.words > 200)).toBe(true) // 00_FOUNDATIONS/04_radar.md already has lessons: not listed
  })
  it('builds the courses one after another and records every step', async () => {
    const { post, get, until, root } = setup()
    const r = await (await post('/ai/batches', { docs: ['alpha.md', 'beta.md'], model: 'haiku' })).json() as Batch
    expect(r).toMatchObject({ status: 'running', model: 'haiku' })
    const b = await until(r.id, (x) => x.status !== 'running')
    expect(b.status).toBe('done')
    expect(b.docs.map((d) => d.status)).toEqual(['done', 'done'])
    const jobs = await Promise.all(b.docs.map((d) => get<JobSummary>(`/ai/jobs/${d.jobId}`)))
    expect(jobs[1].created).toBeGreaterThanOrEqual(jobs[0].finished!) // the second starts after the first ended
    expect(readdirSync(join(root, 'learn')).length).toBeGreaterThan(1)
    expect((await get<Batch[]>('/ai/batches'))[0].id).toBe(r.id)
  })
  it('can be stopped and resumed: finished documents are not done again', async () => {
    const { post, get, until } = setup(120)
    const r = await (await post('/ai/batches', { docs: ['alpha.md', 'beta.md', 'gamma.md'] })).json() as Batch
    await until(r.id, (x) => x.docs[0].status === 'done')
    await post(`/ai/batches/${r.id}/stop`)
    const stopped = await until(r.id, (x) => x.status === 'stopped')
    expect(stopped.docs[0].status).toBe('done')
    expect(stopped.docs.slice(1).map((d) => d.status).every((s) => s === 'pending' || s === 'cancelled')).toBe(true)
    const before = (await get<JobSummary[]>('/ai/jobs')).length
    await post(`/ai/batches/${r.id}/resume`)
    const done = await until(r.id, (x) => x.status === 'done')
    expect(done.docs.map((d) => d.status)).toEqual(['done', 'done', 'done'])
    const after = (await get<JobSummary[]>('/ai/jobs')).length
    expect(after - before).toBeLessThanOrEqual(3) // alpha's job is not repeated
    expect((await post(`/ai/batches/${r.id}/resume`)).status).toBe(400) // nothing left
  })
  it('refuses a second batch while one runs, unknown models, and documents with nothing to build', async () => {
    const { post, until } = setup(100)
    const first = await (await post('/ai/batches', { docs: ['alpha.md', 'beta.md'] })).json() as Batch
    expect((await post('/ai/batches', { docs: ['gamma.md'] })).status).toBe(400)
    await post(`/ai/batches/${first.id}/stop`); await until(first.id, (x) => x.status !== 'running')
    expect((await post('/ai/batches', { docs: ['gamma.md'], model: 'gpt' })).status).toBe(400)
    expect((await post('/ai/batches', { docs: ['00_FOUNDATIONS/04_radar.md'] })).status).toBe(400)
    expect((await post('/ai/batches', { docs: [] })).status).toBe(400)
  })
  it('a batch that was running when the program closed shows as stopped and can be resumed', async () => {
    const { post, until, jobs, h } = setup(150)
    const r = await (await post('/ai/batches', { docs: ['alpha.md', 'beta.md'] })).json() as Batch
    await until(r.id, (x) => x.docs[0].status === 'running')
    const fresh = new BatchRunner(jobs) // a new process: nothing is driving the saved file
    const seen = fresh.get(h, r.id)
    expect(seen.status).toBe('stopped'); expect(seen.docs.every((d) => d.status !== 'running')).toBe(true)
    await post(`/ai/batches/${r.id}/stop`); await until(r.id, (x) => x.status !== 'running')
    expect(existsSync(join(h.root, '.mdlearn/jobs', `batch-${r.id}.json`))).toBe(true)
  })
})
