import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { Bm25 } from '../server/ask/search'
import { buildPrompt } from '../server/ask/prompt'
import { cardPassages } from '../server/ask/lessons'
import type { AskEntry, RelatedResponse } from '../shared/types'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const TOKEN = 'x'.repeat(43)
const LESSON = `---
title: The Moon and the tides
level: beginner
lang: en
goals:
  - Explain why there are two tides a day
---

## Two bulges

The gravity of the Moon raises a bulge of water on the near side and leaves another on the far side, so most coasts see two high tides a day.

:::cloze
Most coasts see {{two}} high tides a day.
:::

## Spring tides

When the Sun and the Moon line up, their pull adds up and the tides are strongest.

:::cloze
The strongest tides come when the Sun and the Moon {{line up}}.
:::
`

// A stand-in for Ollama. Requests for search words get what a test sets; every other chat is recorded and answered.
type Chat = { messages: { role: string; content: string }[] }
let chats: Chat[] = [], wordRequests: Chat[] = [], searchWords = '', wordsFail = false
let ollama: Server, url = ''
beforeAll(async () => {
  ollama = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); return }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      const j = JSON.parse(body || '{}') as Chat
      const words = /search words/i.test(j.messages[0]?.content ?? '')
      if (words && wordsFail) { res.statusCode = 500; res.end('{}'); return }
      if (words) wordRequests.push(j); else chats.push(j)
      res.setHeader('content-type', 'application/x-ndjson')
      res.write(JSON.stringify({ message: { content: words ? searchWords : 'Due maree al giorno [1].' } }) + '\n')
      res.end(JSON.stringify({ done: true }) + '\n')
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })
beforeEach(() => { chats = []; wordRequests = []; searchWords = ''; wordsFail = false })

function setup(o: { local?: boolean; claudeOnce?: (r: { system: string; prompt: string; signal?: AbortSignal }) => Promise<string>; lan?: boolean } = {}) {
  const root = tmp('mdl-comp-')
  mkdirSync(join(root, 'tides'))
  writeFileSync(join(root, 'tides/course.md'), '# Tides\n\nWhy the sea rises and falls.\n\n1. [The Moon](01-moon.learn.md)\n')
  writeFileSync(join(root, 'tides/01-moon.learn.md'), LESSON)
  writeFileSync(join(root, 'cooking.md'), '# Cooking\n\n## 1. Bread\n\nBread needs flour, water, salt and yeast, and rises slowly in a warm kitchen for a few hours before baking.\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url: o.local === false ? 'http://127.0.0.1:9' : url, model: 'qwen3:8b', embedModel: 'embeddinggemma' } }))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: !!o.lan, lanFull: false, token: TOKEN }, settings, workspaces, bus: new EventBus(), serverId: 't', ...(o.claudeOnce ? { claudeOnce: o.claudeOnce } : {}) })
  const h = workspaces.open(root)
  const headers = { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1', origin: 'http://localhost:1' }
  const post = (p: string, body: unknown, extra: Record<string, string> = {}) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, ...extra } })
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const done = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const e = (await get<AskEntry[]>('/ask/history')).find((x) => x.id === id)
      if (e?.done) return e
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('the answer never finished')
  }
  /** Asks, and waits for the answer to end: it is written in the background, after the request returns. */
  const ask = async (body: Record<string, unknown>) => {
    const r = await post('/ask', body)
    expect(r.status).toBe(200)
    const asked = await r.json() as { id: string; entry: AskEntry }
    await done(asked.id)
    return asked
  }
  return { root, ask, done, get, post }
}
const lastPrompt = () => chats.at(-1)!.messages.map((m) => m.content).join('\n')

describe('Ask reads your lessons', () => {
  it('finds a card in a lesson and cites it by lesson and card', async () => {
    const { ask } = setup()
    const { entry } = await ask({ question: 'Why do most coasts see two high tides?' })
    const source = entry.sources.find((s) => s.doc === 'tides/01-moon.learn.md')
    expect(source).toMatchObject({ docTitle: 'The Moon and the tides', section: { title: 'Two bulges' } })
    expect(lastPrompt()).toMatch(/bulge of water on the near side/)
  })
  it('sees a lesson that changed', async () => {
    const { ask, root } = setup()
    await ask({ question: 'Why do most coasts see two high tides?' })
    writeFileSync(join(root, 'tides/01-moon.learn.md'), LESSON.replace('Spring tides', 'Neap tides').replace('line up', 'stand at a right angle'))
    const { entry } = await ask({ question: 'What are neap tides?' })
    expect(entry.sources.some((s) => s.section?.title === 'Neap tides')).toBe(true)
  })
  it('keeps lessons out of Related, which lists notes', async () => {
    const { get } = setup()
    const r = await get<RelatedResponse>('/related?path=tides/course.md')
    expect(r.passages.every((p) => !p.doc.endsWith('.learn.md'))).toBe(true)
  })
})

