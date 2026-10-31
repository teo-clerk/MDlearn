// A course can live anywhere in the folder: topic courses, chat imports and outside assistants write
// <folder>/course.md with its lessons beside it, and those lessons must be studied like any other.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { course, lessonsOfDoc, plan } from '../server/study'
import { planBundle } from '@mdlearn/core'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const lesson = (title: string, id?: string) => `---
title: ${title}
level: beginner
lang: en
goals: [Explain ${title.toLowerCase()}]
${id ? `id: ${id}\n` : ''}---

## One idea

The moon pulls the sea.

:::quiz
What pulls the sea?

- [x] The moon
  > Right.
- [ ] The wind
  > The wind makes waves, not tides.
:::
`

function folder() {
  const root = tmp('mdl-course-')
  const workspaces = new Workspaces(settingsStore(join(tmp('mdl-cfg-'), 's.json')))
  mkdirSync(join(root, 'tides'))
  writeFileSync(join(root, 'tides/course.md'), '# Tides\n\nWhy the sea moves.\n')
  writeFileSync(join(root, 'tides/01-why.learn.md'), lesson('Why tides'))
  writeFileSync(join(root, 'tides/02-when.learn.md'), lesson('When tides'))
  return { root, workspaces, h: workspaces.open(root) }
}

describe('a course outside learn/', () => {
  it('is listed under its course.md, not left out of the library', () => {
    const { workspaces, h } = folder()
    const tree = workspaces.tree(h)
    const doc = tree.docs.find((d) => d.path === 'tides/course.md')
    expect(doc?.lessons.map((l) => l.path)).toEqual(['tides/01-why.learn.md', 'tides/02-when.learn.md'])
    expect(doc?.cards).toBe(2)
    expect(tree.orphanLessons).toEqual([])
    expect(tree.totals.lessons).toBe(2)
  })
  it('counts in the list of recent folders', () => {
    const { workspaces } = folder()
    expect(workspaces.list()[0].lessons).toBe(2)
  })
  it('reaches Study and Today', () => {
    const { h } = folder()
    expect(course(h).lessons.map((l) => l.id).sort()).toEqual(['when', 'why'])
    expect(lessonsOfDoc(h, 'tides/course.md').size).toBe(2)
    expect(plan(h, { newCards: 5 }).items.length).toBe(2)
  })
  it('keeps companion lessons in learn/ as they are', () => {
    const { root, workspaces, h } = folder()
    writeFileSync(join(root, 'radar.md'), '# Radar\n\n## Range\n\nText.\n')
    mkdirSync(join(root, 'learn/radar'), { recursive: true })
    writeFileSync(join(root, 'learn/radar/01-range.learn.md'), lesson('Range'))
    const tree = workspaces.tree(h)
    expect(tree.docs.find((d) => d.path === 'radar.md')?.lessons.map((l) => l.path)).toEqual(['learn/radar/01-range.learn.md'])
    expect(tree.totals.lessons).toBe(3)
  })
  it('leaves a lesson with no course.md beside it among the loose lessons', () => {
    const { root, workspaces, h } = folder()
    mkdirSync(join(root, 'loose'))
    writeFileSync(join(root, 'loose/01-alone.learn.md'), lesson('Alone'))
    expect(workspaces.tree(h).orphanLessons.map((l) => l.path)).toEqual(['loose/01-alone.learn.md'])
  })
  it('warns when two courses share a lesson id, because their progress would mix', () => {
    const { root, workspaces, h } = folder()
    mkdirSync(join(root, 'waves'))
    writeFileSync(join(root, 'waves/01-why.learn.md'), lesson('Why waves'))
    expect(workspaces.tree(h).duplicateLessons).toEqual([{ id: 'why', paths: ['tides/01-why.learn.md', 'waves/01-why.learn.md'] }])
  })
  it('gives the lessons of a chat course an id of their own, and keeps one the chat chose', () => {
    const plan = planBundle([
      { path: 'course.md', content: '# Tides\n' },
      { path: '01-why.learn.md', content: lesson('Why') },
      { path: '02-when.learn.md', content: lesson('When', 'my-own-id') },
    ], { folder: 'Tides 2', exists: () => false })
    const [overview, why, when] = plan.files
    expect(overview.content).toBe('# Tides\n')
    expect(why.content).toMatch(/^---\nid: tides-2-why\ntitle: Why/)
    expect(when.content).toBe(lesson('When', 'my-own-id'))
  })
})
