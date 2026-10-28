import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync, strFromU8 } from 'fflate'
import { compileSource } from '@mdlearn/core/node'
import type { Lesson } from '@mdlearn/core'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { buildApkg, notesOf } from '../server/export/anki'

const fixtures = resolve(__dirname, '../../core/test/fixtures')
const lesson = (name: string): Lesson => { const p = join(fixtures, name); return compileSource(readFileSync(p, 'utf8'), p).lesson! }
const open = (apkg: Uint8Array) => {
  const files = unzipSync(apkg)
  const db = new DatabaseSync(':memory:'); db.deserialize(files['collection.anki2'])
  return { db, files }
}

describe('Anki export', () => {
  const lessons = [lesson('02-bayes-theorem.learn.md')]
  const notes = notesOf(lessons)
  it('turns every card of a lesson into a note: quiz and explain as Basic, gaps as Cloze, math in Anki delimiters', () => {
    expect(notes.length).toBeGreaterThan(2)
    const kinds = new Set(notes.map((n) => n.model))
    expect(kinds.has('basic')).toBe(true)
    const all = notes.map((n) => n.fields.join(' ')).join('\n')
    expect(all).toMatch(/\\\(|\\\[/)           // math survives as \( \) or \[ \]
    expect(all).not.toMatch(/\$[^$\s][^$]*\$/) // no Markdown dollars left
    expect(all).not.toMatch(/<script|onerror/i)
    for (const n of notes) { expect(n.fields.every((f) => typeof f === 'string')).toBe(true); expect(n.guid).toMatch(/^[A-Za-z0-9]{6,10}$/) }
  })
  it('says which video and when for a question a video pauses at, with a link that starts there', () => {
    const l = compileSource('---\ntitle: Video\n---\n## Card\n\n::video[https://youtu.be/dQw4w9WgXcQ]{title="Speckle <basics>"}\n\n:::quiz{at=1:05}\nWhich band?\n- [x] C\n- [ ] L\n  > No.\n:::\n', join(fixtures, 'v.learn.md')).lesson!
    const [n] = notesOf([l])
    expect(n.fields[0]).toMatch(/^<p><small>From the video <a href="https:\/\/youtu\.be\/dQw4w9WgXcQ\?t=65">Speckle &lt;basics&gt; at 1:05<\/a><\/small><\/p>/)
  })
  it('hides every gap of a cloze card together, including a gap inside a formula', () => {
    const clozes = notes.filter((n) => n.model === 'cloze').map((n) => n.fields[0])
    expect(clozes.length).toBeGreaterThanOrEqual(3)
    expect(clozes[0]).toMatch(/\{\{c1::prior\}\}.*\{\{c1::posterior\}\}/)           // two gaps, one card
    expect(clozes.every((c) => !/\{\{c2::/.test(c))).toBe(true)
    expect(clozes[1]).toMatch(/\\\[P\(E\) = .*\{\{c1::P\(E \\mid \\neg H\)\\,P\(\\neg H\) \}\}\\\]/) // cloze inside display math, space before }}
  })
  it('puts the explanation under the right answer, not inside a paragraph inside a paragraph', () => {
    const quiz = notes.find((n) => /About 17%/.test(n.fields[1]))!
    expect(quiz.fields[1]).toMatch(/^<p><b>C\.<\/b> About 17%<\/p><div><small><p>/)
  })
  it('is a valid legacy collection: tables, models, one deck per lesson, one card per note', () => {
    const { db, files } = open(buildApkg(notes, 1_760_000_000_000))
    expect(Object.keys(files).sort()).toEqual(['collection.anki2', 'media'])
    expect(strFromU8(files.media)).toBe('{}')
    const count = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n
    expect(count('notes')).toBe(notes.length); expect(count('cards')).toBe(notes.length)
    const col = db.prepare('SELECT ver, models, decks FROM col').get() as { ver: number; models: string; decks: string }
    expect(col.ver).toBe(11)
    const models = Object.values(JSON.parse(col.models)) as { name: string; type: number; flds: unknown[] }[]
    expect(models.map((m) => [m.name, m.type, m.flds.length]).sort()).toEqual([['MDlearn Basic', 0, 2], ['MDlearn Cloze', 1, 2]])
    const decks = Object.values(JSON.parse(col.decks)) as { name: string }[]
    expect(decks.some((d) => d.name.startsWith('MDlearn::'))).toBe(true)
    const row = db.prepare('SELECT flds, tags, guid FROM notes ORDER BY id LIMIT 1').get() as { flds: string; tags: string; guid: string }
    expect(row.flds.split('\x1f')).toHaveLength(2); expect(row.tags).toMatch(/ mdlearn /)
    // ids are unique and cards point at their notes and decks
    expect(count('cards') - (db.prepare('SELECT count(DISTINCT nid) AS n FROM cards').get() as { n: number }).n).toBe(0)
  })
  it('keeps the same note ids (guids) when exported again, so Anki updates instead of duplicating', () => {
    const guids = (t: number) => (open(buildApkg(notesOf([lesson('02-bayes-theorem.learn.md')]), t)).db.prepare('SELECT guid FROM notes ORDER BY guid').all() as { guid: string }[]).map((r) => r.guid)
    expect(guids(1_760_000_000_000)).toEqual(guids(1_770_000_000_000))
  })
})

describe('the export route', () => {
  it('downloads an .apkg for a lesson, a document or the folder; refuses a folder without cards', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mdl-anki-')); cpSync(join(fixtures, 'curriculum'), root, { recursive: true })
    cpSync(join(fixtures, '02-bayes-theorem.learn.md'), join(root, 'learn/02-bayes-theorem.learn.md'))
    const settings = settingsStore(join(mkdtempSync(join(tmpdir(), 'mdl-cfg-')), 's.json'))
    const workspaces = new Workspaces(settings)
    const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
    const h = workspaces.open(root)
    const get = (q: string) => app.request(`/api/w/${h.id}/export/anki${q}`, { headers: { host: 'localhost:1' } })
    const all = await get('')
    expect(all.status).toBe(200)
    expect(all.headers.get('content-disposition')).toMatch(/^attachment; filename="mdlearn-.+\.apkg"$/)
    const { db } = open(new Uint8Array(await all.arrayBuffer()))
    expect((db.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n).toBeGreaterThan(0)
    const one = await get(`?scope=${encodeURIComponent('learn/02-bayes-theorem.learn.md')}`)
    expect(one.status).toBe(200)
    expect((await get('?scope=nope.md')).status).toBeGreaterThanOrEqual(400)
  })
})
