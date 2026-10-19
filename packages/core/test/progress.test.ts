import { describe, it, expect } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, utimesSync, readFileSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { workspace, loadProgress, saveProgress, appendProgress, progressPath, loadCourse, loadDoc, IGNORED_DIRS, walk, inRoot, searchCurriculum, scaffoldLessons, findDoc } from '../src/node'
import { normText } from '../src/checkers'

const sandbox = () => mkdtempSync(join(tmpdir(), 'mdl-progress-'))
const run = (args: string[]) => new Promise<number>((done, fail) => {
  const p = spawn(process.execPath, ['--import', 'tsx', resolve(__dirname, 'helpers/append-worker.ts'), ...args], { stdio: 'inherit' })
  p.on('exit', (code) => done(code ?? 1)); p.on('error', fail)
})

describe('progress file is safe for several writers', () => {
  it('two processes appending 200 events each keep all 400', async () => {
    const ws = workspace(sandbox())
    const codes = await Promise.all([run([ws.root, 'a', '200']), run([ws.root, 'b', '200'])])
    expect(codes).toEqual([0, 0])
    const p = loadProgress(ws)
    expect(p.reviews).toHaveLength(400)
    expect(new Set(p.reviews.map((r) => r.id)).size).toBe(400)
  }, 60_000)

  it('saveProgress merges with what another writer saved in the meantime', () => {
    const ws = workspace(sandbox())
    const mine = loadProgress(ws)
    appendProgress(ws, { attempts: [{ id: 'other', t: 1, widget: 'w', card: 'l/c', kind: 'attempt', correct: true }] })
    const merged = saveProgress(ws, { ...mine, reviews: [{ id: 'mine', t: 2, key: 'l/c', rating: 3 }] })
    expect(merged.attempts.map((a) => a.id)).toEqual(['other'])
    expect(loadProgress(ws).reviews.map((r) => r.id)).toEqual(['mine'])
    expect(loadProgress(ws).attempts.map((a) => a.id)).toEqual(['other'])
  })

  it('a stale lock left by a crashed process is recovered', () => {
    const ws = workspace(sandbox())
    mkdirSync(join(ws.learnDir, '.mdlearn'), { recursive: true })
    const lock = `${progressPath(ws)}.lock`
    writeFileSync(lock, '99999')
    const old = new Date(Date.now() - 60_000)
    utimesSync(lock, old, old)
    appendProgress(ws, { reviews: [{ id: 'x', t: 1, key: 'l/c', rating: 1 }] })
    expect(loadProgress(ws).reviews).toHaveLength(1)
    expect(JSON.parse(readFileSync(progressPath(ws), 'utf8')).version).toBe(1)
  })
})

describe('course loading', () => {
  const fixture = resolve(__dirname, 'fixtures/curriculum')
  it('reuses compiled lessons whose file (and source document) did not change', () => {
    const root = sandbox()
    cpSync(fixture, root, { recursive: true })
    const ws = workspace(root)
    const a = loadCourse(ws.learnDir)
    const b = loadCourse(ws.learnDir)
    expect(b[0].lesson).toBe(a[0].lesson)
    const later = new Date(Date.now() + 5000)
    utimesSync(a[0].path, later, later)
    expect(loadCourse(ws.learnDir)[0].lesson).not.toBe(a[0].lesson)
  })
  it('exports the shared ignore rules for watchers', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true)
    expect(walk(fixture, (f) => f.endsWith('.md')).length).toBeGreaterThan(0)
  })
})

describe('path guard', () => {
  it('accepts paths inside, rejects ../ and symlinks that escape', () => {
    const root = sandbox(), outside = sandbox()
    mkdirSync(join(root, 'learn'))
    symlinkSync(outside, join(root, 'escape'))
    expect(inRoot(root, 'learn/x.learn.md')).toBe(join(root, 'learn/x.learn.md'))
    expect(inRoot(root, '.')).toBe(root)
    expect(inRoot(root, '../x')).toBeNull()
    expect(inRoot(root, '/etc/passwd')).toBeNull()
    expect(inRoot(root, 'escape/x.md')).toBeNull()
    expect(inRoot(root, 'new/dir/not/yet/there.md')).toBe(join(root, 'new/dir/not/yet/there.md'))
  })
})
describe('curriculum helpers moved into core', () => {
  const ws = workspace(resolve(__dirname, 'fixtures/curriculum'))
  it('searchCurriculum finds sections containing every term', () => {
    const hits = searchCurriculum(ws, 'radar equation')
    expect(hits[0]).toMatchObject({ doc: expect.stringContaining('04_radar'), section: expect.any(String) })
    expect(searchCurriculum(ws, '   ')).toEqual([])
  })
  it('scaffoldLessons never regenerates an existing lesson', () => {
    const plan = scaffoldLessons(ws, findDoc(ws, '04_radar')!)
    expect(plan.length).toBeGreaterThan(0)
    for (const p of plan) expect(p.exists ? p.content : p.content?.startsWith('---')).toBe(p.exists ? null : true)
  })
})

