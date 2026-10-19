import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { zipSync, strToU8 } from 'fflate'
import { compileSource, loadProgress } from '@mdlearn/core/node'
import { deriveCards } from '@mdlearn/core'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { buildApkg, notesOf } from '../server/export/anki'
import { importAnki, htmlToMarkdown, cardMarkdown } from '../server/import/anki'

const fixtures = resolve(__dirname, '../../core/test/fixtures')
const open = () => new Workspaces(settingsStore(join(mkdtempSync(join(tmpdir(), 'mdl-cfg-')), 's.json'))).open(mkdtempSync(join(tmpdir(), 'mdl-anki-')))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

/** A small legacy-format collection, written by hand like Anki does. */
function craft(notes: { id: number; mid: number; flds: string[] }[], cards: { id: number; nid: number; did?: number }[], revlog: { id: number; cid: number; ease: number; type?: number }[] = [], media: Record<string, Uint8Array> = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);`)
  db.prepare('INSERT INTO col VALUES (1,0,0,0,11,0,0,0,?,?,?,?,?)').run('{}', JSON.stringify({ 1: { name: 'Basic', type: 0 }, 2: { name: 'Cloze', type: 1 } }), JSON.stringify({ 1: { name: 'Default' }, 77: { name: 'Radar::Speckle' } }), '{}', '{}')
  for (const n of notes) db.prepare("INSERT INTO notes VALUES (?, 'g' || ?, ?, 0, 0, '', ?, 0, 0, 0, '')").run(n.id, n.id, n.mid, n.flds.join('\x1f'))
  for (const c of cards) db.prepare('INSERT INTO cards VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, \'\')').run(c.id, c.nid, c.did ?? 77)
  for (const r of revlog) db.prepare('INSERT INTO revlog VALUES (?, ?, 0, ?, 0, 0, 0, 0, ?)').run(r.id, r.cid, r.ease, r.type ?? 1)
  const bytes = db.serialize(); db.close()
  const names = Object.keys(media)
  return zipSync({ 'collection.anki2': bytes, media: strToU8(JSON.stringify(Object.fromEntries(names.map((n, i) => [String(i), n])))), ...Object.fromEntries(names.map((n, i) => [String(i), media[n]])) })
}

describe('Anki HTML', () => {
  it('turns fields into Markdown: emphasis, lists, line breaks, MathJax, pictures', () => {
    expect(htmlToMarkdown('<div>What is <b>speckle</b>?</div><div>Think \\(x^2\\) and <i>noise</i>.</div>')).toBe('What is **speckle**?\n\nThink $x^2$ and *noise*.')
    expect(htmlToMarkdown('Line one<br>line two')).toBe('Line one  \nline two')
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
    expect(htmlToMarkdown('Energy: \\[E = mc^2\\] [sound:x.mp3]')).toBe('Energy: $$E = mc^2$$')
    expect(htmlToMarkdown('<img src="my pic.png">')).toBe('![](my%20pic.png)')
  })
  it('makes cloze cards from {{c1::…}} with hints, and explain cards from front and back; empty notes give nothing', () => {
    const c = cardMarkdown({ id: 1, mid: 2, tags: '', flds: 'The {{c1::mean}} of \\(x\\) is {{c2::E[x]::say it as an operator}}\x1f' }, true)!
    expect(c.widget).toBe(':::cloze\nThe {{mean}} of $x$ is {{E[x]}}\n::hint[say it as an operator]\n:::')
    expect(c.title).toBe('The … of $x$ is …'.replace('$x$', 'formula'))
    expect(cardMarkdown({ id: 2, mid: 1, tags: '', flds: 'Why?\x1fBecause.' }, false)!.widget).toBe(':::explain\nWhy?\n> Because.\n:::')
    expect(cardMarkdown({ id: 3, mid: 1, tags: '', flds: 'Only a front\x1f' }, false)).toBeNull()
  })
})

describe('Anki import', () => {
  it('turns notes into lessons that compile, one per deck, with pictures copied', () => {
    const h = open()
    const apkg = craft(
      [{ id: 1001, mid: 1, flds: ['<div>What is <b>speckle</b>?</div>', 'Granular noise<br>from coherent sums'] }, { id: 1002, mid: 2, flds: ['The {{c1::mean}} of \\(x\\) is {{c2::E[x]::operator}}', ''] },
        { id: 1003, mid: 1, flds: ['Name this <img src="pic.png">', 'A pixel'] }, { id: 1004, mid: 1, flds: ['Front only', ''] }],
      [{ id: 5001, nid: 1001 }, { id: 5002, nid: 1002 }, { id: 5003, nid: 1002 }, { id: 5004, nid: 1003 }, { id: 5005, nid: 1004 }], [], { 'pic.png': PNG })
    const r = importAnki(h, 'radar.apkg', apkg)
    expect(r.files.filter((f) => f.kind === 'lesson').map((f) => f.path)).toEqual(['learn/imports/speckle.learn.md'])
    expect(r.summary).toBe('3 cards in 1 lessons.'); expect(r.warnings.join(' ')).toMatch(/1 notes were skipped/)
    const text = readFileSync(join(h.root, 'learn/imports/speckle.learn.md'), 'utf8')
    expect(text).toMatch(/^---\nid: anki-speckle\ntitle: "Speckle"\n/)
    expect(text).toContain(':::explain\nWhat is **speckle**?\n> Granular noise')
    expect(text).toContain(':::cloze\nThe {{mean}} of $x$ is {{E[x]}}')
    expect(text).toContain('![](media/speckle/pic.png)')
    expect(readFileSync(join(h.root, 'learn/imports/media/speckle/pic.png')).equals(PNG)).toBe(true)
    const compiled = compileSource(text, join(h.root, 'learn/imports/speckle.learn.md'))
    expect(compiled.diagnostics.filter((d) => d.code.startsWith('E'))).toEqual([])
    expect(compiled.lesson!.cards).toHaveLength(3)
  })
  it('carries the review history over as schedules, when asked', () => {
    const h = open()
    const t0 = Date.UTC(2026, 0, 5, 9)
    const apkg = craft([{ id: 1001, mid: 1, flds: ['What is speckle?', 'Granular noise'] }], [{ id: 5001, nid: 1001 }],
      [{ id: t0, cid: 5001, ease: 1 }, { id: t0 + 864e5, cid: 5001, ease: 3 }, { id: t0 + 5 * 864e5, cid: 5001, ease: 4 }, { id: t0 + 6 * 864e5, cid: 5001, ease: 0, type: 4 }, { id: t0 + 7 * 864e5, cid: 9999, ease: 3 }])
    const r = importAnki(h, 'x.apkg', apkg, { keepHistory: true })
    expect(r.summary).toMatch(/3 reviews kept/)
    const p = loadProgress(h.ws)
    expect(p.reviews.map((e) => e.rating)).toEqual([1, 3, 4])
    expect(p.reviews.every((e) => e.key.startsWith('anki-'))).toBe(true)
    const card = deriveCards(p.reviews).get(p.reviews[0].key)!
    expect(card.reps).toBe(3)
    // without the option nothing is written to the progress file
    const h2 = open(); importAnki(h2, 'x.apkg', apkg)
    expect(existsSync(join(h2.root, 'learn/.mdlearn/progress.json'))).toBe(false)
  })
  it('splits big decks into lessons of 100 cards, and never replaces an earlier import', () => {
    const h = open()
    const notes = Array.from({ length: 230 }, (_, i) => ({ id: 2000 + i, mid: 1, flds: [`Question number ${i}?`, `Answer ${i}`] }))
    const apkg = craft(notes, notes.map((n) => ({ id: n.id + 10000, nid: n.id })))
    const a = importAnki(h, 'big.apkg', apkg)
    expect(a.files.map((f) => f.path)).toEqual(['learn/imports/speckle-1.learn.md', 'learn/imports/speckle-2.learn.md', 'learn/imports/speckle-3.learn.md'])
    const b = importAnki(h, 'big.apkg', apkg)
    expect(b.files[0].path).toBe('learn/imports/speckle-1-2.learn.md')
  })
  it('round trip: a deck exported from lessons imports back as the same number of cards', () => {
    const p = join(fixtures, '02-bayes-theorem.learn.md')
    const lesson = compileSource(readFileSync(p, 'utf8'), p).lesson!
    const notes = notesOf([lesson])
    const h = open()
    const r = importAnki(h, 'back.apkg', buildApkg(notes))
    expect(r.summary).toMatch(new RegExp(`^${notes.length} cards`))
    const back = r.files.filter((f) => f.kind === 'lesson').flatMap((f) => compileSource(readFileSync(join(h.root, f.path), 'utf8'), join(h.root, f.path)).lesson!.cards)
    expect(back).toHaveLength(notes.length)
    expect(readdirSync(join(h.root, 'learn/imports')).some((n) => n.endsWith('.learn.md'))).toBe(true)
  })
  it('refuses files that are not decks', () => {
    const h = open()
    expect(() => importAnki(h, 'x.apkg', Buffer.from('nope'))).toThrow(/not a valid Anki deck/)
    expect(() => importAnki(h, 'x.apkg', zipSync({ 'readme.txt': strToU8('hi') }))).toThrow(/no collection/)
  })
})

describe('Anki import limits', () => {
  it('refuses a deck that unpacks to far more than it should (zip bomb)', () => {
    const h = open()
    // A small zip whose central directory claims 420 MB unpacked: the size check runs before inflating.
    const bomb = zipSync({ 'collection.anki2': new Uint8Array(1024) })
    const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength)
    let cd = bomb.length - 4
    while (cd >= 0 && view.getUint32(cd, true) !== 0x02014b50) cd--
    expect(cd).toBeGreaterThanOrEqual(0)
    view.setUint32(cd + 24, 420 * 1024 * 1024, true)
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024)
    expect(() => importAnki(h, 'bomb.apkg', bomb)).toThrow(/too large to import/)
  })
})
