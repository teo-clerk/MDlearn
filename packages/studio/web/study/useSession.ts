// The study coach as a state machine, the same flow as `mdlearn review`:
// plan → card → answer (hints allowed) → "were you sure?" → verdict in words → solid/shaky/again with the
// next review → … → revisit what you missed (practice only) → summary with sections to reread.
import { useCallback, useReducer, useRef } from 'react'
import type { Checked, MdNode, WebAnswer, Outcome, ReadRef } from '@mdlearn/core'
import { studyApi } from '../api/queries'
import type { StudyPlan, StudyItem, RecordResponse } from '../../shared/types'
import { t } from '../i18n'

export type Phase = 'loading' | 'empty' | 'answer' | 'sure' | 'self' | 'feedback' | 'summary' | 'error'
export interface CardResult { widgetId: string; cardKey: string; title: string; rating: 1 | 2 | 3; reads: ReadRef[]; reason: 'due' | 'new'; lessonPath: string }
export interface SessionState {
  phase: Phase
  plan: StudyPlan | null
  /** First pass index, or position in the revisit list. */
  index: number
  revisit: boolean
  revisitList: CardResult[]
  item: StudyItem | null
  answer: WebAnswer | null
  hints: MdNode[][]
  checked: Checked | null
  recorded: RecordResponse | null
  results: CardResult[]
  error: string | null
  startedAt: number
}
type Action =
  | { type: 'plan'; plan: StudyPlan } | { type: 'item'; item: StudyItem } | { type: 'hint'; hint: MdNode[] }
  | { type: 'answered'; answer: WebAnswer; needsSure: boolean } | { type: 'checked'; checked: Checked; needsSelf: boolean }
  | { type: 'recorded'; recorded: RecordResponse | null; result: CardResult | null } | { type: 'next' } | { type: 'error'; message: string }
const initial = (): SessionState => ({ phase: 'loading', plan: null, index: 0, revisit: false, revisitList: [], item: null, answer: null, hints: [], checked: null, recorded: null, results: [], error: null, startedAt: Date.now() })

function reducer(s: SessionState, a: Action): SessionState {
  switch (a.type) {
    case 'plan': return { ...s, plan: a.plan, phase: a.plan.items.length ? 'loading' : 'empty' }
    case 'item': return { ...s, item: a.item, answer: null, hints: [], checked: null, recorded: null, phase: 'answer' }
    case 'hint': return { ...s, hints: [...s.hints, a.hint] }
    case 'answered': return { ...s, answer: a.answer, phase: a.needsSure ? 'sure' : 'loading' }
    case 'checked': return { ...s, checked: a.checked, phase: a.needsSelf ? 'self' : 'feedback' }
    case 'recorded': return { ...s, recorded: a.recorded, results: a.result ? [...s.results, a.result] : s.results, phase: 'feedback' }
    case 'next': {
      // the next card starts from nothing: no leftover question, answer or result
      const fresh = { item: null, answer: null, checked: null, recorded: null, hints: [] }
      if (!s.revisit) {
        const next = s.index + 1
        if (next < (s.plan?.items.length ?? 0)) return { ...s, ...fresh, index: next, phase: 'loading' }
        const missed = s.results.filter((r) => r.rating === 1)
        return missed.length ? { ...s, ...fresh, revisit: true, revisitList: missed, index: 0, phase: 'loading' } : { ...s, ...fresh, phase: 'summary' }
      }
      const next = s.index + 1
      return next < s.revisitList.length ? { ...s, ...fresh, index: next, phase: 'loading' } : { ...s, ...fresh, phase: 'summary' }
    }
    case 'error': return { ...s, phase: 'error', error: a.message }
  }
}

const autoGraded = (k: string, a: WebAnswer) => ['quiz', 'cloze', 'order', 'steps'].includes(k) || (a.type === 'code' && !!a.tests)