describe('a lesson as passages', () => {
  it('makes one passage per card, without the marks only the compiler needs', () => {
    const cards = cardPassages('t.learn.md', LESSON)
    expect(cards.map((c) => c.section?.title)).toEqual(['Two bulges', 'Spring tides'])
    expect(cards[0].docTitle).toBe('The Moon and the tides')
    expect(cards[0].text).toMatch(/Most coasts see two high tides a day\./)
    expect(cards[0].text).not.toMatch(/:::|\{\{/)
    expect(cards.map((c) => c.text).join('\n')).not.toMatch(/level: beginner/)
  })
  it('reads a file saved with Windows line endings the same way', () => {
    const cards = cardPassages('t.learn.md', LESSON.replace(/\n/g, '\r\n'))
    expect(cards.map((c) => c.section?.title)).toEqual(['Two bulges', 'Spring tides'])
    expect(cards[0].docTitle).toBe('The Moon and the tides')
    expect(cards.map((c) => c.text).join('\n')).not.toMatch(/level: beginner/)
  })
  it('keeps a pinned id out of the title, and a heading inside code out of the cards', () => {
    const cards = cardPassages('t.learn.md', '---\ntitle: "Quoted"\n---\n\n## Renamed card {#old-id}\n\nText.\n\n```md\n## not a card\n```\n')
    expect(cards).toHaveLength(1)
    expect(cards[0].section).toEqual({ num: null, anchor: 'old-id', title: 'Renamed card' })
    expect(cards[0].docTitle).toBe('Quoted')
  })
})

describe('what may reach a model from a folder someone else made', () => {
  it.skipIf(process.platform === 'win32')('leaves out a lesson that is a link to a file outside the folder', async () => {
    const { ask, root } = setup()
    const secret = join(tmp('mdl-out-'), 'secret.md')
    writeFileSync(secret, '---\ntitle: Secret\n---\n\n## Private key\n\nzebra giraffe hunter2 kept out of every folder.\n')
    symlinkSync(secret, join(root, 'tides/02-link.learn.md'))
    const { entry } = await ask({ question: 'zebra giraffe hunter2', companion: true })
    expect(entry.sources.map((s) => s.docTitle)).not.toContain('Secret')
    expect(lastPrompt()).not.toMatch(/hunter2 kept/)
  })
  it.skipIf(process.platform === 'win32')('keeps a link that stays inside the folder', async () => {
    const { ask, root } = setup()
    mkdirSync(join(root, 'shared'))
    writeFileSync(join(root, 'shared/real.learn.md'), '---\ntitle: Shared\n---\n\n## Currents\n\nOcean currents carry heat from the equator to the poles over many years.\n')
    symlinkSync(join(root, 'shared/real.learn.md'), join(root, 'tides/03-shared.learn.md'))
    const { entry } = await ask({ question: 'ocean currents carry heat' })
    expect(entry.sources.map((s) => s.docTitle)).toContain('Shared')
  })
  it('skips a lesson too big to be a lesson', async () => {
    const { ask, root } = setup()
    writeFileSync(join(root, 'tides/04-huge.learn.md'), `---\ntitle: Huge\n---\n\n## Filler\n\n${'zebra '.repeat(400_000)}\n`)
    const { entry } = await ask({ question: 'zebra' })
    expect(entry.sources.map((s) => s.docTitle)).not.toContain('Huge')
  })
  it('cuts a title or a card that would swallow the prompt', () => {
    const cards = cardPassages('t.learn.md', `---\ntitle: ${'a'.repeat(5000)}\n---\n\n## ${'b'.repeat(5000)}\n\n${'c'.repeat(50_000)}\n`)
    expect(cards[0].docTitle.length).toBeLessThanOrEqual(200)
    expect(cards[0].section!.title.length).toBeLessThanOrEqual(200)
    expect(cards[0].text.length).toBeLessThanOrEqual(20_000)
  })
})

describe('questions in any language', () => {
  it('asks for the language of the question, with the app language for a question too short to tell', () => {
    const [system] = buildPrompt('SAR?', [], { lang: 'it' })
    expect(system.content).toMatch(/language the question is asked in/)
    expect(system.content).toMatch(/Italian/)
    const [strict] = buildPrompt('SAR?', [])
    expect(strict.content).toMatch(/only the numbered passages/)
    expect(strict.content).toMatch(/language the question is asked in/)
  })
  it('measures how much of a question the folder knows', () => {
    const search = new Bm25(['the moon raises tides on the coast'])
    expect(search.known('moon tides')).toBe(1)
    expect(search.known('perché le maree')).toBe(0)
    expect(search.known('moon perché')).toBe(0.5)
  })
  it('finds an English lesson from a question in Italian, by asking for search words first', async () => {
    const { ask, done } = setup()
    searchWords = 'two high tides moon'
    const { id, entry } = await ask({ question: 'Perché ci sono due maree alte al giorno?', lang: 'it' })
    expect(entry.sources.map((s) => s.doc)).toContain('tides/01-moon.learn.md')
    expect(wordRequests[0].messages.map((m) => m.content).join('\n')).toMatch(/The Moon and the tides/) // it sees what the folder is written in
    expect(chats.at(-1)!.messages.at(-1)!.content).toMatch(/Question: Perché ci sono/) // the model answers the question as it was asked
    expect((await done(id)).answer).toBe('Due maree al giorno [1].')
  })
  it('lets the search words lead: a question in another language only shares stray words with the folder', async () => {
    const { ask, root } = setup()
    writeFileSync(join(root, 'pasta.md'), '# Pasta\n\n## 1. Recipe\n\nIn Naples they say al giorno for a serving a day, and this recipe gives one al giorno for a family of four people.\n')
    searchWords = 'two high tides moon'
    const { entry } = await ask({ question: 'Perché ci sono due maree al giorno?', lang: 'it' })
    expect(entry.sources[0].doc).toBe('tides/01-moon.learn.md')
    expect(entry.sources.map((s) => s.doc)).not.toContain('pasta.md')
  })
  it('shows the search words a spread of the folder, not only its first titles', async () => {
    const { ask, root } = setup()
    for (let i = 0; i < 40; i++) writeFileSync(join(root, `a${String(i).padStart(2, '0')}.md`), `# Note number ${i}\n\n## 1. Text\n\nA short note that is here only so that this folder holds many more documents.\n`)
    await ask({ question: 'Perché ci sono due maree alte?', lang: 'it' })
    expect(wordRequests[0].messages[1].content).toMatch(/Note number 3\d/) // not just the first twenty
  })
  it('does not ask for search words when the folder knows the words of the question', async () => {
    const { ask } = setup()
    await ask({ question: 'Why do most coasts see two high tides?' })
    expect(wordRequests).toHaveLength(0)
  })
  it('falls back to the words of the question when no search words come', async () => {
    const { ask } = setup()
    wordsFail = true
    const { entry } = await ask({ question: 'moon perché quando dove come', lang: 'it' })
    expect(entry.sources.map((s) => s.doc)).toContain('tides/01-moon.learn.md')
  })
  it('sends notices as codes, so the app can say them in your language', async () => {
    const { ask } = setup()
    const found = await ask({ question: 'Why do most coasts see two high tides?' })
    expect(found.entry.notice).toBe('words')
    const none = await ask({ question: 'zebra giraffe' })
    expect(none.entry).toMatchObject({ done: true, notice: 'nothing', answer: '', sources: [] })
    expect(chats).toHaveLength(1) // the answer to the first question, nothing for the second
  })
})

describe('who answers', () => {
  it('Claude answers when there is no local model, with the same passages and rules', async () => {
    const asked: { system: string; prompt: string }[] = []
    const { ask, done } = setup({ local: false, claudeOnce: async (r) => { asked.push(r); return 'Two tides a day [1].' } })
    const { id, entry } = await ask({ question: 'Why do most coasts see two high tides?', engine: 'claude', lang: 'es' })
    expect(entry.done).toBe(false)
    expect((await done(id)).answer).toBe('Two tides a day [1].')
    expect(asked[0].system).toMatch(/Spanish/)
    expect(asked[0].prompt).toMatch(/\[1\]/)
    expect(asked[0].prompt).toMatch(/Question: Why do most coasts/)
  })
  it('the local model is still the default, and says when it is missing', async () => {
    const { post } = setup({ local: false })
    const r = await post('/ask', { question: 'Why do most coasts see two high tides?' })
    expect(r.status).toBe(400)
  })
  it('says so when Claude is not there', async () => {
    const { post } = setup({ local: false })
    const r = await post('/ask', { question: 'Why do most coasts see two high tides?', engine: 'claude' })
    expect(r.status).toBe(400)
    expect((await r.json() as { error: { message: string } }).error.message).toMatch(/Claude is not available/)
  })
  it('keeps a failed Claude answer as an error on the entry', async () => {
    const { ask, done } = setup({ local: false, claudeOnce: async () => { throw new Error('Claude could not answer just now. Try again, or use the local AI.') } })
    const { id } = await ask({ question: 'Why do most coasts see two high tides?', engine: 'claude' })
    expect((await done(id)).error).toMatch(/could not answer/)
  })
  it('Claude runs on this computer only: a phone on the network keeps the local model', async () => {
    let called = 0
    const { post } = setup({ lan: true, claudeOnce: async () => { called++; return 'x' } })
    const phone = { host: '192.168.1.5:1', origin: 'http://192.168.1.5:1', cookie: `mdl_t=${TOKEN}` }
    const r = await post('/ask', { question: 'Why do most coasts see two high tides?', engine: 'claude' }, phone)
    expect(r.status).toBe(403)
    expect(called).toBe(0)
  })
})

describe('what the app tells you about it', () => {
  it('no help page still says that nothing leaves your computer but AI Studio jobs', () => {
    for (const f of ['help.md', 'help.it.md', 'help.es.md', 'help.fr.md', 'help.ca.md']) {
      const text = readFileSync(resolve(__dirname, '..', f), 'utf8')
      expect(text, f).toMatch(/\(Claude\) (or|o|ou) /)
      expect(text, f).toMatch(/Companion|Compagno|Compañero|Compagnon|Company/i)
    }
  })
})

describe('the companion', () => {
  it('knows your course and your progress, so it can answer what to review', async () => {
    const { ask } = setup()
    await ask({ question: 'What should I review next?', companion: true, lang: 'en' })
    const text = lastPrompt()
    expect(text).toMatch(/Study record/)
    expect(text).toMatch(/The Moon and the tides: 2 cards, 0 seen/)
  })
  it('still answers when no passage matches, and marks what is not from the course', async () => {
    const { ask, done } = setup()
    const { id, entry } = await ask({ question: 'zebra giraffe', companion: true })
    expect(entry.done).toBe(false)
    expect(entry.notice).toBeUndefined()
    expect(chats[0].messages[0].content).toMatch(/not from their course/)
    expect((await done(id)).answer).toBe('Due maree al giorno [1].')
  })
  it('the Ask page stays strict: only your documents, no study record', async () => {
    const { ask } = setup()
    await ask({ question: 'Why do most coasts see two high tides?' })
    expect(chats[0].messages[0].content).toMatch(/only the numbered passages/)
    expect(lastPrompt()).not.toMatch(/Study record/)
  })
  it('reads the page you are on, for a question that names nothing', async () => {
    const { ask } = setup()
    const { entry } = await ask({ question: 'what does this mean exactly?', companion: true, doc: 'tides/01-moon.learn.md' })
    expect(entry.sources[0].doc).toBe('tides/01-moon.learn.md')
    expect(lastPrompt()).toMatch(/reading: The Moon and the tides/)
  })
  it('ignores a page that is not in the folder', async () => {
    const { ask } = setup()
    const { entry } = await ask({ question: 'what does this mean exactly?', companion: true, doc: '../../etc/passwd' })
    expect(entry.sources.every((s) => s.doc !== '../../etc/passwd')).toBe(true)
    expect(lastPrompt()).not.toMatch(/reading:/)
  })
  it('remembers the conversation, for a follow-up that names nothing', async () => {
    const { ask, done } = setup()
    const first = await ask({ question: 'What are spring tides?', companion: true })
    await done(first.id)
    const next = await ask({ question: 'and why is that?', companion: true, thread: [first.id] })
    const roles = chats.at(-1)!.messages.map((m) => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'user'])
    expect(chats.at(-1)!.messages[1].content).toBe('What are spring tides?')
    expect(chats.at(-1)!.messages[2].content).toBe('Due maree al giorno [1].')
    expect(next.entry.sources.some((s) => s.section?.title === 'Spring tides')).toBe(true) // found through the question before
  })
  it('tells the model that its material is data, not instructions', () => {
    const [system] = buildPrompt('hello', [], { companion: true })
    expect(system.content).toMatch(/not instructions/)
  })
})
