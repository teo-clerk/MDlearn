// What the companion knows about your studies: what the Progress page shows, in a few lines of text. It stays on this
// computer unless Claude is the one answering.
import { dirname } from 'node:path'
import { loadGoals } from '@mdlearn/core/node'
import { progressReport } from '../study.js'
import type { Handle } from '../workspaces.js'

const MAX_LESSONS = 30, MAX_DEADLINES = 5, MAX_WEAK_CARDS = 8

/** The lessons of the course you are in, or those that need you most. Empty when there is nothing to tell. */
export function studyRecord(h: Handle, doc?: string): string {
  let r: ReturnType<typeof progressReport>, deadlines: ReturnType<typeof loadGoals>['deadlines']
  try { r = progressReport(h); deadlines = loadGoals(h.ws).deadlines } catch { return '' } // a damaged progress file should not stop a question
  if (!r.lessons.length) return ''
  const folder = doc ? dirname(doc) : null
  const here = r.lessons.filter((l) => dirname(l.path) === folder)
  const neediest = [...r.lessons].sort((a, b) => b.due - a.due || (a.predictedRecall ?? 1) - (b.predictedRecall ?? 1))
  const shown = (here.length ? here : neediest).slice(0, MAX_LESSONS)
  const line = (l: (typeof shown)[number]) => `- ${l.title}: ${l.cards} cards, ${l.seen} seen, ${l.due} due${l.predictedRecall === null ? '' : `, ${Math.round(l.predictedRecall * 100)}% predicted recall`}`
  const weak = r.confidence.overconfident.slice(0, MAX_WEAK_CARDS).map((c) => `${c.cardTitle} (${c.lessonTitle})`)
  return [
    `${r.totals.cards} cards in all, ${r.totals.seen} seen, ${r.totals.due} due now.${r.nextDueText ? ` Next due: ${r.nextDueText}.` : ''}`,
    r.lessons.length > shown.length ? `Lessons (${shown.length} of ${r.lessons.length}):` : 'Lessons:',
    ...shown.map(line),
    ...(deadlines.length ? [`Deadlines: ${deadlines.slice(0, MAX_DEADLINES).map((d) => `${d.label ?? 'exam'} on ${d.date}`).join('; ')}`] : []),
    ...(weak.length ? [`Cards they felt sure of but got wrong: ${weak.join('; ')}`] : []),
  ].join('\n')
}
