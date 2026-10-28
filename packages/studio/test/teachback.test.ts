import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import type { TeachResult } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
// A stand-in for Ollama: answers what the test sets, and keeps the last request
let reply = ''
let last: { messages: { role: string; content: string }[]; format?: unknown } | null = null
let ollama: Server, url = ''
beforeAll(async () => {
  ollama = createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      last = JSON.parse(body || '{}')
      res.setHeader('content-type', 'application/x-ndjson')
      for (const piece of reply.match(/.{1,20}/gs) ?? []) res.write(JSON.stringify({ message: { content: piece }, done: false }) + '\n')
      res.end(JSON.stringify({ done: true }) + '\n')
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })

const LESSON = `---\ntitle: Speckle\nid: speckle\ngoals:\n  - Say where speckle comes from\n---\n## What it is\n\nSpeckle is granular noise from the coherent sum of many echoes.\n\n:::explain\nWhy does multi-looking reduce speckle?\n> - Averaging independent looks lowers the variance.\n> - The price is a coarser resolution.\n:::\n`
function setup(claudeOnce?: (r: { system: string; prompt: string }) => Promise<string>) {
  const root = tmp('mdl-teach-'); cpSync(fixture, root, { recursive: true })
  mkdirSync(join(root, 'learn/speckle'), { recursive: true })
  writeFileSync(join(root, 'learn/speckle/01-speckle.learn.md'), LESSON)
  writeFileSync(join(root, 'notes.md'), '# Notes\n\n## 1. Doppler\n\nA moving target shifts the echo frequency in proportion to its radial speed.\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url, model: 'qwen3:8b', embedModel: 'embeddinggemma' } }))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't', ...(claudeOnce ? { claudeOnce } : {}) })
  const h = workspaces.open(root)
  const post = (body: unknown) => app.request(`/api/w/${h.id}/teachback`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  return { post }
}
const EXPLANATION = 'Speckle happens because the radar adds up many echoes. If you average several looks the picture gets smoother, and it is always sharper.'

describe('teach-back', () => {
  it('judges an explanation of a lesson against its goals and key ideas, by number', async () => {
    const { post } = setup()
    reply = JSON.stringify({ ideas: [{ index: 2, verdict: 'covered', evidence: 'average several looks' }, { index: 1, verdict: 'partly' }, { index: 9, verdict: 'covered' }],
      misconceptions: [{ quote: 'it is always sharper', correction: 'Multi-looking makes the resolution coarser, not sharper.' }], followUp: 'Why do the echoes add up unevenly?', feedback: 'Good start.' })
    const r = await post({ lesson: 'learn/speckle/01-speckle.learn.md', text: EXPLANATION, lang: 'it' })
    expect(r.status).toBe(200)
    const t = await r.json() as TeachResult
    expect(t.ideasFrom).toBe('lesson')
    expect(t.ideas.map((i) => [i.idea, i.verdict])).toEqual([
      ['Say where speckle comes from', 'partly'], ['Averaging independent looks lowers the variance.', 'covered'], ['The price is a coarser resolution.', 'missing'], // not judged: missing
    ])
    expect(t.misconceptions[0].correction).toMatch(/coarser/)
    expect(t.followUp).toMatch(/\?$/)
    const prompt = last!.messages.at(-1)!.content
    expect(prompt).toContain('Write every text field in Italian.')
    expect(prompt).toContain('coherent sum of many echoes')
    expect(prompt).toContain(EXPLANATION)
    expect(last!.format).toBeTruthy()
  })
  it('explains a section of notes with no lesson: the AI lists the key ideas itself', async () => {
    const { post } = setup()
    reply = 'Here you go:\n```json\n' + JSON.stringify({ ideas: [{ idea: 'Motion shifts the frequency.', verdict: 'covered' }, { verdict: 'missing' }], misconceptions: [], followUp: 'What if it moves sideways?', feedback: 'Nice.' }) + '\n```'
    const t = await (await post({ doc: 'notes.md', section: '1', text: 'When something moves toward the radar the echo comes back at a higher frequency.' })).json() as TeachResult
    expect(t).toMatchObject({ title: '§1 Doppler', ideasFrom: 'ai', ideas: [{ idea: 'Motion shifts the frequency.', verdict: 'covered' }] })
    expect(last!.messages.at(-1)!.content).toContain('Key ideas: none given')
  })
  it('uses Claude when chosen, and says so plainly when the answer cannot be read', async () => {
    let asked = ''
    const { post } = setup(async (r) => { asked = r.prompt; return '{"ideas":[{"index":1,"verdict":"covered"}],"misconceptions":[],"followUp":"Why?","feedback":"Fine."}' })
    const t = await (await post({ lesson: 'learn/speckle/01-speckle.learn.md', text: EXPLANATION, engine: 'claude' })).json() as TeachResult
    expect(t.ideas[0].verdict).toBe('covered')
    expect(asked).toContain('Student explanation')
    reply = 'not json at all'
    const bad = await (await post({ lesson: 'learn/speckle/01-speckle.learn.md', text: EXPLANATION })).json() as { error: { code: string } }
    expect(bad.error.code).toBe('engine')
  })
  it('refuses a one-line explanation, Claude where it is not set up, and a lesson that is gone', async () => {
    const { post } = setup()
    expect((await post({ lesson: 'learn/speckle/01-speckle.learn.md', text: 'Noise.' })).status).toBe(400)
    expect((await post({ lesson: 'learn/speckle/01-speckle.learn.md', text: EXPLANATION, engine: 'claude' })).status).toBe(400)
    expect((await post({ lesson: 'learn/gone.learn.md', text: EXPLANATION })).status).toBe(404)
    expect((await post({ doc: 'notes.md', text: EXPLANATION })).status).toBe(400)
  })
})
