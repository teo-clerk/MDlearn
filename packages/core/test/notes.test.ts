import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cleanAttrs, compile, isStudyNote, parseDocument, parseTag, safeBundlePath, splitBundle } from '../src/index.js'
import { isStudyFile, lessonPaths, loadLessons, sourceDocs, workspace } from '../src/node.js'

const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')
const quiz = ':::quiz\n¿Cuál?\n\n- [x] Esta\n  > Sí.\n- [ ] Otra\n  > Confunde causa y efecto.\n:::\n'
const head = 'id: marketing-precio\nlang: es\nlevel: beginner\ngoals: [Fijar un precio]'
const note = (body: string, study = true) => `---\n${head}${study ? '\nstudy: true' : ''}\n---\n\n# Precio\n\n${body}`
const codes = (source: string) => compile(source).diagnostics.map((d) => d.code)

describe('a note that is also studied', () => {
  it('may explain as long as it needs', () => {
    const long = Array.from({ length: 18 }, (_, i) => `## Sección ${i}\n\n${words(400)}\n\n${i % 6 === 0 ? quiz : ''}`).join('\n')
    expect(codes(note(long))).not.toEqual(expect.arrayContaining(['W601']))
    expect(codes(note(long))).not.toContain('W602')
    expect(codes(note(long))).not.toContain('W603')
  })
  it('a lesson keeps its limits', () => {
    const long = `## Una\n\n${words(400)}\n\n${quiz}`
    expect(codes(note(long, false))).toContain('W601')
  })
  it('has at least one exercise', () => {
    expect(codes(note(`## Una\n\n${words(40)}\n`))).toContain('W611')
    expect(codes(note(`## Una\n\n${words(40)}\n\n${quiz}`))).not.toContain('W611')
  })
  it('gives each section with exercises a place in review', () => {
    const { lesson } = compile(note(`## Una\n\n${words(40)}\n\n${quiz}\n## Dos\n\n${words(40)}\n`))
    expect(lesson?.id).toBe('marketing-precio')
    expect(lesson?.title).toBe('Precio')
    expect(lesson?.cards.map((c) => c.id)).toEqual(['una', 'dos'])
  })
})

describe('telling a studied note from a document', () => {
  it('reads the flag in the frontmatter', () => {
    expect(isStudyNote(note(''))).toBe(true)
    expect(isStudyNote('﻿---\r\nstudy: true\r\n---\r\n# A\r\n')).toBe(true)
  })
  it('leaves everything else alone', () => {
    expect(isStudyNote(note('', false))).toBe(false)
    expect(isStudyNote('# Notes\n\nstudy: true\n')).toBe(false)
    expect(isStudyNote('---\ntitle: A\n---\n\nstudy: true\n')).toBe(false)
    expect(isStudyNote('---\nstudy: false\n---\n')).toBe(false)
  })
})

describe('notes in a folder', () => {
  function folder() {
    const root = mkdtempSync(join(tmpdir(), 'mdl-notes-'))
    mkdirSync(join(root, 'marketing/sources/text'), { recursive: true })
    writeFileSync(join(root, 'marketing/01-precio.md'), note(`## Una\n\n${words(30)}\n\n${quiz}`))
    writeFileSync(join(root, 'marketing/sources/text/clase.md'), '# Clase\n\nTexto.\n')
    writeFileSync(join(root, 'marketing/02-corta.learn.md'), `---\ntitle: Corta\nlang: es\n---\n\n## Una\n\n${words(30)}\n\n${quiz}`)
    return workspace(root)
  }
  it('are found with the lessons, and stay documents', () => {
    const ws = folder()
    expect(lessonPaths(ws).map((p) => p.slice(ws.root.length + 1)).sort()).toEqual(['marketing/01-precio.md', 'marketing/02-corta.learn.md'])
    expect(sourceDocs(ws).some((p) => p.endsWith('01-precio.md'))).toBe(true)
    expect(loadLessons(ws).map((l) => l.lesson?.title).sort()).toEqual(['Corta', 'Precio'])
  })
  it('a plain document is not studied', () => {
    const ws = folder()
    expect(isStudyFile(join(ws.root, 'marketing/sources/text/clase.md'))).toBe(false)
    expect(isStudyFile(join(ws.root, 'marketing/01-precio.md'))).toBe(true)
    expect(isStudyFile(join(ws.root, 'marketing/02-corta.learn.md'))).toBe(true)
  })
})

describe('a pinned section in the reader', () => {
  const source = note(`## Precio y valor {#precio}\n\nTexto.\n\n${quiz}`)
  it('shows its title without the id', () => {
    const doc = parseDocument(source)
    expect(doc.outline.sections[0].title).toBe('Precio y valor')
    const heading = doc.blocks.find((b) => b.type === 'heading' && b.depth === 2) as { text: { value?: string }[]; anchor: string }
    expect(heading.text.map((t) => t.value).join('')).toBe('Precio y valor')
  })
  it('keeps the id as its anchor, the one Study links to', () => {
    expect(parseDocument(source).outline.sections[0].anchor).toBe('precio')
    expect(compile(source).lesson?.cards[0].id).toBe('precio')
  })
})

describe('highlights that mean something', () => {
  const marked = (mark: string) => note(`## Una\n\n${words(60)} ${mark} ${words(60)}\n\n${quiz}`)
  it('keeps a tone from the list', () => {
    expect(cleanAttrs(parseTag('<mark data-tone="definition">')!)).toEqual({ 'data-tone': 'definition' })
  })
  it('drops any other value, and any other element', () => {
    expect(cleanAttrs(parseTag('<mark data-tone="x onload=1">')!)).toEqual({})
    expect(cleanAttrs(parseTag('<span data-tone="key">')!)).toEqual({})
  })
  it('warns about a tone that does not exist', () => {
    expect(codes(marked('<mark data-tone="blue">coste</mark>'))).toContain('W612')
    expect(codes(marked('<mark data-tone="trap">coste</mark>'))).not.toContain('W612')
  })
  it('counts how much is marked in a note, not how many marks', () => {
    const five = ['uno', 'dos', 'tres', 'cuatro', 'cinco'].map((w) => `<mark>${w}</mark>`).join(' ')
    expect(codes(marked(five))).not.toContain('W610')
    expect(codes(note(`## Una\n\n${five} ${five}\n\n${quiz}`))).toContain('W610')
  })
  it('a highlight stays a phrase', () => {
    expect(codes(marked(`<mark>${words(14)}</mark>`))).toContain('W610')
  })
  it('a lesson keeps its three', () => {
    const body = (n: number) => `---\ntitle: A\nlang: es\n---\n\n## Una\n\n${words(60)} ${Array.from({ length: n }, () => '<mark>uno</mark>').join(' ')}\n\n${quiz}`
    expect(codes(body(4))).toContain('W610')
  })
})

describe('notes in an answer from a chat', () => {
  it('keeps .md for a studied note', () => {
    expect(safeBundlePath('marketing/01-precio.md', true)).toBe('marketing/01-precio.md')
    expect(safeBundlePath('marketing/01-precio.md')).toBe('marketing/01-precio.learn.md')
  })
  it('names the files by what they hold', () => {
    const files = splitBundle(`<!-- file: curso/01-precio.md -->\n~~~~markdown\n${note(`## Una\n\n${quiz}`)}\n~~~~\n`)
    expect(files.map((f) => f.path)).toEqual(['curso/01-precio.md'])
    expect(splitBundle(note(`## Una\n\n${quiz}`)).map((f) => f.path)).toEqual(['precio.md'])
  })
})
