import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import type { SheetResponse } from '../shared/types'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
let chats = 0, ollama: Server, url = ''
beforeAll(async () => {
  ollama = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); return }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      chats++
      res.setHeader('content-type', 'application/x-ndjson')
      res.write(JSON.stringify({ message: { content: JSON.stringify({ ideas: ['Power falls with the fourth power of range.', 'Gain enters squared: it is used twice.'] }) }, done: false }) + '\n')
      res.end(JSON.stringify({ done: true }) + '\n')
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })

const LONG = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
function setup() {
  chats = 0
  const root = tmp('mdl-sheet-')
  writeFileSync(join(root, 'radar.md'), `# Radar\n\n## 1. Equation\n\n${LONG}\n\n**Gain** is the antenna power concentration relative to an isotropic source.\n\n$$P_r = \\frac{P_t G^2}{R^4}$$\n\n### 1.1 Detail\n\n$$S = \\frac{P_t}{4\\pi R^2}$$\n\n## 2. Short\n\nTiny section.\n\n## 3. Plain\n\n${LONG}\n`)
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url, model: 'qwen3:8b', embedModel: 'embeddinggemma' } }))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  const sheet = async () => (await app.request(`/api/w/${h.id}/sheet?path=radar.md`, { headers: { host: 'localhost:1' } })).json() as Promise<SheetResponse>
  return { post, sheet }
}

describe('cheat sheet', () => {
  it('collects formulas and terms by section, leaving out sections with nothing to show', async () => {
    const { sheet } = setup()
    const s = await sheet()
    expect(s).toMatchObject({ title: 'Radar', formulaCount: 2, termCount: 1, ideas: { state: 'none' } })
    expect(s.sections.map((x) => [x.num, x.formulas.length, x.terms.length])).toEqual([['1', 1, 1], ['1.1', 1, 0]])
    expect(s.sections[0].formulas[0].tex).toBe('P_r = \\frac{P_t G^2}{R^4}')
    expect(s.sections[0].terms[0]).toMatchObject({ term: 'Gain', definition: expect.stringMatching(/antenna power concentration/) })
  })
  it('writes key ideas for the long top-level sections once, and reuses them until the text changes', async () => {
    const { post, sheet } = setup()
    const r = await post('/sheet/ideas', { path: 'radar.md' })
    expect(r.status).toBe(200)
    for (let i = 0; i < 100 && (await sheet()).ideas.state === 'running'; i++) await new Promise((x) => setTimeout(x, 30))
    const s = await sheet()
    expect(s.ideas.state).toBe('done')
    expect(chats).toBe(2) // sections 1 and 3 are long enough; 2 is not
    expect(s.sections.find((x) => x.num === '1')?.ideas).toEqual(['Power falls with the fourth power of range.', 'Gain enters squared: it is used twice.'])
    await post('/sheet/ideas', { path: 'radar.md' })
    for (let i = 0; i < 100 && chats === 2; i++) await new Promise((x) => setTimeout(x, 30))
    await new Promise((x) => setTimeout(x, 100))
    expect(chats).toBe(2) // unchanged sections are not asked again
    await post('/sheet/ideas', { path: 'radar.md', regenerate: true })
    for (let i = 0; i < 100 && chats < 4; i++) await new Promise((x) => setTimeout(x, 30))
    expect(chats).toBe(4)
  })
  it('refuses a path outside the folder', async () => {
    const { post } = setup()
    expect((await post('/sheet/ideas', { path: '../etc/passwd' })).status).toBeGreaterThanOrEqual(400)
  })
})
