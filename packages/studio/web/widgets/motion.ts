// Small motion helpers for the games: FLIP moves (an item glides to where it now belongs), reduced-motion
// checks, and "submit once the game is over" (after the parent has the final draft).
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animate every `[data-flip]` element inside `root` from its previous position to its new one whenever
 * `key` changes (transform only, so layout is never animated).
 */
export function useFlip(root: RefObject<HTMLElement | null>, key: unknown) {
  const last = useRef(new Map<string, DOMRect>())
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const now = new Map<string, DOMRect>()
    for (const n of el.querySelectorAll<HTMLElement>('[data-flip]')) now.set(n.dataset.flip!, n.getBoundingClientRect())
    if (!reducedMotion()) {
      for (const n of el.querySelectorAll<HTMLElement>('[data-flip]')) {
        const before = last.current.get(n.dataset.flip!), after = now.get(n.dataset.flip!)
        if (!before || !after) continue
        const dx = before.left - after.left, dy = before.top - after.top
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
      }
    }
    last.current = now
  }, [root, key])
}

/** Call `onSubmit` once, after a render in which the game is over (so the parent submits the final draft). */
export function useSubmitWhenDone(done: boolean, locked: boolean, onSubmit?: () => void) {
  const sent = useRef(false)
  useEffect(() => {
    if (!done) { sent.current = false; return }
    if (locked || sent.current) return
    sent.current = true
    onSubmit?.()
  }, [done, locked, onSubmit])
}
