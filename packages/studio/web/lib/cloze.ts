// A passage of Markdown as clickable pieces, and back to a cloze with `{{…}}` blanks.
export type TokKind = 'word' | 'math' | 'display' | 'space' | 'other'
export interface Tok { text: string; kind: TokKind }

const PIECE = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|`[^`\n]+`|[\p{L}\p{N}](?:[\p{L}\p{N}'’_\-/.]*[\p{L}\p{N}])?|\s+|[^\s]/gu
export function tokenize(src: string): Tok[] {
  return [...src.matchAll(PIECE)].map(([text]): Tok => {
    if (text.startsWith('$$')) return { text, kind: 'display' }
    if (text.startsWith('$')) return { text, kind: 'math' }
    if (/^\s+$/.test(text)) return { text, kind: 'space' }
    if (/^[\p{L}\p{N}]/u.test(text)) return { text, kind: 'word' }
    return { text, kind: 'other' }
  })
}
/** Can this piece be blanked? (words and inline formulas; not display math, markup or punctuation) */
export const blankable = (t: Tok) => t.kind === 'word' || t.kind === 'math'

/** Cloze source: each run of chosen pieces becomes one blank; a chosen formula blanks the whole formula. */
export function buildCloze(toks: Tok[], chosen: ReadonlySet<number>): string {
  let out = '', i = 0
  while (i < toks.length) {
    if (!chosen.has(i)) { out += toks[i].text; i++; continue }
    // a run: chosen pieces, possibly separated by single spaces between chosen words
    let j = i, text = ''
    while (j < toks.length && (chosen.has(j) || (toks[j].kind === 'space' && chosen.has(j + 1) && chosen.has(j - 1) && !toks[j].text.includes('\n')))) { text += toks[j].text; j++ }
    const run = toks.slice(i, j)
    if (run.length === 1 && run[0].kind === 'math') out += `\${{${run[0].text.slice(1, -1).trim()}}}$`
    else if (run.some((t) => t.kind === 'math')) out += run.map((t) => (t.kind === 'math' ? t.text : t.text)).join('') // a mixed run is not blanked as one answer
    else out += `{{${text}}}`
    i = j
  }
  return out
}
/** What would be asked, in words (for the preview): the passage with blanks as ____. */
export const preview = (cloze: string) => cloze.replace(/\$\{\{[\s\S]+?\}\}\$/g, "____").replace(/\{\{[\s\S]+?\}\}/g, '____')
export const countBlanks = (cloze: string) => (cloze.match(/\{\{[\s\S]+?\}\}/g) ?? []).length
