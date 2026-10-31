import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { findPapers, scinetPaper, scinetPdf, scinetStatus, scinetUrl } from '../server/integrations/scinet'
import type { ImportResult, ScinetDetail, ScinetPaper } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const TEXT = `## Introduction\n\n${'A sentence about adaptation with α and β and σ and μ and Σ in it. '.repeat(10)}`

// A stand-in for SciNet's API, with a few papers and the ways it can answer badly
const DETAIL = { id: 7, title: 'Statistical: Physics of "Adaptation"', year: 2016, status: 'ready', authors: ['N. Perunov', 'J. England'], venue: 'Phys. Rev. X', abstract: 'Whether by mechanisms of Darwinian selection or something else entirely, things adapt.', doi: '10.1103/x', arxiv_id: '1412.1875', page_count: 12, parse: { tier: 0, parser: 'pymupdf' } }
let scinet: Server, url = ''
const seen: string[] = []
beforeAll(async () => {
  scinet = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x')
    seen.push(req.url!)
    const send = (body: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
    if (u.pathname === '/api/health') return send({ status: 'ok', version: '0.9.0', pipeline_version: 3 })
    if (u.pathname === '/api/papers') return send({ items: u.searchParams.get('q') === 'none' ? [] : [{ id: 7, title: DETAIL.title, year: 2016, status: 'ready' }, { id: 8, title: null, year: null, status: 'ready' }], total: 2, offset: 0, limit: 30 })
    if (u.pathname === '/api/search/semantic') return send({ mode: 'semantic', query: u.searchParams.get('q'), hits: [{ paper_id: 7, title: DETAIL.title, score: 0.9, snippet: 'about adaptation' }] })
    if (u.pathname === '/api/papers/7') return send(DETAIL)
    if (u.pathname === '/api/papers/9') return send({ ...DETAIL, id: 9, title: 'Marker paper', parse: { tier: 1, parser: 'marker' } })
    if (u.pathname === '/api/papers/10') return send({ ...DETAIL, id: 10, title: 'Book', parse: null })
    if (u.pathname === '/api/papers/11') return send({ nonsense: true })
    if (u.pathname === '/api/papers/7/markdown' || u.pathname === '/api/papers/9/markdown') { res.setHeader('content-type', 'text/plain'); return res.end(TEXT) }
    if (u.pathname === '/api/papers/10/markdown') { res.statusCode = 410; return send({ detail: 'markdown file is missing from disk' }) }
    if (u.pathname === '/api/papers/7/pdf') return res.end('%PDF-1.7 not really')
    if (u.pathname === '/api/papers/9/pdf') return res.end('EPUB')
    res.statusCode = 404; send({ detail: 'this paper has not been parsed yet' })
  }).listen(0, '127.0.0.1')
  await new Promise((r) => scinet.once('listening', r))
  url = `http://127.0.0.1:${(scinet.address() as { port: number }).port}`
})
afterAll(() => { scinet.close() })

