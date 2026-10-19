import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { workspace, loadGoals, saveGoals, goalsPath, loadCourse, DEFAULT_GOALS } from '../src/node'
import { studyQueue } from '../src/tutor'
import type { Lesson } from '../src/ast'

const sandbox = () => mkdtempSync(join(tmpdir(), 'mdl-goals-'))
describe('goals file', () => {
  it('starts with sensible defaults and round-trips', () => {
    const ws = workspace(sandbox())
    expect(loadGoals(ws)).toEqual(DEFAULT_GOALS)
    saveGoals(ws, { ...DEFAULT_GOALS, dailyGoal: 35, deadlines: [{ scope: '', date: '2026-11-15', label: 'ESA interview' }], suspended: ['l/c'] })
    const g = loadGoals(ws)
    expect(g).toMatchObject({ dailyGoal: 35, suspended: ['l/c'] })
    expect(g.deadlines[0]).toEqual({ scope: '', date: '2026-11-15', label: 'ESA interview' })
  })
  it('refuses a malformed save and a damaged file, leaving the old file alone', () => {
    const ws = workspace(sandbox())
    saveGoals(ws, { ...DEFAULT_GOALS, dailyGoal: 10 })
    expect(() => saveGoals(ws, { ...DEFAULT_GOALS, deadlines: [{ scope: '', date: 'next week' }] })).toThrow()
    expect(() => saveGoals(ws, { ...DEFAULT_GOALS, dailyGoal: 0 })).toThrow()
    expect(loadGoals(ws).dailyGoal).toBe(10)
    mkdirSync(join(ws.learnDir, '.mdlearn'), { recursive: true })
    writeFileSync(goalsPath(ws), '{ nope')
    expect(() => loadGoals(ws)).toThrow(/goals/)
  })
})

describe('suspended cards leave the queue', () => {
  const root = resolve(__dirname, 'fixtures/curriculum')
  const lessons = loadCourse(join(root, 'learn')).map((l) => l.lesson).filter((l): l is Lesson => !!l)
  it('are never offered, whatever the scope', () => {
    const all = studyQueue(lessons, [], { limit: 50, newCards: 50 })
    expect(all.length).toBeGreaterThan(1)
    const hidden = new Set([all[0].cardKey])
    const q = studyQueue(lessons, [], { limit: 50, newCards: 50, suspended: hidden })
    expect(q.map((i) => i.cardKey)).not.toContain(all[0].cardKey)
    expect(q).toHaveLength(all.length - 1)
  })
})
void cpSync
