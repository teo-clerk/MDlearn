// The exam paper, one question at a time. Each answer is handed in with how sure you were ("Sure" / "Not sure"),
// and nothing is checked until the end. When the time is up the paper is handed in as it stands.
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime, type WebAnswer } from '@mdlearn/core'
import { WidgetView } from '../widgets/WidgetView'
import { emptyDraft, ready, toAnswer, type Draft } from '../widgets/draft'
import { Button, Kbd } from '../ui/primitives'
import { prettyTitle } from '../lib/title'
import type { ExamPlan } from '../../shared/types'
import { t, tp } from '../i18n'

/** One question as handed in; `answer: null` = not answered when the time ran out. The draft is kept to show it again with the marks. */
export interface Given { widgetId: string; answer: WebAnswer | null; sure?: boolean; ms: number; draft: Draft | null }
/** The last minute is shown in the warning colour. */
const LAST_MINUTE = 60_000

export function ExamRun({ plan, limitMin, onFinish }: { plan: ExamPlan; limitMin: number; onFinish: (given: Given[]) => void }) {
  const [i, setI] = useState(0)
  const [given, setGiven] = useState<Given[]>([])
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(plan.items[0].widget))
  const [confirm, setConfirm] = useState(false)
  const shownAt = useRef(Date.now())
  const [deadline] = useState(() => (limitMin ? Date.now() + limitMin * 60_000 : null))
  const [now, setNow] = useState(() => Date.now())
  const handedIn = useRef(false)
  const sureButton = useRef<HTMLButtonElement>(null)
  const item = plan.items[i]

  const handIn = useCallback((list: Given[]) => {
    if (handedIn.current) return
    handedIn.current = true
    onFinish([...list, ...plan.items.slice(list.length).map((it) => ({ widgetId: it.widget.id, answer: null, ms: 0, draft: null }))])
  }, [onFinish, plan.items])
  // time up: what is written on the current question counts, the rest is unanswered
  useEffect(() => {
    if (!deadline) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])
  useEffect(() => {
    if (!deadline || now < deadline) return
    handIn(ready(item.widget, draft) ? [...given, { widgetId: item.widget.id, answer: toAnswer(item.widget, draft), ms: Date.now() - shownAt.current, draft }] : given)
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps -- only the clock decides
  // leaving the page mid-exam loses the paper: the browser asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!handedIn.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const next = (sure: boolean | undefined, skip = false) => {
    const g: Given = skip ? { widgetId: item.widget.id, answer: { type: 'skip' }, ms: Date.now() - shownAt.current, draft: null }
      : { widgetId: item.widget.id, answer: toAnswer(item.widget, draft), ...(sure !== undefined ? { sure } : {}), ms: Date.now() - shownAt.current, draft }
    const list = [...given, g]
    if (i + 1 >= plan.items.length) { handIn(list); return }
    setGiven(list)
    setI(i + 1)
    setDraft(emptyDraft(plan.items[i + 1].widget))
    setConfirm(false)
    shownAt.current = Date.now()
  }
  const canGo = ready(item.widget, draft)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.key === 'y' || e.key === 'n') && canGo) { e.preventDefault(); next(e.key === 'y') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const left = deadline ? Math.max(0, deadline - now) : null
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 pt-4">
        <h1 className="text-[15px] font-semibold">{t('Question {done} of {total}', { done: i + 1, total: plan.items.length })}</h1>
        {left !== null && <p role="timer" aria-label={t('Time left')} className={`shrink-0 tabular text-[13px] ${left < LAST_MINUTE ? 'font-semibold text-warn' : 'text-muted'}`}>{t('{time} left', { time: formatTime(Math.ceil(left / 1000)) })}</p>}
      </div>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuemin={0} aria-valuemax={plan.items.length} aria-valuenow={i} aria-label={t('Exam progress')}>
        <div className="h-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${(i / plan.items.length) * 100}%` }} />
      </div>
      <article key={item.widget.id} className="mt-6 rounded-[12px] border border-border bg-raised px-5 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:px-7 sm:py-6" aria-label={t('Question {done} of {total}', { done: i + 1, total: plan.items.length })}>
        <p className="mb-4 text-[12.5px] text-muted">{prettyTitle(item.item.lessonTitle)}</p>
        <WidgetView widget={item.widget} draft={draft} setDraft={setDraft} autoFocus onSubmit={() => sureButton.current?.focus()} />
        <div className="mt-6" role="group" aria-labelledby="exam-sure">
          <p id="exam-sure" className="text-[13.5px] font-medium">{t('Hand in this answer: how sure are you?')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button ref={sureButton} variant="primary" disabled={!canGo} onClick={() => next(true)}>{t('Sure')} <Kbd>Y</Kbd></Button>
            <Button variant="secondary" disabled={!canGo} onClick={() => next(false)}>{t('Not sure')} <Kbd>N</Kbd></Button>
            <Button variant="ghost" onClick={() => next(undefined, true)}>{t('I don’t know')}</Button>
          </div>
        </div>
      </article>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="underline decoration-border-strong underline-offset-2 hover:text-text cursor-pointer">{t('Hand in now')}</button>
        ) : (
          <>
            <span>{tp(plan.items.length - i, 'Hand in with {n} question unanswered?', 'Hand in with {n} questions unanswered?')}</span>
            <Button size="sm" variant="secondary" onClick={() => handIn(given)}>{t('Hand in')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t('Keep going')}</Button>
          </>
        )}
      </div>
    </>
  )
}
