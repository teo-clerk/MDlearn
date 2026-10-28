// The confidence check: before an answer is checked you say whether you were sure. Being sure and wrong is the
// mistake most worth studying (it shows an illusion of knowing), so those cards are listed with "Review these",
// which asks the very questions you missed again.
import { Link, useLocation } from 'wouter'
import { RotateCcw } from 'lucide-react'
import type { ConfidenceInfo } from '../../shared/types'
import { Button } from '../ui/primitives'
import { lessonRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { t, tp, locale } from '../i18n'

/** Fewer answers than this say nothing about calibration yet. */
const MIN_ANSWERS = 5
const pct = (right: number, n: number) => (n ? `${Math.round((right / n) * 100)}%` : '–')

export function Confidence({ ws, c }: { ws: string; c: ConfidenceInfo }) {
  const [, navigate] = useLocation()
  const s = c.split
  const sure = s.sureRight + s.sureWrong, unsure = s.unsureRight + s.unsureWrong
  return (
    <section className="mt-8" aria-labelledby="conf-title">
      <h2 id="conf-title" className="text-[13px] font-medium text-muted">{t('Confidence check')}</h2>
      {s.answered < MIN_ANSWERS ? (
        <p className="mt-2 text-[13.5px] text-muted">{t('Before a question is checked you say whether you were sure. After a few answers this shows how well your confidence matches what you know.')}</p>
      ) : (
        <>
          <p className="mt-1 text-[13.5px] text-muted">{t('Last 30 days. Being sure and wrong is the most useful mistake to study: it is something you think you know.')}</p>
          <div className="mt-4 grid gap-x-10 gap-y-6 sm:grid-cols-[auto_1fr]">
            <table className="border-collapse text-[13.5px] tabular">
              <caption className="sr-only">{t('Answers by confidence and result')}</caption>
              <thead>
                <tr className="text-[12px] text-muted"><td /><th scope="col" className="px-3 pb-1.5 text-right font-normal">{t('Right')}</th><th scope="col" className="px-3 pb-1.5 text-right font-normal">{t('Wrong')}</th><th scope="col" className="pb-1.5 pl-3 text-right font-normal">{t('Accuracy')}</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{t('Sure')}</th>
                  <td className="px-3 text-right">{s.sureRight}</td>
                  <td className={`px-3 text-right ${s.sureWrong ? 'font-semibold text-warn' : ''}`}>{s.sureWrong}</td>
                  <td className="pl-3 text-right text-muted">{pct(s.sureRight, sure)}</td>
                </tr>
                <tr className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{t('Not sure')}</th>
                  <td className="px-3 text-right">{s.unsureRight}</td>
                  <td className="px-3 text-right">{s.unsureWrong}</td>
                  <td className="pl-3 text-right text-muted">{pct(s.unsureRight, unsure)}</td>
                </tr>
              </tbody>
            </table>
            <Trend weeks={c.weeks} />
          </div>
          {s.sureWrong > 0 && <p className="mt-4 text-[13.5px]">{tp(s.sureWrong, 'You were sure and wrong {n} time.', 'You were sure and wrong {n} times.')} {s.unsureRight > 0 ? tp(s.unsureRight, 'And {n} time you knew more than you thought.', 'And {n} times you knew more than you thought.') : ''}</p>}
          {c.overconfident.length > 0 && (
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[12.5px] font-medium text-muted">{t('Sure, but wrong')}</h3>
                <Button size="sm" icon={RotateCcw} onClick={() => navigate(`/w/${ws}/study?widgets=${encodeURIComponent(c.overconfident.map((o) => o.widget).join(','))}`)}>
                  {tp(c.overconfident.length, 'Review this card', 'Review these {n} cards')}
                </Button>
              </div>
              <ul className="mt-2 flex flex-col">
                {c.overconfident.map((o) => (
                  <li key={o.card} className="flex min-w-0 items-baseline gap-3 border-t border-border py-2 text-[13.5px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{prettyTitle(o.cardTitle)}</span>
                      <Link href={lessonRoute(ws, o.lessonPath)} className="ml-2 text-[12.5px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text">{prettyTitle(o.lessonTitle)}</Link>
                      {o.answers[0] && <span className="block truncate text-[12.5px] text-muted">{t('You answered: {answer}', { answer: o.answers[0] })}</span>}
                    </span>
                    <span className="shrink-0 tabular text-[12.5px] text-muted">{tp(o.count, '{n} time', '{n} times')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const week = (start: string) => new Date(`${start}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** "Right when sure", week by week: one series, so one colour and no legend; each bar names its week on hover or focus. */
function Trend({ weeks }: { weeks: ConfidenceInfo['weeks'] }) {
  return (
    <figure className="min-w-0">
      <figcaption className="text-[12px] text-muted">{t('Right when sure, by week')}</figcaption>
      <div role="list" aria-label={t('Right when sure, by week')} className="relative mt-2 flex h-[88px] items-end gap-[2px] border-b border-border">
        {weeks.map((w) => {
          const share = w.sure ? w.sureRight / w.sure : null
          const label = w.sure ? t('Week of {date}: right {pct} of {n} sure answers', { date: week(w.start), pct: pct(w.sureRight, w.sure), n: w.sure }) : t('Week of {date}: no sure answers', { date: week(w.start) })
          return (
            <div key={w.start} role="listitem" tabIndex={0} aria-label={label} className="group relative flex h-full flex-1 items-end justify-center outline-offset-2">
              {share === null
                ? <span aria-hidden className="mb-1 h-px w-3 bg-border-strong" />
                : <span aria-hidden className="w-full max-w-[22px] rounded-t-[4px] bg-accent" style={{ height: `${Math.max(3, share * 100)}%` }} />}
              <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-[200px] -translate-x-1/2 rounded-[6px] border border-border bg-raised px-2 py-1 text-[12px] text-text shadow-pop group-hover:block group-focus-visible:block">{label}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11.5px] text-subtle tabular" aria-hidden><span>{week(weeks[0].start)}</span><span>{t('this week')}</span></div>
    </figure>
  )
}
