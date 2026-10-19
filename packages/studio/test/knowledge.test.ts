import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { Knowledge } from '../server/knowledge/index'
import type { FormulasResponse, GlossaryResponse, LinksResponse, MapResponse, DocSummary } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-know-'); cpSync(fixture, root, { recursive: true })
  writeFileSync(join(root, 'A.md'), '# Alpha\n\nIntro to alpha, long enough to be a useful summary of the document.\n\n**Gain** is the antenna power concentration. See [beta](B.md).\n\n**Dwell time**: how long a beam stays on one spot of the ground.\n\nThe energy relation reads:\n\n$$E = m c^2$$\n')
  writeFileSync(join(root, 'B.md'), '# Beta\n\n> **Prerequisites**: [`A.md`](A.md)\n\nBeta text mentions [alpha](A.md) twice: [again](A.md).\n\n$$F = m a$$\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const bus = new EventBus()
  const knowledge = new Knowledge(workspaces, bus)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', knowledge })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  return { root, h, get, bus }
}

describe('formula sheet', () => {
  it('lists every formula with where it comes from, and searches by TeX and by words', async () => {
    const { get } = setup()
    const all = await get<FormulasResponse>('/formulas?wait=1')
    expect(all.status).toMatchObject({ building: false })
    expect(all.items.map((f) => f.tex)).toEqual(expect.arrayContaining(['E = m c^2', 'F = m a']))
    expect(all.items.find((f) => f.tex === 'E = m c^2')).toMatchObject({ doc: 'A.md', docTitle: 'Alpha' })
    expect(all.items.find((f) => f.tex === 'E = m c^2')?.lead).toMatch(/energy relation/)
    const q = await get<FormulasResponse>('/formulas?q=energy&wait=1')
    expect(q.items.map((f) => f.tex)).toEqual(['E = m c^2'])
    expect((await get<FormulasResponse>('/formulas?doc=B.md&wait=1')).items.map((f) => f.tex)).toEqual(['F = m a'])
    expect(all.docs.find((d) => d.path === 'A.md')?.count).toBe(1)
  })
})
describe('glossary', () => {
  it('gathers defined terms with their sources, searchable and in a compact form for hovers', async () => {
    const { get } = setup()
    const g = await get<GlossaryResponse>('/glossary?wait=1')
    const gain = g.terms.find((t) => t.term === 'Gain')!
    expect(gain.definition).toMatch(/^The antenna power concentration/)
    expect(gain.sources[0]).toMatchObject({ doc: 'A.md', docTitle: 'Alpha' })
    expect((await get<GlossaryResponse>('/glossary?q=antenna&wait=1')).terms.map((t) => t.term)).toContain('Gain')
    expect((await get<GlossaryResponse>('/glossary?q=zzzz&wait=1')).terms).toEqual([])
    expect((await get<GlossaryResponse>('/glossary?compact=1&wait=1')).terms[0]).toHaveProperty('sources')
    // "term: text" lines are shown only on request, and never underlined in the reader
    expect(g.terms.map((t) => t.term)).not.toContain('Dwell time')
    expect((await get<GlossaryResponse>('/glossary?loose=1&wait=1')).terms.map((t) => t.term)).toContain('Dwell time')
    expect((await get<GlossaryResponse>('/glossary?compact=1&loose=1&wait=1')).terms.map((t) => t.term)).not.toContain('Dwell time')
  })
})
describe('links, backlinks and the map', () => {
  it('knows what a document links to and what links to it', async () => {
    const { get } = setup()
    const a = await get<LinksResponse>(`/links?path=A.md&wait=1`)
    expect(a.outgoing.map((l) => l.path)).toEqual(['B.md'])
    expect(a.backlinks.map((l) => [l.path, l.kind])).toEqual([['B.md', 'prereq']])
    const b = await get<LinksResponse>(`/links?path=B.md&wait=1`)
    expect(b.outgoing.find((l) => l.path === 'A.md')?.count).toBeGreaterThanOrEqual(3)
    expect(b.backlinks.map((l) => l.path)).toEqual(['A.md'])
  })
  it('draws prerequisites from the prerequisite to the document that needs it', async () => {
    const { get } = setup()
    const m = await get<MapResponse>('/map?wait=1')
    expect(m.nodes.map((n) => n.path)).toEqual(expect.arrayContaining(['A.md', 'B.md']))
    expect(m.edges.filter((e) => e.to === 'B.md')).toEqual([{ from: 'A.md', to: 'B.md', kind: 'prereq' }])
  })
  it('summarises a document for a hover preview', async () => {
    const { get } = setup()
    const s = await get<DocSummary>('/doc/summary?path=A.md&wait=1')
    expect(s).toMatchObject({ title: 'Alpha', lessons: 0, memory: null })
    expect(s.intro).toMatch(/^Intro to alpha/)
  })
})
describe('keeping up with the files', () => {
  it('a document edited on disk updates the index; the index is saved and reused', async () => {
    const { get, root, bus, h } = setup()
    await get('/formulas?wait=1')
    expect(existsSync(join(root, '.mdlearn/index/knowledge.json'))).toBe(true)
    writeFileSync(join(root, 'A.md'), '# Alpha\n\nChanged.\n\n$$x = y + z$$\n')
    bus.publish({ type: 'fs.changed', ws: h.id, paths: [{ path: 'A.md', kind: 'doc', change: 'change' }] })
    const after = await get<FormulasResponse>('/formulas?doc=A.md&wait=1')
    expect(after.items.map((f) => f.tex)).toEqual(['x = y + z'])
    expect(JSON.parse(readFileSync(join(root, '.mdlearn/index/knowledge.json'), 'utf8')).version).toBeGreaterThan(0)
  })
})
