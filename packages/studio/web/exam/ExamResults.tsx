// The marks: the score, the weakest lessons first, how long each question took, and every question again with
// its answer, the missed ones open. Each answered card was rated with the study table and is scheduled as usual.
import { Link, useLocation } from 'wouter'
import { BookOpenCheck, Check, Minus, RotateCcw, X } from 'lucide-react'
import { formatTime } from '@mdlearn/core'
import { WidgetView } from '../widgets/WidgetView'
import { Verdict } from '../widgets/Verdict'
import { emptyDraft } from '../widgets/draft'
import { Button } from '../ui/primitives'
import { lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { whenText } from '../lib/when'
import type { ExamPlan, ExamResult } from '../../shared/types'
import type { Given } from './ExamRun'
import { t, tp } from '../i18n'

const pct = (x: number) => `${Math.round(x * 100)}%`
const secs = (ms: number) => formatTime(Math.round(ms / 1000))

export function ExamResults({ ws, plan, given, result, onAgain }: { ws: string; plan: ExamPlan; given: Given[]; result: ExamResult; onAgain: () => void }) {
  const [, navigate] = useLocation()
  const s = result.summary
  const missed = result.results.filter((r) => r.correct !== true || r.skipped)
  const pathOf = new Map(plan.items.map((i) => [i.item.lessonId, i.lessonPath]))
  return (
    <section className="pt-10" aria-labelledby="marks-title">
      <h1 id="marks-title" className="text-[24px] font-semibold tracking-[-0.015em]">{t('Your marks')}</h1>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-[34px] font-semibold leading-none tracking-[-0.02em]">{pct(s.score)}</span>
        <span className="tabular text-[15px] text-muted">{t('{done} of {total} right', { done: s.right, total: s.total })}</span>
      </p>
      <p className="mt-2 tabular text-[13.5px] text-muted">
        {[t('{time} in all', { time: secs(s.ms) }), s.answered ? t('about {time} a question', { time: secs(s.msPerQuestion) }) : '',
          s.total > s.answered ? tp(s.total - s.answered, '{n} not answered', '{n} not answered') : '', s.sureWrong ? tp(s.sureWrong, '{n} sure but wrong', '{n} sure but wrong') : ''].filter(Boolean).join(' · ')}
      </p>
      {plan.items.length < plan.requested && <p className="mt-1 text-[12.5px] text-muted">{tp(plan.available, 'Only {n} card you have studied could be asked.', 'Only the {n} cards you have studied could be asked.')}</p>}

      <h2 className="mt-8 text-[13px] font-medium text-muted">{t('By lesson')}</h2>
      <ul className="mt-2 flex flex-col">
        {s.lessons.map((l) => (
          <li key={l.lessonId} className="flex items-center gap-3 border-t border-border py-2 text-[13.5px]">
            <Link href={lessonRoute(ws, pathOf.get(l.lessonId) ?? '')} className="min-w-0 flex-1 truncate hover:underline">{prettyTitle(l.title)}</Link>
            <span className="h-[6px] w-24 shrink-0 overflow-hidden rounded-full bg-hover" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: `${(l.right / l.total) * 100}%` }} /></span>
            <span className="w-14 shrink-0 text-right tabular text-muted">{l.right}/{l.total}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[13px] font-medium text-muted">{t('Every question')}</h2>
      <ol className="mt-2 flex flex-col">
        {result.results.map((r, k) => {
          const item = plan.items.find((i) => i.widget.id === r.widgetId)
          if (!item) return null
          const g = given.find((x) => x.widgetId === r.widgetId)
          const ok = r.correct === true && !r.skipped
          const Icon = r.correct === null ? Minus : ok ? Check : X
          return (
            <li key={r.widgetId} className="border-t border-border">
              <details open={!ok} className="group py-2">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-[13.5px]">
                  <span className="w-5 shrink-0 tabular text-right text-muted">{k + 1}</span>
                  <Icon className={`size-4 shrink-0 ${r.correct === null ? 'text-muted' : ok ? 'text-good' : 'text-bad'}`} aria-label={r.correct === null ? t('Not answered') : ok ? t('Right') : t('Wrong')} />
                  <span className="min-w-0 flex-1 truncate">{prettyTitle(item.item.cardTitle)}</span>
                  {r.sure !== undefined && <span className="hidden shrink-0 text-[12px] text-muted sm:inline">{r.sure ? t('sure') : t('not sure')}</span>}
                  <span className="w-12 shrink-0 text-right tabular text-[12.5px] text-muted">{r.correct === null ? '–' : secs(r.ms)}</span>
                  {r.word && <span className={`w-14 shrink-0 text-right text-[12px] font-medium ${r.rating === 3 ? 'text-good' : r.rating === 2 ? 'text-warn' : 'text-bad'}`} title={r.next ? t('next review {when}', { when: whenText(r.next) }) : undefined}>{r.rating === 1 ? t('again') : r.rating === 2 ? t('shaky') : t('solid')}</span>}
                </summary>
                <div className="pb-3 pl-8 pt-3">
                  <WidgetView widget={item.widget} draft={g?.draft ?? emptyDraft(item.widget)} setDraft={() => {}} result={r.checked} />
                  <Verdict result={r.checked} skipped={r.skipped || r.correct === null} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-[12.5px] text-muted">{t('Every answered card is scheduled as in a study session: missed ones come back soon.')}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {missed.length > 0 && <Button variant="primary" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study?from=exam&widgets=${encodeURIComponent(missed.slice(0, 20).map((r) => r.widgetId).join(','))}`)}>{tp(missed.length, 'Practise the one you missed', 'Practise the {n} you missed')}</Button>}
        <Button icon={RotateCcw} onClick={onAgain}>{t('Another exam')}</Button>
        <Link href={`/w/${ws}/progress`} className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13.5px] font-medium hover:bg-hover">{t('Progress')}</Link>
      </div>
    </section>
  )
}
