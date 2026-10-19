// Quick cards: turn a passage you are reading into a card of your own (a cloze with words or formulas
// blanked, or a question with your answer). Cards go into `my-cards.learn.md` beside the document's other
// lessons, so they are studied, scheduled and shown on the document like any lesson.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import GithubSlugger from 'github-slugger'
import { formatDiagnostic } from '@mdlearn/core'
import { compileSource, lessonDirFor, loadDoc, type Workspace } from '@mdlearn/core/node'
import { withFile } from './notes.js'
import { locateQuote, paragraphAt, sectionAtLine } from './passage.js'
import { UserError, type Handle } from './workspaces.js'

export interface Passage { text: string; startLine: number; endLine: number; section: { num: string | null; anchor: string; title: string } | null }
/** The source text of the paragraph around a quote from the rendered page (math stays `$…$`). */
export function passageFor(abs: string, quote: string): Passage {
  const lines = readFileSync(abs, 'utf8').split('\n')
  const at = locateQuote(lines, quote)
  if (at < 0) throw new UserError('not-found', 'That passage could not be found in the file.')
  const { start, end } = paragraphAt(lines, at)
  const { outline } = loadDoc(abs)
  const s = sectionAtLine(outline, at)
  return { text: lines.slice(start, end + 1).join('\n'), startLine: start + 1, endLine: end + 1, section: s ? { num: s.num, anchor: s.anchor, title: s.title } : null }
}

export type CardInput =
  | { kind: 'cloze'; text: string; title?: string }
  | { kind: 'qa'; question: string; answer: string; title?: string }
export interface CardResult { path: string; cardKey: string; created: boolean }

const plain = (s: string) => s.replace(/\{\{|\}\}/g, '').replace(/[$*_`#>\\[\]]/g, '').replace(/\s+/g, ' ').trim()
const autoTitle = (i: CardInput) => plain(i.kind === 'cloze' ? i.text : i.question).split(' ').slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '') || 'Card'
export function cardBlock(i: CardInput): string {
  if (i.kind === 'cloze') {
    if (!/\{\{[\s\S]+?\}\}/.test(i.text)) throw new UserError('invalid', 'Blank at least one word or formula first.')
    return `:::cloze\n${i.text.trim()}\n:::`
  }
  const ideas = i.answer.split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean)
  if (!i.question.trim() || !ideas.length) throw new UserError('invalid', 'Write a question and its answer.')
  return `:::explain\n${i.question.trim()}\n${ideas.map((l) => `> - ${l}`).join('\n')}\n:::`
}
const slug = (s: string) => new GithubSlugger().slug(s)

/** Append a card to the document's my-cards lesson (creating it), after the compiler accepts the whole file. */
export async function addCard(h: Handle, docRel: string, docAbs: string, section: { num: string | null; anchor: string } | null, input: CardInput): Promise<CardResult> {
  const block = cardBlock(input)
  const dir = lessonDirFor(h.ws as Workspace, docAbs)
  const file = join(dir, 'my-cards.learn.md')
  return withFile(file, () => {
    const { outline, md } = loadDoc(docAbs, h.root)
    const lang = /^lang:\s*(\S+)/m.exec(md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '')?.[1] ?? 'en'
    const lessonId = `my-cards-${docRel.replace(/\.(md|markdown)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60).replace(/^-/, '')}`
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : null
    const title = (input.title?.trim() || autoTitle(input)).slice(0, 80)
    const used = new Set(existing ? headingIds(existing) : [])
    let heading = title, n = 1
    while (used.has(slug(heading))) heading = `${title} (${++n})`
    const cardId = slug(heading)
    const read = section ? `::read[§${section.num ?? section.anchor}]\n\n` : ''
    const card = `## ${heading}\n\n${read}${block}\n`
    const header = `---\ntitle: ${JSON.stringify(`My cards — ${outline.title}`)}\nid: ${lessonId}\nlevel: intermediate\nlang: ${lang}\nsource: ${relative(dir, docAbs).split(sep).join('/')}\ngoals:\n  - Recall what I marked as worth remembering\n---\n\n`
    const next = existing ? `${existing.replace(/\s*$/, '\n')}\n${card}` : `${header}${card}`
    const r = compileSource(next, file)
    const errors = r.diagnostics.filter((d) => d.code.startsWith('E'))
    if (errors.length || !r.lesson) throw new UserError('invalid', `That card cannot be built: ${errors.map((d) => formatDiagnostic(d)).join('; ') || 'it has no question'}`)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, next)
    renameSync(tmp, file)
    return { path: relative(h.root, file).split(sep).join('/'), cardKey: `${r.lesson.id}/${cardId}`, created: !existing }
  })
}
function headingIds(src: string): string[] {
  const s = new GithubSlugger()
  return [...src.matchAll(/^##\s+(.*)$/gm)].map((m) => s.slug(m[1].trim()))
}
