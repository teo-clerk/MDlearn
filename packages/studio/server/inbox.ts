// The capture inbox: thoughts, links and passages saved in a moment, to be sorted later. It is plain Markdown you own,
// one file a day in Inbox/, with a task line for each item:
//
//   - [ ] 14:32 Why does coherence fall with the baseline?
//     > the passage you selected
//     — [Radar § 2.1 Coherence](../radar.md#coherence)
//
// Dealing with an item ticks its box and says what became of it. An item is known by a hash of its text, so a stale
// page can never act on something that was edited since.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, posix } from 'node:path'
import { inRoot, loadDoc } from '@mdlearn/core/node'
import { addCard, type CardInput, type CardResult } from './cards.js'
import { appendToSection } from './insert.js'
import { withFile } from './notes.js'
import { UserError, type Handle } from './workspaces.js'
import type { InboxItem, InboxList, InboxSource } from '../shared/types.js'

export const INBOX_DIR = 'Inbox'
const MAX_FILE_BYTES = 2 * 1024 * 1024, SHOWN = 100
const FILE_NAME = /^\d{4}-\d{2}-\d{2}\.md$/
const OPEN_ITEM = /^- \[ \](?: (\d\d:\d\d)(?= |$))?(?: (.*))?$/
const SOURCE_LINE = /^— \[((?:\\.|[^\]\\])*)\]\((\S+)\)$/
const LOOKS_LIKE_SOURCE = /^— \[/
const STALE = 'This item changed. Reload and try again.'

export interface CaptureInput {
  text?: string; quote?: string; url?: string
  /** The document it came from, already checked to be in the folder. */
  source?: { doc: string; abs: string; section?: string | null }
}
/** Finds a document of the folder from its path, refusing anything else. */
export type DocResolver = (rel: string) => string

const tidy = (s = '') => s.replace(/\r\n?/g, '\n').replace(/\n\s*\n+/g, '\n').trim()
const escapeLabel = (s: string) => s.replace(/[\\[\]]/g, '\\$&').replace(/\s+/g, ' ')
const unescapeLabel = (s: string) => s.replace(/\\(.)/g, '$1')
const encodeParens = (s: string) => s.replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
const fileLink = (from: string, to: string) => encodeParens(posix.relative(posix.dirname(from), to).split('/').map(encodeURIComponent).join('/'))
/** A link typed by hand may not be valid percent-encoding: it then means what it says. */
const decoded = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
const stamp = (d: Date) => {
  const two = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` }
}
const writeAtomic = (abs: string, text: string) => {
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, abs)
}

interface Parsed extends InboxItem { end: number }
/** The open items of one inbox file. Lines typed by hand count too, with or without a time. */
function parse(file: string, lines: string[]): Parsed[] {
  const out: Parsed[] = []
  lines.forEach((first, line) => {
    const m = OPEN_ITEM.exec(first)
    if (!m) return
    let end = line + 1
    while (end < lines.length && /^ {2,}\S/.test(lines[end])) end++
    const body = lines.slice(line + 1, end).map((l) => l.slice(2))
    const link = SOURCE_LINE.exec(body.at(-1) ?? '')
    const rest = link ? body.slice(0, -1) : body
    const quote = rest.filter((l) => /^> ?/.test(l)).map((l) => l.replace(/^> ?/, ''))
    const text = [m[2] ?? '', ...rest.filter((l) => !/^> ?/.test(l)).map((l) => l.replace(/^— \\\[/, '— ['))].filter(Boolean).join('\n')
    out.push({
      id: createHash('sha1').update(lines.slice(line, end).join('\n')).digest('hex').slice(0, 12),
      file, line, end, date: posix.basename(file, '.md'), time: m[1] ?? null, text, quote: quote.length ? quote.join('\n') : null,
      source: link ? sourceFrom(file, unescapeLabel(link[1]), link[2]) : null,
    })
  })
  return out
}
function sourceFrom(file: string, label: string, href: string): InboxSource {
  if (/^https?:\/\//i.test(href)) return { label, url: href, doc: null, section: null }
  const [path, anchor] = href.split('#')
  return { label, url: null, doc: posix.join(posix.dirname(file), decoded(path)), section: anchor ?? null }
}
const publicItem = ({ end: _end, ...item }: Parsed): InboxItem => item

/** Where a day's file really is. A link leading out of the folder is refused: a phone can write here. */
function dayFile(h: Handle, name: string): string {
  const abs = inRoot(h.root, `${INBOX_DIR}/${name}`)
  if (!abs) throw new UserError('path', 'That is not an inbox file.')
  return abs
}
/** The path of a day's inbox file, for a name that came from a request. */
function inboxFile(h: Handle, file: string): string {
  const [dir, name, ...more] = file.split('/')
  if (dir !== INBOX_DIR || !FILE_NAME.test(name ?? '') || more.length) throw new UserError('path', 'That is not an inbox file.')
  return dayFile(h, name)
}
function findItem(abs: string, file: string, id: string): Parsed {
  const item = existsSync(abs) ? parse(file, readFileSync(abs, 'utf8').split('\n')).find((i) => i.id === id) : undefined
  if (!item) throw new UserError('conflict', STALE)
  return item
}

function sourceOf(h: Handle, rel: string, input: CaptureInput): string | null {
  if (input.source) {
    const { outline } = loadDoc(input.source.abs, h.root)
    const s = outline.sections.find((x) => x.anchor === input.source?.section)
    const where = s ? ` § ${s.num ? `${s.num} ` : ''}${s.title}` : ''
    return `— [${escapeLabel(`${outline.title}${where}`)}](${fileLink(rel, input.source.doc)}${s ? `#${s.anchor}` : ''})`
  }
  return input.url ? `— [${escapeLabel(input.url)}](${encodeParens(input.url.replace(/\s/g, '%20'))})` : null
}

/** Save something for later. Only ever adds to today's file. */
export async function capture(h: Handle, input: CaptureInput, now = new Date()): Promise<InboxItem> {
  const text = tidy(input.text), quote = tidy(input.quote)
  if (!text && !quote && !input.url) throw new UserError('invalid', 'Write something to capture.')
  const { date, time } = stamp(now)
  const rel = `${INBOX_DIR}/${date}.md`, abs = dayFile(h, `${date}.md`)
  const source = sourceOf(h, rel, input)
  const [first = '', ...more] = text.split('\n')
  const typed = more.map((l) => `  ${l.trim().replace(LOOKS_LIKE_SOURCE, '— \\[')}`) // what is typed can never pass for where an item came from
  const block = [`- [ ] ${time}${first ? ` ${first}` : ''}`, ...typed, ...(quote ? quote.split('\n').map((l) => `  > ${l.trim()}`) : []), ...(source ? [`  ${source}`] : [])]
  return withFile(abs, () => {
    const had = existsSync(abs) ? readFileSync(abs, 'utf8').trimEnd() : `# Inbox ${date}\n`
    const lines = [...had.split('\n'), ...block]
    const next = `${lines.join('\n')}\n`
    if (Buffer.byteLength(next) > MAX_FILE_BYTES) throw new UserError('too-large', 'Today’s inbox file is full. Sort some of it first.')
    writeAtomic(abs, next)
    return publicItem(parse(rel, lines).at(-1)!)
  })
}

