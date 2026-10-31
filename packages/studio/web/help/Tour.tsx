// The welcome tour: a few coach marks beside the sidebar the first time a folder opens (and again from
// Help). Each step outlines the part of the app it talks about; on a phone, or with the sidebar hidden, the
// steps come as a sheet at the bottom. Esc skips, ← / → move. Finishing or skipping saves "done" once.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { helpApi, useOnboarding } from '../api/queries'
import { useUi } from '../state/ui'
import { Button } from '../ui/primitives'
import { t } from '../i18n'

interface Step { anchor?: string; title: string; body: string }
const STEPS = (): Step[] => [
  { title: t('Welcome to MDlearn Studio'), body: t('Your notes, ready to study. Six quick stops show where everything is.') },
  { anchor: 'files', title: t('Your notes'), body: t('Open any note to read it. Select text to leave a note beside it, ask about it, or turn it into a card.') },
  { anchor: 'today', title: t('Today'), body: t('Your daily session: the cards that are due, then a few new ones. Press Start — five to ten minutes is enough.') },
  { anchor: 'study', title: t('Study'), body: t('One card at a time. Say whether you were sure before you see the answer; what you miss comes back sooner.') },
  { anchor: 'ai', title: t('AI Studio'), body: t('An AI turns your class files or a note into lessons of cards. Every change is checked and can be undone.') },
  { anchor: 'help', title: t('Help and the tutorial'), body: t('Shortcuts, how to write questions and games, and an interactive tutorial to try them. Press ? any time.') },
]
const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0

export function Tour() {
  const { tour, setTour } = useUi()
  const onboarding = useOnboarding()
  const qc = useQueryClient()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  // first run: open once, as soon as we know it has not been seen
  const opened = useRef(false)
  useEffect(() => { if (onboarding.data && !onboarding.data.tourDone && !opened.current) { opened.current = true; setTour(true) } }, [onboarding.data, setTour])
  // steps whose part of the app exists here (no AI Studio without the AI capability)
  const steps = useMemo(() => (tour ? STEPS().filter((s) => !s.anchor || document.querySelector(`[data-tour="${s.anchor}"]`)) : STEPS()), [tour])
  const step = steps[Math.min(i, steps.length - 1)]
  useLayoutEffect(() => {
    if (!tour) return
    const measure = () => {
      const el = step.anchor ? document.querySelector(`[data-tour="${step.anchor}"]`) : null
      setRect(visible(el) ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tour, step])
  useEffect(() => { if (tour) card.current?.focus({ preventScroll: true }) }, [tour, i])
  if (!tour) return null
  const finish = () => {
    setTour(false); setI(0)
    qc.setQueryData(['onboarding'], { tourDone: true })
    helpApi.tourDone(true).catch(() => { /* a phone without write access: shown again next time */ })
  }
  const last = i >= steps.length - 1
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); finish() }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (last) finish(); else setI(i + 1) }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(i - 1) }
  }
  const CARD_W = 340
  const beside = rect && window.innerWidth >= 640
  const style = beside
    ? { left: Math.min(rect.right + 14, window.innerWidth - CARD_W - 12), top: Math.max(12, Math.min(rect.top - 10, window.innerHeight - 230)), width: CARD_W }
    : undefined
  return (
    <>
      {beside && <div aria-hidden className="tour-ring pointer-events-none fixed z-[60] rounded-[8px]" style={{ left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 }} />}
      <div ref={card} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1} onKeyDown={onKey}
        className={`tour-card fixed z-[61] rounded-[12px] border border-border-strong bg-raised p-4 font-ui shadow-pop ${beside ? '' : step.anchor ? 'inset-x-3 bottom-3 sm:inset-x-auto sm:left-1/2 sm:w-[380px] sm:-translate-x-1/2' : 'inset-x-3 top-[22vh] sm:inset-x-auto sm:left-1/2 sm:w-[400px] sm:-translate-x-1/2'}`}
        style={style}>
        <div className="flex items-start gap-2">
          <p className="tabular text-[11.5px] text-subtle">{i + 1} of {steps.length}</p>
          <button type="button" onClick={finish} aria-label={t('Skip the tour')} title={t('Skip the tour (Esc)')} className="ml-auto -mr-1 -mt-1 rounded-[6px] p-1 text-muted hover:bg-hover hover:text-text cursor-pointer"><X className="size-4" aria-hidden /></button>
        </div>
        <h2 id="tour-title" className="mt-0.5 text-[15.5px] font-semibold">{step.title}</h2>
        <p id="tour-body" className="mt-1 text-[13.5px] leading-relaxed text-text/85">{step.body}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>{steps.map((_, k) => <span key={k} className={`size-1.5 rounded-full transition-colors ${k === i ? 'bg-text' : 'bg-border-strong'}`} />)}</span>
          <span className="ml-auto" />
          {i > 0 && <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>{t('Back')}</Button>}
          <Button size="sm" variant="primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? t('Done') : i === 0 ? t('Show me') : t('Next')}</Button>
        </div>
      </div>
    </>
  )
}
