// End of a session: what went well, what to reread (with links to the exact sections), what comes next.
import { useEffect } from 'react'
import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '../api/client'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Button } from '../ui/primitives'
import { useTree, type ReportResponse } from '../api/queries'
import { useUi } from '../state/ui'
import type { SessionState } from './useSession'
import { t, tp } from '../i18n'
import { whenText } from '../lib/when'

export function Summary({ ws, state, onAgain }: { ws: string; state: SessionState; onAgain: () => void }) {
  const tree = useTree(ws)
  const rep = useQuery({ queryKey: ['report', ws, 'summary'], queryFn: () => api.get<ReportResponse>(`/api/w/${ws}/study/report`) })
  const celebrate = useUi((u) => u.celebrate)
  useEffect(() => { celebrate() }, [celebrate])
  const r = state.results
  const solid = r.filter((x) => x.rating === 3), shaky = r.filter((x) => x.rating === 2), missed = r.filter((x) => x.rating === 1)
  const mins = Math.max(1, Math.round((Date.now() - state.startedAt) / 6e4))
  const docOf = (lessonPath: string) => tree.data?.docs.find((d) => d.lessons.some((l) => l.path === lessonPath))
  return (
    <section className="pt-10" aria-labelledby="sum-title">
      <h1 id="sum-title" className="text-[24px] font-semibold tracking-[-0.015em]">{t('Session done')}</h1>
      <p className="mt-1 tabular text-[14.5px] text-muted">{t('{done} of {total} solid on the first try', { done: solid.length, total: r.length })} · {tp(mins, '{n} minute', '{n} minutes')}</p>
      <dl className="mt-8 flex flex-col gap-6 text-[14.5px]">
        {solid.length > 0 && <Row label={t('Solid')} items={solid.map((x) => prettyTitle(x.title))} />}
        {shaky.length > 0 && <Row label={t('Shaky — comes back sooner')} items={shaky.map((x) => prettyTitle(x.title))} />}
        {missed.length > 0 && (
          <div>
            <dt className="text-[12.5px] font-medium text-muted">{t('Worth rereading')}</dt>
            <dd className="mt-1.5">
              <ul className="flex flex-col gap-1">
                {missed.map((x) => {
                  const d = docOf(x.lessonPath)
                  return (
                    <li key={x.cardKey}>
                      {prettyTitle(x.title)}
                      {x.noteSection && <> — <Link href={`${docRoute(ws, x.lessonPath)}&section=${encodeURIComponent(x.noteSection)}`} className="underline decoration-border-strong underline-offset-2">{t('Read this in your notes')}</Link></>}
                      {d && x.reads[0] && <> — <Link href={`${docRoute(ws, d.path)}&section=${encodeURIComponent(x.reads[0].section)}`} className="underline decoration-border-strong underline-offset-2 hover:decoration-text">§{x.reads[0].section} of {d.title || d.path}</Link></>}
                    </li>
                  )
                })}
              </ul>
              {missed.filter((x) => x.reason === 'new').length >= r.length / 2 && (
                <p className="mt-2 text-[13px] text-muted">{t('Missing cards you have only just met is normal: trying, then seeing the answer and rereading, is what makes it stick.')}</p>
              )}
            </dd>
          </div>
        )}
      </dl>
      {rep.data && (
        <p className="mt-8 border-t border-border pt-4 text-[14px] text-muted">
          {rep.data.nextDue ? <>{t('Next review {when}.', { when: whenText(rep.data.nextDue) })} </> : null}
          {t('Study streak: {days}.', { days: tp(rep.data.streak, '{n} day', '{n} days') })}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <Button icon={RotateCcw} onClick={onAgain}>{t('Another session')}</Button>
        <Link href={`/w/${ws}/progress`} className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13.5px] font-medium hover:bg-hover">{t('Progress')}</Link>
      </div>
    </section>
  )
}
function Row({ label, items }: { label: string; items: string[] }) {
  return <div><dt className="text-[12.5px] font-medium text-muted">{label}</dt><dd className="mt-1.5">{items.join(' · ')}</dd></div>
}