/** Everything still to sort, newest first. `total` counts them all, however many are shown. */
export function listInbox(h: Handle): InboxList {
  const dir = inRoot(h.root, INBOX_DIR)
  if (!dir || !existsSync(dir)) return { total: 0, items: [] }
  const names = readdirSync(dir).filter((n) => FILE_NAME.test(n)).sort().reverse()
  const open = names.flatMap((n) => {
    const abs = inRoot(h.root, `${INBOX_DIR}/${n}`)
    return abs ? parse(`${INBOX_DIR}/${n}`, readFileSync(abs, 'utf8').split('\n')).reverse() : []
  })
  return { total: open.length, items: open.slice(0, SHOWN).map(publicItem) }
}

/** Tick an item, saying what became of it. */
export async function settle(h: Handle, file: string, id: string, outcome?: string): Promise<void> {
  const abs = inboxFile(h, file)
  await withFile(abs, () => {
    const item = findItem(abs, file, id)
    const lines = readFileSync(abs, 'utf8').split('\n')
    writeAtomic(abs, lines.with(item.line, `${lines[item.line].replace('- [ ]', '- [x]')}${outcome ? ` → ${outcome}` : ''}`).join('\n'))
  })
}

/** A document of the folder, or null: gone and outside look the same, so the answer says nothing about other paths. */
function inFolder(resolve: DocResolver, rel: string): string | null {
  try { return resolve(rel) } catch { return null }
}

/** Make a card from an item: on the document it came from if that is still there, else on the inbox file itself. */
export async function cardFromItem(h: Handle, file: string, id: string, card: CardInput, resolve: DocResolver): Promise<CardResult> {
  const abs = inboxFile(h, file)
  const item = findItem(abs, file, id)
  const doc = item.source?.doc
  const sourceAbs = doc ? inFolder(resolve, doc) : null
  const s = sourceAbs ? loadDoc(sourceAbs, h.root).outline.sections.find((x) => x.anchor === item.source?.section) : undefined
  const result = await addCard(h, sourceAbs ? doc! : file, sourceAbs ?? resolve(file), s ? { num: s.num, anchor: s.anchor } : null, card)
  await settle(h, file, id, 'card')
  return result
}

/** The item as text for another document, with its link rewritten to work from there. */
function asText(item: InboxItem, target: string): string {
  const s = item.source
  const href = s?.url ?? (s?.doc ? `${fileLink(target, s.doc)}${s.section ? `#${s.section}` : ''}` : null)
  return [item.text, item.quote?.split('\n').map((l) => `> ${l}`).join('\n'), s && href ? `— [${escapeLabel(s.label)}](${href})` : null].filter(Boolean).join('\n\n')
}

/** Put an item at the end of a section of a document (only ever when you ask), then tick it. */
export async function moveItem(h: Handle, file: string, id: string, target: { doc: string; abs: string; section?: string | null }): Promise<void> {
  const abs = inboxFile(h, file)
  const item = findItem(abs, file, id)
  await withFile(target.abs, () => appendToSection(target.abs, target.section ?? null, asText(item, target.doc), h.root))
  await settle(h, file, id, `moved to ${target.doc}`)
}
