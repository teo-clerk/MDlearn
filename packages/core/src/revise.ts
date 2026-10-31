// Changing a course someone has started. Progress belongs to `lessonId/cardId`, and without an explicit id a card's id is
// its title's slug, so renaming a card would silently restart it. pinIds writes the ids down before anything is edited;
// courseChanges says what an edit did; lostCards finds history left behind anyway; carriedOver moves it to the new card.
import { CARD_ID, compile } from './compile.js'
import type { Lesson } from './ast.js'
import type { ReviewEvent } from './learn/srs.js'

const LESSON_ID = /^[a-z0-9][a-z0-9-]*$/ // what frontmatter accepts; a file name can be anything

/** A heading line without its closing `##`. By hand, because a regex here is quadratic on a long run of spaces. */
function headingText(line: string): string {
  const text = line.trimEnd()
  let end = text.length
  while (end > 0 && text[end - 1] === '#') end--
  return end < text.length && /\s/.test(text[end - 1] ?? '') ? text.slice(0, end).trimEnd() : text
}

/** The lesson with its ids written out: `## Title {#id}` on each card (or on `only`), and `id:` in the frontmatter. */
export function pinIds(source: string, path: string, only?: ReadonlySet<string>): string {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  const { lesson, cardLines } = compile(source.slice(bom.length), { path })
  if (!lesson) return source
  const lines = source.slice(bom.length).split('\n')
  lesson.cards.forEach((card, i) => {
    const n = cardLines[i] - 1, line = lines[n]
    if (!card.id || !/^ {0,3}#/.test(line) || CARD_ID.test(headingText(line)) || (only && !only.has(card.id))) return
    lines[n] = `${headingText(line)} {#${card.id}}${line.endsWith('\r') ? '\r' : ''}`
  })
  const text = lines.join('\n')
  const front = /^---(\r?\n)([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(text)
  if (!LESSON_ID.test(lesson.id) || (front && /^id\s*:/im.test(front[2]))) return bom + text
  if (!front) return `${bom}---\nid: ${lesson.id}\n---\n\n${text}`
  return `${bom}---${front[1]}id: ${lesson.id}${front[1]}${text.slice(3 + front[1].length)}`
}

export interface CardRef { key: string; title: string }
const refs = (lessons: Lesson[]): CardRef[] => lessons.flatMap((l) => l.cards.map((c) => ({ key: `${l.id}/${c.id}`, title: c.title })))

export interface CourseChanges { kept: number; added: CardRef[]; removed: CardRef[] }
export function courseChanges(before: Lesson[], after: Lesson[]): CourseChanges {
  const was = refs(before), now = refs(after)
  const hadKey = new Set(was.map((c) => c.key)), hasKey = new Set(now.map((c) => c.key))
  return { kept: now.filter((c) => hadKey.has(c.key)).length, added: now.filter((c) => !hadKey.has(c.key)), removed: was.filter((c) => !hasKey.has(c.key)) }
}

export interface LostCard { key: string; title: string; reviews: number; last: number; matches: CardRef[] }
const words = (slug: string) => new Set(slug.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))
const overlap = (a: Set<string>, b: Set<string>) => {
  const shared = [...a].filter((w) => b.has(w)).length
  return shared / Math.max(1, new Set([...a, ...b]).size)
}
const MATCHES = 5

/** Cards with reviews that no lesson has any more, and the unstudied cards most likely to be them. */
export function lostCards(lessons: Lesson[], reviews: ReviewEvent[], settled: ReadonlySet<string>): LostCard[] {
  const cards = refs(lessons), exists = new Set(cards.map((c) => c.key))
  const counts = new Map<string, { reviews: number; last: number }>()
  for (const r of reviews) {
    const c = counts.get(r.key) ?? { reviews: 0, last: 0 }
    counts.set(r.key, { reviews: c.reviews + 1, last: Math.max(c.last, r.t) })
  }
  const unstudied = cards.filter((c) => !counts.has(c.key))
  return [...counts].filter(([key]) => !exists.has(key) && !settled.has(key)).map(([key, c]) => {
    const [lessonId, cardId = ''] = key.split('/')
    const lost = words(cardId)
    const score = (m: CardRef) => overlap(lost, words(m.title)) + (m.key.startsWith(`${lessonId}/`) ? 0.01 : 0)
    return {
      key, title: cardId.replace(/-/g, ' '), ...c,
      matches: unstudied.filter((m) => score(m) > 0.01).sort((a, b) => score(b) - score(a)).slice(0, MATCHES),
    }
  })
}
