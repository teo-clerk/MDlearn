import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { buildPrompt, citedNumbers } from '../server/ask/service'
import type { AskEntry, AskStatus, Note, RelatedResponse } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))

// A stand-in for Ollama: chat echoes the cited numbers, embeddings are word-bag hashes (so overlap = similarity),
// pull "downloads" the embedding model in two steps and then lists it.
let models = ['qwen3:8b']
let lastChat: { messages: { role: string; content: string }[] } | null = null
let embedCalls = 0
let ollama: Server, url = ''
const vec = (text: string) => { const v = new Array(48).fill(0); for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 48; v[h] += 1 } return v }
beforeAll(async () => {
  ollama = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: models.map((name) => ({ name })) })); return }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      const j = JSON.parse(body || '{}')
      if (req.url === '/api/embed') { embedCalls++; res.end(JSON.stringify({ embeddings: (j.input as string[]).map(vec) })); return }
      if (req.url === '/api/pull') {
        res.setHeader('content-type', 'application/x-ndjson')
        res.write(JSON.stringify({ status: 'pulling abc', total: 100, completed: 40 }) + '\n')
        setTimeout(() => { models = [...models, 'embeddinggemma:latest']; res.end(JSON.stringify({ status: 'success' }) + '\n') }, 50)
        return
      }
      lastChat = j
      res.setHeader('content-type', 'application/x-ndjson')
      for (const piece of 'The radar equation has $R^4$ [1], and speckle is noise [2][9].'.match(/.{1,9}/g)!) res.write(JSON.stringify({ message: { content: piece }, done: false }) + '\n')
      res.end(JSON.stringify({ done: true }) + '\n')
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })

