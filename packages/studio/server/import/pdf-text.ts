// A PDF's positioned text from pdf.js, which comes with the app, so reading a PDF needs nothing installed. pdf.js loads
// on the first PDF, and the sizes are 1.5 × points, the scale pagesToMarkdown's thresholds were tuned on.
import { UserError } from '../workspaces.js'
import type { Line, Page } from './pdf-fast.js'

const SCALE = 1.5, ASCENT = 0.9, TIMEOUT_MS = 120_000
const SAME_LINE = 0.3, WORD_GAP = 0.15, COLUMN_GAP = 1.5 // of the font size
const BOLD = /bold|black|heavy|cmbx|[.,_-]b(i|o)?$/i, ITALIC = /italic|oblique|cmti|[.,_-](b?i|b?o)$/i // an embedded font says so only in its name

export interface Run { text: string; left: number; right: number; base: number; size: number; font: string }
export interface Style { bold: boolean; italic: boolean }

/** Runs on the same baseline and close together are one line; a wide gap is the next column. */
export function toLines(runs: Run[], page: number, styleOf: (font: string) => Style): Line[] {
  const groups: Run[][] = []
  for (const r of runs) {
    const line = groups.at(-1), last = line?.at(-1)
    const joins = last && Math.abs(last.base - r.base) < last.size * SAME_LINE && r.left - last.right < last.size * COLUMN_GAP && r.left > last.left
    if (joins) line!.push(r)
    else groups.push([r])
  }
  return groups.flatMap((group) => {
    const text = group.reduce((acc, r, i) => acc + (i && r.left - group[i - 1].right > r.size * WORD_GAP && !/\s$/.test(acc) ? ' ' : '') + r.text, '').replace(/\s+/g, ' ').trim()
    if (!text) return []
    const main = group.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    const left = group[0].left, right = group.at(-1)!.right, size = Math.round(main.size)
    return [{ page, top: Math.round(main.base - size * ASCENT), left: Math.round(left), width: Math.round(right - left), height: size, size, ...styleOf(main.font), text }]
  })
}

const open = async (bytes: Uint8Array) => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return getDocument({ data: Uint8Array.from(bytes), verbosity: 0, disableFontFace: true, fontExtraProperties: true })
}

export async function pdfPages(bytes: Uint8Array): Promise<Page[]> {
  const deadline = Date.now() + TIMEOUT_MS
  const task = await open(bytes)
  try {
    const doc = await task.promise
    const pages: Page[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      if (Date.now() > deadline) throw new Error('took too long')
      const page = await doc.getPage(number)
      const { width, height } = page.getViewport({ scale: SCALE })
      const { items } = await page.getTextContent()
      await page.getOperatorList() // this is what loads the fonts
      const styleOf = (font: string): Style => {
        const name = page.commonObjs.has(font) ? (page.commonObjs.get(font) as { name?: string }).name ?? '' : ''
        return { bold: BOLD.test(name), italic: ITALIC.test(name) }
      }
      const runs = items.flatMap((item): Run[] => {
        if (!('str' in item) || !item.str.trim()) return []
        const [, , c, d, x, y] = item.transform as number[]
        const left = x * SCALE
        return [{ text: item.str, left, right: left + item.width * SCALE, base: height - y * SCALE, size: Math.hypot(c, d) * SCALE, font: item.fontName }]
      })
      pages.push({ number, width: Math.round(width), height: Math.round(height), lines: toLines(runs, number, styleOf) })
      page.cleanup()
    }
    return pages
  } catch {
    throw new UserError('pdf', 'This PDF could not be read. It may be damaged or locked with a password.')
  } finally { await task.destroy() }
}

/** Pages in a PDF, or null when it cannot be told. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  const task = await open(bytes)
  try { return (await task.promise).numPages } catch { return null } finally { await task.destroy() }
}
