// A note with `study: true` is a document you read and a set of questions you review: one file, shown once.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { course, item, plan } from '../server/study'
import { courseInfo } from '../server/course'
import { classCourse, improveLesson, topicCourse } from '../server/ai/recipes'
import { toolsFor } from '../server/ai/claude'
import { compile } from '@mdlearn/core'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const note = (title: string, id: string) => `---
id: ${id}
lang: es
level: beginner
goals: [Fijar un precio]
study: true
---

# ${title}

## El precio y el valor

El precio es lo que pagas; el valor es lo que recibes.

:::quiz
¿Qué fija el techo de un precio?

- [x] El valor percibido
  > Eso es: nadie paga más de lo que cree que vale.
- [ ] El coste
  > El coste fija el suelo, no el techo.
:::
`
function setup() {
  const root = tmp('mdl-note-')
  mkdirSync(join(root, 'marketing'))
  writeFileSync(join(root, 'marketing/course.md'), '# Marketing\n\nEl curso.\n')
  writeFileSync(join(root, 'marketing/01-precio.md'), note('Precio', 'marketing-precio'))
  writeFileSync(join(root, 'marketing/02-marca.md'), note('Marca', 'marketing-marca'))
  writeFileSync(join(root, 'plain.md'), '# Plain\n\nNothing to study.\n')
  const workspaces = new Workspaces(settingsStore(join(tmp('mdl-cfg-'), 'studio.json')))
  return { h: workspaces.open(root), workspaces }
}

describe('a studied note in the file tree', () => {
  it('is listed once, as a file', () => {
    const { h, workspaces } = setup()
    const tree = workspaces.tree(h)
    expect(tree.docs.map((d) => d.path).sort()).toEqual(['marketing/01-precio.md', 'marketing/02-marca.md', 'marketing/course.md', 'plain.md'])
    expect(tree.orphanLessons).toEqual([])
    expect(tree.docs.find((d) => d.path === 'marketing/course.md')!.lessons).toEqual([])
  })
  it('shows its own cards on its row', () => {
    const { h, workspaces } = setup()
    const docs = workspaces.tree(h).docs
    expect(docs.find((d) => d.path === 'marketing/01-precio.md')).toMatchObject({ cards: 1, study: true })
    expect(docs.find((d) => d.path === 'plain.md')).toMatchObject({ cards: 0, study: false })
  })
})

describe('a studied note in Study', () => {
  it('comes up like a lesson', () => {
    const { h } = setup()
    const { items } = plan(h, {})
    expect(items.map((i) => i.cardKey).sort()).toEqual(['marketing-marca/el-precio-y-el-valor', 'marketing-precio/el-precio-y-el-valor'])
  })
  it('links back to its section', () => {
    const { h } = setup()
    const widgetId = plan(h, {}).items[0].widgetId
    expect(item(h, widgetId)).toMatchObject({ noteSection: 'el-precio-y-el-valor' })
    expect(item(h, widgetId).lessonPath).toMatch(/^marketing\/0\d-.*\.md$/)
  })
  it('keeps its id when the file moves', () => {
    const { h } = setup()
    expect(course(h).lessons.map((l) => l.id).sort()).toEqual(['marketing-marca', 'marketing-precio'])
  })
})

describe('a studied note in its course', () => {
  it('is a part of the course, in order, without the overview', () => {
    const { h } = setup()
    expect(courseInfo(h, 'marketing/course.md').lessons.map((l) => l.path)).toEqual(['marketing/01-precio.md', 'marketing/02-marca.md'])
  })
  it('can be improved like a lesson', () => {
    const { h } = setup()
    expect(improveLesson(h, 'marketing/01-precio.md').spec.recipe).toBe('lesson.improve')
    expect(() => improveLesson(h, 'plain.md')).toThrow(/No lesson/)
  })
  it('compiles the same text the reader shows', () => {
    expect(compile(note('Precio', 'marketing-precio')).diagnostics.filter((d) => !d.code.startsWith('I'))).toEqual([])
  })
})

describe('improving a note', () => {
  it('asks for tones and full explanations, not for short cards', () => {
    const { h } = setup()
    expect(improveLesson(h, 'marketing/01-precio.md', 'marks').spec.prompt).toContain('data-tone')
    expect(improveLesson(h, 'marketing/01-precio.md', 'clarity').spec.prompt).not.toContain('three sentences')
  })
})

describe('a course from a topic, with no files', () => {
  it('is written at the top of its own folder', () => {
    const { h } = setup()
    const { spec } = classCourse(h, { name: 'Marketing' })
    expect(spec.prompt).toContain('Create an MDlearn course on: Marketing')
    expect(spec.prompt).not.toContain('sources/')
    expect(spec.writeScope).toEqual([h.root])
  })
  it('reads the class files when there are some', () => {
    const { h } = setup()
    mkdirSync(join(h.root, 'sources'))
    writeFileSync(join(h.root, 'sources/plan.txt'), 'A plan')
    expect(classCourse(h, { name: 'Marketing' }).spec.prompt).toContain('from the class files in `sources/`')
  })
})

describe('searching the web', () => {
  it('is off unless the learner turned it on', () => {
    const { h } = setup()
    expect(classCourse(h, { name: 'Marketing' }).spec.webSearch).toBeFalsy()
    expect(topicCourse(h, { topic: 'Marketing' }).spec.webSearch).toBeFalsy()
    expect(classCourse(h, { name: 'Marketing', web: true }).spec.webSearch).toBe(true)
    expect(topicCourse(h, { topic: 'Marketing', web: true }).spec.webSearch).toBe(true)
  })
  it('gives a job the tool only when asked, and never lets it open a page', () => {
    expect(toolsFor().tools).not.toContain('WebSearch')
    expect(toolsFor().disallowedTools).toContain('WebSearch')
    expect(toolsFor(true).tools).toContain('WebSearch')
    expect(toolsFor(true).allowedTools).toContain('WebSearch')
    expect(toolsFor(true).disallowedTools).not.toContain('WebSearch')
    for (const on of [false, true]) {
      expect(toolsFor(on).tools).not.toContain('WebFetch')
      expect(toolsFor(on).allowedTools).not.toContain('WebFetch')
      expect(toolsFor(on).disallowedTools).toEqual(expect.arrayContaining(['WebFetch', 'Bash']))
    }
  })
})
