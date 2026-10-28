// What the AI made of an explanation: each key idea covered, partly or missing; what was wrong; the one question
// a beginner would ask next. Then: reread the text, and explain again.
import { useEffect, useRef } from 'react'
import { Link } from 'wouter'
import { Check, CircleDashed, MessageCircleQuestion, TriangleAlert, X } from 'lucide-react'
import type { TeachResult } from '../../shared/types'
import { Button } from '../ui/primitives'
import { t } from '../i18n'

const MARK = {
  covered: { Icon: Check, tone: 'text-good', word: () => t('covered') },
  partly: { Icon: CircleDashed, tone: 'text-warn', word: () => t('partly') },
  missing: { Icon: X, tone: 'text-bad', word: () => t('missing') },
} as const

export function TeachFeedback({ result: r, back, onRevise }: { result: TeachResult; back: string | null; onRevise: () => void }) {
  const covered = r.ideas.filter((i) => i.verdict === 'covered').length
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [r])
  return (
    <section className="mt-8 border-t border-border pt-6" aria-labelledby="fb-title">
      <h2 id="fb-title" ref={heading} tabIndex={-1} className="text-[17px] font-semibold">{t('{done} of {total} key ideas covered', { done: covered, total: r.ideas.length })}</h2>
      {r.feedback && <p className="mt-1.5 text-[14.5px]">{r.feedback}</p>}
      <ul className="mt-4 flex flex-col">
        {r.ideas.map((i, k) => {
          const m = MARK[i.verdict]
          return (
            <li key={k} className="flex gap-2.5 border-t border-border py-2.5 text-[14px]">
              <m.Icon className={`mt-0.5 size-4 shrink-0 ${m.tone}`} aria-hidden />
              <span className="min-w-0">
                <span className="sr-only">{m.word()}: </span>{i.idea}
                {i.evidence && i.verdict !== 'missing' && <span className="block text-[12.5px] text-muted">{t('You wrote: “{quote}”', { quote: i.evidence })}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      {r.ideasFrom === 'ai' && <p className="mt-1 text-[12px] text-muted">{t('No lesson lists the key ideas of this section, so the AI picked them from the text.')}</p>}
      {r.misconceptions.length > 0 && (
        <div className="mt-6">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><TriangleAlert className="size-4 text-warn" aria-hidden />{t('To correct')}</h3>
          <ul className="mt-2 flex flex-col gap-2.5 text-[14px]">
            {r.misconceptions.map((m, k) => <li key={k}><span className="text-muted">“{m.quote}”</span><span className="block">{m.correction}</span></li>)}
          </ul>
        </div>
      )}
      {r.followUp && (
        <div className="mt-6 rounded-[10px] bg-panel px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted"><MessageCircleQuestion className="size-4" aria-hidden />{t('A beginner would ask next')}</p>
          <p className="read mt-1 text-[16px]">{r.followUp}</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onRevise}>{t('Improve your explanation')}</Button>
        {back && <Link href={back} className="inline-flex h-8 items-center rounded-[6px] px-3 text-[13.5px] font-medium hover:bg-hover">{t('Reread the text')}</Link>}
      </div>
      <p className="mt-4 text-[12px] text-muted">{t('AI feedback is a suggestion and can be wrong: check it against the text. Nothing here changes your schedule.')}</p>
    </section>
  )
}
