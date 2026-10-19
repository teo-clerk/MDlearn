import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, utimesSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import type { FileInfo, HistoryEntry, PreviewResponse } from '../shared/types'

const fixtures = resolve(__dirname, '../../core/test/fixtures')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-edit-'); cpSync(join(fixtures, 'curriculum'), root, { recursive: true })
  cpSync(join(fixtures, '02-bayes-theorem.learn.md'), join(root, 'learn/02-bayes-theorem.learn.md'))
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const get = (p: string) => app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })
  const file = async (path: string) => (await get(`/file?path=${encodeURIComponent(path)}`)).json() as Promise<FileInfo>
  return { root, post, get, file }
}
const DOC = '00_FOUNDATIONS/04_radar.md'
const LESSON = 'learn/02-bayes-theorem.learn.md'

describe('reading and saving files', () => {
  it('reads a file with its version stamp and what kind it is', async () => {
    const { file } = setup()
    expect(await file(DOC)).toMatchObject({ path: DOC, kind: 'doc', mtime: expect.any(Number), text: expect.stringContaining('#') })
    expect((await file(LESSON)).kind).toBe('lesson')
  })
  it('saves, remembers the previous text, and gives the new version stamp', async () => {
    const { post, get, file, root } = setup()
    const f = await file(DOC)
    const r = await post('/files/save', { path: DOC, text: `${f.text}\n\nAdded line.\n`, baseMtime: f.mtime })
    expect(r.status).toBe(200)
    expect(readFileSync(join(root, DOC), 'utf8')).toBe(`${f.text}\n\nAdded line.\n`)
    expect((await r.json() as { mtime: number }).mtime).toBeGreaterThan(0)
    const hist = await (await get(`/history?path=${encodeURIComponent(DOC)}`)).json() as HistoryEntry[]
    expect(hist).toHaveLength(1)
    const old = await (await get(`/history/version?path=${encodeURIComponent(DOC)}&id=${hist[0].id}`)).json() as { text: string }
    expect(old.text).toBe(f.text)
    expect(readdirSync(root).some((n) => n.endsWith('.tmp'))).toBe(false)
  })
  it('refuses to overwrite a change made on disk meanwhile, unless told to', async () => {
    const { post, file, root } = setup()
    const f = await file(DOC)
    writeFileSync(join(root, DOC), 'Someone else wrote this.\n'); utimesSync(join(root, DOC), new Date(), new Date(Date.now() + 5000))
    const r = await post('/files/save', { path: DOC, text: 'Mine.\n', baseMtime: f.mtime })
    expect(r.status).toBe(409); expect((await r.json() as { error: { code: string } }).error.code).toBe('conflict')
    expect(readFileSync(join(root, DOC), 'utf8')).toBe('Someone else wrote this.\n')
    expect((await post('/files/save', { path: DOC, text: 'Mine.\n', baseMtime: f.mtime, overwrite: true })).status).toBe(200)
    expect(readFileSync(join(root, DOC), 'utf8')).toBe('Mine.\n')
  })
  it('does not write or remember anything when the text did not change; keeps only the last 20 versions', async () => {
    const { post, get, file } = setup()
    let f = await file(DOC)
    await post('/files/save', { path: DOC, text: f.text, baseMtime: f.mtime })
    expect(await (await get(`/history?path=${encodeURIComponent(DOC)}`)).json()).toEqual([])
    for (let i = 0; i < 24; i++) { f = await file(DOC); await post('/files/save', { path: DOC, text: `${f.text}\nv${i}`, baseMtime: f.mtime }); await new Promise((r) => setTimeout(r, 2)) }
    const hist = await (await get(`/history?path=${encodeURIComponent(DOC)}`)).json() as HistoryEntry[]
    expect(hist).toHaveLength(20)
    expect(hist[0].at).toBeGreaterThan(hist[19].at)
  })
  it('only touches Markdown files inside the folder', async () => {
    const { post } = setup()
    expect((await post('/files/save', { path: '../outside.md', text: 'x' })).status).toBe(403)
    expect((await post('/files/save', { path: 'learn/.mdlearn/progress.json', text: 'x' })).status).toBe(403)
    expect((await post('/files/save', { path: 'nope.md', text: 'x' })).status).toBe(404)
  })
})

describe('new notes', () => {
  it('creates a file with its folders, and never replaces one', async () => {
    const { post, root } = setup()
    const r = await post('/files/create', { path: 'notes/ideas/first.md', text: '# First\n' })
    expect(r.status).toBe(200)
    expect(readFileSync(join(root, 'notes/ideas/first.md'), 'utf8')).toBe('# First\n')
    expect((await post('/files/create', { path: 'notes/ideas/first.md', text: 'again' })).status).toBe(409)
    expect(readFileSync(join(root, 'notes/ideas/first.md'), 'utf8')).toBe('# First\n')
  })
  it('refuses names outside the folder, hidden folders and anything that is not .md', async () => {
    const { post, root } = setup()
    for (const path of ['../x.md', '/etc/x.md', '.hidden/x.md', 'a/.x.md', 'plain.txt', 'a//b.md', '']) {
      const r = await post('/files/create', { path, text: '' })
      expect(r.status, path).toBeGreaterThanOrEqual(400)
    }
    expect(existsSync(join(root, '..', 'x.md'))).toBe(false)
  })
})

describe('preview of unsaved text', () => {
  it('parses a document as it would read, with diagnostics, without touching the file', async () => {
    const { post, root } = setup()
    const before = readFileSync(join(root, DOC), 'utf8')
    const r = await (await post('/preview', { path: DOC, text: '# Title\n\n## 1. Part\n\nText with $x^2$.\n\n$$E=mc^2$$\n' })).json() as PreviewResponse
    expect(r.kind).toBe('doc'); expect(r.doc!.title).toBe('Title')
    expect(r.doc!.blocks.some((b) => b.type === 'heading')).toBe(true)
    expect(readFileSync(join(root, DOC), 'utf8')).toBe(before)
  })
  it('compiles a lesson, hides the answers, and reports mistakes with their line', async () => {
    const { post, file } = setup()
    const ok = await (await post('/preview', { path: LESSON, text: (await file(LESSON)).text })).json() as PreviewResponse
    expect(ok.kind).toBe('lesson'); expect(ok.lesson!.lesson!.cards.length).toBeGreaterThan(2)
    expect(JSON.stringify(ok.lesson)).not.toMatch(/"correct"|"solution"|"ideas"/)
    const bad = await (await post('/preview', { path: LESSON, text: '---\ntitle: X\n---\n\n## One\n\n:::quiz\nQ?\n- [ ] a\n- [ ] b\n:::\n' })).json() as PreviewResponse
    expect(bad.diagnostics.some((d) => d.code.startsWith('E') && d.line > 0)).toBe(true)
  })
  it('refuses non-Markdown paths', async () => {
    const { post } = setup()
    expect((await post('/preview', { path: 'a.json', text: '{}' })).status).toBe(403)
  })
})
