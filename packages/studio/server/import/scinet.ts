// A paper from SciNet → one Markdown document in imports/scinet/, saying on top where it came from.
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { IMPORT_DIR, escapeYaml, freePath, result, slugify, writeNew } from './common.js'
import type { ImportResult, ScinetDetail } from '../../shared/types.js'

const MATH_LIKE = /[∑∏∫∂≤≥≈≠√∞∇αβγδεθκλμνξπρσφχψωΓΔΘΛΞΠΣΦΨΩ]/g
const MANY_SYMBOLS = 5
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

function frontMatter(p: ScinetDetail, date: string): string {
  const lines = [
    `title: ${escapeYaml(p.title)}`,
    p.authors.length ? `authors: ${JSON.stringify(p.authors)}` : '',
    p.year ? `year: ${p.year}` : '',
    p.venue ? `venue: ${escapeYaml(p.venue)}` : '',
    p.doi ? `doi: ${escapeYaml(p.doi)}` : '',
    p.arxivId ? `arxiv: ${escapeYaml(p.arxivId)}` : '',
    `scinet: ${p.id}`,
    p.parsedBy ? `parsed_by: ${escapeYaml(p.parsedBy)}` : '',
    `imported: ${date}`,
  ]
  return `---\n${lines.filter(Boolean).join('\n')}\n---\n\n`
}

export function importScinet(h: Handle, p: ScinetDetail, text: string): ImportResult {
  const body = text.replaceAll('\0', '').trim()
  const words = body.split(/\s+/).length
  if (words < 30) throw new UserError('empty', 'SciNet has no text for this paper.')
  const rel = freePath(h, `${IMPORT_DIR}/scinet`, slugify(p.title))
  const title = /^#\s/.test(body) ? '' : `# ${p.title}\n\n`
  const abstract = p.abstract && !flat(body).includes(flat(p.abstract).slice(0, 60)) ? `## Abstract\n\n${p.abstract.trim()}\n\n` : ''
  writeNew(h, rel, `${frontMatter(p, new Date().toISOString().slice(0, 10))}${title}${abstract}${body}\n`)
  const plainFormulas = p.formulas === 'text' && (body.match(MATH_LIKE)?.length ?? 0) >= MANY_SYMBOLS
  const warnings = plainFormulas ? ['Formulas came in as plain text: SciNet read this paper from the text inside the PDF. Import it again with “Read the PDF again” to get them as LaTeX.'] : []
  return result([{ path: rel, kind: 'document' }], warnings, `${p.title}: ${words} words.`)
}
