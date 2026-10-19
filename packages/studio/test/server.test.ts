import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, symlinkSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { startStudio, type Studio } from '../server/index'
import type { Tree, LessonResponse, DocResponse } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-ws-')
  cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 'studio.json'))
  settings.update((s) => ({ ...s, libraryDir: join(tmp('mdl-lib-'), 'library') }))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 'test', security: { port: 4747, lan: false, lanFull: false, token: 't'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 'test' })
  const h = workspaces.open(root)
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers: { host: 'localhost:4747', ...headers } })
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:4747', 'content-type': 'application/json', 'x-mdl': '1', origin: 'http://localhost:4747', ...headers } })
  return { root, settings, workspaces, app, h, get, post }
}

describe('security', () => {
  const { get, post, h } = setup()
  it('refuses foreign Host headers (DNS rebinding)', async () => {
    expect((await get('/api/session', { host: 'evil.example:4747' })).status).toBe(403)
    expect((await get('/api/session')).status).toBe(200)
  })
  it('changes need the X-MDL header, our own origin and JSON', async () => {
    expect((await post('/api/workspaces/open', { path: h.root }, { 'x-mdl': '' })).status).toBe(403)
    expect((await post('/api/workspaces/open', { path: h.root }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await post('/api/workspaces/open', { path: h.root }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post('/api/workspaces/open', { path: h.root }, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post('/api/workspaces/open', { path: h.root })).status).toBe(200)
  })
  it('sets protective headers', async () => {
    const r = await get('/api/session')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('content-security-policy')).toContain("object-src 'none'")
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
  it('session reports a local client with every capability', async () => {
    const s = await (await get('/api/session')).json() as { client: string; caps: string[] }
    expect(s.client).toBe('local')
    expect(s.caps).toEqual(expect.arrayContaining(['read', 'study', 'ai', 'fs']))
  })
})

describe('reading a folder', () => {
  const { get, post, h, root } = setup()
  it('tree lists documents with their companion lessons', async () => {
    const t = await (await get(`/api/w/${h.id}/tree`)).json() as Tree
    const radar = t.docs.find((d) => d.path === '00_FOUNDATIONS/04_radar.md')!
    expect(radar.title).toBeTruthy()
    expect(radar.lessons[0]).toMatchObject({ path: expect.stringContaining('learn/00_FOUNDATIONS/04_radar/'), cards: expect.any(Number) })
    expect(t.totals.lessons).toBeGreaterThan(0)
  })
  it('doc returns the parsed document with an ETag, then 304', async () => {
    const r = await get(`/api/w/${h.id}/doc?path=00_FOUNDATIONS/04_radar.md`)
    expect(r.status).toBe(200)
    const d = await r.json() as DocResponse
    expect(d.blocks.some((b) => b.type === 'heading')).toBe(true)
    const again = await get(`/api/w/${h.id}/doc?path=00_FOUNDATIONS/04_radar.md`, { 'if-none-match': r.headers.get('etag')! })
    expect(again.status).toBe(304)
  })
  it('refuses paths outside the folder, hidden files, symlink escapes and non-Markdown files', async () => {
    const outside = tmp('mdl-out-')
    writeFileSync(join(outside, 'secret.md'), '# secret')
    symlinkSync(outside, join(root, 'escape'))
    mkdirSync(join(root, '.hidden')); writeFileSync(join(root, '.hidden/x.md'), '# x')
    writeFileSync(join(root, 'notes.txt'), 'x')
    for (const p of ['../x.md', '/etc/passwd', 'escape/secret.md', '.hidden/x.md', 'notes.txt'])
      expect((await get(`/api/w/${h.id}/doc?path=${encodeURIComponent(p)}`)).status, p).toBe(403)
    expect((await get(`/api/w/${h.id}/doc?path=nope.md`)).status).toBe(404)
  })
  it('lessons arrive without answer keys', async () => {
    const t = await (await get(`/api/w/${h.id}/tree`)).json() as Tree
    const lp = t.docs.flatMap((d) => d.lessons)[0].path
    const r = await (await get(`/api/w/${h.id}/lesson?path=${encodeURIComponent(lp)}`)).json() as LessonResponse
    const json = JSON.stringify(r.lesson)
    expect(r.lesson?.cards.length).toBeGreaterThan(0)
    for (const k of ['"correct"', '"answers"', '"solution"', '"ideas"', '"feedback"']) expect(json).not.toContain(k)
  })
  it('widgets written inside a document are redacted, and can be practised', async () => {
    writeFileSync(join(root, 'quiz-doc.md'), '# Q\n\n:::quiz\nWhich?\n- [x] yes\n  > Right.\n- [ ] no\n  > Wrong.\n:::\n')
    const d = await (await get(`/api/w/${h.id}/doc?path=quiz-doc.md`)).json() as DocResponse
    const json = JSON.stringify(d)
    expect(json).not.toContain('"correct"')
    expect(json).not.toContain('Right.')
    const w = d.blocks.find((b) => b.type === 'quiz') as unknown as { id: string; options: { content: unknown }[] }
    const yes = w.options.findIndex((o) => JSON.stringify(o.content).includes('yes'))
    const r = await (await post(`/api/w/${h.id}/doc/check`, { path: 'quiz-doc.md', widgetId: w.id, answer: { type: 'quiz', picked: [yes] } })).json() as { checked: { correct: boolean } }
    expect(r.checked.correct).toBe(true)
  })
  it('compile previews a snippet without writing', async () => {
    const r = await (await post(`/api/w/${h.id}/compile`, { source: '---\ntitle: T\n---\n## C\n\n:::quiz\nQ?\n- [x] a\n- [ ] b\n:::\n' })).json() as { ok: boolean; diagnostics: { code: string }[] }
    expect(r.ok).toBe(true)
    const bad = await (await post(`/api/w/${h.id}/compile`, { source: '## C\n\n:::quiz\nQ?\n:::\n' })).json() as { ok: boolean }
    expect(bad.ok).toBe(false)
  })
  it('search finds sections', async () => {
    const hits = await (await get(`/api/w/${h.id}/search?q=radar`)).json() as unknown[]
    expect(hits.length).toBeGreaterThan(0)
  })
  it('unknown workspace ids are 404', async () => {
    expect((await get('/api/w/000000000000/tree')).status).toBe(404)
  })
})

describe('upload', () => {
  const { app, settings } = setup()
  const upload = (files: [string, string][], name = 'My notes') => {
    const fd = new FormData()
    fd.append('name', name)
    for (const [path, content] of files) { fd.append('files', new File([content], path.split('/').pop()!)); fd.append('paths', path) }
    return app.request('/api/workspaces/upload', { method: 'POST', body: fd, headers: { host: 'localhost:4747', 'x-mdl': '1', origin: 'http://localhost:4747' } })
  }
  it('copies a dropped folder into the library and opens it', async () => {
    const r = await upload([['Physics/a.md', '# A'], ['Physics/sub/b.md', '# B'], ['Physics/run.sh', 'echo hi']])
    expect(r.status).toBe(200)
    const body = await r.json() as { id: string; root: string; files: number; skipped: number }
    expect(body).toMatchObject({ files: 2, skipped: 1 })
    expect(body.root.startsWith(settings.get().libraryDir)).toBe(true)
    expect(readFileSync(join(body.root, 'sub/b.md'), 'utf8')).toBe('# B')
    expect(existsSync(join(body.root, 'run.sh'))).toBe(false)
  })
  it('refuses path traversal in file names', async () => {
    const r = await upload([['../../evil.md', '# x'], ['ok.md', '# ok']])
    expect(r.status).toBe(403)
  })
  it('refuses uploads without Markdown', async () => {
    expect((await upload([['pic.png', 'x']])).status).toBe(400)
  })
})

describe('live reload over SSE', () => {
  let studio: Studio, root: string
  beforeAll(async () => {
    root = tmp('mdl-live-'); cpSync(fixture, root, { recursive: true })
    studio = await startStudio({ root, port: 47470 + Math.floor(Math.random() * 500), settingsFile: join(tmp('mdl-cfg-'), 's.json') })
  })
  afterAll(async () => { await studio?.close() })
  it('a file edited on disk is announced to the browser', async () => {
    const id = studio.url.split('/w/')[1]
    const ctl = new AbortController()
    const res = await fetch(`http://localhost:${studio.port}/api/events?ws=${id}`, { signal: ctl.signal })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    const until = async (re: RegExp) => { for (const end = Date.now() + 5000; Date.now() < end;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); if (re.test(buf)) return true } return false }
    expect(await until(/"type":"hello"/)).toBe(true)
    await new Promise((r) => setTimeout(r, 300)) // let the watcher settle
    writeFileSync(join(root, '00_FOUNDATIONS/04_radar.md'), readFileSync(join(root, '00_FOUNDATIONS/04_radar.md'), 'utf8') + '\nMore.\n')
    expect(await until(/"type":"fs.changed".*04_radar\.md/)).toBe(true)
    ctl.abort()
  }, 10_000)
})
