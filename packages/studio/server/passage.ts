// Finding a passage of the rendered page in the Markdown source: its words (math and markup ignored)
// are matched against the file, so a quote copied from the screen leads back to the exact lines.
import type { DocOutline } from '@mdlearn/core'

// compare on ordinary words only: math reads differently in the source ($R^{-4}$) and on screen (R−4)
const squash = (s: string) => s.replace(/\$[^$]*\$/g, ' ').toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 3).join(' ')

/** 0-based index of the line holding the end of the quote's first words, or -1. */
export function locateQuote(lines: string[], quote: string): number {
  const want = squash(quote).split(' ').filter(Boolean).slice(0, 6)
  const stream = lines.flatMap((l, line) => squash(l).split(' ').filter(Boolean).map((w) => ({ w, line })))
  for (let i = 0; want.length && i + want.length <= stream.length; i++) {
    if (want.every((w, k) => stream[i + k].w === w)) return stream[i + want.length - 1].line
  }
  return -1
}
/** Inclusive line range of the paragraph around line `at` (bounded by blank lines). */
export function paragraphAt(lines: string[], at: number): { start: number; end: number } {
  let start = at, end = at
  while (start > 0 && lines[start - 1].trim() !== '') start--
  while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++
  return { start, end }
}
/** The deepest outline section holding a 0-based line. */
export function sectionAtLine(outline: DocOutline, line: number): DocOutline['sections'][number] | null {
  let best: DocOutline['sections'][number] | null = null
  for (const s of outline.sections) if (s.startLine - 1 <= line && line <= s.endLine - 1 && (!best || s.startLine > best.startLine)) best = s
  return best
}
