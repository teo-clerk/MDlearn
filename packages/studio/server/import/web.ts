// A web page → one Markdown document: the article text (Readability), math written back as $…$, tables and
// code kept, pictures saved beside it. The page is fetched by the server (http/https only, 5 MB, 15 s).
import { posix } from 'node:path'
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { IMPORT_DIR, freePath, result, slugify, writeNew } from './common.js'
import type { ImportResult } from '../../shared/types.js'

type Doc = ReturnType<typeof parseHTML>['document']
type El = NonNullable<ReturnType<Doc['querySelector']>>
type ReadabilityDoc = ConstructorParameters<typeof Readability>[0]
const MAX_PAGE_BYTES = 5 * 1024 * 1024, MAX_IMAGE_BYTES = 2 * 1024 * 1024, MAX_IMAGES = 20, TIMEOUT_MS = 15_000
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
const UA = 'Mozilla/5.0 (compatible; MDlearn Studio importer)'

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  let n = 0
  const reader = res.body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    n += value.length
    if (n > max) { await reader.cancel(); throw new UserError('too-large', `The page is larger than ${Math.round(max / 1048576)} MB.`) }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
export function checkUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new UserError('invalid', 'That is not a web address.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UserError('invalid', 'Only http and https addresses can be imported.')
  if (u.username || u.password) throw new UserError('invalid', 'Addresses with a user name or password are not accepted.')
  return u
}
async function fetchPage(url: URL): Promise<{ html: string; url: URL }> {
  let res: Response
  try { res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' }) }
  catch (e) { throw new UserError('fetch', `The page could not be loaded (${(e as Error).name === 'TimeoutError' ? 'it took longer than 15 seconds' : (e as Error).message}).`) }
  const final = checkUrl(res.url || url.href)
  if (!res.ok) throw new UserError('fetch', `The site answered ${res.status}.`)
  const type = res.headers.get('content-type') ?? ''
  if (!/html|xml/i.test(type)) throw new UserError('fetch', `That address is not a web page (${type || 'unknown type'}).`)
  const bytes = await readCapped(res, MAX_PAGE_BYTES)
  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(Buffer.from(bytes.subarray(0, 2048)).toString('latin1'))?.[1] ?? 'utf-8'
  let html: string
  try { html = new TextDecoder(charset).decode(bytes) } catch { html = new TextDecoder('utf-8').decode(bytes) }
  return { html, url: final }
}

// ---- math: KaTeX, MathJax and <math> turn into tokens that survive Readability and Turndown, then back into TeX
const TOKEN = (i: number) => `MDLMATH${i}END`
function takeMath(doc: Doc): string[] {
  const found: string[] = []
  const put = (el: El, tex: string, display: boolean) => {
    const t = tex.trim(); if (!t) return
    found.push(display ? `$$\n${t}\n$$` : `$${t}$`)
    el.replaceWith(doc.createTextNode(display ? `\n\n${TOKEN(found.length - 1)}\n\n` : ` ${TOKEN(found.length - 1)} `))
  }
  for (const el of [...doc.querySelectorAll('.katex-display, .katex')]) {
    if (!el.isConnected) continue
    const display = el.classList.contains('katex-display') || !!el.closest('.katex-display')
    const tex = (el.querySelector('annotation[encoding="application/x-tex"]') ?? null)?.textContent
    put(display && !el.classList.contains('katex-display') ? (el.closest('.katex-display') ?? el) : el, tex ?? '', display)
  }
  for (const el of [...doc.querySelectorAll('script[type^="math/tex"]')]) put(el, el.textContent ?? '', /mode=display/.test(el.getAttribute('type') ?? ''))
  for (const el of [...doc.querySelectorAll('math')]) { const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? el.getAttribute('alttext'); if (tex) put(el, tex, el.getAttribute('display') === 'block') }
  for (const el of [...doc.querySelectorAll('[data-tex], .math-tex, img.latex, img[alt^="\\\\"]')]) { const tex = el.getAttribute('data-tex') ?? el.getAttribute('alt') ?? el.textContent; if (tex) put(el, tex.replace(/^\\\(|\\\)$/g, ''), false) }
  return found
}

export function articleToMarkdown(html: string, base: URL): { title: string; markdown: string } {
  const { document } = parseHTML(html)
  const maths = takeMath(document)
  const heading = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()
  for (const el of [...document.querySelectorAll('script, style, noscript, iframe, form, nav, footer, aside, [aria-hidden="true"]')]) el.remove()
  const article = new Readability(document as unknown as ReadabilityDoc, { keepClasses: true, charThreshold: 200 }).parse()
  // the page's own heading beats <title>, which usually ends with the site's name
  const fromTitle = (article?.title || document.title || base.hostname).split(/\s[|–—]\s|\s-\s/)[0].trim()
  const title = heading && heading.length >= 3 && heading.length <= 160 ? heading : fromTitle
  const content = article?.content ?? document.body?.innerHTML ?? ''
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' })
  td.use(gfm)
  const absolute = (u: string | null) => { try { return u ? new URL(u, base).href : '' } catch { return '' } }
  td.addRule('absolute-links', { filter: 'a', replacement: (inner, node) => { const href = absolute((node as unknown as El).getAttribute('href')); return href && inner.trim() ? `[${inner}](${href})` : inner } })
  td.addRule('absolute-images', { filter: 'img', replacement: (_c, node) => { const el = node as unknown as El; const src = absolute(el.getAttribute('src') ?? el.getAttribute('data-src')); return src ? `![${(el.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')}](${src})` : '' } })
  let markdown = td.turndown(content)
  markdown = markdown.replace(/MDLMATH(\d+)END/g, (_, i: string) => maths[Number(i)] ?? '').replace(/^(\s*)-   /gm, '$1- ').replace(/^(\s*\d+\.)   /gm, '$1 ').replace(/\n{3,}/g, '\n\n').trim()
  return { title, markdown }
}

/** Download the pictures of an article next to it (at most 20, 2 MB each); a picture that fails keeps its text. */
async function localiseImages(h: Handle, markdown: string, docRel: string, slug: string): Promise<{ markdown: string; saved: string[]; failed: number }> {
  const urls = [...new Set([...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]))].slice(0, MAX_IMAGES)
  const saved: string[] = []
  let failed = 0, n = 0
  const rewrites = new Map<string, string | null>()
  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA } })
      const ext = IMAGE_EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()]
      if (!res.ok || !ext) throw new Error('not an image')
      const bytes = await readCapped(res, MAX_IMAGE_BYTES)
      const rel = posix.join('assets', slug, `image-${++n}.${ext}`)
      writeNew(h, rel, bytes); saved.push(rel)
      rewrites.set(u, posix.relative(posix.dirname(docRel), rel))
    } catch { failed++; rewrites.set(u, null) }
  }
  const out = markdown.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt: string, u: string) => (rewrites.has(u) ? (rewrites.get(u) ? `![${alt}](${rewrites.get(u)})` : (alt ? `*${alt}*` : '')) : (alt ? `*${alt}*` : '')))
  return { markdown: out, saved, failed }
}

export async function importWeb(h: Handle, rawUrl: string): Promise<ImportResult> {
  const { html, url } = await fetchPage(checkUrl(rawUrl))
  const { title, markdown } = articleToMarkdown(html, url)
  if (markdown.split(/\s+/).length < 30) throw new UserError('empty', 'No article text could be found on that page.')
  const slug = slugify(title)
  const rel = freePath(h, IMPORT_DIR, slug)
  const local = await localiseImages(h, markdown, rel, slug)
  const date = new Date().toISOString().slice(0, 10)
  const body = /^#\s/.test(local.markdown) ? local.markdown : `# ${title}\n\n${local.markdown}`
  const [first, ...rest] = body.split('\n')
  writeNew(h, rel, `${first}\n\n> Imported from <${url.href}> on ${date}.\n${rest.join('\n').replace(/^\n*/, '\n')}\n`)
  const warnings = local.failed ? [`${local.failed} pictures could not be downloaded and were left out.`] : []
  return result([{ path: rel, kind: 'document' }, ...local.saved.map((p) => ({ path: p, kind: 'asset' as const }))], warnings, `${title}: ${markdown.split(/\s+/).length} words${local.saved.length ? `, ${local.saved.length} pictures` : ''}.`)
}