function setup(scinetAt = url) {
  const root = tmp('mdl-scinet-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, scinet: { url: scinetAt } }))
  const workspaces = new Workspaces(settings)
  const id = workspaces.open(root).id
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const headers = { host: 'localhost:1' }
  const get = (p: string) => app.request(p, { headers })
  const post = (p: string, body: unknown) => app.request(p, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1' } })
  return { root, id, settings, get, post }
}
const errorOf = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error

describe('asking SciNet', () => {
  it('accepts only http on this computer', () => {
    for (const ok of ['http://127.0.0.1:8000', 'http://localhost:8000/', 'http://[::1]:8000']) expect(() => scinetUrl(ok)).not.toThrow()
    for (const bad of ['https://127.0.0.1:8000', 'http://192.168.1.4:8000', 'http://example.org', 'http://localhost.example.org', 'http://u:p@127.0.0.1:8000', 'file:///etc/passwd', 'nonsense']) expect(() => scinetUrl(bad)).toThrow()
  })
  it('says whether it is running, and how many papers it has', async () => {
    expect(await scinetStatus(url)).toEqual({ url, running: true, version: '0.9.0', papers: 2 })
    expect(await scinetStatus('http://127.0.0.1:9')).toEqual({ url: 'http://127.0.0.1:9', running: false })
  })
  it('finds papers by meaning, by title, or lists them', async () => {
    expect(await findPapers(url, 'how things adapt', 'meaning')).toEqual([{ id: 7, title: DETAIL.title, year: null, snippet: 'about adaptation' }])
    expect((await findPapers(url, 'adapt', 'title')).map((p) => [p.id, p.title, p.year])).toEqual([[7, DETAIL.title, 2016], [8, 'Paper 8', null]])
    expect(await findPapers(url, 'none', 'title')).toEqual([])
    seen.length = 0
    await findPapers(url, '', 'meaning') // too short to mean anything: the list
    expect(seen).toEqual(['/api/papers?status=ready&limit=30'])
  })
  it('knows which parser read a paper, and so how its formulas came in', async () => {
    expect(await scinetPaper(url, 7)).toMatchObject({ arxivId: '1412.1875', pages: 12, parsedBy: 'pymupdf', formulas: 'text' })
    expect(await scinetPaper(url, 9)).toMatchObject({ parsedBy: 'marker', formulas: 'latex' })
    expect(await scinetPaper(url, 10)).toMatchObject({ parsedBy: null, formulas: 'text' })
  })
  it('turns bad answers into plain messages', async () => {
    await expect(scinetPaper(url, 404)).rejects.toThrow('SciNet has not read this paper yet.')
    await expect(scinetPaper(url, 11)).rejects.toThrow('cannot read')
    await expect(scinetPaper('http://127.0.0.1:9', 7)).rejects.toThrow('SciNet is not answering')
    await expect(scinetPdf(url, 9)).rejects.toThrow('not a PDF')
  })
})

describe('importing a paper', () => {
  it('writes one new document with where it came from, and warns when its formulas are plain text', async () => {
    const { root, id, post } = setup()
    const r = await (await post(`/api/w/${id}/import/scinet`, { paperId: 7 })).json() as ImportResult
    expect(r.files).toEqual([{ path: 'imports/scinet/statistical-physics-of-adaptation.md', kind: 'document' }])
    expect(r.warnings[0]).toMatch(/plain text/)
    const text = readFileSync(join(root, r.files[0].path), 'utf8')
    expect(text).toMatch(/^---\ntitle: "Statistical: Physics of \\"Adaptation\\""\nauthors: \["N\. Perunov","J\. England"\]\nyear: 2016\n/)
    expect(text).toContain('scinet: 7\nparsed_by: "pymupdf"\n')
    expect(text).toMatch(/\n# Statistical: Physics of "Adaptation"\n\n## Abstract\n\nWhether by mechanisms/)
    expect(text).toContain('## Introduction')
  })
  it('never replaces a file, and has no warning when SciNet read the formulas as LaTeX', async () => {
    const { root, id, post } = setup()
    const first = await (await post(`/api/w/${id}/import/scinet`, { paperId: 9 })).json() as ImportResult
    const second = await (await post(`/api/w/${id}/import/scinet`, { paperId: 9 })).json() as ImportResult
    expect(first.warnings).toEqual([])
    expect(second.files[0].path).toBe('imports/scinet/marker-paper-2.md')
    expect(existsSync(join(root, first.files[0].path))).toBe(true)
  })
  it('says so when SciNet has lost the text', async () => {
    const { id, post } = setup()
    expect(await errorOf(await post(`/api/w/${id}/import/scinet`, { paperId: 10 }))).toMatchObject({ code: 'not-found', message: 'SciNet no longer has this file.' })
  })
  it('keeps only a valid address, and reports on the new one', async () => {
    const { get, post, settings } = setup('http://127.0.0.1:9')
    expect(await (await get('/api/scinet/status')).json()).toMatchObject({ running: false })
    expect(await errorOf(await post('/api/scinet/url', { url: 'http://example.org:8000' }))).toMatchObject({ code: 'invalid' })
    expect(settings.get().scinet.url).toBe('http://127.0.0.1:9')
    expect(await (await post('/api/scinet/url', { url })).json()).toMatchObject({ running: true })
    expect(settings.get().scinet.url).toBe(url)
  })
})
