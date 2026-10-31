import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { zipSync, strToU8 } from 'fflate'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { JobManager, type JobSummary } from '../server/ai/jobs'
import { FakeEngine } from '../server/ai/fake'
import type { ImportResult } from '../shared/types'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
let page: Server, base = ''
beforeAll(async () => {
  page = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(`<html><head><title>Notes</title></head><body><article><h1>Notes on radar</h1><p>${'Radar measures the time of flight of a pulse and the Doppler shift of the echo. '.repeat(8)}</p></article></body></html>`) }).listen(0)
  await new Promise((r) => page.once('listening', r))
  base = `http://127.0.0.1:${(page.address() as { port: number }).port}`
})
afterAll(() => { page.close() })

function setup() {
  const root = tmp('mdl-impr-')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const jobs = new JobManager(bus)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', jobs, engine: () => new FakeEngine(5) })
  const h = workspaces.open(root)
  const headers = { host: 'localhost:1', 'x-mdl': '1' }
  const json = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json' } })
  const upload = (kind: string, name: string, data: Uint8Array | string, extra: Record<string, string> = {}) => {
    const form = new FormData()
    form.set('kind', kind); form.set('file', new File([data as BlobPart], name))
    for (const [k, v] of Object.entries(extra)) form.set(k, v)
    return app.request(`/api/w/${h.id}/import/file`, { method: 'POST', body: form, headers })
  }
  return { root, json, upload, app, h }
}

