// One card studied offline, in the same steps as a study session: answer (hints allowed), "were you sure?" for
// questions marked automatically, the verdict, then again / shaky / solid with the next review.
import { useState } from 'react'
import { Check, Lightbulb } from 'lucide-react'
import type { Checked, MdNode, Outcome, WebAnswer } from '@mdlearn/core'
import { WidgetView } from '../widgets/WidgetView'
import { Verdict } from '../widgets/Verdict'
import { emptyDraft, ready, selfSubmitting, toAnswer, type Draft } from '../widgets/draft'
import { Inline, Prose } from '../prose/Prose'
import { Button } from '../ui/primitives'
import { prettyTitle } from '../lib/title'
import { whenText } from '../lib/when'
import type { OfflinePack } from '../../shared/types'
import { hint as hintOf, mark, pose, type PackCard } from './engine'
import { t } from '../i18n'

type Step = 'answer' | 'sure' | 'self' | 'done'
const AUTO = ['quiz', 'cloze', 'order', 'steps']
export interface Result { answer: WebAnswer; checked: Checked; outcome: Outcome; hints: number }

export function OfflineCard({ pack, card, onAnswered, onNext, rated }: { pack: OfflinePack; card: PackCard; onAnswered: (r: Result) => void; onNext: () => void; rated: { rating: 1 | 2 | 3; next: string | null } | null }) {
  const q = pose(pack, card.widgetId)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(q.widget))
  const [step, setStep] = useState<Step>('answer')
  const [answer, setAnswer] = useState<WebAnswer | null>(null)
  const [checked, setChecked] = useState<Checked | null>(null)
  const [hints, setHints] = useState<MdNode[][]>([])
  const help = hints.length ? 'author-hint' as const : 'none' as const

  const submit = (a: WebAnswer) => {
    setAnswer(a)
    if (a.type !== 'skip' && AUTO.includes(q.widget.type)) { setStep('sure'); return }
    finish(a, undefined)
  }
  const finish = (a: WebAnswer, sure: boolean | undefined) => {
    const c = mark(pack, card.widgetId, a)
    setChecked(c)
    if (c.correct === null) { setStep('self'); return } // an explanation: you rate yourself against the key ideas
    setStep('done')
    onAnswered({ answer: a, checked: c, hints: hints.length, outcome: { correct: c.correct && a.type !== 'skip', partial: c.partial, revealed: a.type === 'skip', help, ...(sure !== undefined ? { sure } : {}) } })
  }
  const self = (how: 'all' | 'partly' | 'missed') => {
    setStep('done')
    onAnswered({ answer: answer!, checked: checked!, hints: hints.length, outcome: { correct: how !== 'missed', partial: how === 'partly', revealed: false, help } })
  }
  const skipped = answer?.type === 'skip'
  return (
    <article className="mt-5 rounded-[12px] border border-border bg-raised px-4 py-4 sm:px-6 sm:py-5" aria-labelledby="off-card">
      <header className="mb-4">
        <p className="text-[12px] text-muted">{prettyTitle(q.lessonTitle)}</p>
        <h2 id="off-card" className="text-[13.5px] font-medium text-muted"><span className="mr-2 rounded-[4px] bg-hover px-1.5 py-px text-[12px]">{card.isNew ? t('New') : t('Review')}</span>{prettyTitle(q.title)}</h2>
      </header>
      <WidgetView widget={q.widget} draft={draft} setDraft={setDraft} result={step === 'done' || step === 'self' ? checked : null} autoFocus
        onSubmit={() => { if (step === 'answer' && ready(q.widget, draft)) submit(toAnswer(q.widget, draft)) }}
        probe={async (a) => mark(pack, card.widgetId, a)} />
      {hints.length > 0 && <div className="mt-4 flex flex-col gap-1.5">{hints.map((h, i) => <p key={i} className="flex gap-2"><Lightbulb className="mt-1 size-4 shrink-0 text-muted" aria-hidden /><span className="read text-[15.5px]"><Inline nodes={h} /></span></p>)}</div>}

      {step === 'answer' && (
        <div className="mt-5 flex flex-wrap gap-2">
          {!selfSubmitting(q.widget) && <Button variant="primary" disabled={!ready(q.widget, draft)} onClick={() => submit(toAnswer(q.widget, draft))}>{t('Check')}</Button>}
          {q.widget.hints > hints.length && <Button variant="ghost" icon={Lightbulb} onClick={() => { const h = hintOf(pack, card.widgetId, hints.length); if (h) setHints([...hints, h]) }}>{t('Hint')}</Button>}
          <Button variant="ghost" onClick={() => submit({ type: 'skip' })}>{t('I don’t know, show me')}</Button>
        </div>
      )}
      {step === 'sure' && answer && (
        <div className="mt-5" role="group" aria-labelledby="off-sure">
          <p id="off-sure" className="text-[14.5px] font-medium">{t('Were you sure?')}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => finish(answer, true)}>{t('Yes, sure')}</Button>
            <Button variant="secondary" onClick={() => finish(answer, false)}>{t('Not really')}</Button>
          </div>
        </div>
      )}
      {step === 'self' && (
        <div className="mt-5" role="group" aria-labelledby="off-self">
          <p id="off-self" className="text-[14.5px] font-medium">{skipped ? t('Read the answer above, then:') : t('How did you do?')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => self('all')}>{t('Got all of it')}</Button>
            <Button onClick={() => self('partly')}>{t('Partly')}</Button>
            <Button onClick={() => self('missed')}>{t('Missed it')}</Button>
          </div>
        </div>
      )}
      {step === 'done' && checked && (
        <>
          <Verdict result={checked} skipped={skipped} />
          {rated && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12.5px] font-semibold ${rated.rating === 3 ? 'border-good text-good' : rated.rating === 2 ? 'border-warn text-warn' : 'border-bad text-bad'}`}>
                {rated.rating === 3 && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}{rated.rating === 1 ? t('again') : rated.rating === 2 ? t('shaky') : t('solid')}
              </span>
              {rated.next && <span className="text-muted">{t('next review {when}', { when: whenText(rated.next) })}</span>}
            </p>
          )}
          {q.exposition.length > 0 && !checked.correct && (
            <details className="mt-4 rounded-[8px] border border-border px-3 py-2">
              <summary className="cursor-pointer text-[13.5px] font-medium">{t('Reread the card')}</summary>
              <div className="read mt-2 text-[16px]"><Prose nodes={q.exposition} /></div>
            </details>
          )}
          <Button className="mt-5" variant="primary" autoFocus onClick={onNext}>{t('Continue')}</Button>
        </>
      )}
    </article>
  )
}
