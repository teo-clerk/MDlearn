// A course someone has started: its lessons and progress, their order, and the cards an edit left behind.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { askable, carriedOver, courseChanges, deriveCards, lostCards, pinIds, retrievability, type Lesson } from '@mdlearn/core'
import { appendProgress, inRoot, lessonOfDoc, loadGoals, loadLessons, saveGoals } from '@mdlearn/core/node'
import { progressOf } from './study.js'
import { UserError, type Handle } from './workspaces.js'
import type { CourseInfo } from '../shared/types.js'

const posix = (p: string) => p.split(sep).join('/')
const NUMBER = /^\d+[-_]/
interface CourseLesson { path: string; abs: string; lesson: Lesson }
const keysOf = (l: Lesson) => l.cards.filter((c) => c.blocks.some(askable)).map((c) => `${l.id}/${c.id}`)

export function courseDoc(h: Handle, doc: string): string {
  const abs = inRoot(h.root, doc)
  if (!abs || basename(abs).toLowerCase() !== 'course.md' || !existsSync(abs)) throw new UserError('not-found', `No document ${doc}.`)
  return abs
}
/** The lessons of a `course.md`, in file-name order, which is the order of the course. */
export function courseLessons(h: Handle, doc: string): CourseLesson[] {
  const abs = courseDoc(h, doc)
  return loadLessons(h.ws).filter((l) => l.lesson && lessonOfDoc(h.ws, abs, l.path))
    .map((l) => ({ path: posix(relative(h.root, l.path)), abs: l.path, lesson: l.lesson! })).sort((a, b) => a.path.localeCompare(b.path))
}
const allLessons = (h: Handle) => loadLessons(h.ws).flatMap((l) => (l.lesson ? [l.lesson] : []))

export function courseInfo(h: Handle, doc: string): CourseInfo {
  const p = progressOf(h), goals = loadGoals(h.ws), now = new Date(), fsrs = deriveCards(p.reviews)
  const paused = new Set(goals.suspended)
  const lessons = courseLessons(h, doc).map(({ path, lesson }) => {
    const keys = keysOf(lesson), seen = keys.flatMap((k) => fsrs.get(k) ?? [])
    return {
      path, title: lesson.title, cards: keys.length, seen: seen.length,
      memory: seen.length ? seen.reduce((n, c) => n + retrievability(c, now), 0) / seen.length : null,
      paused: !!keys.length && keys.every((k) => paused.has(k)), numbered: NUMBER.test(basename(path)),
    }
  })
  return { doc, lessons, lost: lostCards(allLessons(h), p.reviews, new Set(goals.settled)) }
}

