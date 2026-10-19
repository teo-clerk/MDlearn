// An Anki deck (.apkg) → lessons: Basic notes become "explain" cards (front = question, back = key ideas),
// cloze notes become fill-the-gap cards; pictures are copied; the review history can come along, so
// schedules carry over. Each card is compiled on its own and skipped (and counted) if it would not compile.
import { posix } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync, strFromU8 } from 'fflate'
import TurndownService from 'turndown'
import { compileSource, appendProgress, inRoot } from '@mdlearn/core/node'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import { freePath, result, slugify, writeNew } from './common.js'
import type { ImportResult } from '../../shared/types.js'

const LESSON_DIR = 'imports'
const CARDS_PER_LESSON = 100
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i
const MAX_UNPACKED = 400 * 1024 * 1024 // a deck that unpacks to more than this is refused (zip bombs)

export interface AnkiNoteRow { id: number; mid: number; flds: string; tags: string }
export interface AnkiDeck { names: Map<number, string>; cards: { nid: number; did: number; id: number }[]; notes: Map<number, AnkiNoteRow>; clozeModels: Set<number>; revlog: { id: number; cid: number; ease: number; type: number }[]; media: Map<string, Uint8Array> }

// ---- reading the collection
function openCollection(files: Record<string, Uint8Array>): DatabaseSync {
  const raw = files['collection.anki21b'] ? zstdDecompressSync(files['collection.anki21b'], { maxOutputLength: MAX_UNPACKED }) : (files['collection.anki21'] ?? files['collection.anki2'])
  if (!raw) throw new UserError('invalid', 'This does not look like an Anki deck (.apkg): there is no collection inside.')
  const db = new DatabaseSync(':memory:')
  db.deserialize(new Uint8Array(raw))
  return db
}
const all = <T>(db: DatabaseSync, sql: string): T[] => { try { return db.prepare(sql).all() as T[] } catch { return [] } }

export function readDeck(apkg: Uint8Array): AnkiDeck {
  let files: Record<string, Uint8Array>
  let total = 0
  try { files = unzipSync(apkg, { filter: (f) => { total += f.originalSize; if (total > MAX_UNPACKED) throw new Error('too large'); return true } }) } catch (e) { throw new UserError('invalid', (e as Error).message === 'too large' ? 'This deck is too large to import (over 400 MB unpacked).' : 'This file is not a valid Anki deck (.apkg).') }
  const db = openCollection(files)
  try {
    const names = new Map<number, string>(), clozeModels = new Set<number>()
    const col = all<{ models: string; decks: string }>(db, 'SELECT models, decks FROM col')[0]
    try { for (const [id, d] of Object.entries(JSON.parse(col?.decks || '{}') as Record<string, { name: string }>)) names.set(Number(id), d.name) } catch { /* newer format: decks table */ }
    try { for (const [id, m] of Object.entries(JSON.parse(col?.models || '{}') as Record<string, { type: number }>)) if (m.type === 1) clozeModels.add(Number(id)) } catch { /* newer format: detected by content */ }
    if (!names.size) for (const d of all<{ id: number; name: string }>(db, 'SELECT id, name FROM decks')) names.set(d.id, d.name.replace(/\x1f/g, '::'))
    const notes = new Map(all<AnkiNoteRow>(db, 'SELECT id, mid, flds, tags FROM notes').map((n) => [n.id, n]))
    const cards = all<{ id: number; nid: number; did: number }>(db, 'SELECT id, nid, did FROM cards ORDER BY id')
    const revlog = all<{ id: number; cid: number; ease: number; type: number }>(db, 'SELECT id, cid, ease, type FROM revlog')
    const media = new Map<string, Uint8Array>()
    try {
      const map = JSON.parse(files.media ? strFromU8(files.media) : '{}') as Record<string, string>
      for (const [idx, name] of Object.entries(map)) if (files[idx] && IMAGE_EXT.test(name)) media.set(name, files[idx])
    } catch { /* the newer media list is not JSON: pictures are skipped */ }
    return { names, cards, notes, clozeModels, revlog, media }
  } finally { db.close() }
}

