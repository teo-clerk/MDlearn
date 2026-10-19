import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus, type Envelope } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { JobManager, type JobSummary } from '../server/ai/jobs'
import { FakeEngine } from '../server/ai/fake'
import { writeAllowed } from '../server/ai/guard'
import { toEvents } from '../server/ai/claude'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-jobs-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const jobs = new JobManager(bus)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', jobs, engine: () => new FakeEngine(5) })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown = {}) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const get = (p: string) => app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })
  const finished = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await (await get(`/ai/jobs/${id}`)).json() as JobSummary; if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 20)) } throw new Error('job did not finish') }
  return { root, h, post, get, bus, finished }
}

describe('the write guard', () => {
  const root = tmp('mdl-guard-')
  mkdirSync(join(root, 'learn/x'), { recursive: true }); mkdirSync(join(root, '.claude')); writeFileSync(join(root, 'source.md'), '# s')
  const outside = tmp('mdl-out-'); symlinkSync(outside, join(root, 'learn/x/escape'))
  const scope = [join(root, 'learn')]
  it.each([
    ['a lesson inside the scope', 'learn/x/01.learn.md', true],
    ['the source document', 'source.md', false],
    ['outside via ..', '../evil.md', false],
    ['through a symlink', 'learn/x/escape/evil.md', false],
    ['a non-Markdown file', 'learn/x/run.sh', false],
  ])('%s', (_, p, ok) => { expect(writeAllowed(join(root, p), scope) === null).toBe(ok) })
  it('protected folders inside the scope are refused', () => {
    expect(writeAllowed(join(root, '.claude/skills/x.md'), [root])).not.toBeNull()
  })
  it('a single-file scope allows only that file', () => {
    const f = join(root, 'learn/x/01.learn.md')
    expect(writeAllowed(f, [f])).toBeNull()
    expect(writeAllowed(join(root, 'learn/x/02.learn.md'), [f])).not.toBeNull()
  })
})

