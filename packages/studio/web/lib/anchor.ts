// Anchoring notes to text: a quote with a little context (prefix/suffix), found again after the document
// changes. Works on the rendered article's text; no markup is ever inserted into the document.
import type { NoteAnchor } from '../../shared/types'

const CONTEXT = 32
/** Text nodes of an element in order (skips KaTeX's hidden MathML copy so offsets match what you see). */
function textNodes(root: Node): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest('.katex-mathml, script, style, [data-no-anchor]')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}
export function textOf(root: Node): string { return textNodes(root).map((t) => t.data).join('') }

/** Character offset of a (node, offset) point within root's visible text (works for element boundaries too). */
function offsetOf(root: Node, node: Node, offset: number): number {
  const point = document.createRange()
  point.setStart(node, offset)
  point.collapse(true)
  let total = 0
  for (const t of textNodes(root)) {
    if (t === node) return total + offset
    // comparePoint < 0: the end of this text node lies before the point, so all of it counts
    if (point.comparePoint(t, t.data.length) <= 0) total += t.data.length
    else return total
  }
  return total
}
/** The anchor for the current selection inside `root`, or null when nothing (meaningful) is selected. */
export function anchorFromSelection(root: HTMLElement): { anchor: NoteAnchor; range: Range } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const text = textOf(root)
  const start = offsetOf(root, range.startContainer, range.startOffset)
  const end = offsetOf(root, range.endContainer, range.endOffset)
  const exact = text.slice(start, end)
  if (!exact.trim()) return null
  const trimmed = exact.trim().slice(0, 2000)
  const lead = exact.indexOf(trimmed)
  const s = start + lead, e = s + trimmed.length
  return { range, anchor: { section: sectionAt(root, range), quote: { exact: trimmed, prefix: text.slice(Math.max(0, s - CONTEXT), s), suffix: text.slice(e, e + CONTEXT) } } }
}
/** The id of the last heading before the range (the section the passage is in). */
function sectionAt(root: HTMLElement, range: Range): string | null {
  let current: string | null = null
  for (const h of root.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) {
    if (range.comparePoint(h, 0) >= 0 && !h.contains(range.startContainer)) break
    current = h.dataset.num || h.id
  }
  return current
}
/** Find the quote again: prefix+exact+suffix, then exact+suffix / prefix+exact, then a unique exact match. */
export function locate(text: string, a: NoteAnchor): { start: number; end: number } | null {
  const { exact, prefix, suffix } = a.quote
  const tries = [prefix + exact + suffix, exact + suffix, prefix + exact]
  for (const t of tries) {
    const at = text.indexOf(t)
    if (at >= 0 && text.indexOf(t, at + 1) < 0) {
      const start = at + (t.startsWith(prefix) && t !== exact + suffix ? prefix.length : 0)
      return { start, end: start + exact.length }
    }
  }
  const first = text.indexOf(exact)
  if (first >= 0 && text.indexOf(exact, first + 1) < 0) return { start: first, end: first + exact.length }
  if (first >= 0) return { start: first, end: first + exact.length } // several matches: the first (rare for real quotes)
  return null
}
/** A DOM Range for character offsets within root's visible text. */
export function rangeFor(root: HTMLElement, start: number, end: number): Range | null {
  let pos = 0
  const range = document.createRange()
  let started = false
  for (const t of textNodes(root)) {
    const next = pos + t.data.length
    if (!started && start < next) { range.setStart(t, start - pos); started = true }
    if (started && end <= next) { range.setEnd(t, end - pos); return range }
    pos = next
  }
  return null
}
