// Study session in the browser: one card at a time, "were you sure?" before any feedback, the verdict in
// words, solid / shaky / again with the next review, missed cards revisited, then a short summary.
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { BookOpenCheck, Check, CircleCheckBig, Film, Lightbulb } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useStudySession, type SessionState } from './useSession'
import { WidgetView } from '../widgets/WidgetView'
import { Verdict } from '../widgets/Verdict'
import { emptyDraft, prepareAnswer, ready, selfSubmitting, type Draft } from '../widgets/draft'
import { Inline, Prose } from '../prose/Prose'
import { Button, Empty, ErrorNote, Kbd, Spinner } from '../ui/primitives'
import { NoLessons } from '../ui/NoLessons'
import { TopLeft } from '../layout/Shell'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Summary } from './Summary'
import { Judge } from './Judge'
import { studyApi, useTree } from '../api/queries'
import { t, tp } from '../i18n'
import { whenText } from '../lib/when'

export default function StudyPage({ ws }: { ws: string }) {
  const params = new URLSearchParams(useSearch())
  const scope = params.get('scope') ?? undefined
  const doc = params.get('doc') ?? undefined
  const more = params.get('new') ? Number(params.get('new')) : undefined
  const widgets = params.get('widgets')?.split(',').filter(Boolean).slice(0, 20)
  const s = useStudySession(ws)
  const qc = useQueryClient()
  const again = () => s.start({ scope, doc, ...(widgets ? { widgets } : {}), ...(more ? { newCards: more, limit: 10 + more } : {}) })
  useEffect(() => { void again() }, [ws, scope, doc, more, params.get('widgets')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = t('Study · MDlearn Studio') }, [])
  // progress shown elsewhere (sidebar counts, outline memory) follows the session
  useEffect(() => { if (s.state.recorded) { void qc.invalidateQueries({ queryKey: ['tree', ws] }); void qc.invalidateQueries({ queryKey: ['report', ws] }) } }, [s.state.recorded, qc, ws])
  const st = s.state
  const total = st.revisit ? st.revisitList.length : st.plan?.items.length ?? 0
  return (
    <div className="mx-auto max-w-[720px] px-5 pb-24 pt-2 sm:px-8">
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{t('Study')}{scope ? ` · ${scope}` : doc ? ` · ${doc.split('/').pop()}` : ''}</span></TopLeft>
      {st.phase === 'error' && <ErrorNote error={new Error(st.error ?? '')} retry={() => void again()} />}
      {st.phase === 'empty' && <Nothing ws={ws} />}
      {st.phase === 'summary' && <Summary ws={ws} state={st} onAgain={() => void s.start({ scope, doc })} />}
      {st.plan && st.plan.items.length > 0 && st.phase !== 'summary' && st.phase !== 'error' && (
        <>
          <PlanLine state={st} chosen={widgets ? (params.get('from') === 'exam' ? 'exam' : 'sure') : null} />
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={st.index + (st.recorded ? 1 : 0)} aria-label={t('Session progress')}>
            <div className="h-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${((st.index + (st.phase === 'feedback' ? 1 : 0)) / Math.max(1, total)) * 100}%` }} />
          </div>
          {st.item ? <Card key={`${st.revisit}-${st.index}-${st.item.widget.id}`} ws={ws} s={s} /> : <div className="py-16"><Spinner /></div>}
        </>
      )}
      {st.phase === 'loading' && !st.plan && <div className="py-16"><Spinner label={t('Preparing your session')} /></div>}
    </div>
  )
}

function PlanLine({ state: st, chosen }: { state: SessionState; chosen: 'sure' | 'exam' | null }) {
  const p = st.plan!
  return (
    <div className="flex items-baseline justify-between gap-3 pt-4">
      <h1 className="text-[15px] font-semibold">
        {st.revisit ? t('Revisiting what you missed') : chosen === 'exam' ? t('What you missed in the exam') : chosen ? t('Cards you were sure about, but missed') : t('Today: {plan}', { plan: [p.due ? tp(p.due, '{n} to review', '{n} to review') : '', p.fresh ? tp(p.fresh, '{n} new', '{n} new') : ''].filter(Boolean).join(', ') })}
      </h1>
      <p className="shrink-0 tabular text-[12.5px] text-muted">{st.revisit ? t('{done} of {total}', { done: st.index + 1, total: st.revisitList.length }) : `${t('{done} of {total}', { done: st.index + 1, total: p.items.length })} · ${t('about {n} min', { n: p.minutes })}`}</p>
    </div>
  )
}