describe('AI jobs (scripted engine)', () => {
  it('creating a course writes lessons, lints them, and undo removes them all', async () => {
    const { root, post, finished, bus } = setup()
    const events: Envelope['event'][] = []
    bus.subscribe((e) => events.push(e.event))
    const src = readFileSync(join(root, '00_FOUNDATIONS/04_radar.md'), 'utf8')
    // the fixture already has lesson 01; remove it so the document has lessons to create
    writeFileSync(join(root, 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'), '')
    const fs = await import('node:fs'); fs.unlinkSync(join(root, 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'))
    const r = await (await post('/ai/jobs', { recipe: 'course.create', doc: '00_FOUNDATIONS/04_radar.md' })).json() as JobSummary
    const job = await finished(r.id)
    expect(job.status).toBe('done')
    expect(job.files.length).toBeGreaterThan(1) // the scaffolds the server prepared + the engine's lesson
    expect(job.files.every((f) => f.change === 'created')).toBe(true)
    expect(job.lint.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'job.event')).toBe(true)
    expect(readFileSync(join(root, '00_FOUNDATIONS/04_radar.md'), 'utf8')).toBe(src) // source untouched
    const created = job.files.map((f) => join(root, f.path))
    expect(created.every((f) => existsSync(f))).toBe(true)
    const undo = await (await post(`/ai/jobs/${r.id}/undo`)).json() as { removed: string[]; skipped: string[] }
    expect(undo.skipped).toEqual([])
    expect(created.every((f) => !existsSync(f))).toBe(true)
  })
  it('undo leaves a file you edited after the job alone', async () => {
    const { root, post, finished } = setup()
    const lesson = 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'
    const before = readFileSync(join(root, lesson), 'utf8')
    const r = await (await post('/ai/jobs', { recipe: 'lesson.improve', lesson })).json() as JobSummary
    await finished(r.id)
    expect(readFileSync(join(root, lesson), 'utf8')).not.toBe(before)
    writeFileSync(join(root, lesson), 'my own edit')
    const undo = await (await post(`/ai/jobs/${r.id}/undo`)).json() as { skipped: string[] }
    expect(undo.skipped).toEqual([lesson])
    expect(readFileSync(join(root, lesson), 'utf8')).toBe('my own edit')
  })
  it('a job for a document that already has every lesson is refused with a hint', async () => {
    const { post, finished } = setup()
    const first = await (await post('/ai/jobs', { recipe: 'course.create', doc: '00_FOUNDATIONS/04_radar.md' })).json() as JobSummary
    await finished(first.id)
    const r = await post('/ai/jobs', { recipe: 'course.create', doc: '00_FOUNDATIONS/04_radar.md' })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/Improve/)
  })
  it('jobs are listed and survive in .mdlearn/jobs', async () => {
    const { root, post, get, finished } = setup()
    const r = await (await post('/ai/jobs', { recipe: 'custom', request: 'Write a short glossary lesson', scope: 'learn' })).json() as JobSummary
    await finished(r.id)
    const list = await (await get('/ai/jobs')).json() as JobSummary[]
    expect(list[0].id).toBe(r.id)
    expect(existsSync(join(root, '.mdlearn/jobs', r.id, 'job.json'))).toBe(true)
  })
})

describe('Claude Code messages become a readable log', () => {
  it('maps the recorded spike session', () => {
    const lines = readFileSync(join(__dirname, 'fixtures/claude-course.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    const events = lines.flatMap((m) => toEvents(m, '/ROOT'))
    const labels = events.filter((e) => e.kind === 'tool').map((e) => (e as { label: string }).label)
    expect(labels.some((l) => l.startsWith('Writing learn/_spike/01-spike.learn.md'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Checking'))).toBe(true)
    expect(labels.some((l) => /skill/.test(l))).toBe(true)
    expect(events.find((e) => e.kind === 'usage')).toMatchObject({ turns: 6 })
    expect(events.some((e) => e.kind === 'session')).toBe(true)
  })
})

describe('job safety', () => {
  it('job ids that are not UUIDs are rejected (no paths through .mdlearn/jobs)', async () => {
    const { get, post } = setup()
    expect((await get('/ai/jobs/..%2F..%2Fetc')).status).toBe(404)
    expect((await post('/ai/jobs/..%2F..%2Fx/undo')).status).toBe(404)
  })
  it('a custom job cannot target a sibling folder that shares a prefix', async () => {
    const { post } = setup()
    expect((await post('/ai/jobs', { recipe: 'custom', request: 'write something', scope: '../x' })).status).toBe(403)
  })
  it('oversized JSON bodies are refused', async () => {
    const { post } = setup()
    expect((await post('/ai/jobs', { recipe: 'custom', request: 'x'.repeat(3 * 1024 * 1024) })).status).toBe(413)
  })
})

describe('fixing a leech with AI', () => {
  it('starts a single-file job whose prompt names the card and the wrong answers', async () => {
    const { post, get, finished } = setup()
    const lesson = 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'
    const r = await (await post('/ai/jobs', { recipe: 'lesson.improve', lesson, focus: 'leech', card: { key: 'radar/fourth-power-loss', title: 'Fourth-power loss', wrong: ['12', '8'] } })).json() as JobSummary
    expect(r.recipe).toBe('leech.fix')
    expect(r.title).toContain('Fourth-power loss')
    const job = await finished(r.id)
    expect(job.status).toBe('done')
    const detail = await (await get(`/ai/jobs/${r.id}`)).json() as { prompt: string }
    expect(detail.prompt).toContain('"12", "8"')
    expect(detail.prompt).toContain('Fourth-power loss')
  })
  it('refuses a lesson path that leaves the folder', async () => {
    const { post } = setup()
    expect((await post('/ai/jobs', { recipe: 'lesson.improve', lesson: '../x.learn.md', focus: 'leech' })).status).toBe(404)
  })
})