function setup() {
  models = ['qwen3:8b']; embedCalls = 0; lastChat = null
  const root = tmp('mdl-ask-'); cpSync(fixture, root, { recursive: true })
  writeFileSync(join(root, 'speckle.md'), '# Speckle\n\n## 1. What it is\n\n**Speckle** is granular noise from coherent summation of echoes. Multi-looking averages independent samples and reduces speckle variance.\n\nThe equivalent number of looks counts independent samples averaged together in an image.\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url, model: 'qwen3:8b', embedModel: 'embeddinggemma' } }))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't' })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const until = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => { for (let i = 0; i < 100; i++) { const v = await fn(); if (ok(v)) return v; await new Promise((r) => setTimeout(r, 40)) } throw new Error('timed out') }
  return { root, h, post, get, until, bus }
}
const finished = (get: ReturnType<typeof setup>['get'], id: string) => async () => (await get<AskEntry[]>('/ask/history')).find((e) => e.id === id)!

describe('prompt and citations', () => {
  it('numbers the passages and puts the question last', () => {
    const m = buildPrompt('What is speckle?', [{ n: 1, title: 'Radar', section: '3.1', text: 'Speckle is noise.' }, { n: 2, title: 'Optics', section: null, text: 'Other.' }])
    expect(m[0].role).toBe('system'); expect(m[0].content).toMatch(/only the numbered passages/)
    expect(m[1].content).toMatch(/\[1\] Radar — §3\.1\nSpeckle is noise\./)
    expect(m[1].content).toMatch(/\[2\] Optics\nOther\./)
    expect(m[1].content.endsWith('Question: What is speckle?')).toBe(true)
  })
  it('lists cited passages once, in order, ignoring numbers that are not sources', () => {
    expect(citedNumbers('A [2] and [1], again [2], and [7] or [0].', 3)).toEqual([2, 1])
    expect(citedNumbers('no citations', 3)).toEqual([])
  })
})

describe('asking the whole folder', () => {
  it('without the search model it searches by words, says so, and answers from the best passages', async () => {
    const { post, get, until } = setup()
    const st = await get<AskStatus>('/ask/status')
    expect(st).toMatchObject({ installed: false, model: 'embeddinggemma', chatReady: true })
    expect(st.total).toBeGreaterThan(0)
    const r = await (await post('/ask', { question: 'How does multi-looking reduce speckle variance?' })).json() as { id: string; entry: AskEntry }
    expect(r.entry.mode).toBe('words'); expect(r.entry.notice).toMatch(/words only/)
    expect(r.entry.sources[0]).toMatchObject({ n: 1, doc: 'speckle.md', docTitle: 'Speckle' })
    expect(r.entry.sources[0].section).toMatchObject({ num: '1' })
    const done = await until(finished(get, r.id), (e) => e?.done)
    expect(done.answer).toBe('The radar equation has $R^4$ [1], and speckle is noise [2][9].')
    expect(lastChat!.messages[1].content).toMatch(/\[1\] Speckle — §1\n/)
    expect(embedCalls).toBe(0)
  })
  it('answers without calling the model when nothing matches', async () => {
    const { post, get } = setup()
    const r = await (await post('/ask', { question: 'zebra giraffe' })).json() as { entry: AskEntry }
    expect(r.entry).toMatchObject({ done: true, sources: [] }); expect(r.entry.answer).toMatch(/Nothing in this folder matches/)
    expect(lastChat).toBeNull()
    expect((await get<AskEntry[]>('/ask/history'))[0].question).toBe('zebra giraffe')
  })
  it('downloads the search model, indexes every passage once, then searches by meaning too', async () => {
    const { post, get, until, root } = setup()
    const first = await (await post('/ask/setup', {})).json() as AskStatus
    expect(first.installed === false || first.pulling !== null || first.building).toBe(true)
    const ready = await until(() => get<AskStatus>('/ask/status'), (s) => s.installed && !s.building && s.indexed === s.total && s.total > 0)
    expect(ready.error).toBeUndefined()
    expect(existsSync(join(root, '.mdlearn/index/embeddings.bin'))).toBe(true)
    const calls = embedCalls
    await post('/ask/setup', {}) // nothing new to embed
    await until(() => get<AskStatus>('/ask/status'), (s) => !s.building)
    expect(embedCalls).toBe(calls)
    const r = await (await post('/ask', { question: 'granular noise echoes' })).json() as { entry: AskEntry }
    expect(r.entry.mode).toBe('meaning'); expect(r.entry.notice).toBeUndefined()
    expect(r.entry.sources[0].doc).toBe('speckle.md')
  })
  it('keeps answers as notes on the passage they come from, and a history you can clear', async () => {
    const { post, get, until } = setup()
    const r = await (await post('/ask', { question: 'What is speckle noise?' })).json() as { id: string }
    await until(finished(get, r.id), (e) => e?.done)
    const saved = await (await post('/ask/note', { id: r.id, n: 1 })).json() as { doc: string }
    expect(saved.doc).toBe('speckle.md')
    const notes = await get<Note[]>('/notes?path=speckle.md')
    expect(notes[0].body).toMatch(/^\*\*What is speckle noise\?\*\*\n\nThe radar equation/)
    expect(notes[0].anchor).toMatchObject({ section: '1', quote: { exact: 'What it is' } })
    expect((await post('/ask/note', { id: 'nope', n: 1 })).status).toBe(404)
    await post('/ask/delete', { id: null })
    expect(await get<AskEntry[]>('/ask/history')).toEqual([])
  })
  it('rejects empty and oversized questions', async () => {
    const { post } = setup()
    expect((await post('/ask', { question: ' ' })).status).toBe(400)
    expect((await post('/ask', { question: 'x'.repeat(1001) })).status).toBe(400)
  })
})

describe('related passages', () => {
  // two sections on different subjects, one document for each, and one on neither
  const library = () => {
    const s = setup()
    writeFileSync(join(s.root, 'imaging.md'), '# Imaging\n\n## Speckle in images\n\nSpeckle noise makes coherent radar images grainy until multilooking averages independent samples together.\n\n## Orbits for imaging\n\nA sunsynchronous orbit crosses the equator at the same local time, keeping the lighting steady between passes.\n\n## Overview\n\n### Empty\n\n### Filled\n\nThis subsection has enough words to count as a passage of its own in the index of the folder.\n')
    writeFileSync(join(s.root, 'filters.md'), '# Filters\n\n## Lee filter\n\nThe Lee filter removes speckle noise from coherent radar images while it keeps the edges sharp and clear.\n\n## Boxcar\n\nA boxcar filter averages independent samples of speckle noise over a window in coherent radar images.\n')
    writeFileSync(join(s.root, 'orbits.md'), '# Orbits\n\n## Sunsynchronous\n\nThe sunsynchronous orbit keeps the same local time at the equator, so lighting stays steady for every pass.\n')
    writeFileSync(join(s.root, 'bread.md'), '# Bread\n\n## Dough\n\nFlour, water, salt and yeast rest overnight before the loaf goes into a very hot oven with some steam.\n')
    return s
  }
  const related = (s: ReturnType<typeof setup>, path: string, section?: string) => s.get<RelatedResponse>(`/related?path=${encodeURIComponent(path)}${section ? `&section=${section}` : ''}`)
  const vectors = async (s: ReturnType<typeof setup>) => {
    await s.post('/ask/setup', {})
    await s.until(() => s.get<AskStatus>('/ask/status'), (a) => a.total > 0 && !a.building && a.indexed === a.total)
    embedCalls = 0
  }

  it('finds other documents by words while there are no vectors, without asking a model', async () => {
    const s = library()
    const r = await related(s, 'imaging.md', 'speckle-in-images')
    expect(r.mode).toBe('words')
    expect(r.passages[0].doc).toBe('filters.md')
    expect(r.passages.map((p) => p.doc)).not.toContain('bread.md')
    expect(embedCalls).toBe(0)
  })
  it('follows the section: another section of the same document finds another document', async () => {
    const s = library()
    expect((await related(s, 'imaging.md', 'orbits-for-imaging')).passages[0].doc).toBe('orbits.md')
  })
  it('by meaning once vectors exist: closest first, one passage per document, never the same document, no model call', async () => {
    const s = library()
    await vectors(s)
    const r = await related(s, 'imaging.md', 'speckle-in-images')
    expect(r.mode).toBe('meaning')
    expect(r.passages[0].doc).toBe('filters.md')
    expect(r.passages[0].section?.anchor).toMatch(/lee-filter|boxcar/)
    expect(r.passages[0].snippet.length).toBeGreaterThan(20)
    const docs = r.passages.map((p) => p.doc)
    expect(docs).not.toContain('imaging.md')
    expect(new Set(docs).size).toBe(docs.length)
    expect(docs).not.toContain('bread.md') // too far away to show
    expect(embedCalls).toBe(0)
    expect((await related(s, 'imaging.md', 'orbits-for-imaging')).passages[0].doc).toBe('orbits.md')
  })
  it('uses the whole document for a heading with no text of its own, or with no section', async () => {
    const s = library()
    expect((await related(s, 'imaging.md', 'empty')).passages.map((p) => p.doc)).toContain('filters.md')
    expect((await related(s, 'imaging.md')).passages.map((p) => p.doc)).toContain('orbits.md')
  })
  it('has nothing to say about a document it does not know, and refuses a bad request', async () => {
    const s = library()
    expect((await related(s, 'nowhere.md')).passages).toEqual([])
    expect((await s.get<{ error: unknown }>('/related')).error).toBeTruthy()
  })
})
