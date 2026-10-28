import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { Prose, Inline } from '../prose/Prose'
import { LETTERS, type Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { t } from '../i18n'

export function Quiz({ widget, draft, setDraft, result, autoFocus }: WidgetProps<Extract<Draft, { type: 'quiz' }>>) {
  // focus the options as a group (letter keys pick), not option A: a ring on A read as "already chosen"
  const group = useRef<HTMLDivElement>(null)
  useEffect(() => { if (autoFocus) group.current?.focus({ preventScroll: true }) }, [autoFocus])
  if (widget.type !== 'quiz') return null
  const parts = result?.parts?.options
  const locked = !!result
  const toggle = (i: number) => {
    if (locked) return
    const on = draft.picked.includes(i)
    setDraft({ type: 'quiz', picked: widget.multi ? (on ? draft.picked.filter((x) => x !== i) : [...draft.picked, i]) : [i] })
  }
  return (
    <div>
      <div className="read"><Prose nodes={widget.stem} /></div>
      {widget.multi && !locked && <p className="mt-2 text-[12.5px] text-muted">{t('Several answers are correct: choose all of them.')}</p>}
      <div ref={group} tabIndex={-1} role={widget.multi ? 'group' : 'radiogroup'} aria-label={t('Options')} className="mt-3 flex flex-col gap-1.5 outline-none"
        onKeyDown={(e) => { const k = LETTERS.indexOf(e.key.toUpperCase()); if (k >= 0 && k < widget.options.length && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); toggle(k) } }}>
        {widget.options.map((o, i) => {
          const picked = draft.picked.includes(i)
          const p = parts?.[i]
          const state = !p ? null : p.correct ? 'correct' : p.picked ? 'wrong' : null
          return (
            <div key={i}>
              <button type="button" role={widget.multi ? 'checkbox' : 'radio'} aria-checked={picked} disabled={locked}
                onClick={() => toggle(i)}
                className={`flex w-full items-start gap-3 rounded-[7px] border px-3 py-2.5 text-left transition-colors ${
                  state === 'correct' ? 'border-good/60 bg-good-soft' : state === 'wrong' ? 'border-bad/50 bg-bad-soft' : picked ? 'border-text bg-hover' : 'border-border hover:bg-hover'
                } ${locked ? 'cursor-default' : 'cursor-pointer'}`}>
                <span className={`mt-[3px] flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border text-[12px] font-semibold ${
                  state === 'correct' ? 'border-good bg-good text-bg' : state === 'wrong' ? 'border-bad bg-bad text-bg' : picked ? 'border-text bg-text text-bg' : 'border-border-strong text-muted'}`} aria-hidden>
                  {state === 'correct' ? <Check className="size-3.5" strokeWidth={2.8} /> : state === 'wrong' ? <X className="size-3.5" strokeWidth={2.8} /> : LETTERS[i]}
                </span>
                <span className="read min-w-0 flex-1 text-[16.5px] leading-[1.55]"><Inline nodes={o.content} /></span>
                {state && <span className="sr-only">{state === 'correct' ? t('(correct answer)') : t('(your choice, not correct)')}</span>}
              </button>
              {p?.feedback && (p.picked || p.correct) && (
                <div className="read ml-[46px] mt-1 text-[15px] text-muted"><Prose nodes={p.feedback} /></div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
