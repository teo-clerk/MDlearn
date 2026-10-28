// Memory game over a match's pairs: every card face down; flip one ● card and one ○ card. A pair stays face
// up, anything else turns back. Each pair of flips is checked on the server (the key never reaches the page);
// when every pair is found the game submits itself, with the flips, so the server can count the misses.
import { useEffect, useRef, useState } from 'react'
import { Prose, Inline } from '../prose/Prose'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { useSubmitWhenDone } from './motion'
import { t, tp } from '../i18n'

type Open = { l?: number; r?: number }

export function Memory({ widget, draft, setDraft, result, probe, onSubmit }: WidgetProps<Extract<Draft, { type: 'match' }>>) {
  const [open, setOpen] = useState<Open>({})
  const [miss, setMiss] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [say, setSay] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const complete = widget.type === 'match' && draft.pairs.every((x) => x !== null)
  useSubmitWhenDone(complete, !!result, onSubmit)
  if (widget.type !== 'match' || !widget.tiles) return null
  const locked = !!result
  const found = (side: 'l' | 'r', i: number) => (side === 'l' ? draft.pairs[i] !== null : draft.pairs.includes(i))
  const isOpen = (side: 'l' | 'r', i: number) => (side === 'l' ? open.l === i : open.r === i)
  const flip = async (side: 'l' | 'r', i: number) => {
    if (locked || busy || found(side, i) || isOpen(side, i)) return
    // one card of each side at a time: a second card of the same side replaces the first
    const next: Open = side === 'l' ? { l: i, ...(open.r !== undefined ? { r: open.r } : {}) } : { r: i, ...(open.l !== undefined ? { l: open.l } : {}) }
    setOpen(next); setMiss(false)
    if (next.l === undefined || next.r === undefined) return
    if (!probe) { setError(t('Open this in MDlearn Studio to play.')); return }
    const l = next.l, r = next.r
    setBusy(true); setError(null)
    try {
      const pairs: (number | null)[] = widget.left.map((_, k) => (k === l ? r : null))
      const checked = await probe({ type: 'match', pairs })
      const ok = checked.parts?.pairs?.[l]?.ok === true
      const log: [number, number][] = [...draft.log, [l, r]]
      if (ok) {
        setDraft({ type: 'match', pairs: draft.pairs.map((x, k) => (k === l ? r : x)), log })
        setOpen({}); setSay(t('A pair.'))
      } else {
        setDraft({ ...draft, log })
        setMiss(true); setSay(t('Not a pair.'))
        timer.current = setTimeout(() => { setOpen({}); setMiss(false) }, 1000)
      }
    } catch (e) { setError((e as Error).message); setOpen({}) } finally { setBusy(false) }
  }
  const pairsFound = draft.pairs.filter((x) => x !== null).length
  const misses = result?.parts?.misses ?? draft.log.length - pairsFound
  return (
    <div>
      <div className="read"><Prose nodes={widget.prompt} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('Memory cards')}>
        {widget.tiles.map((tile, k) => {
          const content = tile.side === 'l' ? widget.left[tile.i] : widget.right[tile.i]
          const up = locked || found(tile.side, tile.i) || isOpen(tile.side, tile.i)
          const state = found(tile.side, tile.i) ? 'is-found' : up && miss ? 'is-miss' : ''
          return (
            <button key={k} type="button" onClick={() => void flip(tile.side, tile.i)} disabled={locked}
              aria-label={up ? undefined : tile.side === 'l' ? t('Card {n}, filled-dot side, face down', { n: k + 1 }) : t('Card {n}, ring side, face down', { n: k + 1 })}
              className={`flip-card h-24 text-left sm:h-28 ${up ? 'is-flipped' : ''} ${state} ${locked || found(tile.side, tile.i) ? 'cursor-default' : 'cursor-pointer'}`}>
              <span className="flip-inner">
                <span className="flip-face flip-front" aria-hidden>
                  <span className={`size-2.5 rounded-full ${tile.side === 'l' ? 'bg-text/55' : 'border-[1.5px] border-text/55'}`} />
                </span>
                <span className="flip-face flip-back read text-[14.5px] leading-snug" aria-hidden={!up}><span className="line-clamp-4"><Inline nodes={content} /></span></span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 font-ui text-[12px] text-muted" aria-live="polite">
        <span className="tabular">{t('{done} of {total} pairs', { done: pairsFound, total: widget.left.length })}</span> · <span className="tabular">{tp(Math.max(0, misses), '{n} miss', '{n} misses')}</span>
        {!locked && <> · <span aria-hidden>{t('Flip one ● card and one ○ card.')}</span><span className="sr-only">{t('Flip one filled-dot card and one ring card.')}</span></>}
        <span className="sr-only"> {say}</span>
      </p>
      {error && <p className="mt-1 font-ui text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  )
}
