import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { JobManager, type JobSummary } from '../server/ai/jobs'
import { FakeEngine } from '../server/ai/fake'
import { writeAllowed } from '../server/ai/guard'
import { slidesToMarkdown, wordToMarkdown } from '../server/import/office'
import type { ClassUpload } from '../shared/types'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/class', name)))
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const url = (name: string) => `../media/x/${name}`

function setup() {
  const library = tmp('mdl-lib-')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, libraryDir: library }))
  const workspaces = new Workspaces(settings), bus = new EventBus()
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus, serverId: 't', jobs: new JobManager(bus), engine: () => new FakeEngine(0) })
  const headers = { host: 'localhost:1', 'x-mdl': '1' }
  const send = async (path: string, files: [string, Uint8Array][]) => {
    const form = new FormData()
    for (const [name, bytes] of files) form.append('files', new File([bytes as BlobPart], name))
    return app.request(path, { method: 'POST', body: form, headers })
  }
  return { app, headers, library, workspaces, send }
}

describe('a PowerPoint file', () => {
  it('keeps slide order, titles, bullets, tables, speaker notes and pictures', () => {
    const r = slidesToMarkdown(fixture('Lecture 3.pptx'), url)
    expect(r.slides).toBe(3)
    expect(r.markdown).toContain('## Slide 1: Lecture 3: Heat engines')
    expect(r.markdown).toContain('- Four reversible steps\n  - Isothermal expansion\n  - Adiabatic expansion\n- No real engine beats it')
    expect(r.markdown).toContain('> Speaker notes: Remind them that reversible means infinitely slow.')
    expect(r.markdown).toContain('| Step | Heat |\n| --- | --- |\n| Expansion | In |')
    expect(r.markdown).toMatch(/!\[carnot\.png\]\(\.\.\/media\/x\/slide-3-picture-1\.png\)/)
    expect(r.pictures.map((p) => p.name)).toEqual(['slide-3-picture-1.png'])
    expect(r.markdown.indexOf('Slide 1')).toBeLessThan(r.markdown.indexOf('Slide 2'))
  })
  it('says when a file is not a presentation', () => {
    expect(() => slidesToMarkdown(zipSync({ 'a.txt': strToU8('hello') }), url)).toThrow(/not a PowerPoint file/)
    expect(() => slidesToMarkdown(new Uint8Array([1, 2, 3, 4]), url)).toThrow(/could not be opened/)
  })
})

describe('a Word file', () => {
  it('keeps headings below the title, lists, tables and pictures', async () => {
    const r = await wordToMarkdown(fixture('Handout 2.docx'), url)
    expect(r.markdown).toContain('## The first law')
    expect(r.markdown).toContain('- Heat is not a state function.')
    expect(r.markdown).toContain('| Engine | Efficiency |')
    expect(r.markdown).toContain('| Carnot | 1 - Tc/Th |')
    expect(r.markdown).toContain('![Picture 1](../media/x/picture-1.png)')
    expect(r.equations).toBe(0)
  })
  it('counts equations, which it cannot bring along', async () => {
    const parts = unzipSync(fixture('Handout 2.docx'))
    const body = strFromU8(parts['word/document.xml']).replace('</w:body>', '<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath><m:oMath><m:r><m:t>y</m:t></m:r></m:oMath></w:body>')
    const r = await wordToMarkdown(zipSync({ ...parts, 'word/document.xml': strToU8(body) }), url)
    expect(r.equations).toBe(2)
  })
  it('refuses a file that would unpack to too much', async () => {
    const bomb = zipSync({ 'word/document.xml': strToU8('<x/>') })
    // the central directory's "unpacked size" of its one entry
    const at = bomb.findLastIndex((_, i) => bomb[i] === 0x50 && bomb[i + 1] === 0x4b && bomb[i + 2] === 1 && bomb[i + 3] === 2)
    new DataView(bomb.buffer).setUint32(at + 24, 0xf0000000, true)
    await expect(wordToMarkdown(bomb, url)).rejects.toThrow(/more than 400 MB/)
  })
})