describe('review follow-ups', () => {
  it('a lock that cannot be removed fails fast instead of spinning', () => {
    const ws = workspace(sandbox())
    mkdirSync(`${progressPath(ws)}.lock`, { recursive: true }) // a directory: openSync(wx) → EEXIST, unlink → EISDIR
    const old = new Date(Date.now() - 60_000)
    utimesSync(`${progressPath(ws)}.lock`, old, old)
    const t = Date.now()
    expect(() => appendProgress(ws, { reviews: [{ id: 'x', t: 1, key: 'l/c', rating: 1 }] })).toThrow()
    expect(Date.now() - t).toBeLessThan(2000)
  })
  it('a malformed event is rejected and never written', () => {
    const ws = workspace(sandbox())
    appendProgress(ws, { reviews: [{ id: 'ok', t: 1, key: 'l/c', rating: 3 }] })
    expect(() => appendProgress(ws, { attempts: [{ id: 'bad', t: Number.NaN, widget: 'w', card: 'l/c', kind: 'attempt' }] })).toThrow()
    expect(() => appendProgress(ws, { attempts: [{ id: 'long', t: 2, widget: 'w', card: 'l/c', kind: 'attempt', answer: 'x'.repeat(2001) }] })).toThrow()
    expect(loadProgress(ws).reviews.map((r) => r.id)).toEqual(['ok'])
    expect(loadProgress(ws).attempts).toEqual([])
  })
  it('editing the source document recompiles the companion lesson', () => {
    const root = sandbox()
    cpSync(resolve(__dirname, 'fixtures/curriculum'), root, { recursive: true })
    const ws = workspace(root)
    const a = loadCourse(ws.learnDir)
    const doc = findDoc(ws, '04_radar')!
    writeFileSync(doc, readFileSync(doc, 'utf8') + '\n')
    const later = new Date(Date.now() + 5000)
    utimesSync(doc, later, later)
    expect(loadCourse(ws.learnDir)[0].lesson).not.toBe(a[0].lesson)
  })
  it('a source: that is a folder gives E111, not a crash', () => {
    const root = sandbox()
    cpSync(resolve(__dirname, 'fixtures/curriculum'), root, { recursive: true })
    const ws = workspace(root)
    const lesson = loadCourse(ws.learnDir)[0].path
    writeFileSync(lesson, readFileSync(lesson, 'utf8').replace(/^source: .*$/m, 'source: ../'))
    const later = new Date(Date.now() + 5000)
    utimesSync(lesson, later, later)
    expect(loadCourse(ws.learnDir)[0].diagnostics.map((d) => d.code)).toContain('E111')
  })
  it('outline paths do not depend on which call loaded the document first', () => {
    const root = sandbox()
    cpSync(resolve(__dirname, 'fixtures/curriculum'), root, { recursive: true })
    const ws = workspace(root)
    loadCourse(ws.learnDir) // loads the source without a root
    expect(loadDoc(findDoc(ws, '04_radar')!, ws.root).outline.path).toBe('00_FOUNDATIONS/04_radar.md')
  })
  it('path guard: dangling symlinks and "..x" names', () => {
    const root = sandbox(), outside = sandbox()
    symlinkSync(join(outside, 'not-yet.md'), join(root, 'evil.md'))
    expect(inRoot(root, 'evil.md')).toBeNull()
    expect(existsSync(join(outside, 'not-yet.md'))).toBe(false)
    expect(inRoot(root, '..x/a.md')).toBe(join(root, '..x/a.md'))
  })
  it('normText runs in linear time on long punctuation runs', () => {
    const t = Date.now()
    normText('a' + '!'.repeat(100_000) + 'b')
    expect(Date.now() - t).toBeLessThan(200)
  })
})
