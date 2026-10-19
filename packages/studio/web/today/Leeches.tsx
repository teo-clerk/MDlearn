// Cards you keep failing: what you answered, where to reread, and three ways out.
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { PauseCircle, Sparkles } from 'lucide-react'
import { goalsApi, jobsApi, keys, useSession } from '../api/queries'
import { docRoute } from '../lib/paths'
import { prettyTitle } from '../lib/title'
import { Button } from '../ui/primitives'
import type { LeechInfo } from '../../shared/types'

export function Leeches({ ws, leeches }: { ws: string; leeches: LeechInfo[] }) {
  const session = useSession()
  const qc = useQueryClient()
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canAi = !!session.data?.caps.includes('ai')
  if (!leeches.length) return null
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(null); try { await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(null) } }
  return (
    <section aria-labelledby="leeches">
      <h2 id="leeches" className="text-[13px] font-medium text-muted">Cards that keep slipping</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">Failed again and again. Rereading helps; so does a better card.</p>
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      <ul className="mt-2 divide-y divide-border rounded-[8px] border border-border">
        {leeches.slice(0, 6).map((l) => (
          <li key={l.key} className="px-3.5 py-3">
            <p className="text-[14px] font-medium">{prettyTitle(l.title)} <span className="font-normal text-muted">· {prettyTitle(l.lessonTitle)}</span></p>
            <p className="mt-0.5 text-[12.5px] text-muted tabular">Missed {l.lapses} times{l.wrongAnswers.length ? <> · you answered {l.wrongAnswers.map((w, i) => <span key={i}>{i ? ', ' : ''}“{w.length > 40 ? `${w.slice(0, 40)}…` : w}”</span>)}</> : null}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {l.sourceDoc && <Link href={`${docRoute(ws, l.sourceDoc)}&section=${encodeURIComponent(l.sourceSection ?? '')}`} className="inline-flex h-7 items-center rounded-[6px] px-2.5 text-[13px] font-medium hover:bg-hover">Reread §{l.sourceSection}</Link>}
              {canAi && l.lessonPath && (
                <Button size="sm" variant="secondary" icon={Sparkles} busy={busy === `fix-${l.key}`} onClick={() => run(`fix-${l.key}`, async () => {
                  const j = await jobsApi.start(ws, { recipe: 'lesson.improve', lesson: l.lessonPath, focus: 'leech', card: { key: l.key, title: l.title, wrong: l.wrongAnswers } })
                  navigate(`/w/${ws}/studio?job=${j.id}`)
                })}>Fix the card with AI</Button>
              )}
              <Button size="sm" variant="ghost" icon={PauseCircle} busy={busy === `s-${l.key}`} title="Stop showing this card in sessions" onClick={() => run(`s-${l.key}`, async () => { await goalsApi.suspend(ws, l.key, true); await qc.invalidateQueries({ queryKey: keys.today(ws) }) })}>Set aside</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