export function useStudySession(ws: string) {
  const [state, dispatch] = useReducer(reducer, undefined, initial)
  const sure = useRef<boolean | undefined>(undefined)
  const fail = (e: unknown) => dispatch({ type: 'error', message: e instanceof Error ? e.message : t('Something went wrong.') })

  const loadItem = useCallback(async (widgetId: string) => {
    try { dispatch({ type: 'item', item: await studyApi.item(ws, widgetId) }) } catch (e) { fail(e) }
  }, [ws])
  const start = useCallback(async (o: { scope?: string; doc?: string; limit?: number; newCards?: number; due?: boolean; widgets?: string[] }) => {
    try {
      const plan = await studyApi.plan(ws, o)
      dispatch({ type: 'plan', plan })
      if (plan.items.length) await loadItem(plan.items[0].widgetId)
    } catch (e) { fail(e) }
  }, [ws, loadItem])

  /** Ask for the next author hint. Hints cap the rating at "shaky". */
  const askHint = useCallback(async () => {
    if (!state.item) return null
    try {
      const r = await studyApi.hint(ws, state.item.widget.id, state.hints.length)
      if (r.hint) dispatch({ type: 'hint', hint: r.hint })
      return r.hint
    } catch (e) { fail(e); return null }
  }, [ws, state.item, state.hints.length])

  const grade = useCallback(async (answer: WebAnswer, isSure: boolean | undefined) => {
    if (!state.item) return
    sure.current = isSure
    try {
      const { checked } = await studyApi.check(ws, { widgetId: state.item.widget.id, answer, ...(isSure !== undefined ? { sure: isSure } : {}), practice: state.revisit })
      const needsSelf = checked.correct === null
      dispatch({ type: 'checked', checked, needsSelf })
      if (!needsSelf) await commit(checked.correct === true, checked.partial, answer.type === 'skip')
    } catch (e) { fail(e) }
  }, [ws, state.item, state.revisit]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Submit an answer: auto-graded kinds ask "were you sure?" first (before any feedback). */
  const submit = useCallback(async (answer: WebAnswer) => {
    if (!state.item) return
    const needsSure = answer.type !== 'skip' && autoGraded(state.item.widget.type, answer)
    dispatch({ type: 'answered', answer, needsSure })
    if (!needsSure) await grade(answer, undefined)
  }, [state.item, grade])
  const answerSure = useCallback((isSure: boolean) => { if (state.answer) void grade(state.answer, isSure) }, [state.answer, grade])
  /** Self-assessment for explain/code: all, partly, missed. */
  const selfAssess = useCallback((how: 'all' | 'partly' | 'missed') => { void commit(how !== 'missed', how === 'partly', false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function commit(correct: boolean, partial: boolean, revealed: boolean) {
    const item = stateRef.current.item!
    if (stateRef.current.revisit) { dispatch({ type: 'recorded', recorded: null, result: null }); return }
    const outcome: Outcome = { correct: correct && !revealed, partial, revealed, help: stateRef.current.hints.length ? 'author-hint' : 'none', ...(sure.current !== undefined ? { sure: sure.current } : {}) }
    try {
      const recorded = await studyApi.record(ws, item.item.cardKey, outcome)
      dispatch({ type: 'recorded', recorded, result: { widgetId: item.widget.id, cardKey: item.item.cardKey, title: item.item.cardTitle, rating: recorded.rating, reads: item.reads, reason: item.item.reason, lessonPath: item.lessonPath } })
    } catch (e) { fail(e) }
  }
  const stateRef = useRef(state)
  stateRef.current = state

  const next = useCallback(async () => {
    const s = stateRef.current
    dispatch({ type: 'next' })
    const after = reducer(s, { type: 'next' })
    if (after.phase !== 'loading') return
    const id = after.revisit ? after.revisitList[after.index].widgetId : after.plan!.items[after.index].widgetId
    await loadItem(id)
  }, [loadItem])

  return { state, start, submit, answerSure, selfAssess, askHint, next }
}
