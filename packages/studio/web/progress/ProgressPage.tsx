// Your progress, honestly: your own first-try accuracy next to the model's predicted memory (labelled as
// such), what is due, the streak, and every lesson.
import { useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { BookOpenCheck } from 'lucide-react'
import { useReport } from '../api/queries'
import { lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Button, ErrorNote, MemoryMark, Spinner } from '../ui/primitives'
import { TopLeft } from '../layout/Shell'
import { NoLessons } from '../ui/NoLessons'
import { t, tp, locale } from '../i18n'
import { whenText } from '../lib/when'
import { Confidence } from './Confidence'

const pct = (a: { answered: number; correct: number }) => (a.answered ? `${Math.round((a.correct / a.answered) * 100)}%` : '–')
export default function ProgressPage({ ws }: { ws: string }) {
  const rep = useReport(ws)
  const [, navigate] = useLocation()
  useEffect(() => { document.title = t('Progress · MDlearn Studio') }, [])
  if (rep.isLoading) return <div className="p-10"><Spinner /></div>
  if (rep.error) return <ErrorNote error={rep.error} retry={() => rep.refetch()} />
  const r = rep.data!
  if (!r.lessons.length) return <NoLessons ws={ws} />
  const stats: [string, string, string][] = [
    [t('Seen'), t('{done} of {total}', { done: r.totals.seen, total: r.totals.cards }), t('cards you have studied at least once')],
    [t('Due now'), String(r.totals.due), r.nextDue && !r.totals.due ? t('next {when}', { when: whenText(r.nextDue) }) : t('cards ready for review')],
    [t('Right first time today'), pct(r.accuracy.today), t('{done} of {total} answers', { done: r.accuracy.today.correct, total: r.accuracy.today.answered })],
    [t('Last 7 days'), pct(r.accuracy.last7Days), t('{done} of {total} answers', { done: r.accuracy.last7Days.correct, total: r.accuracy.last7Days.answered })],
    [t('Study streak'), tp(r.streak, '{n} day', '{n} days'), t('days you studied and cleared what was due')],
  ]
  return (
    <div className="mx-auto max-w-[860px] px-6 pb-20 pt-6 sm:px-10">
      <TopLeft><span className="px-1 text-[13px] text-muted">{t('Progress')}</span></TopLeft>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Progress')}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{t('What you have studied, how well you are likely to remember it, and how often you were right.')}</p>
        </div>
        {r.totals.due > 0 && <Button variant="primary" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study`)}>{tp(r.totals.due, 'Review {n} due card', 'Review {n} due cards')}</Button>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-5">
        {stats.map(([k, v, hint]) => (
          <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-0.5 tabular text-[20px] font-semibold">{v}</dd><dd className="text-[11.5px] leading-snug text-subtle">{hint}</dd></div>
        ))}
      </dl>
      <Confidence ws={ws} c={r.confidence} />
      <h2 className="mt-8 text-[13px] font-medium text-muted">{t('Lessons')}</h2>
      {/* fixed layout: long lesson titles truncate instead of pushing the numbers off a phone screen */}
      <table className="mt-2 w-full table-fixed border-collapse text-[13.5px]">
        <colgroup><col /><col className="w-[4.5rem]" /><col className="w-[3.25rem]" /><col className="w-[4.5rem]" /></colgroup>
        <thead><tr className="text-left text-[12px] text-muted"><th className="py-1.5 pl-1 font-normal">{t('Lesson')}</th><th className="px-2 text-right font-normal">{t('Seen')}</th><th className="px-2 text-right font-normal">{t('Due')}</th><th className="pl-2 pr-1 text-right font-normal" title={t('The model\'s estimate that you would recall these cards now')}>{t('Memory')}</th></tr></thead>
        <tbody>
          {r.lessons.map((l) => (
            <tr key={l.lessonId} className="border-t border-border hover:bg-hover">
              <td className="py-2 pl-1 pr-3"><Link href={lessonRoute(ws, l.path)} className="block truncate" title={prettyTitle(l.title)}>{prettyTitle(l.title)}</Link></td>
              <td className="px-2 text-right tabular text-muted">{l.seen}/{l.cards}</td>
              <td className="px-2 text-right tabular text-muted">{l.due || ''}</td>
              <td className="pl-2 pr-1 text-right"><MemoryMark memory={l.predictedRecall} seen={l.seen} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[12px] text-muted">{t('Memory is the scheduler’s estimate of recall, not a test score; your own accuracy is above.')}</p>
    </div>
  )
}