// ---- Anki HTML → Markdown
const MATH = (i: number) => `MDLMATH${i}END`
export function htmlToMarkdown(html: string): string {
  const maths: string[] = []
  const take = (tex: string, display: boolean) => { maths.push(display ? `$$${tex.trim()}$$` : `$${tex.trim()}$`); return ` ${MATH(maths.length - 1)} ` }
  const prepared = html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, t: string) => take(t.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''), true))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, t: string) => take(t.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ''), false))
    .replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/g, (_, t: string) => take(t, true))
    .replace(/\[\$\]([\s\S]*?)\[\/\$\]/g, (_, t: string) => take(t, false))
    .replace(/&nbsp;/g, ' ')
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  td.addRule('image', { filter: 'img', replacement: (_c, node) => { const n = node as unknown as { getAttribute(k: string): string | null }; const src = n.getAttribute('src'); return src ? `![](${encodeURI(src)})` : '' } })
  td.addRule('div-break', { filter: ['div'], replacement: (inner) => `\n\n${inner}\n\n` })
  let md = td.turndown(`<body>${prepared}</body>`)
  md = md.replace(/MDLMATH(\d+)END/g, (_, i: string) => maths[Number(i)] ?? '').replace(/^(\s*)-   /gm, '$1- ').replace(/[ \t]+\n/g, (m) => (/^ {2,}\n$/.test(m) ? '  \n' : '\n')).replace(/\n{3,}/g, '\n\n').trim()
  return md
}
const plainTitle = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\$\$?[^$]*\$\$?/g, 'formula').replace(/[*_`#>\[\]]/g, '').replace(/\s+/g, ' ').trim()
const shorten = (s: string, n = 64) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s)

/** One note → the Markdown of one card, or null when it has nothing to ask. */
export function cardMarkdown(note: AnkiNoteRow, cloze: boolean): { title: string; widget: string } | null {
  const [front = '', back = ''] = note.flds.split('\x1f')
  if (cloze || /\{\{c\d+::/.test(front)) {
    const hints: string[] = []
    const text = front.replace(/\{\{c\d+::([\s\S]*?)(?:::([^{}]*))?\}\}/g, (_m, answer: string, hint?: string) => { if (hint) hints.push(hint.replace(/<[^>]+>/g, '')); return `{{${answer.replace(/<[^>]+>/g, '')}}}` })
    if (!text.includes('{{') || /\}\}\}/.test(text.replace(/\{\{[^{}]*\}\}/g, ''))) return null
    // Markdown escaping must not reach into a gap: {{E\[x\]}} is the answer E[x]
    const md = htmlToMarkdown(text).replace(/\{\{[^{}]*\}\}/g, (gap) => gap.replace(/\\([\[\]_*`])/g, '$1'))
    if (!md.includes('{{')) return null
    const extra = htmlToMarkdown(back)
    return { title: shorten(plainTitle(md.replace(/\{\{([^{}]*)\}\}/g, '…')) || 'Cloze'), widget: `:::cloze\n${md}\n${hints.map((h) => `::hint[${h}]`).join('\n')}${hints.length ? '\n' : ''}${extra ? `\n${extra}\n` : ''}:::` }
  }
  const q = htmlToMarkdown(front), a = htmlToMarkdown(back)
  if (!q || !a) return null
  const idea = a.split('\n').map((l) => (/ {2}$/.test(l) ? `> ${l.trimEnd()}  ` : `> ${l}`.trimEnd())).join('\n')
  return { title: shorten(plainTitle(q) || 'Card'), widget: `:::explain\n${q}\n${idea}\n:::` }
}

const frontmatter = (id: string, title: string) => `---\nid: ${id}\ntitle: ${JSON.stringify(title)}\nlang: en\n---\n`
export interface ImportOptions { keepHistory?: boolean }

