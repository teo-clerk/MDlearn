// Mock exam: questions on cards you have already studied, sampled across lessons and interleaved, answered
// with no feedback until the end (so it feels like the real thing), then marked and recorded with the same
// rating table as a study session. Pure: the Studio server and the tests share it.
import type { Lesson } from '../ast.js'
import { askable, cardKey, interleave, type QueueItem, type Outcome } from '../tutor.js'
import { deriveCards, retrievability, type ReviewEvent } from './srs.js'
import { seededOrder } from '../seed.js'

/** Question kinds an exam asks: marked on the server in one go, with no feedback move by move (games give some). */
export const EXAM_KINDS = ['quiz', 'cloze', 'order', 'steps'] as const
export const MAX_EXAM_QUESTIONS = 50
const isExamKind = (t: string): t is (typeof EXAM_KINDS)[number] => (EXAM_KINDS as readonly string[]).includes(t)

export interface ExamOptions {
  count: number
  /** Makes the sample repeatable (the exam id). */
  seed: string
  now?: number
  /** Only these lessons (a document's companion lessons, or one lesson). */
  lessons?: ReadonlySet<string>
  suspended?: ReadonlySet<string>
  attempts?: { widget: string }[]
}
/** Up to `count` questions, one per studied card, a fair random sample across lessons; `available` is how many cards could be asked. */
export function examQueue(lessons: Lesson[], reviews: ReviewEvent[], o: ExamOptions): { items: QueueItem[]; available: number } {
  const now = new Date(o.now ?? Date.now())
  const cards = deriveCards(reviews)
  const used = new Map<string, number>()
  for (const a of o.attempts ?? []) used.set(a.widget, (used.get(a.widget) ?? 0) + 1)
  const pool: QueueItem[] = []
  for (const lesson of lessons) {
    if (o.lessons && !o.lessons.has(lesson.id)) continue
    for (const card of lesson.cards) {
      const key = cardKey(lesson, card), state = cards.get(key)
      if (!state || o.suspended?.has(key)) continue
      const widgets = card.blocks.filter(askable).filter((w) => isExamKind(w.type))
      if (!widgets.length) continue
      // the question you have answered least, so a card with several questions is not always asked the same way
      const w = seededOrder(widgets, `${o.seed}/${key}`).sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0))[0]
      pool.push({ cardKey: key, lessonId: lesson.id, lessonTitle: lesson.title, cardId: card.id, cardTitle: card.title, widgetId: w.id, kind: w.type, reason: 'due',
        retrievability: Math.round(retrievability(state, now) * 1000) / 1000, dueSince: state.due.toISOString() })
    }
  }
  const count = Math.max(1, Math.min(o.count, MAX_EXAM_QUESTIONS))
  return { items: interleave(seededOrder(pool, o.seed).slice(0, count)), available: pool.length }
}

/** One question's outcome. `correct: null` = not answered (time ran out): marked wrong, but not recorded. */
export interface ExamAnswer { widgetId: string; cardKey: string; lessonId: string; lessonTitle: string; correct: boolean | null; partial?: boolean; skipped?: boolean; sure?: boolean; ms: number }
/** The rating an answered exam question records: the study table (a skip is "again", "not sure" caps at "shaky"). */
export const examOutcome = (a: ExamAnswer): Outcome => ({ correct: a.correct === true && !a.skipped, partial: !!a.partial, revealed: !!a.skipped, ...(a.sure !== undefined ? { sure: a.sure } : {}) })

export function examSummary(answers: ExamAnswer[]) {
  const right = answers.filter((a) => a.correct === true && !a.skipped).length
  const answered = answers.filter((a) => a.correct !== null)
  const byLesson = new Map<string, { lessonId: string; title: string; right: number; total: number }>()
  for (const a of answers) {
    const l = byLesson.get(a.lessonId) ?? { lessonId: a.lessonId, title: a.lessonTitle, right: 0, total: 0 }
    byLesson.set(a.lessonId, { ...l, total: l.total + 1, right: l.right + (a.correct === true && !a.skipped ? 1 : 0) })
  }
  const ms = answers.reduce((s, a) => s + a.ms, 0)
  return {
    total: answers.length, answered: answered.length, right,
    score: answers.length ? right / answers.length : 0,
    ms, msPerQuestion: answered.length ? Math.round(answered.reduce((s, a) => s + a.ms, 0) / answered.length) : 0,
    sureWrong: answers.filter((a) => a.sure === true && a.correct === false).length,
    // the weakest lessons first: where to go back to
    lessons: [...byLesson.values()].sort((x, y) => x.right / x.total - y.right / y.total || y.total - x.total),
  }
}
export type ExamSummary = ReturnType<typeof examSummary>
