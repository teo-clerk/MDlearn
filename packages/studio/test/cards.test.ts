import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { compileFile } from '@mdlearn/core/node'
import type { StudyPlan, LessonResponse, Tree } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function setup() {
  const root = tmp('mdl-cards-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const get = async <T>(p: string) => (await app.request(`/api/w/${h.id}${p}`, { headers: { host: 'localhost:1' } })).json() as Promise<T>
  const post = (p: string, body: unknown) => app.request(`/api/w/${h.id}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { host: 'localhost:1', 'content-type': 'application/json', 'x-mdl': '1' } })
  return { root, get, post }
}
const DOC = '00_FOUNDATIONS/04_radar.md'
const MINE = 'learn/00_FOUNDATIONS/04_radar/my-cards.learn.md'

describe('passage for a quote', () => {
  it('returns the source paragraph with its math and the section it is in', async () => {
    const { get } = setup()
    const p = await get<{ text: string; section: { num: string } | null }>(`/doc/passage?path=${encodeURIComponent(DOC)}&quote=${encodeURIComponent('received power falls')}`)
    expect(p.text).toContain('received power falls')
    expect(p.text).toMatch(/\$/)
    expect(p.section?.num).toBeTruthy()
  })
  it('says so when the quote is not in the file', async () => {
    const { get } = setup()
    const r = await get<{ error: { code: string } }>(`/doc/passage?path=${encodeURIComponent(DOC)}&quote=${encodeURIComponent('zebra giraffe antelope')}`)
    expect(r.error.code).toBe('not-found')
  })
})

describe('quick cards', () => {
  it('a cloze card is written to my-cards, checked, linked to the section, and studied', async () => {
    const { root, get, post } = setup()
    const r = await post('/cards', { doc: DOC, section: { num: '2', anchor: 'the-radar-equation' }, card: { kind: 'cloze', text: 'Received power falls as {{R^{-4}}}', title: 'Range law' } })
    if (r.status !== 200) throw new Error(JSON.stringify(await r.clone().json()))
    const body = await r.json() as { path: string; cardKey: string; created: boolean }
    expect(body).toMatchObject({ path: MINE, created: true })
    expect(existsSync(join(root, MINE))).toBe(true)
    const compiled = compileFile(join(root, MINE))
    expect(compiled.diagnostics.filter((d) => d.code.startsWith('E'))).toEqual([])
    expect(compiled.lesson?.cards[0]).toMatchObject({ id: 'range-law', title: 'Range law' })
    expect(body.cardKey).toBe(`${compiled.lesson!.id}/range-law`)
    const plan = await get<StudyPlan>('/study/queue?limit=50&newCards=20')
    expect(plan.items.map((i) => i.cardKey)).toContain(body.cardKey)
    const tree = await get<Tree>('/tree')
    expect(tree.docs.find((d) => d.path === DOC)!.lessons.map((l) => l.path)).toContain(MINE)
    // the card gives nothing away before an attempt
    const lesson = await get<LessonResponse>(`/lesson?path=${encodeURIComponent(MINE)}`)
    expect(JSON.stringify(lesson.lesson)).not.toContain('R^{-4}')
  })
  it('more cards are appended; equal titles stay distinct; the file is always valid', async () => {
    const { root, post } = setup()
    for (const text of ['One {{alpha}}', 'Two {{beta}}']) expect((await post('/cards', { doc: DOC, section: null, card: { kind: 'cloze', text, title: 'Same title' } })).status).toBe(200)
    expect((await post('/cards', { doc: DOC, section: null, card: { kind: 'qa', question: 'Why four?', answer: 'Out and back\n- Two spreads' } })).status).toBe(200)
    const c = compileFile(join(root, MINE))
    expect(c.diagnostics.filter((d) => d.code.startsWith('E'))).toEqual([])
    expect(c.lesson!.cards.map((x) => x.id)).toEqual(['same-title', 'same-title-2', 'why-four'])
    expect(readFileSync(join(root, MINE), 'utf8').match(/^---/gm)).toHaveLength(2) // header written once
  })
  it('refuses a cloze without a blank, an empty question, and bad documents', async () => {
    const { post, root } = setup()
    expect((await post('/cards', { doc: DOC, section: null, card: { kind: 'cloze', text: 'No blanks here at all' } })).status).toBe(400)
    expect((await post('/cards', { doc: DOC, section: null, card: { kind: 'qa', question: 'Why?', answer: ' ' } })).status).toBe(400)
    expect((await post('/cards', { doc: '../x.md', section: null, card: { kind: 'cloze', text: 'a {{b}}' } })).status).toBe(403)
    expect(existsSync(join(root, MINE))).toBe(false)
  })
  it('a blank that the compiler rejects leaves the file untouched', async () => {
    const { post, root } = setup()
    await post('/cards', { doc: DOC, section: null, card: { kind: 'cloze', text: 'Good {{one}}' } })
    const before = readFileSync(join(root, MINE), 'utf8')
    const r = await post('/cards', { doc: DOC, section: null, card: { kind: 'cloze', text: 'Broken {{}} blank {{ unclosed' } })
    expect(r.status).toBe(400)
    expect(readFileSync(join(root, MINE), 'utf8')).toBe(before)
  })
})