describe('import routes', () => {
  it('imports a web page', async () => {
    const { json, root } = setup()
    const r = await (await json('/import/web', { url: `${base}/page` })).json() as ImportResult
    expect(r.files[0]).toEqual({ path: 'imports/notes-on-radar.md', kind: 'document' })
    expect(readFileSync(join(root, r.files[0].path), 'utf8')).toMatch(/^# Notes on radar/)
    expect((await json('/import/web', { url: 'file:///etc/passwd' })).status).toBe(400)
    expect((await json('/import/web', { url: 'x' })).status).toBe(400)
  })
  it('imports a notebook, a PDF read locally and an Anki deck from uploaded files', async () => {
    const { upload, root } = setup()
    const nb = await upload('notebook', 'a.ipynb', JSON.stringify({ cells: [{ cell_type: 'markdown', source: '# Hello\n\nWorld.' }] }))
    expect(nb.status).toBe(200); expect(((await nb.json()) as ImportResult).files[0].path).toBe('imports/a.md')
    const pdf = await upload('pdf-fast', 'sample.pdf', readFileSync(resolve(__dirname, 'fixtures/sample.pdf')))
    expect(pdf.status).toBe(200); expect(((await pdf.json()) as ImportResult).summary).toMatch(/2 pages/)
    const db = new DatabaseSync(':memory:')
    db.exec("CREATE TABLE col (id integer, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text); CREATE TABLE notes (id integer, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text); CREATE TABLE cards (id integer, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text); CREATE TABLE revlog (id integer, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);")
    db.prepare("INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')").run('{}', JSON.stringify({ 1: { name: 'Radar' } }))
    db.prepare("INSERT INTO notes VALUES (1,'g',1,0,0,'',?,0,0,0,'')").run('What is Doppler?\x1fA frequency shift.')
    db.prepare("INSERT INTO cards VALUES (7,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'')").run()
    const apkg = zipSync({ 'collection.anki2': db.serialize(), media: strToU8('{}') })
    const anki = await upload('anki', 'radar.apkg', apkg, { keepHistory: 'true' })
    expect(anki.status).toBe(200)
    const a = await anki.json() as ImportResult
    expect(a.files[0].path).toBe('learn/imports/radar.learn.md'); expect(existsSync(join(root, a.files[0].path))).toBe(true)
  })
  it('refuses unknown kinds, empty uploads and files that are not what they claim', async () => {
    const { upload } = setup()
    expect((await upload('zip', 'x', 'x')).status).toBe(400)
    expect((await upload('notebook', 'x.ipynb', 'nope')).status).toBe(400)
    expect((await upload('pdf-fast', 'x.pdf', 'not a pdf at all')).status).toBe(400)
    expect((await upload('anki', 'x.apkg', 'not a zip')).status).toBe(400)
  })
  it('the high-quality PDF import keeps the PDF in the folder and starts a Claude job that may write one new file', async () => {
    const { upload, root, app, h } = setup()
    const r = await upload('pdf-quality', 'My Paper.pdf', readFileSync(resolve(__dirname, 'fixtures/sample.pdf')))
    expect(r.status).toBe(200)
    const res = await r.json() as ImportResult
    expect(res.files).toEqual([{ path: 'imports/source/my-paper.pdf', kind: 'asset' }, { path: 'imports/my-paper.md', kind: 'document' }])
    expect(existsSync(join(root, 'imports/source/my-paper.pdf'))).toBe(true)
    expect(res.jobId).toMatch(/^[0-9a-f-]{36}$/)
    let job: JobSummary & { prompt: string } = { status: 'queued', prompt: '' } as never
    for (let i = 0; i < 100 && ['queued', 'running'].includes(job.status); i++) { job = await (await app.request(`/api/w/${h.id}/ai/jobs/${res.jobId}`, { headers: { host: 'localhost:1' } })).json() as never; await new Promise((x) => setTimeout(x, 20)) }
    expect(job.prompt).toMatch(/imports\/source\/my-paper\.pdf[\s\S]*imports\/my-paper\.md/); expect(job.prompt).toMatch(/2 pages/)
    expect(job.status).toBe('done')
    expect(existsSync(join(root, 'imports/my-paper.md'))).toBe(true)
  })
})

describe('import from a chat', () => {
  const lesson = (title: string, body = ':::cloze\nTides follow the {{Moon}}.\n:::\n') => `---\ntitle: ${title}\nlevel: beginner\n---\n\n## The idea\n\nTides follow the Moon.\n\n${body}`
  const answer = `<!-- file: tides/course.md -->\n~~~~markdown\n# Tides\n~~~~\n<!-- file: tides/01-why.learn.md -->\n~~~~markdown\n${lesson('Why')}~~~~\n<!-- file: tides/02-bad.learn.md -->\n~~~~markdown\n${lesson('Bad', ':::quiz\nQ?\n- [ ] a\n- [ ] b\n:::\n')}~~~~\n`
  it('checks without writing, then saves only the files without errors', async () => {
    const { root, json } = setup()
    const check = await (await json('/import/chat/check', { text: answer })).json() as { folder: string; files: { path: string; errors: number; cards: number }[]; fix: string }
    expect(check.folder).toBe('tides')
    expect(check.files.map((f) => [f.path, f.errors])).toEqual([['tides/course.md', 0], ['tides/01-why.learn.md', 0], ['tides/02-bad.learn.md', 1]])
    expect(check.fix).toMatch(/<!-- file: tides\/02-bad\.learn\.md -->\n- \d+:\d+ E202/)
    expect(existsSync(join(root, 'tides'))).toBe(false)
    const r = await (await json('/import/chat', { text: answer })).json() as ImportResult
    expect(r.files).toEqual([{ path: 'tides/course.md', kind: 'document' }, { path: 'tides/01-why.learn.md', kind: 'lesson' }])
    expect(r.warnings.join(' ')).toMatch(/02-bad\.learn\.md was not saved/)
    expect(r.fix).toMatch(/E202/)
    expect(readFileSync(join(root, 'tides/01-why.learn.md'), 'utf8')).toBe(lesson('Why').replace('---\n', '---\nid: tides-why\n'))
    // a second import goes to a new folder instead of touching the first
    expect((await (await json('/import/chat/check', { text: answer })).json() as { folder: string }).folder).toBe('tides-2')
  })
  it('keeps everything inside the folder and says when nothing was found', async () => {
    const { json } = setup()
    expect((await json('/import/chat/check', { text: answer, folder: '../up' })).ok).toBe(false)
    const escaped = await (await json('/import/chat/check', { text: '<!-- file: ../../x.learn.md -->\n' + lesson('X') })).json() as { files: { path: string }[] }
    expect(escaped.files[0].path).toBe('x/x.learn.md') // the unsafe name is dropped, the lesson is named by its title
    const none = await json('/import/chat/check', { text: '<!-- file: a.learn.md -->\n\n' })
    expect(none.ok).toBe(false)
    expect(JSON.stringify(await none.json())).toMatch(/No lesson found/)
  })
})
