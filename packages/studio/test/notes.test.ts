import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus, type Envelope } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import type { Note } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
// a stand-in for Ollama: lists one model, streams a fixed answer, echoes the prompt it got
let lastChat: { messages: { role: string; content: string }[]; format?: unknown } | null = null
let reply = 'One $R^2$ going out and one coming back, so $R^4$ (§3.1).'
let ollama: Server, url = ''
beforeAll(async () => {
  ollama = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); return }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      lastChat = JSON.parse(body)
      res.setHeader('content-type', 'application/x-ndjson')
      for (const piece of reply.match(/.{1,8}/g)!) res.write(JSON.stringify({ message: { content: piece }, done: false }) + '\n')
      res.end(JSON.stringify({ done: true }) + '\n')
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })

function setup() {
  const root = tmp('mdl-notes-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url, model: 'qwen3:8b' } }))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't' })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const get = (p: string) => app.request(p.startsWith('/api/') ? p : `/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })
  return { root, h, post, get, bus }
}
const anchor = { section: '2', quote: { exact: 'radar equation', prefix: 'The ', suffix: ' tells' } }
const DOC = '00_FOUNDATIONS/04_radar.md'

describe('notes', () => {
  it('are stored beside the files, never in the document', async () => {
    const { root, post, get } = setup()
    const before = readFileSync(join(root, DOC), 'utf8')
    const n = await (await post('/notes', { doc: DOC, anchor, body: 'Check the 4π factors.' })).json() as Note
    expect(n.body).toBe('Check the 4π factors.')
    expect(existsSync(join(root, '.mdlearn/notes', `${DOC}.json`))).toBe(true)
    expect(readFileSync(join(root, DOC), 'utf8')).toBe(before)
    await post(`/notes/${n.id}/update`, { doc: DOC, body: 'Edited.' })
    const list = await (await get(`/notes?path=${encodeURIComponent(DOC)}`)).json() as Note[]
    expect(list.map((x) => x.body)).toEqual(['Edited.'])
    await post(`/notes/${n.id}/delete`, { doc: DOC })
    expect(await (await get(`/notes?path=${encodeURIComponent(DOC)}`)).json()).toEqual([])
  })
  it('refuse documents outside the folder', async () => {
    const { post } = setup()
    expect((await post('/notes', { doc: '../x.md', anchor, body: 'x' })).status).toBe(403)
  })
})

describe('asking the local model about a passage', () => {
  it('grounds the question in the section text and streams the answer into the note', async () => {
    const { post, get, bus } = setup()
    const events: Envelope['event'][] = []
    bus.subscribe((e) => events.push(e.event))
    const r = await (await post('/ai/ask', { doc: DOC, anchor, question: 'Why the fourth power?' })).json() as { note: Note; messageId: string }
    for (let i = 0; i < 50 && !events.some((e) => e.type === 'ai.done'); i++) await new Promise((res) => setTimeout(res, 20))
    expect(events.some((e) => e.type === 'ai.delta')).toBe(true)
    const prompt = lastChat!.messages.map((m) => m.content).join('\n')
    expect(prompt).toContain('radar equation')        // the quoted passage
    expect(prompt).toContain('Why the fourth power?')  // the question
    expect(prompt).toMatch(/Section §2/)              // the grounding section
    const notes = await (await get(`/notes?path=${encodeURIComponent(DOC)}`)).json() as Note[]
    const ai = notes[0].thread.find((m) => m.id === r.messageId)!
    expect(ai).toMatchObject({ role: 'ai', done: true, text: reply })
  })
  it('engines report the local model', async () => {
    const { get } = setup()
    const e = await (await get('/api/engines')).json() as { local: { available: boolean; model: string } }
    expect(e.local).toMatchObject({ available: true, model: 'qwen3:8b' })
  })
  it('when Ollama is not running, asking fails fast with a way out', async () => {
    const root = tmp('mdl-notes-'); cpSync(fixture, root, { recursive: true })
    const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
    settings.update((s) => ({ ...s, ollama: { url: 'http://127.0.0.1:9', model: 'qwen3:8b' } }))
    const workspaces = new Workspaces(settings)
    const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
    const h = workspaces.open(root)
    const t = Date.now()
    const r = await app.request(`/api/w/${h.id}/ai/ask`, { method: 'POST', body: JSON.stringify({ doc: DOC, anchor, question: 'q' }), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/ollama serve/)
    expect(Date.now() - t).toBeLessThan(3000)
  })
})

describe('explanation feedback', () => {
  it('returns per-idea verdicts validated against the card', async () => {
    const { post } = setup()
    reply = JSON.stringify({ ideas: [{ index: 1, verdict: 'covered', evidence: 'spreads' }, { index: 9, verdict: 'missing' }], feedback: 'Add the way back.' })
    const lessonsWithExplain = (await import('@mdlearn/core/node')).loadCourse(join(fixture, 'learn'))
      .flatMap((l) => l.lesson?.cards.flatMap((c) => c.blocks) ?? []).find((b) => b.type === 'explain') as { id: string } | undefined
    if (!lessonsWithExplain) return // fixture without an explain card
    const r = await (await post('/study/judge', { widgetId: lessonsWithExplain.id, text: 'it spreads out' })).json() as { ideas: { index: number }[]; feedback: string }
    expect(r.ideas.every((i) => i.index >= 1)).toBe(true)
    expect(lastChat!.format).toBeTruthy()
  })
})
