// Today: what to do now, how the week looks, how you are doing, and what needs attention.
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { BookOpenCheck } from 'lucide-react'
import { useToday, useTree } from '../api/queries'
import { docRoute } from '../lib/paths'
import { duration } from '../lib/title'
import { Button, Empty, ErrorNote, MemoryMark, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { Forecast, Heatmap } from './Charts'
import { Leeches } from './Leeches'
import { GoalsEditor } from './GoalsEditor'
import { FileText } from 'lucide-react'
import type { TodayResponse } from '../../shared/types'
import { t, tp, locale } from '../i18n'
import { whenText } from '../lib/when'
import { paceText } from './pace'
import { InboxSection } from '../inbox/InboxSection'

export const lastDocKey = (ws: string) => `mdl-last-doc:${ws}`
const fmt = new Intl.NumberFormat(locale())
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

function calibrationText(c: TodayResponse['calibration']): string | null {
  if (c.answered < 5) return null
  const sure = c.sureRight + c.sureWrong, unsure = c.unsureRight + c.unsureWrong
  const a = sure ? t('When you are sure, you are right {pct} of the time ({n} answers).', { pct: pct(c.sureAccuracy), n: sure }) : ''
  const b = unsure ? t('When not sure, you are right {pct} of the time ({n} answers).', { pct: pct(c.unsureAccuracy), n: unsure }) : ''
  const warn = sure >= 8 && c.sureAccuracy !== null && c.sureAccuracy < 0.8 ? t('Being sure and wrong is the most useful mistake to study: reread those cards.') : ''
  return [a, b, warn].filter(Boolean).join(' ')
}

export default function TodayPage({ ws }: { ws: string }) {
  const today = useToday(ws)
  const tree = useTree(ws)
  const [, navigate] = useLocation()
  const [last, setLast] = useState<string | null>(null)
  useEffect(() => { try { setLast(localStorage.getItem(lastDocKey(ws))) } catch { /* ignore */ } }, [ws])
  useEffect(() => { document.title = tree.data ? `${tree.data.name} · MDlearn Studio` : 'MDlearn Studio' }, [tree.data])
  if (today.isLoading || tree.isLoading) return <div className="p-10"><Spinner label={t('Reading folder')} /></div>
  if (today.error || tree.error) return <ErrorNote error={today.error ?? tree.error} retry={() => { void today.refetch(); void tree.refetch() }} />
  const d = today.data!, f = tree.data!
  const lastDoc = last ? f.docs.find((d) => d.path === last) : undefined
  const docs = [...f.docs].sort((a, b) => a.path.localeCompare(b.path))
  const hasLessons = f.totals.lessons > 0
  const cal = calibrationText(d.calibration)
  const stat = (k: string, v: string, hint?: string) => <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-0.5 tabular text-[18px] font-semibold">{v}</dd>{hint && <dd className="text-[11.5px] text-subtle">{hint}</dd>}</div>
  return (
    <div className="mx-auto max-w-[900px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="truncate px-1 text-[13.5px] text-muted">{f.name}</span></TopLeft>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{t('Today')}</h1>
      <p className="mt-1 text-[13.5px] text-muted tabular">{tp(f.totals.docs, '{n} document', '{n} documents')}{hasLessons ? ` · ${tp(f.totals.lessons, '{n} lesson', '{n} lessons')} · ${tp(d.totals.cards, '{n} card', '{n} cards')}` : ''}</p>

      {hasLessons ? (
        <section className="mt-6 rounded-[10px] border border-border p-5" aria-labelledby="plan">
          <h2 id="plan" className="text-[13px] font-medium text-muted">{t('Your session')}</h2>
          {d.plan.items.length ? (
            <p className="mt-1 text-[18px]">{[d.plan.due ? tp(d.plan.due, '{n} to review', '{n} to review') : '', d.plan.fresh ? tp(d.plan.fresh, '{n} new', '{n} new') : ''].filter(Boolean).join(', ')}<span className="text-muted"> · {t('about {n} min', { n: d.plan.minutes })}</span></p>
          ) : <p className="mt-1 text-[18px]">{t('You are all caught up.')}{d.nextDue ? <span className="text-muted"> {t('Next review {when}.', { when: whenText(d.nextDue) })}</span> : null}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {d.plan.items.length > 0 && <Button variant="primary" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study`)}>{t('Start')}</Button>}
            {d.plan.items.length === 0 && d.totals.seen < d.totals.cards && <Button icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study?new=10`)}>{t('Learn 10 new cards')}</Button>}
            {d.plan.items.length > 0 && d.totals.seen < d.totals.cards && <Link href={`/w/${ws}/study?new=15`} className="text-[13px] text-muted underline underline-offset-2 hover:text-text">{t('or more new cards')}</Link>}
          </div>
          <div className="mt-5" aria-label={t('{done} of {total} cards today', { done: d.goal.doneToday, total: d.goal.daily })}>
            <div className="flex items-baseline justify-between text-[12.5px] text-muted"><span>{t('Daily goal')}</span><span className="tabular">{t('{done} of {total} cards', { done: d.goal.doneToday, total: d.goal.daily })}</span></div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.goal.percent}><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${d.goal.percent}%` }} /></div>
          </div>
          {d.paces.length > 0 && <ul className="mt-4 flex flex-col gap-1 text-[13.5px]">{d.paces.map((p) => <li key={`${p.scope}${p.deadline}`}>{paceText(p)}</li>)}</ul>}
          <p className="mt-4 text-[12.5px] text-muted">{t('Away from the computer?')} <Link href={`/offline/${ws}`} className="underline underline-offset-2 hover:text-text">{t('Take the next days’ cards offline')}</Link></p>
        </section>
      ) : (
        <section className="mt-6 rounded-[10px] border border-border p-5">
          <h2 className="text-[13px] font-medium text-muted">{t('Study')}</h2>
          <p className="mt-1 text-[14.5px] leading-relaxed">{t('No lessons in this folder yet. Every document can still be read here. Select a passage and choose')} <strong className="font-semibold">{t('Card')}</strong> {t('to make your own cards, or ask the AI Studio to build a course.')}</p>
        </section>
      )}

      <InboxSection ws={ws} />

      {hasLessons && (
        <>
          <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.4fr]">
            <section aria-labelledby="fc"><h2 id="fc" className="mb-2 text-[13px] font-medium text-muted">{t('Next 7 days')}</h2><Forecast days={d.forecast} /></section>
            <section aria-labelledby="hm"><h2 id="hm" className="mb-2 text-[13px] font-medium text-muted">{t('Study calendar')}</h2><Heatmap map={d.heatmap} /></section>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
            {stat(t('Study streak'), tp(d.streak, '{n} day', '{n} days'), t('days you studied and cleared what was due'))}
            {stat(t('Time today'), duration(d.time.today.minutes) || t('0 min'), t('{time} in 7 days', { time: duration(d.time.last7Days.minutes) || t('0 min') }))}
            {stat(t('Seen'), t('{done} of {total}', { done: fmt.format(d.totals.seen), total: fmt.format(d.totals.cards) }), t('cards studied at least once'))}
            {stat(t('Reviews'), fmt.format(d.totals.reviews), t('in total'))}
          </dl>
          {cal && <p className="mt-3 text-[13.5px] text-muted">{cal}</p>}
          <div className="mt-8 flex flex-col gap-8">
            <Leeches ws={ws} leeches={d.leeches} />
            <GoalsEditor ws={ws} goal={d.goal} paces={d.paces} docs={f.docs} suspended={d.suspended} />
          </div>
        </>
      )}

      {lastDoc && (
        <section className="mt-8"><h2 className="text-[13px] font-medium text-muted">{t('Continue reading')}</h2>
          <Link href={docRoute(ws, lastDoc.path)} className="mt-1 block truncate text-[15px] underline decoration-border-strong underline-offset-4 hover:decoration-text">{lastDoc.title || lastDoc.path}</Link>
        </section>
      )}

      <h2 className="mt-10 text-[13px] font-medium text-muted">{t('Documents')}</h2>
      {docs.length === 0 ? <Empty icon={FileText} title={t('No Markdown files here')}>{t('Add .md files to this folder and they appear automatically.')}</Empty> : (
        <table className="mt-2 w-full border-collapse text-[13.5px]">
          <thead className="sr-only"><tr><th>{t('Document')}</th><th>{t('Length')}</th><th>{t('Lessons')}</th><th>{t('Memory')}</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.path} className="border-t border-border hover:bg-hover">
                <td className="max-w-0 w-full py-2 pl-1 pr-3"><Link href={docRoute(ws, d.path)} className="block min-w-0"><span className="block truncate font-medium">{d.title || d.path}</span><span className="block truncate text-[12px] text-muted">{d.path}</span></Link></td>
                <td className="whitespace-nowrap px-2 text-right tabular text-[12.5px] text-muted">{d.timeMin ? duration(d.timeMin) : `${fmt.format(d.words)} words`}</td>
                <td className="whitespace-nowrap px-2 text-right tabular text-[12.5px] text-muted">{d.lessons.length ? `${d.lessons.length} lessons` : ''}</td>
                <td className="whitespace-nowrap pl-2 pr-1 text-right">{d.seen ? <MemoryMark memory={d.memory} seen={d.seen} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
