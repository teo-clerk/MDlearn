// Session reducer — pure, framework-agnostic, serialisable (persist it to resume a lesson).
import { isWidget, type Lesson } from '../ast.js'

export type Rating = 1 | 2 | 3 // FSRS Again | Hard | Good (Easy is never assigned automatically)
export type Help = 'none' | 'author-hint' | 'look-back' | 'answer-hint'
/** shaky = succeeded with doubt or partially ("Not sure", typo accepted, some idea units missing). */
export interface WidgetRun { failed: boolean; shaky: boolean; help: Help; done: boolean; revealed: boolean }
export type Entry = { kind: 'card'; cardId: string } | { kind: 'retry'; cardId: string; widgetId: string }
export interface Session {
  lessonId: string
  queue: Entry[]; pos: number
  phase: 'expose' | 'check' | 'complete'
  runs: Record<string, WidgetRun>
  deferred: string[] // missed widgets with no room for a spaced retry → first review
}
export type Event =
  | { type: 'NEXT' }
  | { type: 'LOOK_BACK' }
  | { type: 'HINT'; widgetId: string; revealsAnswer: boolean }
  | { type: 'ATTEMPT'; widgetId: string; correct: boolean; sure?: boolean; partial?: boolean; final?: boolean }
  | { type: 'REVEAL'; widgetId: string }
  | { type: 'SKIP'; widgetId: string }

const MIN_GAP = 2 // a retry needs ≥2 other items in between (spacing within the session)
const rank: Record<Help, number> = { none: 0, 'author-hint': 1, 'look-back': 1, 'answer-hint': 2 }

export function start(lesson: Lesson): Session {
  return { lessonId: lesson.id, queue: lesson.cards.map((c) => ({ kind: 'card', cardId: c.id })), pos: 0, phase: phaseFor(lesson, { kind: 'card', cardId: lesson.cards[0]?.id }), runs: {}, deferred: [] }
}
/** Widgets the learner must attempt on an entry. A fully worked `steps` (no blanks) is exposition. */
const widgetsOf = (lesson: Lesson, e: Entry): string[] =>
  e.kind === 'retry' ? [retryKey(e.widgetId)] : (lesson.cards.find((c) => c.id === e.cardId)?.blocks ?? [])
    .filter((b) => isWidget(b) && !(b.type === 'steps' && b.blanks.length === 0))
    .map((b) => (b as { id: string }).id)
/** A retry is a real check with its own run, so the first attempt's history stays intact. */
const retryKey = (widgetId: string) => `${widgetId}#retry`
function phaseFor(lesson: Lesson, e: Entry | undefined): Session['phase'] {
  if (!e?.cardId) return 'complete'
  if (e.kind === 'retry') return 'check'
  const blocks = lesson.cards.find((c) => c.id === e.cardId)!.blocks
  const hasProse = blocks.some((b) => b.type === 'prose' || b.type === 'callout' || ['plot', 'formula', 'animate', 'sim', 'html', 'video'].includes(b.type))
  return hasProse ? 'expose' : 'check'
}
const run = (s: Session, id: string): WidgetRun => s.runs[id] ?? { failed: false, shaky: false, help: 'none', done: false, revealed: false }

export function reduce(lesson: Lesson, s: Session, ev: Event): Session {
  if (s.phase === 'complete') return s
  const entry = s.queue[s.pos]
  const patch = (id: string, p: Partial<WidgetRun>): Session => ({ ...s, runs: { ...s.runs, [id]: { ...run(s, id), ...p } } })
  const key = (widgetId: string) => (entry.kind === 'retry' && entry.widgetId === widgetId ? retryKey(widgetId) : widgetId)
  switch (ev.type) {
    case 'NEXT': {
      const ids = widgetsOf(lesson, entry)
      if (s.phase === 'expose' && ids.length) return { ...s, phase: 'check' } // exposition collapses before the check
      if (s.phase === 'check' && ids.some((id) => !run(s, id).done)) return s // attempt-gated, not correctness-gated
      const pos = s.pos + 1
      return { ...s, pos, phase: phaseFor(lesson, s.queue[pos]) }
    }
    case 'LOOK_BACK': {
      if (s.phase !== 'check') return s
      let next: Session = s
      for (const id of widgetsOf(lesson, entry)) if (!run(s, id).done && rank[run(s, id).help] < 1) next = { ...next, runs: { ...next.runs, [id]: { ...run(next, id), help: 'look-back' } } }
      return next
    }
    case 'HINT': {
      const k = key(ev.widgetId), r = run(s, k)
      const help: Help = ev.revealsAnswer ? 'answer-hint' : 'author-hint'
      return patch(k, { help: rank[help] > rank[r.help] ? help : r.help })
    }
    case 'ATTEMPT': {
      const k = key(ev.widgetId), r = run(s, k)
      if (r.done) return s
      const firstMiss = !ev.correct && !r.failed
      let next = patch(k, { failed: r.failed || !ev.correct, shaky: r.shaky || ev.sure === false || !!ev.partial, done: ev.correct || !!ev.final })
      if (firstMiss && entry.kind === 'card') next = scheduleRetry(next, entry.cardId, ev.widgetId)
      return next
    }
    case 'REVEAL': case 'SKIP': {
      const k = key(ev.widgetId), r = run(s, k)
      let next = patch(k, { revealed: true, done: true })
      if (!r.failed && entry.kind === 'card') next = scheduleRetry(next, entry.cardId, ev.widgetId)
      return next
    }
  }
}
function scheduleRetry(s: Session, cardId: string, widgetId: string): Session {
  const at = s.pos + 1 + MIN_GAP
  if (at > s.queue.length) return { ...s, deferred: [...s.deferred, widgetId] }
  const queue = [...s.queue]; queue.splice(at, 0, { kind: 'retry', cardId, widgetId })
  return { ...s, queue }
}

/** Event → FSRS rating (shared table with PEDAGOGICAL_SPEC). */
export function rate(r: WidgetRun): Rating {
  if (r.failed || r.revealed || r.help === 'answer-hint') return 1
  if (r.shaky || r.help !== 'none') return 2
  return 3
}
/** One FSRS item per card (= knowledge component): the weakest widget decides. Call at `complete`;
 *  a widget never finished counts as skipped (Again). Retries do not raise the rating of a first miss. */
export function cardRatings(lesson: Lesson, s: Session): Record<string, Rating> {
  const out: Record<string, Rating> = {}
  for (const c of lesson.cards) {
    const ids = widgetsOf(lesson, { kind: 'card', cardId: c.id })
    if (ids.length) out[c.id] = Math.min(...ids.map((id) => (run(s, id).done ? rate(run(s, id)) : 1))) as Rating
  }
  return out
}
