// Mock exam: choose what, how many questions and how long, then answer a paper of questions on what you have
// studied, mixed across lessons, with no feedback until the end; then the marks and every answer.
import { useEffect, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { BookOpenCheck, ChevronDown, ClipboardCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { examApi, useTree } from '../api/queries'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { ExamRun, type Given } from './ExamRun'
import { ExamResults } from './ExamResults'
import type { ExamPlan, ExamResult } from '../../shared/types'
import { t, tp } from '../i18n'

const COUNTS = [10, 20, 30, 40]
const LIMITS = [0, 10, 20, 30, 60]
type Stage =
  | { kind: 'setup'; empty?: boolean }
  | { kind: 'loading' }
  | { kind: 'running'; plan: ExamPlan; limit: number }
  | { kind: 'grading'; plan: ExamPlan }
  | { kind: 'results'; plan: ExamPlan; given: Given[]; result: ExamResult }
  | { kind: 'error'; error: unknown; retry: () => void }
const option = (on: boolean) => `inline-flex h-8 min-w-[2.75rem] items-center justify-center rounded-[6px] border px-3 text-[13px] tabular cursor-pointer ${on ? 'border-text bg-hover font-medium' : 'border-border hover:bg-hover'}`

export default function ExamPage({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const tree = useTree(ws)
  const qc = useQueryClient()
  const [, navigate] = useLocation()
  const [doc, setDoc] = useState(params.get('doc') ?? '')
  const [count, setCount] = useState(20)
  const [limit, setLimit] = useState(20)
  const [stage, setStage] = useState<Stage>({ kind: 'setup' })
  useEffect(() => { document.title = t('Mock exam · MDlearn Studio') }, [])
  const docs = (tree.data?.docs ?? []).filter((d) => d.lessons.length > 0)

  const begin = async () => {
    setStage({ kind: 'loading' })
    try {
      const plan = await examApi.plan(ws, { count, ...(doc ? { doc } : {}) })
      setStage(plan.items.length ? { kind: 'running', plan, limit } : { kind: 'setup', empty: true })
    } catch (e) { setStage({ kind: 'error', error: e, retry: () => setStage({ kind: 'setup' }) }) }
  }
  const finish = async (plan: ExamPlan, given: Given[]) => {
    setStage({ kind: 'grading', plan })
    const send = async () => {
      try {
        const result = await examApi.grade(ws, plan.id, given.map(({ widgetId, answer, sure, ms }) => ({ widgetId, answer, ms, ...(sure !== undefined ? { sure } : {}) })))
        setStage({ kind: 'results', plan, given, result })
        for (const k of ['tree', 'report', 'today']) void qc.invalidateQueries({ queryKey: [k, ws] })
      } catch (e) { setStage({ kind: 'error', error: e, retry: () => { setStage({ kind: 'grading', plan }); void send() } }) } // same paper id: sending it again records it once
    }
    await send()
  }

  return (
    <div className="mx-auto max-w-[720px] px-5 pb-24 pt-2 sm:px-8">
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{t('Mock exam')}</span></TopLeft>
      {stage.kind === 'setup' && (
        <section className="pt-8" aria-labelledby="exam-title">
          <h1 id="exam-title" className="text-[24px] font-semibold tracking-[-0.015em]">{t('Mock exam')}</h1>
          <p className="mt-1.5 max-w-[60ch] text-[14.5px] text-muted">{t('Questions on what you have already studied, mixed across lessons, with no feedback until you finish, like the real thing. Then your marks, where to go back to, and every answer.')}</p>
          {stage.empty && (
            <Empty icon={ClipboardCheck} title={t('Nothing to ask yet')} action={<Button icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`)}>{t('Study first')}</Button>}>
              {t('An exam asks only about cards you have studied at least once. Study a few, then come back.')}
            </Empty>
          )}
          <form className="mt-6 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void begin() }}>
            <div>
              <label htmlFor="exam-scope" className="text-[12.5px] text-muted">{t('On')}</label>
              <span className="relative mt-1.5 block max-w-[28rem]">
                <select id="exam-scope" value={doc} onChange={(e) => setDoc(e.target.value)} className="h-9 w-full cursor-pointer appearance-none truncate rounded-[6px] border border-border-strong bg-bg pl-2.5 pr-8 text-[14px] outline-none focus:border-text">
                  <option value="">{t('Everything in this folder')}</option>
                  {docs.map((d) => <option key={d.path} value={d.path}>{d.title || d.path}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              </span>
            </div>
            <Choice label={t('Questions')} values={COUNTS} value={count} onChange={setCount} text={(n) => String(n)} />
            <Choice label={t('Time limit')} values={LIMITS} value={limit} onChange={setLimit} text={(n) => (n ? tp(n, '{n} min', '{n} min') : t('None'))} />
            <div>
              <Button type="submit" variant="primary" icon={ClipboardCheck}>{t('Start the exam')}</Button>
              <p className="mt-2 text-[12.5px] text-muted">{t('Explanations, code and games are left out: practise those in a study session.')}</p>
            </div>
          </form>
        </section>
      )}
      {stage.kind === 'loading' && <div className="py-16"><Spinner label={t('Setting the paper')} /></div>}
      {stage.kind === 'running' && <ExamRun plan={stage.plan} limitMin={stage.limit} onFinish={(given) => void finish(stage.plan, given)} />}
      {stage.kind === 'grading' && <div className="py-16"><Spinner label={t('Marking your paper')} /></div>}
      {stage.kind === 'results' && <ExamResults ws={ws} plan={stage.plan} given={stage.given} result={stage.result} onAgain={() => setStage({ kind: 'setup' })} />}
      {stage.kind === 'error' && <ErrorNote error={stage.error} retry={stage.retry} />}
    </div>
  )
}

function Choice({ label, values, value, onChange, text }: { label: string; values: number[]; value: number; onChange: (n: number) => void; text: (n: number) => string }) {
  const id = `exam-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div>
      <p id={id} className="text-[12.5px] text-muted">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={option(value === n)}>{text(n)}</button>)}
      </div>
    </div>
  )
}