describe('a course from class files', () => {
  it('makes a folder, keeps the originals and turns what it can into text', async () => {
    const { send, library, workspaces, app, headers } = setup()
    const r = await send(`/api/courses?name=${encodeURIComponent('Thermo 2')}`, [
      ['Lecture 3.pptx', fixture('Lecture 3.pptx')], ['Handout 2.docx', fixture('Handout 2.docx')], ['board.png', PNG], ['notes.txt', strToU8('Exam on chapter 3')],
    ])
    expect(r.status).toBe(200)
    const body = await r.json() as ClassUpload
    expect(body.root).toBe(join(library, 'Thermo 2'))
    expect(body.files).toEqual([
      { name: 'Lecture 3.pptx', path: 'sources/Lecture 3.pptx', kind: 'slides', text: 'sources/text/lecture-3.md', slides: 3, pictures: 1, skipped: 0, equations: 0 },
      { name: 'Handout 2.docx', path: 'sources/Handout 2.docx', kind: 'word', text: 'sources/text/handout-2.md', pictures: 1, skipped: 0, equations: 0 },
      { name: 'board.png', path: 'sources/board.png', kind: 'picture' },
      { name: 'notes.txt', path: 'sources/notes.txt', kind: 'text' },
    ])
    expect(existsSync(join(body.root, 'sources/media/lecture-3/slide-3-picture-1.png'))).toBe(true)
    expect(readFileSync(join(body.root, 'sources/text/lecture-3.md'), 'utf8')).toMatch(/^# Lecture 3\n/)
    // its pictures work from where the Markdown sits
    expect(readFileSync(join(body.root, 'sources/text/lecture-3.md'), 'utf8')).toContain('(../media/lecture-3/slide-3-picture-1.png)')
    const h = workspaces.get(body.id)!
    expect(workspaces.tree(h).docs.map((d) => d.path)).toEqual(['sources/text/handout-2.md', 'sources/text/lecture-3.md'])
    const asset = await app.request(`/api/w/${body.id}/asset?path=sources%2Fmedia%2Flecture-3%2Fslide-3-picture-1.png`, { headers })
    expect(asset.status).toBe(200)
  })
  it('names what it could not read, and carries on with the rest', async () => {
    const { send } = setup()
    const r = await (await send('/api/courses?name=Mixed', [
      ['old slides.ppt', strToU8('binary')], ['broken.docx', new Uint8Array([1, 2, 3])], ['fake.pdf', strToU8('not a pdf')], ['thing.xyz', strToU8('?')], ['ok.pptx', fixture('Lecture 3.pptx')],
    ])).json() as ClassUpload
    expect(r.files.map((f) => [f.name, f.problem])).toEqual([
      ['old slides.ppt', 'old-format'], ['broken.docx', 'unreadable'], ['fake.pdf', 'unreadable'], ['thing.xyz', 'unknown-type'], ['ok.pptx', undefined],
    ])
  })
  it('keeps names Windows reserves or cannot store from breaking the folder', async () => {
    const { send } = setup()
    const r = await (await send('/api/courses?name=Reserved', [['CON.md', strToU8('# x')], ['notes.md. ', strToU8('# y')]])).json() as ClassUpload
    expect(r.files[0].path).toBe('sources/_CON.md')
    expect(r.files[1].path).toBe('sources/notes.md')
  })
  it('never lets a file name lead out of the folder, and adds to a course without replacing anything', async () => {
    const { send, library } = setup()
    const first = await (await send('/api/courses?name=Safe', [['../../evil.md', strToU8('# x')]])).json() as ClassUpload
    expect(first.files[0].path).toMatch(/^sources\/[^/]+\.md$/)
    expect(existsSync(join(library, 'evil.md'))).toBe(false)
    const again = await (await send(`/api/w/${first.id}/sources`, [['board.png', PNG]])).json() as ClassUpload
    const third = await (await send(`/api/w/${first.id}/sources`, [['board.png', PNG]])).json() as ClassUpload
    expect(again.files[0].path).toBe('sources/board.png')
    expect(third.files[0].path).toBe('sources/board-2.png')
  })
  it('asks the AI to cover the files and keeps it out of them', async () => {
    const { send, app, headers } = setup()
    const { id, root } = await (await send('/api/courses?name=Thermo', [['Lecture 3.pptx', fixture('Lecture 3.pptx')]])).json() as ClassUpload
    const job = await (await app.request(`/api/w/${id}/ai/jobs`, { method: 'POST', body: JSON.stringify({ recipe: 'course.class', name: 'Thermo', request: 'Only chapter 3' }), headers: { ...headers, 'content-type': 'application/json' } })).json() as JobSummary
    expect(job.title).toBe('Course: Thermo')
    const scope = [root], keepOut = [join(root, 'sources'), join(root, 'AGENTS.md')]
    expect(writeAllowed(join(root, '01-heat.learn.md'), scope, keepOut)).toBeNull()
    expect(writeAllowed(join(root, 'course.md'), scope, keepOut)).toBeNull()
    expect(writeAllowed(join(root, 'sources/text/lecture-3.md'), scope, keepOut)).toMatch(/not change/)
    expect(writeAllowed(join(root, 'AGENTS.md'), scope, keepOut)).toMatch(/not change/)
  })
})
