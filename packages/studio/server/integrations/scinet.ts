// SciNet (a private map of your paper library) as a source: find a paper there and bring it into this folder to
// study. Only a SciNet on this computer is ever asked: plain http to a loopback address, no redirects, and every
// answer limited in size and time.
import { z } from 'zod'
import { UserError } from '../workspaces.js'
import { readCapped } from '../import/common.js'
import type { ScinetDetail, ScinetPaper, ScinetStatus } from '../../shared/types.js'

const QUICK_MS = 5000, TEXT_MS = 15_000, SEARCH_MS = 30_000, PDF_MS = 60_000 // a first search loads SciNet's embedding model
const MAX_JSON = 5 * 1024 * 1024, MAX_MARKDOWN = 20 * 1024 * 1024, MAX_PDF = 100 * 1024 * 1024
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const MARKER_TIER = 1 // SciNet's tier that writes formulas as LaTeX; the text layer and its vision tier do not

const Summary = z.object({ id: z.number().int(), title: z.string().nullish(), year: z.number().int().nullish() })
const Page = z.object({ items: z.array(Summary), total: z.number().int() })
const Hits = z.object({ hits: z.array(z.object({ paper_id: z.number().int(), title: z.string().nullish(), snippet: z.string().nullish() })) })
const Health = z.object({ version: z.string() })
const Detail = Summary.extend({
  authors: z.array(z.string()).default([]), venue: z.string().nullish(), abstract: z.string().nullish(), doi: z.string().nullish(), arxiv_id: z.string().nullish(),
  page_count: z.number().int().nullish(), parse: z.object({ tier: z.number().int(), parser: z.string() }).nullish(),
})
const titled = (id: number, title?: string | null) => title?.trim() || `Paper ${id}`

/** The address SciNet answers on: only http, only on this computer. */
export function scinetUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new UserError('invalid', 'That is not a web address.') }
  if (u.protocol !== 'http:' || !LOOPBACK.has(u.hostname) || u.username || u.password) throw new UserError('invalid', 'SciNet must run on this computer, for example http://127.0.0.1:8000.')
  return new URL(u.origin)
}

async function ask(raw: string, path: string, max: number, ms: number, what: string): Promise<Uint8Array> {
  const url = new URL(path, scinetUrl(raw))
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'error' })
    if (res.status === 404) throw new UserError('not-found', 'SciNet has not read this paper yet.')
    if (res.status === 410) throw new UserError('not-found', 'SciNet no longer has this file.')
    if (!res.ok) throw new UserError('engine', `SciNet answered ${res.status}.`)
    return await readCapped(res, max, what)
  } catch (e) {
    if (e instanceof UserError) throw e
    throw new UserError('engine', 'SciNet is not answering. Start it with `uv run scinet-up`.')
  }
}
async function json<T>(raw: string, path: string, schema: z.ZodType<T>, ms = QUICK_MS): Promise<T> {
  const bytes = await ask(raw, path, MAX_JSON, ms, 'The answer from SciNet')
  try { return schema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))) }
  catch { throw new UserError('engine', 'SciNet gave an answer this version of MDlearn cannot read.') }
}

export async function scinetStatus(raw: string): Promise<ScinetStatus> {
  const url = scinetUrl(raw).origin
  try {
    const { version } = await json(raw, '/api/health', Health)
    const { total } = await json(raw, '/api/papers?status=ready&limit=1', Page)
    return { url, running: true, version, papers: total }
  } catch (e) {
    if (e instanceof UserError) return { url, running: false } // nothing there, or something else on that port
    throw e
  }
}

/** By meaning (SciNet's vectors) or by words in the title; with no words, the papers it has read. */
export async function findPapers(raw: string, query: string, mode: 'meaning' | 'title'): Promise<ScinetPaper[]> {
  const q = query.trim().slice(0, 200)
  if (mode === 'meaning' && q.length >= 2) {
    const { hits } = await json(raw, `/api/search/semantic?limit=20&q=${encodeURIComponent(q)}`, Hits, SEARCH_MS)
    return hits.map((h) => ({ id: h.paper_id, title: titled(h.paper_id, h.title), year: null, ...(h.snippet ? { snippet: h.snippet.slice(0, 300) } : {}) }))
  }
  const { items } = await json(raw, `/api/papers?status=ready&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`, Page)
  return items.map((p) => ({ id: p.id, title: titled(p.id, p.title), year: p.year ?? null }))
}

export async function scinetPaper(raw: string, id: number): Promise<ScinetDetail> {
  const p = await json(raw, `/api/papers/${id}`, Detail)
  return {
    id: p.id, title: titled(p.id, p.title), year: p.year ?? null, authors: p.authors, venue: p.venue ?? null, abstract: p.abstract ?? null, doi: p.doi ?? null,
    arxivId: p.arxiv_id ?? null, pages: p.page_count ?? null, parsedBy: p.parse?.parser ?? null, formulas: p.parse?.tier === MARKER_TIER ? 'latex' : 'text',
  }
}
export async function scinetMarkdown(raw: string, id: number): Promise<string> {
  return Buffer.from(await ask(raw, `/api/papers/${id}/markdown`, MAX_MARKDOWN, TEXT_MS, 'The text of this paper')).toString('utf8')
}
export async function scinetPdf(raw: string, id: number): Promise<Uint8Array> {
  const bytes = await ask(raw, `/api/papers/${id}/pdf`, MAX_PDF, PDF_MS, 'This PDF')
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new UserError('invalid', 'This work is not a PDF, so it cannot be read again.')
  return bytes
}
