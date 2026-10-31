import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import type { DocResponse } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-ws-')
  cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 'studio.json'))
  const libraryDir = join(tmp('mdl-lib-'), 'library')
  settings.update((s) => ({ ...s, libraryDir }))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 'test', security: { port: 4747, lan: false, lanFull: false, token: 't'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 'test' })
  const h = workspaces.open(root)
  const get = (path: string) => app.request(path, { headers: { host: 'localhost:4747' } })
  const post = (path: string, body: unknown) => app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:4747', 'content-type': 'application/json', 'x-mdl': '1', origin: 'http://localhost:4747' } })
  return { root, settings, libraryDir, h, get, post }
}

describe('help and onboarding', () => {
  it('the welcome tour is shown until it is done, and that is remembered', async () => {
    const { get, post, settings } = setup()
    expect(await (await get('/api/onboarding')).json()).toEqual({ tourDone: false })
    expect(await (await post('/api/onboarding', { tourDone: true })).json()).toEqual({ tourDone: true })
    expect(settings.get().onboarding.tourDone).toBe(true)
    expect((await post('/api/onboarding', { tourDone: 'yes' })).status).toBe(400)
  })
  it('knows a folder is in the library when the library is reached through a link', () => {
    const { settings } = setup()
    const link = join(tmp('mdl-link-'), 'library')
    symlinkSync(tmp('mdl-real-lib-'), link, 'junction')
    settings.update((s) => ({ ...s, libraryDir: link }))
    const spaces = new Workspaces(settings)
    const course = spaces.course('Thermo')
    expect(spaces.list().find((w) => w.id === course.id)?.inLibrary).toBe(true)
  })
  it('the tutorial is copied into the library, opened, and can start over', async () => {
    const { post, libraryDir } = setup()
    const w = await (await post('/api/workspaces/tutorial', {})).json() as { id: string; root: string }
    expect(w.root).toBe(join(libraryDir, 'MDlearn Tutorial'))
    expect(existsSync(join(w.root, 'feature-tour.md'))).toBe(true)
    expect(existsSync(join(w.root, 'learn', '01-feature-tour.learn.md'))).toBe(true)
    // your own changes survive reopening; "start over" brings back a fresh copy
    writeFileSync(join(w.root, 'feature-tour.md'), 'changed')
    await post('/api/workspaces/tutorial', {})
    expect(readFileSync(join(w.root, 'feature-tour.md'), 'utf8')).toBe('changed')
    await post('/api/workspaces/tutorial', { reset: true })
    expect(readFileSync(join(w.root, 'feature-tour.md'), 'utf8')).toContain('# MDlearn feature tour')
  })
  it('serves the Help document', async () => {
    const { get } = setup()
    const r = await (await get('/api/help')).json() as { doc: { title: string; blocks: { type: string }[] } }
    expect(r.doc.title).toBe('Help')
    expect(r.doc.blocks.some((b) => b.type === 'heading')).toBe(true)
  })
  it('the :::html sandbox page has its own policy: inline scripts, no network', async () => {
    const { get } = setup()
    const r = await get('/sandbox/html.html')
    const csp = r.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("'unsafe-inline'")
    expect(csp).not.toMatch(/connect-src/)
    expect(await r.text()).toContain('/sandbox/html.js')
  })
})

describe('games and html in a document', () => {
  const GAMES = `# Games

:::match
Match.
- one :: uno
- two :: dos
- three :: tres
:::

:::speed
- [x] Water is wet.
- [ ] Fire is cold.
  > It is hot.
- [x] Ice is solid.
:::

A <mark>marked</mark> word.
`
  it('are redacted, and a single move is checked without revealing the rest', async () => {
    const { root, h, get, post } = setup()
    writeFileSync(join(root, 'games.md'), GAMES)
    const d = await (await get(`/api/w/${h.id}/doc?path=games.md`)).json() as DocResponse
    const json = JSON.stringify(d)
    for (const k of ['"truth"', '"pairs"', 'It is hot.']) expect(json).not.toContain(k)
    expect(json).toContain('"tag":"mark"')
    const speed = d.blocks.find((b) => b.type === 'speed') as unknown as { id: string; statements: unknown[] }
    const move = await (await post(`/api/w/${h.id}/doc/check`, { path: 'games.md', widgetId: speed.id, answer: { type: 'speed', answers: [true, null, null] } })).json() as { checked: { correct: boolean; answer: string; parts: { statements: { ok: boolean | null; truth?: boolean }[] } } }
    expect(move.checked.correct).toBe(false)
    expect(move.checked.answer).toBe('')
    expect(move.checked.parts.statements[0].truth).toBeTypeOf('boolean')
    expect(move.checked.parts.statements[1]).toEqual({ ok: null })
    const match = d.blocks.find((b) => b.type === 'match') as unknown as { id: string }
    const bad = await post(`/api/w/${h.id}/doc/check`, { path: 'games.md', widgetId: match.id, answer: { type: 'match', pairs: [0, 0, 1] } })
    expect(bad.status).toBe(400)
  })
})
