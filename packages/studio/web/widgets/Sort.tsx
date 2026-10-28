// Sort items into groups: choose an item, then a group (or press the group's number). Items glide to where
// they go. Choose a placed item and then "Not sorted yet" to take it back out.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Prose, Inline } from '../prose/Prose'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'
import { useFlip } from './motion'
import { t } from '../i18n'

export function Sort({ widget, draft, setDraft, result }: WidgetProps<Extract<Draft, { type: 'sort' }>>) {
  const [sel, setSel] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useFlip(box, draft.groups.join(','))
  // keyboard sorting is a run of single key presses: focus follows the item chosen next
  const focusNext = useRef<number | null>(null)
  useEffect(() => {
    const n = focusNext.current
    if (n === null) return
    focusNext.current = null
    box.current?.querySelector<HTMLButtonElement>(`[data-flip="${n}"] button`)?.focus({ preventScroll: true })
  }, [draft.groups])
  if (widget.type !== 'sort') return null
  const locked = !!result
  const parts = result?.parts?.items
  const place = (g: number | null) => {
    if (locked || sel === null) return
    setDraft({ type: 'sort', groups: draft.groups.map((x, i) => (i === sel ? g : x)) })
    // the next unsorted item is chosen for you, so sorting is a run of single choices
    const next = draft.groups.findIndex((x, i) => x === null && i !== sel)
    setSel(g === null || next < 0 ? null : next)
    focusNext.current = g === null || next < 0 ? sel : next
  }
  const onKey = (e: KeyboardEvent) => {
    if (locked || sel === null || e.metaKey || e.ctrlKey || e.altKey) return
    const g = Number(e.key) - 1
    if (g >= 0 && g < widget.groups.length) { e.preventDefault(); place(g) }
    if (e.key === '0' || e.key === 'Backspace') { e.preventDefault(); place(null) }
  }
  const chip = (i: number) => {
    const p = parts?.[i]
    const chosen = sel === i
    const tone = p?.ok === true ? 'border-good/60 bg-good-soft' : p?.ok === false ? 'border-bad/50 bg-bad-soft' : chosen ? 'border-text bg-hover shadow-[0_0_0_1px_var(--text)]' : 'border-border-strong bg-raised hover:bg-hover'
    return (
      <li key={i} data-flip={i}>
        <button type="button" disabled={locked} aria-pressed={chosen} onClick={() => setSel(chosen ? null : i)}
          className={`game-item inline-flex max-w-full items-baseline gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-left transition-colors ${tone} ${locked ? 'cursor-default' : 'cursor-pointer'}`}>
          <span className="read min-w-0 text-[15.5px] leading-[1.45]"><Inline nodes={widget.items[i]} /></span>
          {p?.ok === false && p.expected !== undefined && <span className="shrink-0 font-ui text-[12px] text-muted">→ <Inline nodes={widget.groups[p.expected]} /></span>}
        </button>
      </li>
    )
  }
  const pool = draft.groups.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0)
  const zone = 'rounded-[9px] border border-dashed px-2.5 pb-2.5 pt-2 transition-colors'
  const canDrop = sel !== null && !locked
  return (
    <div onKeyDown={onKey}>
      <div className="read"><Prose nodes={widget.prompt} /></div>
      <div ref={box} className="mt-3">
        {(pool.length > 0 || canDrop) && !locked && (
          <div className={`${zone} mb-2 ${canDrop && draft.groups[sel] !== null ? 'cursor-pointer border-border-strong hover:bg-hover' : 'border-transparent px-0'}`}
            onClick={() => { if (canDrop && draft.groups[sel] !== null) place(null) }}>
            <p className="mb-1.5 font-ui text-[12px] text-muted">{pool.length ? t('Not sorted yet') : t('Choose a group, or here to take it back')}</p>
            <ul className="game-list flex flex-wrap gap-1.5">{pool.map(chip)}</ul>
          </div>
        )}
        <div className={`grid gap-2 ${widget.groups.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {widget.groups.map((label, g) => {
            const members = draft.groups.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0)
            return (
              <section key={g} aria-label={t('Group {n}', { n: g + 1 })} onClick={(e) => { if (canDrop && e.target === e.currentTarget) place(g) }}
                className={`${zone} min-h-[84px] ${canDrop ? 'cursor-pointer border-text/40 hover:bg-hover' : 'border-border-strong'}`}>
                <button type="button" disabled={!canDrop} onClick={() => place(g)}
                  className="mb-1.5 flex w-full items-baseline gap-1.5 text-left font-ui text-[13px] font-semibold disabled:cursor-default enabled:cursor-pointer">
                  <span className="tabular text-[11.5px] font-normal text-subtle">{g + 1}</span><span className="min-w-0"><Inline nodes={label} /></span>
                </button>
                <ul className="game-list flex flex-wrap gap-1.5">{members.map(chip)}</ul>
              </section>
            )
          })}
        </div>
      </div>
      {!locked && <p className="mt-2 font-ui text-[12px] text-muted">{t('Choose an item, then its group (or press the group’s number).')}</p>}
    </div>
  )
}