/** Swap two paths; either may be missing. */
function swap(a: string, b: string, aTo: string, bTo: string) {
  const parked = `${a}.${randomUUID()}.moving`
  if (existsSync(a)) renameSync(a, parked)
  if (existsSync(b)) renameSync(b, bTo)
  if (existsSync(parked)) renameSync(parked, aTo)
}
/** Move a lesson up or down by swapping its number with its neighbour's. Lesson ids ignore the number, so progress stays. */
export function moveLesson(h: Handle, doc: string, lessonPath: string, by: -1 | 1) {
  const order = courseLessons(h, doc), i = order.findIndex((l) => l.path === lessonPath)
  if (i < 0) throw new UserError('not-found', `No lesson ${lessonPath}.`)
  const a = order[i], b = order[i + by]
  if (!b) return
  const numberOf = (l: CourseLesson) => NUMBER.exec(basename(l.path))?.[0]
  const na = numberOf(a), nb = numberOf(b)
  if (!na || !nb) throw new UserError('no-number', 'This lesson has no number in its file name, so its name sets its place.')
  const aName = nb + basename(a.path).slice(na.length), bName = na + basename(b.path).slice(nb.length)
  const aTo = join(dirname(a.abs), aName), bTo = join(dirname(b.abs), bName)
  if ((aTo !== b.abs && existsSync(aTo)) || (bTo !== a.abs && existsSync(bTo))) throw new UserError('exists', 'Another file already has that name, so this lesson can\'t move.')
  swap(a.abs, b.abs, aTo, bTo)
  const notes = (p: string) => join(h.root, '.mdlearn', 'notes', `${posix(relative(h.root, p))}.json`)
  swap(notes(a.abs), notes(b.abs), notes(aTo), notes(bTo))
  const overview = courseDoc(h, doc), text = readFileSync(overview, 'utf8')
  const nameA = basename(a.path), nameB = basename(b.path)
  const linked = text.replace(new RegExp(`(?<![\\w.-])(?:${escape(nameA)}|${escape(nameB)})(?![\\w.-])`, 'g'), (m) => (m === nameA ? aName : bName))
  if (linked !== text) writeFileSync(overview, linked)
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function pauseLesson(h: Handle, doc: string, lessonPath: string, paused: boolean) {
  const found = courseLessons(h, doc).find((l) => l.path === lessonPath)
  if (!found) throw new UserError('not-found', `No lesson ${lessonPath}.`)
  const goals = loadGoals(h.ws), keys = new Set(keysOf(found.lesson))
  return saveGoals(h.ws, { ...goals, suspended: paused ? [...new Set([...goals.suspended, ...keys])] : goals.suspended.filter((k) => !keys.has(k)) })
}

const settle = (h: Handle, key: string) => {
  const goals = loadGoals(h.ws)
  saveGoals(h.ws, { ...goals, settled: [...new Set([...goals.settled, key])] })
}
/** Give a studied card's history to the card it became, and write that card's id down so it can't happen twice. */
export function reconnect(h: Handle, from: string, to: string) {
  const p = progressOf(h)
  if (!p.reviews.some((r) => r.key === from)) throw new UserError('not-found', 'No history for that card.')
  if (p.reviews.some((r) => r.key === to)) throw new UserError('has-history', 'That card already has its own history.')
  const target = loadLessons(h.ws).find((l) => l.lesson?.cards.some((c) => `${l.lesson!.id}/${c.id}` === to))
  if (!target) throw new UserError('not-found', 'That card no longer exists.')
  const source = readFileSync(target.path, 'utf8'), pinned = pinIds(source, target.path, new Set([to.slice(target.lesson!.id.length + 1)]))
  if (pinned !== source) writeFileSync(target.path, pinned)
  appendProgress(h.ws, { reviews: carriedOver(p.reviews, from, to) }, { keepExisting: true })
  settle(h, from)
}
/** Stop asking about a card that is really gone. Its reviews stay in the log. */
export const letGo = (h: Handle, key: string) => settle(h, key)

/** What the lessons of a course look like to the AI that changes them, and the pins to write first. */
export function studiedState(h: Handle, doc: string) {
  const lessons = courseLessons(h, doc), p = progressOf(h), fsrs = deriveCards(p.reviews), now = new Date()
  const rows = lessons.map(({ path, abs, lesson }) => {
    const cards = lesson.cards.map((c) => ({ id: c.id, title: c.title, state: fsrs.get(`${lesson.id}/${c.id}`) }))
    const studied = cards.filter((c) => c.state)
    const hardest = [...studied].filter((c) => c.state!.lapses > 0).sort((a, b) => b.state!.lapses - a.state!.lapses).slice(0, 5)
    const memory = studied.length ? Math.round(100 * studied.reduce((n, c) => n + retrievability(c.state!, now), 0) / studied.length) : null
    return {
      abs, ids: new Set(studied.map((c) => c.id)),
      line: `- ${path}: ${lesson.cards.length} cards, ${studied.length} studied${memory === null ? '' : `, recall ${memory}%`}${hardest.length ? `. Hardest: ${hardest.map((c) => JSON.stringify(c.title.slice(0, 80))).join(', ')}` : ''}`,
    }
  })
  return { rows, before: lessons.map((l) => l.lesson) }
}
export const changesSince = (h: Handle, doc: string, before: Lesson[]) => courseChanges(before, courseLessons(h, doc).map((l) => l.lesson))
