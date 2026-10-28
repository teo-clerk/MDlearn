// Match pairs: pick an item on the left, then its partner on the right (or the other way round). Pairs are
// joined by a drawn line on wide screens and by number/letter badges everywhere. Keyboard: with a left item
// chosen, press the partner's letter; with a right item chosen, press the number.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Prose, Inline } from '../prose/Prose'
import { LETTERS, type Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { t } from '../i18n'

type Side = { side: 'l' | 'r'; i: number }
interface Line { key: string; d: string; ok: boolean | null }

export function Match({ widget, draft, setDraft, result }: WidgetProps<Extract<Draft, { type: 'match' }>>) {
  const [sel, setSel] = useState<Side | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const parts = result?.parts?.pairs
  // connector lines between paired items, measured after layout (only when the columns sit side by side)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || widget.type !== 'match') return
    const measure = () => {
      const b = el.getBoundingClientRect()
      const out: Line[] = []
      draft.pairs.forEach((r, l) => {
        if (r === null) return
        const a = el.querySelector(`[data-side="l"][data-i="${l}"]`)?.getBoundingClientRect()
        const c = el.querySelector(`[data-side="r"][data-i="${r}"]`)?.getBoundingClientRect()
        if (!a || !c || c.left < a.right) return
        const x1 = a.right - b.left, y1 = a.top + a.height / 2 - b.top, x2 = c.left - b.left, y2 = c.top + c.height / 2 - b.top, mid = (x1 + x2) / 2
        out.push({ key: `${l}-${r}`, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, ok: parts ? parts[l]?.ok ?? null : null })
      })
      setLines(out)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [draft.pairs, parts, widget.type])
  if (widget.type !== 'match') return null
  const locked = !!result
  const leftOf = (r: number) => draft.pairs.indexOf(r)
  const set = (pairs: (number | null)[]) => setDraft({ ...draft, pairs })
  const pair = (l: number, r: number) => { set(draft.pairs.map((x, k) => (k === l ? r : x === r ? null : x))); setSel(null) }
  const pick = (s: Side) => {
    if (locked) return
    if (sel && sel.side !== s.side) return s.side === 'l' ? pair(s.i, sel.i) : pair(sel.i, s.i)
    // choosing a paired item again takes it out of its pair
    if (s.side === 'l' && draft.pairs[s.i] !== null) set(draft.pairs.map((x, k) => (k === s.i ? null : x)))
    if (s.side === 'r' && leftOf(s.i) >= 0) set(draft.pairs.map((x) => (x === s.i ? null : x)))
    setSel(sel?.side === s.side && sel.i === s.i ? null : s)
  }
  const onKey = (e: KeyboardEvent) => {
    if (locked || !sel || e.metaKey || e.ctrlKey || e.altKey) return
    if (sel.side === 'l') { const r = LETTERS.indexOf(e.key.toUpperCase()); if (r >= 0 && r < widget.right.length) { e.preventDefault(); pair(sel.i, r) } }
    else { const l = Number(e.key) - 1; if (l >= 0 && l < widget.left.length) { e.preventDefault(); pair(l, sel.i) } }
  }
  const tone = (ok: boolean | null | undefined, chosen: boolean, paired: boolean) =>
    ok === true ? 'border-good/60 bg-good-soft' : ok === false ? 'border-bad/50 bg-bad-soft' : chosen ? 'border-text bg-hover' : paired ? 'border-border-strong bg-raised' : 'border-border hover:bg-hover'
  const item = (s: Side, content: Parameters<typeof Inline>[0]['nodes'], badge: string, partner: string | null, ok: boolean | null | undefined, hint?: string) => (
    <button key={`${s.side}${s.i}`} type="button" data-side={s.side} data-i={s.i} disabled={locked} onClick={() => pick(s)} aria-pressed={sel?.side === s.side && sel.i === s.i}
      className={`game-item flex w-full items-start gap-2.5 rounded-[7px] border px-3 py-2 text-left transition-colors ${tone(ok, sel?.side === s.side && sel.i === s.i, !!partner)} ${locked ? 'cursor-default' : 'cursor-pointer'}`}>
      <span className="mt-[3px] flex size-[22px] shrink-0 items-center justify-center rounded-[5px] border border-border-strong font-ui text-[12px] font-semibold text-muted" aria-hidden>{badge}</span>
      <span className="read min-w-0 flex-1 text-[16px] leading-[1.5]"><Inline nodes={content} /></span>
      {partner && <span className="game-badge mt-[3px] shrink-0 rounded-[5px] bg-text px-1.5 font-ui text-[12px] font-semibold leading-[22px] text-bg">{partner}<span className="sr-only"> {t('paired')}</span></span>}
      {hint && <span className="mt-[3px] shrink-0 font-ui text-[12px] text-muted">{hint}</span>}
    </button>
  )
  const done = draft.pairs.filter((x) => x !== null).length
  return (
    <div onKeyDown={onKey}>
      <div className="read"><Prose nodes={widget.prompt} /></div>
      <div ref={box} className="relative mt-3 grid gap-y-1.5 sm:grid-cols-[1fr_3.5rem_1fr]">
        <svg className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible sm:block" aria-hidden>
          {lines.map((ln) => <path key={ln.key} d={ln.d} pathLength={1} className={`match-line ${ln.ok === true ? 'stroke-good' : ln.ok === false ? 'stroke-bad' : 'stroke-text/45'}`} fill="none" strokeWidth={1.6} />)}
        </svg>
        <div className="flex flex-col gap-1.5" role="group" aria-label={t('Left items')}>
          {widget.left.map((c, l) => {
            const r = draft.pairs[l], p = parts?.[l]
            return item({ side: 'l', i: l }, c, String(l + 1), r !== null ? LETTERS[r] : null, p?.ok, p?.ok === false && p.expected !== undefined ? `→ ${LETTERS[p.expected]}` : undefined)
          })}
        </div>
        <div aria-hidden className="hidden sm:block" />
        <div className="mt-3 flex flex-col gap-1.5 sm:mt-0" role="group" aria-label={t('Right items')}>
          {widget.right.map((c, r) => {
            const l = leftOf(r)
            const p = l >= 0 ? parts?.[l] : undefined
            return item({ side: 'r', i: r }, c, LETTERS[r], l >= 0 ? String(l + 1) : null, p?.ok)
          })}
        </div>
      </div>
      {!locked && <p className="mt-2 font-ui text-[12px] text-muted"><span className="tabular">{t('{done} of {total} paired.', { done, total: widget.left.length })}</span> {t('Choose an item, then its partner; press a letter or number to pair from the keyboard.')}</p>}
    </div>
  )
}
