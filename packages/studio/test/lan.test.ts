import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { startStudio, type Studio } from '../server/index'
import { lanAddresses } from '../server/security'

const ip = lanAddresses()[0]
const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
describe.skipIf(!ip)('sharing on the network (--lan)', () => {
  let studio: Studio
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'mdl-lan-')); cpSync(fixture, root, { recursive: true })
    studio = await startStudio({ root, port: 48000 + Math.floor(Math.random() * 900), lan: true, fakeAi: true, settingsFile: join(mkdtempSync(join(tmpdir(), 'mdl-cfg-')), 's.json') })
  })
  afterAll(async () => { await studio?.close() })
  const base = () => `http://${ip}:${studio.port}`
  it('prints a private link and a QR code', () => {
    expect(studio.lanUrl).toMatch(new RegExp(`^http://${ip.replace(/\./g, '\\.')}:\\d+/api/auth\\?t=`))
    expect(studio.qr?.length).toBeGreaterThan(100)
  })
  it('another device without the token is refused', async () => {
    expect((await fetch(`${base()}/api/session`)).status).toBe(401)
    expect((await fetch(`${base()}/api/auth?t=wrong`)).status).toBe(401)
  })
  it('the link sets a cookie; then reading and studying work, but not files or AI jobs', async () => {
    const r = await fetch(studio.lanUrl!, { redirect: 'manual' })
    expect(r.status).toBe(302)
    const cookie = r.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    const headers = { cookie: cookie.split(';')[0] }
    const s = await (await fetch(`${base()}/api/session`, { headers })).json() as { client: string; caps: string[] }
    expect(s.client).toBe('lan')
    expect(s.caps).toEqual(['read', 'study', 'notes', 'askLocal'])
    const ws = studio.url.split('/w/')[1]
    expect((await fetch(`${base()}/api/w/${ws}/tree`, { headers })).status).toBe(200)
    expect((await fetch(`${base()}/api/w/${ws}/related?path=x.md`, { headers })).status).toBe(200)
    expect((await fetch(`${base()}/api/fs/browse`, { headers })).status).toBe(403)
    const job = await fetch(`${base()}/api/w/${ws}/ai/jobs`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1', origin: base() }, body: JSON.stringify({ recipe: 'custom', request: 'hello there' }) })
    expect(job.status).toBe(403)
    // editing, importing, exporting answers and starting batches stay on the computer running MDlearn; asking and reading do not
    const post = (path: string, body: unknown) => fetch(`${base()}/api/w/${ws}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1', origin: base() }, body: JSON.stringify(body) })
    expect((await post('/files/save', { path: 'x.md', text: 'x' })).status).toBe(403)
    expect((await post('/files/create', { path: 'new.md', text: 'x' })).status).toBe(403)
    expect((await post('/import/web', { url: 'http://example.org' })).status).toBe(403)
    expect((await post('/ai/batches', { docs: ['a.md'] })).status).toBe(403)
    expect((await post('/ask/setup', {})).status).toBe(403)
    expect((await post('/latex/compile', { path: 'paper.tex' })).status).toBe(403) // runs a program on the computer
    expect((await post('/latex/save-pdf', { path: 'paper.tex' })).status).toBe(403)
    // downloading, choosing and removing AI models change this computer
    const postApi = (path: string, body: unknown) => fetch(`${base()}/api${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1', origin: base() }, body: JSON.stringify(body) })
    for (const action of ['pull', 'choose', 'delete', 'cancel']) expect((await postApi(`/ai/local/${action}`, { model: 'qwen3:4b' })).status).toBe(403)
    // a phone can capture and sort into cards, but only this computer writes into a document
    const captured = await post('/inbox', { text: 'From the phone' })
    expect(captured.status).toBe(200)
    const item = await captured.json() as { file: string; id: string }
    expect((await fetch(`${base()}/api/w/${ws}/inbox`, { headers })).status).toBe(200)
    expect((await post('/inbox/move', { file: item.file, id: item.id, doc: 'x.md' })).status).toBe(403)
    expect((await post('/pictures', {})).status).toBe(403)
    expect((await post('/sources', {})).status).toBe(403)
    expect((await post('/inbox/done', { file: item.file, id: item.id })).status).toBe(200)
    // the paper library stays on this computer, as SciNet keeps it
    for (const path of ['/api/scinet/status', '/api/scinet/papers?q=x', '/api/scinet/papers/1']) expect((await fetch(`${base()}${path}`, { headers })).status).toBe(403)
    expect((await postApi('/scinet/url', { url: 'http://127.0.0.1:8000' })).status).toBe(403)
    expect((await post('/import/scinet', { paperId: 1 })).status).toBe(403)
    // the model list, but not this computer's hardware, system or where its programs are
    const local = await (await fetch(`${base()}/api/ai/local`, { headers })).json() as { hardware: unknown; install: { command: unknown }; claude: Record<string, unknown> }
    expect(local.hardware).toBeNull()
    expect(local.install.command).toBeNull()
    expect(Object.keys(local.claude)).toEqual(['available'])
    const engines = await (await fetch(`${base()}/api/engines`, { headers })).json() as { claude: Record<string, unknown> }
    expect(Object.keys(engines.claude)).toEqual(['available'])
    expect((await fetch(`${base()}/api/w/${ws}/export/anki`, { headers })).status).toBe(403)
    expect((await fetch(`${base()}/api/w/${ws}/formulas`, { headers })).status).toBe(200)
    expect((await fetch(`${base()}/api/w/${ws}/ask/status`, { headers })).status).toBe(200)
  })
})
