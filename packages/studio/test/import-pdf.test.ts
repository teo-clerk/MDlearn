import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { importPdfFast, pagesToMarkdown, type Page } from '../server/import/pdf-fast'
import { pdfPageCount, toLines, type Run } from '../server/import/pdf-text'

const open = () => new Workspaces(settingsStore(join(mkdtempSync(join(tmpdir(), 'mdl-cfg-')), 's.json'))).open(mkdtempSync(join(tmpdir(), 'mdl-pdf-')))
const line = (page: number, top: number, text: string, o: Partial<{ left: number; size: number; bold: boolean; width: number }> = {}) => ({ page, top, left: o.left ?? 90, width: o.width ?? 600, height: 18, size: o.size ?? 16, bold: o.bold ?? false, italic: false, text })

describe('PDF layout to Markdown', () => {
  it('reads headings by size, paragraphs by spacing, lists by indentation', () => {
    const pages: Page[] = [{ number: 1, width: 900, height: 1260, lines: [
      line(1, 90, 'A Study of Speckle', { size: 33, bold: true, width: 400 }),
      line(1, 150, '1 Introduction', { size: 22, bold: true, width: 200 }),
      line(1, 200, 'Speckle is granular noise caused by the coherent summation of many scatterers inside one'),
      line(1, 219, 'resolution cell, and it must be modelled statistically rather than removed pixel by pixel.'),
      line(1, 270, 'A second paragraph starts after a larger gap and says something else about the radar signal.'),
      line(1, 320, 'Average independent samples', { left: 140, width: 300 }),
      line(1, 339, 'Use a model-based filter', { left: 140, width: 260 }),
      line(1, 390, '1. First step in the procedure for estimating looks', { left: 140, width: 400 }),
      line(1, 409, '2. Second step in the procedure for estimating looks', { left: 140, width: 400 }),
    ] }]
    const md = pagesToMarkdown(pages).markdown.split('\n\n')
    expect(md[0]).toBe('# A Study of Speckle'); expect(md[1]).toBe('## 1 Introduction')
    expect(md[2]).toBe('Speckle is granular noise caused by the coherent summation of many scatterers inside one resolution cell, and it must be modelled statistically rather than removed pixel by pixel.')
    expect(md[3]).toMatch(/^A second paragraph/)
    expect(md[4]).toBe('- Average independent samples\n- Use a model-based filter')
    expect(md[5]).toBe('1. First step in the procedure for estimating looks\n2. Second step in the procedure for estimating looks')
  })
  it('drops running headers, footers and page numbers, and joins a paragraph across a page break and a hyphen', () => {
    const page = (n: number, body: Line[]): Page => ({ number: n, width: 900, height: 1260, lines: [line(n, 40, 'Radar Notes — draft', { size: 11 }), ...body, line(n, 1180, `Page ${n}`, { size: 11 })] })
    type Line = ReturnType<typeof line>
    const md = pagesToMarkdown([
      page(1, [line(1, 200, 'The estimator of the equivalent number of looks depends on the homogeneity of the patch and the sam-'), line(1, 219, 'ple size used when computing the variance of the intensity over the chosen area, which must')]),
      page(2, [line(2, 200, 'be large enough to be stable but small enough to be homogeneous across the whole selected patch.')]),
      page(3, [line(3, 200, 'Another page of ordinary text that is long enough to count as body text for the font statistics.')]),
    ]).markdown
    expect(md).not.toMatch(/Radar Notes|Page \d/)
    expect(md).toContain('sample size used when computing the variance')
    expect(md).toContain('which must be large enough to be stable')
  })
  it('counts formula-looking lines and notices two-column pages', () => {
    const many = Array.from({ length: 40 }, (_, i) => line(1, 100 + i * 20, `Column text number ${i} that is long enough to be counted here`, { left: i % 2 ? 520 : 90, width: 330 }))
    const r = pagesToMarkdown([{ number: 1, width: 900, height: 1260, lines: [...many, line(1, 1000, 'σ⁰ ≈ β⁰ sin θ ≤ γ⁰ √L', { size: 16 })] }])
    expect(r.columns).toBe(true); expect(r.formulaLines).toBe(1)
  })
})

describe('lines from positioned text', () => {
  const run = (text: string, left: number, base: number, o: Partial<Run> = {}): Run => ({ text, left, right: left + text.length * 6, base, size: 12, font: 'body', ...o })
  const styleOf = (font: string) => ({ bold: font === 'heavy', italic: false })
  it('joins the pieces of a line, with a bold word inside it', () => {
    const lines = toLines([run('The ', 10, 100), run('Moon', 34, 100, { font: 'heavy' }), run(' pulls the sea', 58, 100)], 1, styleOf)
    expect(lines.map((l) => l.text)).toEqual(['The Moon pulls the sea'])
    expect(lines[0].bold).toBe(false)
  })
  it('adds the space a PDF leaves out between two pieces', () => {
    expect(toLines([run('near', 10, 100), run('side', 38, 100)], 1, styleOf)[0].text).toBe('near side')
  })
  it('keeps two columns apart, though they share a baseline', () => {
    expect(toLines([run('left column', 10, 100), run('right column', 300, 100)], 1, styleOf).map((l) => l.text)).toEqual(['left column', 'right column'])
  })
  it('starts a new line when the baseline moves', () => {
    expect(toLines([run('first', 10, 100), run('second', 10, 116)], 1, styleOf).length).toBe(2)
  })
})

describe('PDF import', () => {
  it('counts the pages, and returns nothing for what is not a PDF', async () => {
    expect(await pdfPageCount(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/sample.pdf'))))).toBe(2)
    expect(await pdfPageCount(new TextEncoder().encode('not a pdf'))).toBeNull()
  })
  it('imports a real PDF: title, sections, lists, no running header or page numbers', async () => {
    const h = open()
    const bytes = readFileSync(resolve(__dirname, 'fixtures/sample.pdf'))
    const r = await importPdfFast(h, 'Radar notes.pdf', bytes)
    const md = readFileSync(join(h.root, r.files[0].path), 'utf8')
    expect(r.files[0].path).toBe('imports/speckle-and-multi-looking.md')
    expect(md).toMatch(/^# Speckle and Multi-looking\n\n> Imported from Radar notes\.pdf \(2 pages\) on \d{4}-\d\d-\d\d\./)
    expect(md).toMatch(/\n## 1 Introduction\n/); expect(md).toMatch(/\n## 2 The model\n/); expect(md).toMatch(/\n### 2\.1 Estimating the number of looks\n/)
    expect(md).toMatch(/- Average independent samples to reduce variance\n- Resolution is the price of the reduction/)
    expect(md).toMatch(/1\. Select a homogeneous patch\n2\. Compute the mean and variance\n3\. Divide the squared mean by the variance/)
    expect(md).not.toMatch(/Radar Notes — draft|Page 1|Page 2/)
    expect(r.summary).toMatch(/2 pages/)
  })
  it('refuses a file that is not a PDF, and one without text', async () => {
    const h = open()
    await expect(importPdfFast(h, 'x.pdf', Buffer.from('hello world, this is not a pdf'))).rejects.toThrow(/not a PDF/)
  })
})
