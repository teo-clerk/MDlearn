// PDF → Markdown without a model, from the positions of its text: headings by font size, paragraphs by
// line spacing, lists by indentation, running headers and page numbers removed. Formulas arrive as plain
// text (a PDF holds glyphs, not TeX): the high-quality import reads the page images instead.
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { IMPORT_DIR, freePath, result, slugify, writeNew } from './common.js'
import { pdfPages } from './pdf-text.js'
import type { ImportResult } from '../../shared/types.js'

export interface Line { page: number; top: number; left: number; width: number; height: number; size: number; bold: boolean; italic: boolean; text: string }
export interface Page { number: number; width: number; height: number; lines: Line[] }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const norm = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
const MATHY = /[∑∫√∞≈≤≥≠±×÷∂∇αβγδεζηθλμνξπρστφχψωΩΔΣΦΨΛΘΠ⁰¹²³⁴⁻]/gu

/** Lines to drop: running headers and footers (the same text near the page edge on many pages) and page numbers. */
function boilerplate(pages: Page[]): Set<Line> {
  const drop = new Set<Line>()
  const counts = new Map<string, number>()
  const edge = (l: Line, p: Page) => l.top < p.height * 0.12 || l.top > p.height * 0.87
  for (const p of pages) for (const k of new Set(p.lines.filter((l) => edge(l, p)).map((l) => norm(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const p of pages) for (const l of p.lines) {
    if (!edge(l, p)) continue
    const pageNumber = /^(page\s+)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?$/i.test(l.text) || /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(l.text)
    if (pageNumber || (pages.length >= 2 && (counts.get(norm(l.text)) ?? 0) >= Math.max(2, pages.length * 0.4))) drop.add(l)
  }
  return drop
}

export interface PdfMarkdown { markdown: string; title: string | null; formulaLines: number; columns: boolean; words: number }
export function pagesToMarkdown(pages: Page[]): PdfMarkdown {
  const gone = boilerplate(pages)
  const lines = pages.flatMap((p) => p.lines.filter((l) => !gone.has(l)))
  if (!lines.length) return { markdown: '', title: null, formulaLines: 0, columns: false, words: 0 }
  // the body font is the size most text is set in; headings are larger, or bold lines that are short
  const bySize = new Map<number, number>()
  for (const l of lines) bySize.set(l.size, (bySize.get(l.size) ?? 0) + l.text.length)
  const body = [...bySize].sort((a, b) => b[1] - a[1])[0][0]
  const bodyLeft = median(lines.filter((l) => l.size === body && l.text.length > 40).map((l) => l.left)) || Math.min(...lines.map((l) => l.left))
  const sizes = [...new Set(lines.filter((l) => l.size >= body * 1.12).map((l) => l.size))].sort((a, b) => b - a)
  const isHeading = (l: Line) => l.size >= body * 1.12 || (l.bold && l.size >= body && l.text.length < 90 && !/[.,;:]$/.test(l.text) && l.left - bodyLeft < 20)
  const level = (l: Line) => { const i = sizes.indexOf(l.size); return Math.min(4, (i < 0 ? sizes.length : i) + 1) }
  const rightEdge = Math.max(...lines.map((x) => x.left + x.width))
  const leading = median(lines.slice(1).map((l, i) => l.top - lines[i].top).filter((d) => d > 0 && d < body * 3)) || body * 1.3

  const out: string[] = []
  let para: string[] = [], list: { ordered: boolean; text: string }[] = []
  let formulaLines = 0
  const flushPara = () => { if (para.length) out.push(para.join(' ').replace(/\s+/g, ' ')); para = [] }
  const flushList = () => { if (list.length) { out.push(list.map((it, i) => `${it.ordered ? `${i + 1}.` : '-'} ${it.text}`).join('\n')); list = [] } }
  const join = (acc: string, next: string) => (/[a-z]-$/.test(acc) && /^[a-z]/.test(next) ? acc.slice(0, -1) + next : `${acc} ${next}`)
  let prev: Line | null = null, title: string | null = null
  for (const l of lines) {
    const gap = prev && prev.page === l.page ? l.top - prev.top : 0
    const newBlock = !prev || prev.page !== l.page ? false : gap > leading * 1.45
    if (isHeading(l)) {
      flushPara(); flushList()
      const lv = level(l)
      if (out.length && /^#{1,4} /.test(out[out.length - 1]) && prev && isHeading(prev) && prev.size === l.size && prev.page === l.page) out[out.length - 1] += ` ${l.text}` // a heading wrapped onto two lines
      else out.push(`${'#'.repeat(lv)} ${l.text}`)
      if (!title && lv === 1) title = l.text
      prev = l; continue
    }
    if ((l.text.match(MATHY)?.length ?? 0) >= 2) formulaLines++
    const indented = l.left - bodyLeft >= body * 1.4 && l.width < 0.85 * (rightEdge - bodyLeft)
    const num = /^(\d{1,2}[.)])\s+(\S.*)$/.exec(l.text)
    const bullet = /^[•◦▪▫●○■□\-–*·]\s+(\S.*)$/.exec(l.text)
    if (indented && (num || bullet || newBlock || list.length)) {
      flushPara()
      // a line that reached the right margin continues the item above; a short one ended it
      const wrapped = prev !== null && prev.left + prev.width >= rightEdge - body * 3
      if (list.length && !newBlock && !num && !bullet && wrapped) list[list.length - 1].text = join(list[list.length - 1].text, l.text)
      else {
        // a numbered list after a bulleted one (or the other way round) is a new list
        if (list.length && (num || bullet) && list[list.length - 1].ordered !== !!num) flushList()
        list.push({ ordered: !!num, text: (num?.[2] ?? bullet?.[1] ?? l.text) })
      }
    } else if (num && newBlock) { flushPara(); list.push({ ordered: true, text: num[2] }) } else {
      flushList()
      if (newBlock) flushPara()
      else if (prev && prev.page !== l.page && para.length && /[.!?:]$/.test(para[para.length - 1])) flushPara()
      para.length && !newBlock ? para[para.length - 1] = join(para[para.length - 1], l.text) : para.push(l.text)
    }
    prev = l
  }
  flushPara(); flushList()
  const right = lines.filter((l) => l.size === body && l.text.length > 30)
  const w = pages[0]?.width ?? 1
  const columns = right.length > 20 && right.filter((l) => l.left > w * 0.45).length > right.length * 0.3 && right.filter((l) => l.left < w * 0.3).length > right.length * 0.3
  const markdown = out.join('\n\n')
  return { markdown, title, formulaLines, columns, words: markdown.split(/\s+/).length }
}

/** A PDF's text as Markdown, from its text layer. Throws for a file that is not a PDF or holds no text (a scan). */
export async function pdfToMarkdown(bytes: Uint8Array): Promise<PdfMarkdown & { pages: Page[] }> {
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new UserError('invalid', 'This file is not a PDF.')
  const pages = await pdfPages(bytes)
  const md = pagesToMarkdown(pages)
  if (md.words < 30) throw new UserError('empty', 'No text could be read from this PDF. It may be scanned pictures; the high-quality import can read those.')
  return { ...md, pages }
}
export async function importPdfFast(h: Handle, fileName: string, bytes: Uint8Array): Promise<ImportResult> {
  const { pages, ...md } = await pdfToMarkdown(bytes)
  const name = fileName.replace(/\.pdf$/i, '')
  const rel = freePath(h, IMPORT_DIR, slugify(md.title ?? name))
  const date = new Date().toISOString().slice(0, 10)
  const body = /^# /.test(md.markdown) ? md.markdown : `# ${md.title ?? name}\n\n${md.markdown}`
  const [first, ...rest] = body.split('\n')
  writeNew(h, rel, `${first}\n\n> Imported from ${fileName} (${pages.length} pages) on ${date}.\n${rest.join('\n').replace(/^\n*/, '\n')}\n`)
  const warnings: string[] = []
  if (md.formulaLines) warnings.push(`About ${md.formulaLines} lines look like formulas. A PDF stores glyphs, not LaTeX, so they came out as plain text; the high-quality import writes them as TeX.`)
  if (md.columns) warnings.push('This PDF seems to use two columns; paragraphs may be out of order.')
  return result([{ path: rel, kind: 'document' }], warnings, `${pages.length} pages, ${md.words.toLocaleString()} words.`)
}
