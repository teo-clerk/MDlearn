// Mock exams over HTTP. The questions go out without their answers; the whole paper comes back at the end and
// is marked here, then recorded at once. Event ids are derived from the exam id, so sending the same paper
// twice (a retry after a dropped connection) records it once.
import { randomUUID } from 'node:crypto'
import {
  examQueue, examSummary, examOutcome, locate, redactWidget, parseWebAnswer, checkStructured, ratingFor, ratingWords, scheduleAfter, EXAM_KINDS,
  type ExamAnswer, type WebAnswer, type Checked,
} from '@mdlearn/core'
import { appendProgress, loadGoals, type AttemptEvent } from '@mdlearn/core/node'
import { course, progressOf, lessonsOfDoc, answerText } from './study.js'
import type { Handle } from './workspaces.js'
import { UserError } from './workspaces.js'
import type { ExamPlan, ExamResult } from '../shared/types.js'

export function examPlan(h: Handle, o: { count: number; doc?: string; lesson?: string }): ExamPlan {
  const { lessons, pathOf } = course(h)
  const p = progressOf(h)
  const only = o.doc ? lessonsOfDoc(h, o.doc) : o.lesson ? new Set([o.lesson]) : undefined
  const id = randomUUID()
  const { items, available } = examQueue(lessons, p.reviews, { count: o.count, seed: id, lessons: only, suspended: new Set(loadGoals(h.ws).suspended), attempts: p.attempts })
  return {
    id, requested: o.count, available,
    items: items.map((item) => {
      const loc = locate(lessons, item.widgetId)!
      return { item, widget: redactWidget(loc.widget), lessonPath: pathOf.get(item.lessonId) ?? '' }
    }),
  }
}

export interface PaperAnswer { widgetId: string; answer: unknown; sure?: boolean; ms: number }
export function examGrade(h: Handle, examId: string, paper: PaperAnswer[]): ExamResult {
  const { lessons } = course(h)
  const now = Date.now()
  const marked = paper.flatMap((a) => {
    const loc = locate(lessons, a.widgetId)
    if (!loc || !(EXAM_KINDS as readonly string[]).includes(loc.widget.type)) return []
    // not answered (time ran out): marked wrong and shown with its answer, but nothing is recorded
    const given = a.answer === null ? null : parseWebAnswer(loc.widget, a.answer)
    const checked = checkStructured(loc, given ?? { type: 'skip' }, lessons)
    const skipped = given?.type === 'skip'
    const ex: ExamAnswer = { widgetId: a.widgetId, cardKey: `${loc.lesson.id}/${loc.card.id}`, lessonId: loc.lesson.id, lessonTitle: loc.lesson.title,
      correct: given ? checked.correct === true : null, partial: checked.partial, skipped, ...(a.sure !== undefined && !skipped ? { sure: a.sure } : {}), ms: a.ms }
    return [{ ex, checked, given }]
  })
  if (!marked.length) throw new UserError('not-found', 'None of these questions exist any more (the lessons were edited).')
  const done = marked.filter((m) => m.given)
  const attempts: AttemptEvent[] = done.map(({ ex, checked, given }) => ({ id: `exam:${examId}:${ex.widgetId}`, t: now, widget: ex.widgetId, card: ex.cardKey,
    kind: ex.skipped ? 'reveal' : 'attempt', ...(checked.correct !== null ? { correct: checked.correct } : {}), ...(ex.sure !== undefined ? { sure: ex.sure } : {}), answer: answerText(given as WebAnswer).slice(0, 2000) }))
  const reviews = done.map(({ ex }) => ({ id: `exam:${examId}:${ex.cardKey}`, t: now, key: ex.cardKey, rating: ratingFor(examOutcome(ex)) }))
  const saved = done.length ? appendProgress(h.ws, { attempts, reviews }) : null
  return {
    summary: examSummary(marked.map((m) => m.ex)),
    results: marked.map(({ ex, checked, given }): ExamResult['results'][number] => {
      const review = given ? reviews.find((r) => r.key === ex.cardKey) : undefined
      const next = review && saved ? scheduleAfter(saved.reviews, ex.cardKey) : null
      return { ...ex, checked: checked as Checked, ...(review ? { rating: review.rating as 1 | 2 | 3, word: ratingWords(review.rating as 1 | 2 | 3).word } : {}), ...(next ? { next: next.due } : {}) }
    }),
  }
}
