// Select text in a document → Note · Card · Inbox · Ask · Explain, floating above the selection.
import { useEffect, useState } from 'react'
import { ChartSpline, Inbox, Layers, MessageSquarePlus, Sparkles, StickyNote } from 'lucide-react'
import { NOTE_MARKS, markLabel } from './marks'
import { anchorFromSelection } from '../lib/anchor'
import type { NoteAnchor } from '../../shared/types'
import { t } from '../i18n'

import type { NoteColor } from '../../shared/types'
export type SelectionKind = 'note' | 'ask' | 'explain' | 'visual' | 'card' | 'inbox' | NoteColor
export interface SelectionAction { (kind: SelectionKind, anchor: NoteAnchor): void }
export function SelectionToolbar({ root, onAction, canAsk }: { root: HTMLElement | null; onAction: SelectionAction; canAsk: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number; anchor: NoteAnchor } | null>(null)
  useEffect(() => {
    if (!root) return
    const update = () => {
      const r = anchorFromSelection(root)
      if (!r || r.anchor.quote.exact.length < 2) { setAt(null); return }
      const rect = r.range.getBoundingClientRect()
      setAt({ x: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140), y: rect.top, anchor: r.anchor })
    }
    const onUp = () => setTimeout(update, 0)
    const onChange = () => { const s = window.getSelection(); if (!s || s.isCollapsed) setAt(null) }
    const hide = () => setAt(null)
    root.addEventListener('mouseup', onUp)
    root.addEventListener('keyup', onUp)
    document.addEventListener('selectionchange', onChange)
    document.getElementById('main')?.addEventListener('scroll', hide, { passive: true })
    return () => { root.removeEventListener('mouseup', onUp); root.removeEventListener('keyup', onUp); document.removeEventListener('selectionchange', onChange); document.getElementById('main')?.removeEventListener('scroll', hide) }
  }, [root])
  if (!at) return null
  const act = (k: SelectionKind) => { onAction(k, at.anchor); window.getSelection()?.removeAllRanges(); setAt(null) }
  const btn = 'flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-medium hover:bg-hover cursor-pointer'
  const label = (text: string) => <span className="max-[560px]:sr-only">{text}</span> // on a phone the row is icons, or it would not fit
  return (
    <div role="toolbar" aria-label={t('Selected text')} style={{ left: at.x, top: Math.max(8, at.y - 44) }}
      className="fixed z-40 flex -translate-x-1/2 items-center divide-x divide-border overflow-hidden rounded-[8px] border border-border bg-raised shadow-pop"
      onMouseDown={(e) => e.preventDefault()}>
      {NOTE_MARKS.map(({ color, icon: Icon }) => <button key={color} className={btn} title={markLabel(color)} aria-label={markLabel(color)} onClick={() => act(color)}><Icon className={`size-4 tone-${color}`} strokeWidth={1.8} aria-hidden /></button>)}
      <button className={btn} onClick={() => act('note')}><StickyNote className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Note'))}</button>
      <button className={btn} onClick={() => act('card')}><Layers className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Card'))}</button>
      <button className={btn} onClick={() => act('inbox')}><Inbox className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Inbox'))}</button>
      {canAsk && <button className={btn} onClick={() => act('ask')}><MessageSquarePlus className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Ask'))}</button>}
      {canAsk && <button className={btn} onClick={() => act('explain')}><Sparkles className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Explain'))}</button>}
      {canAsk && <button className={btn} onClick={() => act('visual')}><ChartSpline className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{label(t('Visualise'))}</button>}
    </div>
  )
}
