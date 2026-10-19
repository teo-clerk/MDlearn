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

export const lastDocKey = (ws: string) => `mdl-last-doc:${ws}`
const fmt = new Intl.NumberFormat()
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

function calibrationText(c: TodayResponse['calibration']): string | null {
  if (c.answered < 5) return null
  const sure = c.sureRight + c.sureWrong, unsure = c.unsureRight + c.unsureWrong
  const a = sure ? `When you are sure you are right ${pct(c.sureAccuracy)} of the time (${sure} answers)` : ''
  const b = unsure ? `${sure ? '; when not sure, ' : 'When not sure, you are right '}${pct(c.unsureAccuracy)} of the time (${unsure})` : ''
  const warn = sure >= 8 && c.sureAccuracy !== null && c.sureAccuracy < 0.8 ? ' Being sure and wrong is the most useful mistake to study: reread those cards.' : ''
  return `${a}${b}.${warn}`
}

export default function TodayPage({ ws }: { ws: string }) {
  const today = useToday(ws)
  const tree = useTree(ws)
  const [, navigate] = useLocation()
  const [last, setLast] = useState<string | null>(null)
  useEffect(() => { try { setLast(localStorage.getItem(lastDocKey(ws))) } catch { /* ignore */ } }, [ws])
  useEffect(() => { document.title = tree.data ? `${tree.data.name} · MDlearn Studio` : 'MDlearn Studio' }, [tree.data])
  if (today.isLoading || tree.isLoading) return <div className="p-10"><Spinner label="Reading folder" /></div>
  if (today.error || tree.error) return <ErrorNote error={today.error ?? tree.error} retry={() => { void today.refetch(); void tree.refetch() }} />
  const t = today.data!, f = tree.data!
  const lastDoc = last ? f.docs.find((d) => d.path === last) : undefined
  const docs = [...f.docs].sort((a, b) => a.path.localeCompare(b.path))
  const hasLessons = f.totals.lessons > 0
  const cal = calibrationText(t.calibration)
  const stat = (k: string, v: string, hint?: string) => <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-0.5 tabular text-[18px] font-semibold">{v}</dd>{hint && <dd className="text-[11.5px] text-subtle">{hint}</dd>}</div>
  return (
    <div className="mx-auto max-w-[900px] px-6 pb-24 pt-6 sm:px-10">
      <TopLeft><span className="truncate px-1 text-[13.5px] text-muted">{f.name}</span></TopLeft>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Today</h1>
      <p className="mt-1 text-[13.5px] text-muted tabular">{fmt.format(f.totals.docs)} documents{hasLessons ? ` · ${f.totals.lessons} lessons · ${fmt.format(t.totals.cards)} cards` : ''}</p>

      {hasLessons ? (
        <section className="mt-6 rounded-[10px] border border-border p-5" aria-labelledby="plan">
          <h2 id="plan" className="text-[13px] font-medium text-muted">Your session</h2>
          {t.plan.items.length ? (
            <p className="mt-1 text-[18px]">{t.plan.due ? <><span className="tabular font-semibold">{t.plan.due}</span> to review{t.plan.fresh ? ', ' : ''}</> : null}{t.plan.fresh ? <><span className="tabular font-semibold">{t.plan.fresh}</span> new</> : null}<span className="text-muted"> · about {t.plan.minutes} min</span></p>
          ) : <p className="mt-1 text-[18px]">You are all caught up.{t.nextDueText ? <span className="text-muted"> Next review {t.nextDueText}.</span> : null}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {t.plan.items.length > 0 && <Button variant="primary" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study`)}>Start</Button>}
            {t.plan.items.length === 0 && t.totals.seen < t.totals.cards && <Button icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study?new=10`)}>Learn 10 new cards</Button>}
            {t.plan.items.length > 0 && t.totals.seen < t.totals.cards && <Link href={`/w/${ws}/study?new=15`} className="text-[13px] text-muted underline underline-offset-2 hover:text-text">or more new cards</Link>}
          </div>
          <div className="mt-5" aria-label={`${t.goal.doneToday} of ${t.goal.daily} cards today`}>
            <div className="flex items-baseline justify-between text-[12.5px] text-muted"><span>Daily goal</span><span className="tabular">{t.goal.doneToday} of {t.goal.daily} cards</span></div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.goal.percent}><div className="h-full bg-text/70 transition-[width] duration-300" style={{ width: `${t.goal.percent}%` }} /></div>
          </div>
          {t.paces.length > 0 && <ul className="mt-4 flex flex-col gap-1 text-[13.5px]">{t.paces.map((p) => <li key={`${p.scope}${p.deadline}`}>{p.text}</li>)}</ul>}
        </section>
      ) : (
        <section className="mt-6 rounded-[10px] border border-border p-5">
          <h2 className="text-[13px] font-medium text-muted">Study</h2>
          <p className="mt-1 text-[14.5px] leading-relaxed">No lessons in this folder yet. Every document can still be read here. Select a passage and choose <strong className="font-semibold">Card</strong> to make your own cards, or ask the AI Studio to build a course.</p>
        </section>
      )}

      {hasLessons && (
        <>
          <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.4fr]">
            <section aria-labelledby="fc"><h2 id="fc" className="mb-2 text-[13px] font-medium text-muted">Next 7 days</h2><Forecast days={t.forecast} /></section>
            <section aria-labelledby="hm"><h2 id="hm" className="mb-2 text-[13px] font-medium text-muted">Study calendar</h2><Heatmap map={t.heatmap} /></section>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
            {stat('Study streak', `${t.streak} ${t.streak === 1 ? 'day' : 'days'}`, 'days you studied and cleared what was due')}
            {stat('Time today', duration(t.time.today.minutes) || '0 min', `${duration(t.time.last7Days.minutes) || '0 min'} in 7 days`)}
            {stat('Seen', `${fmt.format(t.totals.seen)} of ${fmt.format(t.totals.cards)}`, 'cards studied at least once')}
            {stat('Reviews', fmt.format(t.totals.reviews), 'in total')}
          </dl>
          {cal && <p className="mt-3 text-[13.5px] text-muted">{cal}</p>}
          <div className="mt-8 flex flex-col gap-8">
            <Leeches ws={ws} leeches={t.leeches} />
            <GoalsEditor ws={ws} goal={t.goal} paces={t.paces} docs={f.docs} suspended={t.suspended} />
          </div>
        </>
      )}

      {lastDoc && (
        <section className="mt-8"><h2 className="text-[13px] font-medium text-muted">Continue reading</h2>
          <Link href={docRoute(ws, lastDoc.path)} className="mt-1 block truncate text-[15px] underline decoration-border-strong underline-offset-4 hover:decoration-text">{lastDoc.title || lastDoc.path}</Link>
        </section>
      )}

      <h2 className="mt-10 text-[13px] font-medium text-muted">Documents</h2>
      {docs.length === 0 ? <Empty icon={FileText} title="No Markdown files here">Add .md files to this folder and they appear automatically.</Empty> : (
        <table className="mt-2 w-full border-collapse text-[13.5px]">
          <thead className="sr-only"><tr><th>Document</th><th>Length</th><th>Lessons</th><th>Memory</th></tr></thead>
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