function Card({ ws, s }: { ws: string; s: ReturnType<typeof useStudySession> }) {
  const st = s.state
  const item = st.item!
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(item.widget))
  const tree = useTree(ws)
  const sourceDoc = item.reads[0] && tree.data?.docs.find((d) => d.lessons.some((l) => l.path === item.lessonPath))
  const answering = st.phase === 'answer'
  const [checking, setChecking] = useState(false)
  const submit = async () => {
    if (!answering || checking || !ready(item.widget, draft)) return
    setChecking(true)
    try { const { answer, run } = await prepareAnswer(item.widget, draft); if (run) setDraft({ type: 'text', text: draft.type === 'text' ? draft.text : '', run }); await s.submit(answer) } finally { setChecking(false) }
  }
  // keyboard: Enter checks, y/n answers "sure?", a/p/m self-assesses, Enter/→ goes on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (st.phase === 'sure' && (e.key === 'y' || e.key === 'n')) { e.preventDefault(); s.answerSure(e.key === 'y') }
      else if (st.phase === 'self' && ['a', 'p', 'm'].includes(e.key)) { e.preventDefault(); s.selfAssess(e.key === 'a' ? 'all' : e.key === 'p' ? 'partly' : 'missed') }
      else if (st.phase === 'feedback' && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); void s.next() }
      else if (st.phase === 'answer' && e.key === 'Enter' && item.widget.type === 'quiz') { e.preventDefault(); void submit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const skipped = st.answer?.type === 'skip'
  const result = st.phase === 'feedback' || st.phase === 'self' ? st.checked : null
  return (
    <article className="mt-6 rounded-[12px] border border-border bg-raised px-5 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:px-7 sm:py-6" aria-labelledby="card-title">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="card-title" className="text-[13.5px] font-medium text-muted">
          <span className="mr-2 rounded-[4px] bg-hover px-1.5 py-px text-[12px] font-medium text-muted">{st.revisit ? t('Practice') : item.item.reason === 'due' ? t('Review') : t('New')}</span>
          {prettyTitle(item.item.cardTitle)}
        </h2>
        {item.noteSection && <Link href={`${docRoute(ws, item.lessonPath)}&section=${encodeURIComponent(item.noteSection)}`} className="text-[12px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text">{t('Read this in your notes')}</Link>}
        {sourceDoc && item.reads.length > 0 && (
          <Link href={`${docRoute(ws, sourceDoc.path)}&section=${encodeURIComponent(item.reads[0].section)}`} className="text-[12px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text">§{item.reads.map((r) => r.section).join(', §')}</Link>
        )}
      </header>
      {item.video && (
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
          <Film className="size-3.5" aria-hidden />{t('From the video “{title}” at {time}', { title: item.video.title, time: item.video.at })}
          {item.video.link && <a href={item.video.link} target="_blank" rel="noopener noreferrer" className="underline decoration-border-strong underline-offset-2 hover:text-text">{t('Watch from there')}</a>}
        </p>
      )}
      <WidgetView widget={item.widget} draft={draft} setDraft={setDraft} result={result} autoFocus onSubmit={() => void submit()}
        probe={async (a) => (await studyApi.check(ws, { widgetId: item.widget.id, answer: a, practice: true })).checked} />
      {st.hints.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {st.hints.map((h, i) => <p key={i} className="flex gap-2 text-[14.5px]"><Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /><span className="read text-[15.5px]"><Inline nodes={h} /></span></p>)}
        </div>
      )}

      {st.phase === 'answer' && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!selfSubmitting(item.widget) && <Button variant="primary" onClick={() => void submit()} busy={checking} disabled={!ready(item.widget, draft)}>{t('Check')}</Button>}
          {item.widget.hints > st.hints.length && <Button variant="ghost" icon={Lightbulb} onClick={() => void s.askHint()}>{t('Hint')}</Button>}
          <Button variant="ghost" onClick={() => void s.submit({ type: 'skip' })}>{t('I don’t know, show me')}</Button>
        </div>
      )}
      {st.phase === 'sure' && (
        <div className="mt-6" role="group" aria-labelledby="sure-q">
          <p id="sure-q" className="text-[14.5px] font-medium">{t('Were you sure?')}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => s.answerSure(true)}>{t('Yes, sure')} <Kbd>Y</Kbd></Button>
            <Button variant="secondary" onClick={() => s.answerSure(false)}>{t('Not really')} <Kbd>N</Kbd></Button>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{t('Asked before the answer, so lucky guesses come back sooner.')}</p>
        </div>
      )}
      {st.phase === 'loading' && st.answer && <div className="mt-6"><Spinner label={t('Checking')} /></div>}
      {st.phase === 'self' && st.checked && (
        <div className="mt-6" role="group" aria-labelledby="self-q">
          <p id="self-q" className="text-[14.5px] font-medium">{skipped ? t('Read the answer above, then:') : t('How did you do?')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => s.selfAssess('all')}>{t('Got all of it')} <Kbd>A</Kbd></Button>
            <Button onClick={() => s.selfAssess('partly')}>{t('Partly')} <Kbd>P</Kbd></Button>
            <Button onClick={() => s.selfAssess('missed')}>{t('Missed it')} <Kbd>M</Kbd></Button>
          </div>
          {item.widget.type === 'explain' && !skipped && st.answer?.type === 'explain' && (
            <Judge ws={ws} widgetId={item.widget.id} text={st.answer.text} suggest={(how) => s.selfAssess(how)} />
          )}
        </div>
      )}
      {st.phase === 'feedback' && st.checked && (
        <>
          <Verdict result={st.checked} skipped={skipped} />
          {st.recorded && <RatingLine rating={st.recorded.rating} when={st.recorded.next ? whenText(st.recorded.next.due) : undefined} />}
          {st.revisit && <p className="mt-4 text-[13px] text-muted">{t('Practice only: this does not change the schedule.')}</p>}
          {item.exposition.length > 0 && !st.checked.correct && (
            <details className="mt-5 rounded-[8px] border border-border px-4 py-2.5">
              <summary className="cursor-pointer text-[13.5px] font-medium">{t('Reread the card')}</summary>
              <div className="read mt-2 text-[16.5px]"><Prose nodes={item.exposition} /></div>
            </details>
          )}
          <div className="mt-6 flex items-center gap-2">
            <Button variant="primary" autoFocus onClick={() => void s.next()}>{t('Continue')}</Button>
            <span className="text-[12px] text-muted">{t('or press Enter')}</span>
          </div>
        </>
      )}
    </article>
  )
}

function RatingLine({ rating, when }: { rating: 1 | 2 | 3; when?: string }) {
  const word = rating === 1 ? t('again') : rating === 2 ? t('shaky') : t('solid')
  const text = rating === 1 ? t('we will come back to it before this session ends') : when ? t('next review {when}', { when }) : ''
  return (
    <p className="mt-3 flex items-center gap-2 text-[14px]">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12.5px] font-semibold ${rating === 3 ? 'border-good text-good' : rating === 2 ? 'border-warn text-warn' : 'border-bad text-bad'}`}>
        {rating === 3 && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}{word}
      </span>
      <span className="text-muted">{text}</span>
    </p>
  )
}

function Nothing({ ws }: { ws: string }) {
  const [, navigate] = useLocation()
  const tree = useTree(ws)
  if (tree.data && !tree.data.totals.lessons) return <NoLessons ws={ws} />
  return (
    <Empty icon={CircleCheckBig} title={t('You are all caught up')} action={<Button icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/progress`)}>{t('See your progress')}</Button>}>
      {t('Nothing is due and there are no new cards in this selection. Come back later, or read a document in the meantime.')}
    </Empty>
  )
}
