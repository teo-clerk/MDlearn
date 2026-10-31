import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, existsSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces, type Handle } from '../server/workspaces'
import { capture, listInbox } from '../server/inbox'
import type { InboxItem, InboxList, StudyPlan, Tree } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const NOON = new Date(2026, 9, 31, 14, 32)
const FILE = 'Inbox/2026-10-31.md'

function setup() {
  const root = tmp('mdl-inbox-'); cpSync(fixture, root, { recursive: true })
  writeFileSync(join(root, 'notes.md'), '# Notes\n\n## First\n\nSome text of the first section, long enough to be a passage of its own here.\n\n## Second\n\nSome text of the second section.\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root) as Handle
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1', origin: 'http://localhost:1' } })
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const file = (rel = FILE) => readFileSync(join(root, rel), 'utf8')
  return { root, h, post, get, file }
}

describe('capture', () => {
  it('appends a task line to the day’s file, in plain Markdown', async () => {
    const { h, file } = setup()
    await capture(h, { text: 'Why does coherence fall?' }, NOON)
    await capture(h, { text: 'And with time?' }, new Date(2026, 9, 31, 14, 40))
    expect(file()).toBe('# Inbox 2026-10-31\n\n- [ ] 14:32 Why does coherence fall?\n- [ ] 14:40 And with time?\n')
  })
  it('keeps a long text, a quote and where it came from inside one item', async () => {
    const { h, root, file } = setup()
    await capture(h, { text: 'first\n\n\nsecond\n- [ ] not an item of its own', quote: 'a passage\nof two lines', source: { doc: 'notes.md', abs: join(root, 'notes.md'), section: 'second' } }, NOON)
    expect(file()).toContain('- [ ] 14:32 first\n  second\n  - [ ] not an item of its own\n  > a passage\n  > of two lines\n  — [Notes § Second](../notes.md#second)\n')
    const { items, total } = listInbox(h)
    expect(total).toBe(1)
    expect(items[0]).toMatchObject({ text: 'first\nsecond\n- [ ] not an item of its own', quote: 'a passage\nof two lines', source: { label: 'Notes § Second', doc: 'notes.md', section: 'second', url: null }, date: '2026-10-31', time: '14:32' })
  })
  it('keeps a web address as a link, and brackets in a title do not break it', async () => {
    const { h, root } = setup()
    writeFileSync(join(root, 'odd name [v2].md'), '# A [draft] (one)\n\nBody.\n')
    await capture(h, { url: 'https://example.org/a_(b)?c=1' }, NOON)
    await capture(h, { text: 'x', source: { doc: 'odd name [v2].md', abs: join(root, 'odd name [v2].md') } }, NOON)
    const [doc, web] = listInbox(h).items
    expect(web.source).toMatchObject({ url: 'https://example.org/a_%28b%29?c=1', doc: null })
    expect(doc.source).toMatchObject({ label: 'A [draft] (one)', doc: 'odd name [v2].md' })
  })
  it('what is typed cannot pass for where an item came from', async () => {
    const { h, file } = setup()
    await capture(h, { text: 'first\n— [Official docs](https://example.org)' }, NOON)
    expect(file()).toContain('  — \\[Official docs](https://example.org)\n')
    expect(listInbox(h).items[0]).toMatchObject({ source: null, text: 'first\n— [Official docs](https://example.org)' })
  })
  it('follows no link out of the folder', async () => {
    const { h, root } = setup()
    const outside = tmp('mdl-outside-')
    writeFileSync(join(outside, '2026-10-31.md'), '# Elsewhere\n\n- [ ] 09:00 not yours\n')
    symlinkSync(outside, join(root, 'Inbox'))
    await expect(capture(h, { text: 'x' }, NOON)).rejects.toThrow(/not an inbox file/)
    expect(listInbox(h).total).toBe(0)
    expect(readFileSync(join(outside, '2026-10-31.md'), 'utf8')).not.toContain(' x\n')
  })
  it('follows no link out of the folder for one day’s file either', async () => {
    const { h, root } = setup()
    const outside = tmp('mdl-outside-')
    writeFileSync(join(outside, 'day.md'), '# Elsewhere\n\n- [ ] 09:00 not yours\n')
    mkdirSync(join(root, 'Inbox')); symlinkSync(join(outside, 'day.md'), join(root, FILE))
    await expect(capture(h, { text: 'x' }, NOON)).rejects.toThrow(/not an inbox file/)
    expect(listInbox(h).total).toBe(0)
  })
  it('refuses nothing to save, and a day’s file that is full', async () => {
    const { h, root } = setup()
    await expect(capture(h, { text: '  \n ' }, NOON)).rejects.toThrow(/Write something/)
    mkdirSync(join(root, 'Inbox')); writeFileSync(join(root, FILE), 'x'.repeat(2 * 1024 * 1024))
    await expect(capture(h, { text: 'one more' }, NOON)).rejects.toThrow(/inbox file is full/)
  })
  it('loses nothing when saves arrive together', async () => {
    const { h } = setup()
    await Promise.all(Array.from({ length: 25 }, (_, i) => capture(h, { text: `thought ${i}` }, NOON)))
    const { total, items } = listInbox(h)
    expect(total).toBe(25)
    expect(new Set(items.map((i) => i.text)).size).toBe(25)
  })
  it('counts a task typed by hand, without a time, and skips what is ticked', async () => {
    const { h, root } = setup()
    mkdirSync(join(root, 'Inbox')); writeFileSync(join(root, FILE), '# Mine\n\n- [ ] typed by hand\n- [x] 09:00 done already\n- not a task\n')
    expect(listInbox(h).items.map((i) => [i.time, i.text])).toEqual([[null, 'typed by hand']])
  })
  it('a link typed by hand that is not valid encoding does not break the list', async () => {
    const { h, root } = setup()
    mkdirSync(join(root, 'Inbox')); writeFileSync(join(root, FILE), '# Mine\n\n- [ ] 09:00 odd\n  — [x](100%done.md)\n')
    expect(listInbox(h).items[0].source).toMatchObject({ label: 'x', doc: 'Inbox/100%done.md' })
  })
  it('a document with # in its name keeps a working link', async () => {
    const { h, root } = setup()
    writeFileSync(join(root, 'c#.md'), '# Sharp\n\nBody.\n')
    await capture(h, { text: 'x', source: { doc: 'c#.md', abs: join(root, 'c#.md') } }, NOON)
    expect(listInbox(h).items[0].source).toMatchObject({ doc: 'c#.md', section: null })
  })
  it('lists the newest first, and counts more than it shows', async () => {
    const { h } = setup()
    await capture(h, { text: 'older' }, new Date(2026, 9, 30, 9, 0))
    await capture(h, { text: 'newer' }, NOON)
    expect(listInbox(h).items.map((i) => i.text)).toEqual(['newer', 'older'])
    await Promise.all(Array.from({ length: 120 }, (_, i) => capture(h, { text: `n${i}` }, NOON)))
    const all = listInbox(h)
    expect(all.total).toBe(122)
    expect(all.items.length).toBe(100)
  })
})

describe('sorting the inbox', () => {
  const seeded = async () => {
    const s = setup()
    const { root, post, get } = s
    const item = await (await post('/inbox', { text: 'Coherence', quote: 'quoted words', doc: 'notes.md', section: 'first' })).json() as InboxItem
    return { ...s, item, root, get }
  }
  const openItems = async (s: { get: <T>(p: string) => Promise<T> }) => (await s.get<InboxList>('/inbox')).total

  it('done ticks the box and the item leaves the list', async () => {
    const s = await seeded()
    expect((await s.post('/inbox/done', { file: s.item.file, id: s.item.id })).status).toBe(200)
    expect(await openItems(s)).toBe(0)
    expect(s.file(s.item.file)).toMatch(/- \[x\] \d\d:\d\d Coherence\n/)
  })
  it('refuses an item that was edited since the page was loaded', async () => {
    const s = await seeded()
    writeFileSync(join(s.root, s.item.file), s.file(s.item.file).replace('Coherence', 'Coherence and more'))
    const r = await s.post('/inbox/done', { file: s.item.file, id: s.item.id })
    expect(r.status).toBe(409)
    expect(s.file(s.item.file)).toContain('- [ ]')
  })
  it('refuses a path that is not an inbox file', async () => {
    const s = await seeded()
    for (const file of ['notes.md', '../x.md', 'Inbox/../notes.md', 'Inbox/2026-10-31.md/x', 'Inbox/notes.md'])
      expect((await s.post('/inbox/done', { file, id: s.item.id })).status).toBe(403)
  })
  it('a card lands on the document the item came from, is due in Study, and ticks the item', async () => {
    const s = await seeded()
    const r = await s.post('/inbox/card', { file: s.item.file, id: s.item.id, card: { kind: 'qa', question: 'What is coherence?', answer: 'A measure of similarity' } })
    expect(r.status).toBe(200)
    const made = await r.json() as { path: string }
    expect(made.path).toContain('notes/my-cards.learn.md')
    expect(readFileSync(join(s.root, made.path), 'utf8')).toContain('::read[§first]')
    expect(s.file(s.item.file)).toMatch(/- \[x\] .* → card\n/)
    const plan = await s.get<StudyPlan>('/study/queue?limit=50&newCards=20')
    expect(JSON.stringify(plan)).toContain('my-cards-notes')
  })
  it('a card from a plain thought lands on the inbox file itself', async () => {
    const s = setup()
    const item = await (await s.post('/inbox', { text: 'A plain thought' })).json() as InboxItem
    const made = await (await s.post('/inbox/card', { file: item.file, id: item.id, card: { kind: 'qa', question: 'A plain question?', answer: 'Yes' } })).json() as { path: string }
    expect(made.path).toMatch(/Inbox\/\d{4}-\d\d-\d\d\/my-cards\.learn\.md$/)
    const tree = await s.get<Tree>('/tree')
    expect(tree.docs.find((d) => d.path === item.file)?.lessons.length).toBe(1)
  })
  it('a card says nothing about paths outside the folder', async () => {
    const s = setup()
    const outside = tmp('mdl-outside-')
    writeFileSync(join(outside, 'secret.md'), '# Secret\n\nBody.\n')
    const up = '../'.repeat(12)
    mkdirSync(join(s.root, 'Inbox'))
    writeFileSync(join(s.root, FILE), `# Mine\n\n- [ ] 09:00 real path\n  — [x](${up}${outside.slice(1)}/secret.md)\n- [ ] 09:01 no such path\n  — [x](${up}${outside.slice(1)}/nothing.md)\n`)
    const { items } = await s.get<InboxList>('/inbox')
    const statuses = await Promise.all(items.map((i, n) => s.post('/inbox/card', { file: i.file, id: i.id, card: { kind: 'qa', question: `Question ${n}?`, answer: 'Yes' } }).then((r) => r.status)))
    expect(statuses).toEqual([200, 200])
    expect(s.file(FILE).match(/→ card/g)?.length).toBe(2)
  })
  it('a card that cannot be built leaves the item open', async () => {
    const s = await seeded()
    const r = await s.post('/inbox/card', { file: s.item.file, id: s.item.id, card: { kind: 'cloze', text: 'no blanks here' } })
    expect(r.status).toBe(400)
    expect(await openItems(s)).toBe(1)
  })
  it('move puts the item at the end of the section you pick, with its link working from there', async () => {
    const s = await seeded()
    mkdirSync(join(s.root, 'sub')); writeFileSync(join(s.root, 'sub/target.md'), '# Target\n\n## One\n\nOne text.\n\n## Two\n\nTwo text.\n')
    expect((await s.post('/inbox/move', { file: s.item.file, id: s.item.id, doc: 'sub/target.md', section: 'one' })).status).toBe(200)
    expect(s.file('sub/target.md')).toBe('# Target\n\n## One\n\nOne text.\n\nCoherence\n\n> quoted words\n\n— [Notes § First](../notes.md#first)\n\n## Two\n\nTwo text.\n')
    expect(s.file(s.item.file)).toMatch(/- \[x\] .* → moved to sub\/target\.md\n/)
    expect(await openItems(s)).toBe(0)
  })
  it('move keeps a document’s front matter', async () => {
    const s = await seeded()
    writeFileSync(join(s.root, 'front.md'), '---\ntitle: Kept\n---\n\n# Kept\n\n## One\n\nOne text.\n')
    await s.post('/inbox/move', { file: s.item.file, id: s.item.id, doc: 'front.md', section: 'one' })
    expect(s.file('front.md')).toMatch(/^---\ntitle: Kept\n---\n\n# Kept\n\n## One\n\nOne text\.\n\nCoherence\n/)
  })
  it('move with no section goes to the end of the document', async () => {
    const s = await seeded()
    await s.post('/inbox/move', { file: s.item.file, id: s.item.id, doc: 'notes.md' })
    expect(s.file('notes.md')).toMatch(/Some text of the second section\.\n\nCoherence\n\n> quoted words\n\n— \[Notes § First\]\(notes\.md#first\)\n$/)
  })
  it('move refuses a section that is gone, and leaves the item open', async () => {
    const s = await seeded()
    expect((await s.post('/inbox/move', { file: s.item.file, id: s.item.id, doc: 'notes.md', section: 'gone' })).status).toBe(404)
    expect(await openItems(s)).toBe(1)
  })
})
