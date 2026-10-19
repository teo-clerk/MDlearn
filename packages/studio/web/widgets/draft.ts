// What the learner has entered so far for one widget, and how it becomes an answer for the server.
import type { PosedWidget, WebAnswer } from '@mdlearn/core'
import { python, type CheckResult } from '../python/runtime'

export type Draft =
  | { type: 'quiz'; picked: number[] }
  | { type: 'gaps'; values: Record<string, string> }
  | { type: 'order'; order: number[] }
  /** `run`: how the exercise's checks went when the code was last checked in the browser. */
  | { type: 'text'; text: string; run?: CheckResult }
export function emptyDraft(w: PosedWidget): Draft {
  switch (w.type) {
    case 'quiz': return { type: 'quiz', picked: [] }
    case 'cloze': case 'steps': return { type: 'gaps', values: {} }
    case 'order': return { type: 'order', order: w.items.map((_, i) => i) }
    case 'explain': return { type: 'text', text: '' }
    case 'code': return { type: 'text', text: w.starter }
  }
}
export function toAnswer(w: PosedWidget, d: Draft): WebAnswer {
  switch (w.type) {
    case 'quiz': return { type: 'quiz', picked: d.type === 'quiz' ? d.picked : [] }
    case 'cloze': case 'steps': return { type: w.type, values: w.blanks.map((b) => (d.type === 'gaps' ? d.values[b.id] ?? '' : '')) }
    case 'order': return { type: 'order', order: d.type === 'order' ? d.order : [] }
    case 'explain': case 'code': return { type: w.type, text: d.type === 'text' ? d.text : '' }
  }
}
/** True when the learner has entered enough to check. */
export function ready(w: PosedWidget, d: Draft): boolean {
  switch (d.type) {
    case 'quiz': return d.picked.length > 0
    case 'gaps': return w.type === 'cloze' || w.type === 'steps' ? w.blanks.length === 0 || w.blanks.some((b) => (d.values[b.id] ?? '').trim()) : false
    case 'order': return true
    case 'text': return d.text.trim().length > 0
  }
}
export const LETTERS = 'ABCDEFGH'

const isPython = (lang: string) => /^py(thon3?)?$/i.test(lang)
export const isRunnableCode = (w: PosedWidget): w is Extract<PosedWidget, { type: 'code' }> & { testSource: string } => w.type === 'code' && w.runnable && !!w.testSource && isPython(w.lang)
const countChecks = (src: string) => Math.max(1, (src.match(/^\s*assert\b/gm) ?? []).length)

/**
 * The answer to send: for a runnable Python exercise the learner's code is run against the checks in the
 * browser first, and the result goes with the answer. If Python is unavailable the answer goes without
 * results and the learner compares with the reference themselves.
 */
export async function prepareAnswer(w: PosedWidget, d: Draft): Promise<{ answer: WebAnswer; run?: CheckResult }> {
  const answer = toAnswer(w, d)
  if (!isRunnableCode(w) || answer.type !== 'code' || !answer.text.trim()) return { answer }
  const run = await python.check(answer.text, w.testSource)
  if (run.error && !run.total) {
    // the code itself failed (syntax error, exception): every check fails; a restart/timeout is not the learner's fault
    if (/restarted|took too long|longer than/.test(run.error)) return { answer, run }
    return { answer: { ...answer, tests: { passed: 0, total: countChecks(w.testSource) } }, run }
  }
  return { answer: { ...answer, tests: { passed: run.passed, total: Math.max(1, run.total) } }, run }
}
