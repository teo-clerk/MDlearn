import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deriveCards } from '@mdlearn/core'
import { loadGoals, loadProgress } from '@mdlearn/core/node'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { JobManager, type JobSummary } from '../server/ai/jobs'
import { FakeEngine } from '../server/ai/fake'
import { writeAllowed } from '../server/ai/guard'
import { keptOut } from '../server/ai/recipes'
import { today } from '../server/today'
import type { CourseInfo } from '../shared/types'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const card = (title: string) => `## ${title}\n\nSome words.\n\n:::quiz\nWhat is ${title}?\n\n- [x] This\n  > Right.\n- [ ] That\n  > No.\n:::\n`
const lesson = (title: string, ...cards: string[]) => `---\ntitle: ${title}\nlevel: beginner\nlang: en\ngoals: [Explain it]\n---\n\n${cards.map(card).join('\n')}`
const DAY = 864e5, NOW = Date.now()

function setup(opts: { lan?: boolean } = {}) {
  const root = tmp('mdl-course-')
  mkdirSync(join(root, 'sources'))
  writeFileSync(join(root, 'sources/handout.txt'), 'from class')
  writeFileSync(join(root, 'course.md'), '# Thermo\n\n1. [Heat](01-heat.learn.md)\n2. [Engines](02-engines.learn.md)\n')
  writeFileSync(join(root, '01-heat.learn.md'), lesson('Heat', 'What heat is', 'First law'))
  writeFileSync(join(root, '02-engines.learn.md'), lesson('Engines', 'Carnot limit'))
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings), bus = new EventBus(), jobs = new JobManager(bus)
  const app = createApp({ version: 't', security: { port: 1, lan: !!opts.lan, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', jobs, engine: () => new FakeEngine(0) })
  const h = workspaces.open(root)
  const headers = { host: 'localhost:1', 'x-mdl': '1', 'content-type': 'application/json' }
  const post = (path: string, body: unknown) => app.request(`/api/w/${h.id}${path}`, { method: 'POST', body: JSON.stringify(body), headers })
  const info = async () => await (await app.request(`/api/w/${h.id}/course?doc=course.md`, { headers })).json() as CourseInfo
  const study = (key: string, t = NOW - 7 * DAY) => {
    const file = join(root, 'learn/.mdlearn/progress.json')
    mkdirSync(join(root, 'learn/.mdlearn'), { recursive: true })
    const log = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { version: 1, reviews: [], attempts: [] }
    writeFileSync(file, JSON.stringify({ ...log, reviews: [...log.reviews, { id: `${key}-${t}`, t, key, rating: 3 }] }))
  }
  return { root, app, h, post, info, study, jobs, headers }
}
const finished = async (s: ReturnType<typeof setup>, id: string) => {
  for (let i = 0; i < 200; i++) {
    const j = s.jobs.get(s.h, id)!
    if (j.status !== 'queued' && j.status !== 'running') return j
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('the job never finished')
}

describe('a course you have started', () => {
  it('shows each lesson with what you have studied', async () => {
    const s = setup()
    s.study('heat/what-heat-is')
    const { lessons, lost } = await s.info()
    expect(lessons.map((l) => [l.path, l.title, l.cards, l.seen, l.paused, l.numbered])).toEqual([
      ['01-heat.learn.md', 'Heat', 2, 1, false, true], ['02-engines.learn.md', 'Engines', 1, 0, false, true],
    ])
    expect(lessons[0].memory).toBeGreaterThan(0)
    expect(lessons[1].memory).toBeNull()
    expect(lost).toEqual([])
  })
  it('moves a lesson by swapping numbers: progress and links stay', async () => {
    const s = setup()
    s.study('heat/what-heat-is')
    mkdirSync(join(s.root, '.mdlearn/notes'), { recursive: true })
    writeFileSync(join(s.root, '.mdlearn/notes/01-heat.learn.md.json'), '[]')
    expect((await s.post('/course/move', { doc: 'course.md', lesson: '01-heat.learn.md', by: 1 })).status).toBe(200)
    const { lessons, lost } = await s.info()
    expect(lessons.map((l) => l.path)).toEqual(['01-engines.learn.md', '02-heat.learn.md'])
    expect(lessons[1].seen).toBe(1)
    expect(lost).toEqual([])
    expect(readFileSync(join(s.root, 'course.md'), 'utf8')).toContain('[Heat](02-heat.learn.md)\n2. [Engines](01-engines.learn.md)')
    expect(existsSync(join(s.root, '.mdlearn/notes/02-heat.learn.md.json'))).toBe(true)
    expect(existsSync(join(s.root, '.mdlearn/notes/01-heat.learn.md.json'))).toBe(false)
  })
  it('does nothing past the end, and says when a lesson has no number', async () => {
    const s = setup()
    await s.post('/course/move', { doc: 'course.md', lesson: '02-engines.learn.md', by: 1 })
    expect((await s.info()).lessons.map((l) => l.path)).toEqual(['01-heat.learn.md', '02-engines.learn.md'])
    writeFileSync(join(s.root, 'extra.learn.md'), lesson('Extra', 'One'))
    const r = await s.post('/course/move', { doc: 'course.md', lesson: 'extra.learn.md', by: -1 })
    expect((await r.json() as { error: { code: string } }).error.code).toBe('no-number')
  })
  it('pauses a lesson by setting its cards aside, and brings them back', async () => {
    const s = setup()
    await s.post('/course/pause', { doc: 'course.md', lesson: '01-heat.learn.md', paused: true })
    expect((await s.info()).lessons[0].paused).toBe(true)
    expect(loadGoals(s.h.ws).suspended).toEqual(['heat/what-heat-is', 'heat/first-law'])
    await s.post('/course/pause', { doc: 'course.md', lesson: '01-heat.learn.md', paused: false })
    expect((await s.info()).lessons[0].paused).toBe(false)
    expect(loadGoals(s.h.ws).suspended).toEqual([])
  })
  it('warns about a studied card that is gone, and reconnects it with its schedule', async () => {
    const s = setup()
    s.study('heat/first-law'); s.study('heat/first-law', NOW - 3 * DAY)
    const scheduled = deriveCards(loadProgress(s.h.ws).reviews).get('heat/first-law')!
    writeFileSync(join(s.root, '01-heat.learn.md'), lesson('Heat', 'What heat is', 'The first law of thermodynamics'))
    const { lost } = await s.info()
    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ key: 'heat/first-law', reviews: 2 })
    expect(lost[0].matches[0].key).toBe('heat/the-first-law-of-thermodynamics')

    const r = await s.post('/course/reconnect', { from: 'heat/first-law', to: 'heat/the-first-law-of-thermodynamics' })
    expect(r.status).toBe(200)
    const after = await s.info()
    expect(after.lost).toEqual([])
    expect(after.lessons[0].seen).toBe(1)
    expect(deriveCards(loadProgress(s.h.ws).reviews).get('heat/the-first-law-of-thermodynamics')?.due).toEqual(scheduled.due)
    // written down, so the next rename can't lose it
    expect(readFileSync(join(s.root, '01-heat.learn.md'), 'utf8')).toContain('## The first law of thermodynamics {#the-first-law-of-thermodynamics}')
    // the log kept the original events, and the copies don't count as work you did twice
    expect(loadProgress(s.h.ws).reviews.filter((x) => x.key === 'heat/first-law')).toHaveLength(2)
    expect(today(s.h).heatmap.days.reduce((n, d) => n + d.count, 0)).toBe(2)
  })
  it('refuses to merge two histories', async () => {
    const s = setup()
    s.study('heat/gone'); s.study('heat/first-law')
    const r = await s.post('/course/reconnect', { from: 'heat/gone', to: 'heat/first-law' })
    expect((await r.json() as { error: { code: string } }).error.code).toBe('has-history')
  })
  it('lets a card go without deleting its history', async () => {
    const s = setup()
    s.study('heat/gone')
    await s.post('/course/let-go', { key: 'heat/gone' })
    expect((await s.info()).lost).toEqual([])
    expect(loadProgress(s.h.ws).reviews.map((r) => r.key)).toContain('heat/gone')
  })
  it('only works on a course.md inside the folder', async () => {
    const s = setup()
    const outside = tmp('mdl-outside-')
    writeFileSync(join(outside, 'course.md'), '# Other')
    for (const doc of ['nope.md', `../${outside.split('/').pop()}/course.md`]) {
      expect((await s.app.request(`/api/w/${s.h.id}/course?doc=${encodeURIComponent(doc)}`, { headers: s.headers })).status).toBe(404)
      expect((await s.post('/ai/jobs', { recipe: 'course.change', doc, request: 'Add a chapter' })).status).toBe(404)
    }
  })
  it('keeps a phone on the network from reordering or reconnecting', async () => {
    const s = setup({ lan: true })
    const phone = { ...s.headers, host: '192.168.1.5:1' }
    for (const [path, body] of [['/course/move', { doc: 'course.md', lesson: '01-heat.learn.md', by: 1 }], ['/course/reconnect', { from: 'a/b', to: 'c/d' }]] as const) {
      const r = await s.app.request(`/api/w/${s.h.id}${path}`, { method: 'POST', body: JSON.stringify(body), headers: phone })
      expect(r.status).toBe(403)
    }
  })
})

describe('moving a lesson safely', () => {
  it('leaves a longer file name that contains the moved name alone', async () => {
    const s = setup()
    writeFileSync(join(s.root, 'course.md'), `${readFileSync(join(s.root, 'course.md'), 'utf8')}\n[Later](101-heat.learn.md)\n`)
    expect((await s.post('/course/move', { doc: 'course.md', lesson: '01-heat.learn.md', by: 1 })).status).toBe(200)
    expect(readFileSync(join(s.root, 'course.md'), 'utf8')).toContain('[Later](101-heat.learn.md)')
  })
  it('refuses to overwrite a third file that already has the new name', async () => {
    const s = setup()
    writeFileSync(join(s.root, '01-heat.learn.md'), lesson('Heat', 'What heat is'))
    writeFileSync(join(s.root, '01-engines.learn.md'), lesson('Other', 'Something else'))
    const r = await s.post('/course/move', { doc: 'course.md', lesson: '02-engines.learn.md', by: -1 })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(readFileSync(join(s.root, '01-engines.learn.md'), 'utf8')).toContain('Something else')
    expect(existsSync(join(s.root, '02-engines.learn.md'))).toBe(true)
  })
})

describe('changing a started course with an AI', () => {
  it('writes the studied ids down first, shows the AI where you stand, and reports what happened', async () => {
    const s = setup()
    s.study('heat/first-law', NOW - 7 * DAY)
    const started = await (await s.post('/ai/jobs', { recipe: 'course.change', doc: 'course.md', request: 'Add a card on entropy' })).json() as JobSummary
    const job = await finished(s, started.id)
    expect(job.status).toBe('done')
    const pinned = readFileSync(join(s.root, '01-heat.learn.md'), 'utf8')
    expect(pinned).toContain('## First law {#first-law}')
    expect(pinned).toContain('## What heat is\n') // not studied, so left as it was
    expect(pinned).toMatch(/^---\nid: heat\n/)
    expect(readFileSync(join(s.root, '02-engines.learn.md'), 'utf8')).not.toContain('{#')
    expect(job.prompt).toContain('The student asks: Add a card on entropy')
    expect(job.prompt).toContain('- 01-heat.learn.md: 2 cards, 1 studied, recall ')
    expect(job.prompt).toContain('Keep every `{#id}`')
    expect(job.changes).toMatchObject({ kept: 3, removed: [] })
    expect(job.changes!.added.length).toBeGreaterThan(0) // the demo engine's lesson
  })
  it('undoes the pins with the rest of the job', async () => {
    const s = setup()
    s.study('heat/first-law')
    const before = readFileSync(join(s.root, '01-heat.learn.md'), 'utf8')
    const started = await (await s.post('/ai/jobs', { recipe: 'course.change', doc: 'course.md', request: 'Add a card' })).json() as JobSummary
    await finished(s, started.id)
    expect((await s.post(`/ai/jobs/${started.id}/undo`, {})).status).toBe(200)
    expect(readFileSync(join(s.root, '01-heat.learn.md'), 'utf8')).toBe(before)
  })
  it('gives no write access to the class files, also in a follow-up', async () => {
    const s = setup()
    const started = await (await s.post('/ai/jobs', { recipe: 'course.change', doc: 'course.md', request: 'Add a card' })).json() as JobSummary
    await finished(s, started.id)
    const live = (s.jobs as unknown as { jobs: Map<string, { spec: { keepOut?: string[] } }> }).jobs.get(started.id)!
    expect(live.spec.keepOut).toEqual([join(s.root, 'sources'), join(s.root, 'AGENTS.md'), join(s.root, 'CLAUDE.md')])
    const next = await (await s.post(`/ai/jobs/${started.id}/followup`, { request: 'One more card' })).json() as JobSummary
    expect((s.jobs as unknown as { jobs: Map<string, { spec: { keepOut?: string[] } }> }).jobs.get(next.id)!.spec.keepOut).toContain(join(s.root, 'sources'))
  })
})

describe('highlights with a purpose', () => {
  const anchor = { section: null, quote: { exact: 'heat flows downhill', prefix: '', suffix: '' } }
  it('saves one with no text, and lists confusing passages on Today, newest first', async () => {
    const s = setup()
    writeFileSync(join(s.root, 'notes.md'), '# Notes\n\nheat flows downhill and work does not\n')
    const add = async (exact: string, color?: string) => await (await s.post('/notes', { doc: 'notes.md', anchor: { ...anchor, quote: { ...anchor.quote, exact } }, body: '', color })).json() as { id: string; color?: string }
    const first = await add('heat flows downhill', 'confusing')
    await new Promise((r) => setTimeout(r, 5))
    await add('work does not', 'confusing')
    await add('Notes', 'important')
    await add('plain note')
    expect(first.color).toBe('confusing')
    expect(today(s.h).confusing.map((c) => c.anchor.quote.exact)).toEqual(['work does not', 'heat flows downhill'])
    expect(today(s.h).confusing[0].explained).toBe(false)
  })
  it('keeps Today working when one notes file is damaged', async () => {
    const s = setup()
    mkdirSync(join(s.root, '.mdlearn/notes'), { recursive: true })
    writeFileSync(join(s.root, '.mdlearn/notes/broken.md.json'), '{ not json')
    expect(today(s.h).confusing).toEqual([])
  })
  it('keeps AI jobs out of the skills and every instruction file', () => {
    const s = setup(), scope = [s.root], keepOut = keptOut(s.root, join(s.root, 'unit'))
    expect(writeAllowed(join(s.root, '.agents/skills/mdlearn-course/SKILL.md'), scope, keepOut)).toMatch(/protected/)
    expect(writeAllowed(join(s.root, 'AGENTS.md'), scope, keepOut)).toMatch(/not change/)
    expect(writeAllowed(join(s.root, 'unit/CLAUDE.md'), scope, keepOut)).toMatch(/not change/)
  })
  it('refuses a colour that has no meaning', async () => {
    const s = setup()
    writeFileSync(join(s.root, 'notes.md'), '# Notes\n')
    expect((await s.post('/notes', { doc: 'notes.md', anchor, body: '', color: 'red' })).status).toBe(400)
  })
  it('asks the AI to mark key terms and change nothing else', async () => {
    const s = setup()
    const r = await s.post('/ai/jobs', { recipe: 'lesson.improve', lesson: '01-heat.learn.md', focus: 'marks' })
    const job = await finished(s, (await r.json() as JobSummary).id)
    expect(job.prompt).toContain('Mark the key terms')
    expect(job.prompt).toContain('change no other text')
  })
})
