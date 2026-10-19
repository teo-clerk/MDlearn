// A small card that appears beside a word or link on hover or keyboard focus, and goes on Escape.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const OPEN_DELAY = 350
const CARD_W = 340

export function Hoverable({ card, children, className, tabIndex }: { card: () => ReactNode; children: ReactNode; className?: string; tabIndex?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const el = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const id = useId()
  const show = useCallback((delay: number) => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (el.current) setRect(el.current.getBoundingClientRect()) }, delay) }, [])
  const hide = useCallback(() => { clearTimeout(timer.current); setRect(null) }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!rect) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    const onScroll = () => hide()
    window.addEventListener('keydown', onKey)
    document.getElementById('main')?.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('keydown', onKey); document.getElementById('main')?.removeEventListener('scroll', onScroll) }
  }, [rect, hide])
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - CARD_W - 8)) : 0
  const below = rect ? rect.bottom + 6 + 220 < window.innerHeight || rect.top < 240 : true
  return (
    <span ref={el} className={className} tabIndex={tabIndex} aria-describedby={rect ? id : undefined}
      onMouseEnter={() => show(OPEN_DELAY)} onMouseLeave={hide} onFocus={() => show(0)} onBlur={hide}>
      {children}
      {rect && createPortal(
        <div id={id} role="tooltip" style={{ position: 'fixed', left, width: CARD_W, ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) }}
          className="pointer-events-none z-50 rounded-[8px] border border-border bg-raised px-3.5 py-3 font-ui text-[13px] leading-snug text-text shadow-pop">
          {card()}
        </div>, document.body)}
    </span>
  )
}
