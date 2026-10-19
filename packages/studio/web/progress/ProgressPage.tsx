// Your progress, honestly: your own first-try accuracy next to the model's predicted memory (labelled as
// such), what is due, the streak, and every lesson.
import { useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { BookOpenCheck, ChartNoAxesColumn } from 'lucide-react'
import { useReport } from '../api/queries'
import { lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Button, Empty, ErrorNote, MemoryMark, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'

const pct = (a: { answered: number; correct: number }) => (a.answered ? `${Math.round((a.correct / a.answered) * 100)}%` : '–')
export default function ProgressPage({ ws }: { ws: string }) {
  const rep = useReport(ws)
  const [, navigate] = useLocation()
  useEffect(() => { document.title = 'Progress · MDlearn Studio' }, [])
  if (rep.isLoading) return <div className="p-10"><Spinner /></div>
  if (rep.error) return <ErrorNote error={rep.error} retry={() => rep.refetch()} />
  const r = rep.data!
  if (!r.lessons.length) return <Empty icon={ChartNoAxesColumn} title="No lessons yet">Progress appears once this folder has lessons (in a learn/ folder) and you have studied some cards.</Empty>
  const stats: [string, string, string][] = [
    ['Seen', `${r.totals.seen} of ${r.totals.cards}`, 'cards you have studied at least once'],
    ['Due now', String(r.totals.due), r.nextDueText && !r.totals.due ? `next ${r.nextDueText}` : 'cards ready for review'],
    ['Right first time today', pct(r.accuracy.today), `${r.accuracy.today.correct} of ${r.accuracy.today.answered} answers`],
    ['Last 7 days', pct(r.accuracy.last7Days), `${r.accuracy.last7Days.correct} of ${r.accuracy.last7Days.answered} answers`],
    ['Study streak', `${r.streak} ${r.streak === 1 ? 'day' : 'days'}`, 'days you studied and cleared what was due'],
  ]
  return (
    <div className="mx-auto max-w-[860px] px-6 pb-20 pt-6 sm:px-10">
      <TopLeft><span className="px-1 text-[13px] text-muted">Progress</span></TopLeft>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Progress</h1>
        {r.totals.due > 0 && <Button variant="primary" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study`)}>Review {r.totals.due} due</Button>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-5">
        {stats.map(([k, v, hint]) => (
          <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-0.5 tabular text-[20px] font-semibold">{v}</dd><dd className="text-[11.5px] leading-snug text-subtle">{hint}</dd></div>
        ))}
      </dl>
      <h2 className="mt-8 text-[13px] font-medium text-muted">Lessons</h2>
      <table className="mt-2 w-full border-collapse text-[13.5px]">
        <thead><tr className="text-left text-[12px] text-muted"><th className="py-1.5 pl-1 font-normal">Lesson</th><th className="px-2 text-right font-normal">Seen</th><th className="px-2 text-right font-normal">Due</th><th className="pl-2 pr-1 text-right font-normal" title="The model's estimate that you would recall these cards now">Memory</th></tr></thead>
        <tbody>
          {r.lessons.map((l) => (
            <tr key={l.lessonId} className="border-t border-border hover:bg-hover">
              <td className="py-2 pl-1 pr-3"><Link href={lessonRoute(ws, l.path)} className="block truncate">{prettyTitle(l.title)}</Link></td>
              <td className="px-2 text-right tabular text-muted">{l.seen}/{l.cards}</td>
              <td className="px-2 text-right tabular text-muted">{l.due || ''}</td>
              <td className="pl-2 pr-1 text-right"><MemoryMark memory={l.predictedRecall} seen={l.seen} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[12px] text-muted">Memory is the scheduler’s estimate of recall, not a test score; your own accuracy is above.</p>
    </div>
  )
}