export function importAnki(h: Handle, fileName: string, apkg: Uint8Array, opts: ImportOptions = {}): ImportResult {
  const deck = readDeck(apkg)
  if (!deck.cards.length) throw new UserError('empty', 'This deck has no cards.')
  const files: ImportResult['files'] = [], warnings: string[] = []
  let skipped = 0, imported = 0
  // group cards by deck, one entry per note (a cloze note has a card per number: they become one card)
  const byDeck = new Map<number, Set<number>>()
  for (const c of deck.cards) { if (!deck.notes.has(c.nid)) continue; (byDeck.get(c.did) ?? byDeck.set(c.did, new Set()).get(c.did)!).add(c.nid) }
  const ankiCardsOfNote = new Map<number, number[]>()
  for (const c of deck.cards) ankiCardsOfNote.set(c.nid, [...(ankiCardsOfNote.get(c.nid) ?? []), c.id])
  const keyOfAnkiCard = new Map<number, string>()
  const base = slugify(fileName.replace(/\.apkg$/i, ''), 40)

  for (const [did, nids] of byDeck) {
    const deckName = (deck.names.get(did) ?? 'Imported deck').split('::').pop()!.trim() || 'Imported deck'
    const slug = slugify(deckName === 'Default' ? base : deckName, 40)
    const titles = new Map<string, number>()
    const usedMedia = new Set<string>()
    const cards: { md: string; nid: number }[] = []
    for (const nid of nids) {
      const note = deck.notes.get(nid)!
      const c = cardMarkdown(note, deck.clozeModels.has(note.mid))
      if (!c) { skipped++; continue }
      let md = `${c.widget}`
      for (const m of md.matchAll(/!\[\]\(([^)]+)\)/g)) { const name = decodeURI(m[1]); if (deck.media.has(name)) usedMedia.add(name) }
      md = md.replace(/!\[\]\(([^)]+)\)/g, (whole, src: string) => (deck.media.has(decodeURI(src)) ? `![](media/${slug}/${src})` : ''))
      const n = (titles.get(c.title) ?? 0) + 1; titles.set(c.title, n)
      const probe = `${frontmatter('probe', 'Probe')}\n## ${n > 1 ? `${c.title} (${n})` : c.title}\n\n${md}\n`
      if (compileSource(probe, posix.join(h.root, 'probe.learn.md')).diagnostics.some((d) => d.code.startsWith('E'))) { skipped++; continue }
      cards.push({ md: `## ${n > 1 ? `${c.title} (${n})` : c.title}\n\n${md}\n`, nid })
    }
    for (let part = 0; part * CARDS_PER_LESSON < cards.length; part++) {
      const chunk = cards.slice(part * CARDS_PER_LESSON, (part + 1) * CARDS_PER_LESSON)
      const parts = Math.ceil(cards.length / CARDS_PER_LESSON)
      const title = parts > 1 ? `${deckName} (part ${part + 1})` : deckName
      const rel = freePath(h, posix.join('learn', LESSON_DIR), `${slug}${parts > 1 ? `-${part + 1}` : ''}`, '.learn.md')
      const lessonId = `anki-${slugify(posix.basename(rel, '.learn.md'), 50)}`
      const text = `${frontmatter(lessonId, title)}\n${chunk.map((c) => c.md).join('\n')}`
      const compiled = compileSource(text, inRoot(h.root, rel)!)
      if (!compiled.lesson || compiled.lesson.cards.length !== chunk.length) { skipped += chunk.length; warnings.push(`${title}: the lesson did not compile as a whole and was left out.`); continue }
      writeNew(h, rel, text)
      files.push({ path: rel, kind: 'lesson' })
      imported += chunk.length
      compiled.lesson.cards.forEach((card, i) => { for (const id of ankiCardsOfNote.get(chunk[i].nid) ?? []) keyOfAnkiCard.set(id, `${compiled.lesson!.id}/${card.id}`) })
    }
    // the pictures these cards use, beside the lessons: learn/imports/media/<deck>/
    for (const name of usedMedia) {
      const rel = posix.join('learn', LESSON_DIR, 'media', slug, name)
      try { writeNew(h, rel, deck.media.get(name)!); files.push({ path: rel, kind: 'asset' }) } catch { /* the same picture is already there */ }
    }
  }
  if (!imported) throw new UserError('empty', 'None of the notes in this deck could be turned into cards (images-only or unsupported note types).')
  let history = 0
  if (opts.keepHistory) {
    const reviews = deck.revlog.filter((r) => r.ease >= 1 && r.ease <= 4 && r.type <= 2 && keyOfAnkiCard.has(r.cid)).map((r) => ({ id: `anki-${r.id}`, t: r.id, key: keyOfAnkiCard.get(r.cid)!, rating: r.ease as 1 | 2 | 3 | 4 }))
    if (reviews.length) { appendProgress(h.ws, { reviews }); history = reviews.length }
  }
  if (skipped) warnings.push(`${skipped} notes were skipped (empty, image-only or not valid cards).`)
  if (deck.media.size === 0 && /<img/i.test([...deck.notes.values()].map((n) => n.flds).join(''))) warnings.push('Pictures in this deck could not be read and were left out.')
  return result(files, warnings, `${imported} cards in ${files.filter((f) => f.kind === 'lesson').length} lessons${history ? `, ${history} reviews kept` : ''}.`)
}
